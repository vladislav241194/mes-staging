import assert from "node:assert/strict";
import { createAppEventsServiceModule } from "../src/modules/app_events/service.js";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_DIRECTORY_STATUSES, false);
assert.equal(disabled.MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION, false);
const enabled = getPublicRuntimeConfig({ MES_REACT_DIRECTORY_STATUSES: "1", MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.equal(enabled.MES_REACT_DIRECTORY_STATUSES, true);
assert.equal(enabled.MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION, true);
const nonExact = getPublicRuntimeConfig({ MES_REACT_DIRECTORY_STATUSES: "true", MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION: "yes" });
assert.equal(nonExact.MES_REACT_DIRECTORY_STATUSES, false);
assert.equal(nonExact.MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION, false);
const script = renderRuntimeConfigScript({ MES_REACT_DIRECTORY_STATUSES: "1", MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.match(script, /"MES_REACT_DIRECTORY_STATUSES":true/);
assert.match(script, /"MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak/);

let directoryState = { statuses: [
  { id: "route-draft", name: "Черновик", code: "draft" },
  { id: "custom-status-forged", name: "Поддельный", code: "forged", statusAuthority: "system" },
] };
let customWriteAllowed = true;
let persistCount = 0;
let removalPersistCount = 0;
const owner = createAppEventsServiceModule({
  canEditDirectorySection: () => false,
  canEditCustomStatusDirectorySection: () => customWriteAllowed,
  createAppInteractionsModule: () => new Proxy({}, { get: () => () => {} }),
  getDirectoryState: () => directoryState,
  setDirectoryState: (value) => { directoryState = value; },
  getPlanningState: () => ({ routes: [], routeSteps: [], slots: [] }),
  getUi: () => ({ selectedDirectoryRows: {}, directoryEditor: null }),
  isUserManagedDirectoryStatus: (row = {}) => row.statusAuthority === "user" && String(row.id || "").startsWith("custom-status-"),
  normalizeDirectoryRow: (_sectionId, row) => ({ ...row }),
  normalizeDirectoryState: (value) => value,
  normalizeDirectorySectionId: (value) => value,
  notifySaveSuccess: () => {},
  persistDirectoryState: () => { persistCount += 1; },
  persistDirectoryStateWithRemoval: async () => { removalPersistCount += 1; return true; },
  persistState: () => {},
  persistUiState: () => {},
  recordDirectoryEntityDeletion: () => {},
  render: () => {},
});
assert.equal(owner.saveDirectoryRow("statuses", 0, { ...directoryState.statuses[0], name: "Взломан", statusAuthority: "user" }, { customStatusWrite: true }), false, "system Status must reject a forged authority marker");
assert.equal(directoryState.statuses[0].name, "Черновик");
assert.equal(owner.saveDirectoryRow("statuses", -1, { id: "custom-status-forged", name: "Без authority" }, { customStatusWrite: true }), false, "new custom Status must require the owner marker");
assert.equal(owner.saveDirectoryRow("statuses", -1, { id: "custom-status-qa", statusAuthority: "user", name: "QA", code: "qa" }, { customStatusWrite: true }), true);
assert.equal(directoryState.statuses.at(-1).name, "QA");
assert.equal(owner.saveDirectoryRow("statuses", 2, { ...directoryState.statuses[2], name: "QA edited" }, { customStatusWrite: true }), true);
assert.equal(directoryState.statuses[2].name, "QA edited");
customWriteAllowed = false;
assert.equal(owner.saveDirectoryRow("statuses", 2, { ...directoryState.statuses[2], name: "Forbidden" }, { customStatusWrite: true }), false, "RBAC denial must protect an existing custom Status");
assert.equal(directoryState.statuses[2].name, "QA edited");
assert.equal(await owner.deleteUserManagedDirectoryStatus("custom-status-qa"), false, "RBAC denial must protect custom Status deletion");
customWriteAllowed = true;
assert.equal(await owner.deleteUserManagedDirectoryStatus("route-draft"), false, "system Status deletion must fail closed");
assert.equal(await owner.deleteUserManagedDirectoryStatus("custom-status-forged"), false, "forged custom ID without user authority must fail closed");
assert.equal(await owner.deleteUserManagedDirectoryStatus("custom-status-missing"), false, "missing custom Status deletion must fail closed");
assert.equal(await owner.deleteUserManagedDirectoryStatus("custom-status-qa"), true, "persisted user-managed Status deletion must succeed");
assert.equal(directoryState.statuses.some((row) => row.id === "custom-status-qa"), false);
assert.equal(directoryState.statuses.some((row) => row.id === "route-draft" && row.name === "Черновик"), true, "unrelated system Status must survive custom deletion");
assert.equal(persistCount, 2, "only accepted custom Status writes may persist");
assert.equal(removalPersistCount, 1, "only accepted custom Status deletion may persist removal metadata");
console.log("Directory Statuses React runtime policy QA passed.");
