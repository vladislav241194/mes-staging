import assert from "node:assert/strict";

import { createPlanningCoreServiceModule } from "../src/modules/planning_core/service.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  clear() { this.values.clear(); }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  removeItem(key) { this.values.delete(String(key)); }
  setItem(key, value) { this.values.set(String(key), String(value)); }
}

const previousWindow = globalThis.window;
const previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const storage = new MemoryStorage();
const location = {
  hash: "",
  hostname: "localhost",
  href: "http://localhost/",
  pathname: "/",
  search: "",
};
globalThis.window = {
  location,
  history: { replaceState() {} },
};
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
  writable: true,
});

function setLocation(hostname, search = "") {
  location.hostname = hostname;
  location.search = search;
  location.href = `http://${hostname}/${search}`;
}

function createService(ui) {
  return createPlanningCoreServiceModule({
    APP_VERSION: "qa",
    AUTH_GATE_DEFAULT_MODULE: "planning",
    AUTH_GATE_MAX_ATTEMPTS: 5,
    AUTH_GATE_SESSION_STORAGE_KEY: "mes-auth-route-guard-session",
    DEFAULT_INTERFACE_ROLE_ID: "employee",
    MES_ADMIN_RUNTIME_HOSTS: new Set(["admin.mes-line.ru"]),
    UI_STORAGE_KEY: "mes-auth-route-guard-ui",
    defaultUiState: { activeModule: "planning", activeNomenclaturePane: "items" },
    getAccessRoleById: () => ({ defaultModule: "planning" }),
    getModuleDefinitions: () => [
      { id: "authPrototype" },
      { id: "nomenclature" },
      { id: "planning" },
    ],
    getUi: () => ui,
    normalizeAccessRoleAssignments: (value) => value || {},
    normalizeAccessRoleProfiles: (value) => value || {},
    normalizeInterfaceRoleId: (value) => String(value || "employee"),
    parseJsonObject: (value) => {
      try { return value ? JSON.parse(value) : null; } catch { return null; }
    },
    setUi: (nextUi) => Object.assign(ui, nextUi),
  });
}

try {
  const ui = {
    activeModule: "nomenclature",
    activeNomenclaturePane: "boards",
    activeRole: "employee",
    authCurrentUserId: "",
    authGateUnlocked: false,
  };
  const service = createService(ui);

  for (const hostname of ["localhost", "127.0.0.1", "::1", "[::1]"]) {
    setLocation(hostname, "?qa-auth-bypass=1");
    assert.equal(service.isAuthGateQaBypassEnabled(), true, `${hostname} must retain the explicit local QA bypass`);
  }
  setLocation("localhost", "?qa-auth-bypass=0");
  assert.equal(service.isAuthGateQaBypassEnabled(), false, "loopback without the explicit query must stay locked");

  for (const hostname of ["pilot.mes-line.ru", "pilot.mes-line.test", "mes-line.ru"]) {
    storage.clear();
    ui.activeModule = "nomenclature";
    ui.activeRole = "employee";
    ui.authGateUnlocked = false;
    setLocation(hostname, "?module=nomenclature&qa-auth-bypass=1");
    assert.equal(service.isAuthGateQaBypassEnabled(), false, `${hostname} must reject the local-only QA bypass`);
    assert.equal(service.isAuthGateUnlocked(), false, `${hostname} must not unlock the auth gate from a query parameter`);
    assert.equal(service.ensureAuthGateModule(), true, `${hostname} must route an unauthenticated request to the auth gate`);
    assert.equal(ui.activeModule, "authPrototype", `${hostname} must not enter Nomenclature as an authenticated/admin session`);
    assert.equal(ui.activeRole, "employee", `${hostname} must not promote the interface role to admin`);
  }

  setLocation("pilot.mes-line.ru", "?module=nomenclature");
  const restoredItems = service.applyUrlUiOverrides({
    activeModule: "nomenclature",
    activeNomenclaturePane: "boards",
  });
  assert.equal(restoredItems.activeModule, "nomenclature", "canonical Nomenclature deep-link must keep the Nomenclature module");
  assert.equal(restoredItems.activeNomenclaturePane, "items", "canonical Nomenclature reload must override a persisted Boards pane");
  ui.activeModule = "nomenclature";
  ui.activeNomenclaturePane = "boards";
  service.syncUiWithUrlParams();
  assert.equal(ui.activeNomenclaturePane, "items", "URL sync must force the canonical Nomenclature items pane");

  setLocation("pilot.mes-line.ru", "?module=bomLists");
  const restoredBoards = service.applyUrlUiOverrides({
    activeModule: "nomenclature",
    activeNomenclaturePane: "items",
  });
  assert.equal(restoredBoards.activeModule, "nomenclature", "canonical Boards alias must normalize to the Nomenclature module owner");
  assert.equal(restoredBoards.activeNomenclaturePane, "boards", "canonical Boards reload must override a persisted items pane");
  ui.activeModule = "nomenclature";
  ui.activeNomenclaturePane = "items";
  service.syncUiWithUrlParams();
  assert.equal(ui.activeModule, "nomenclature", "URL sync must preserve the normalized Nomenclature owner for Boards");
  assert.equal(ui.activeNomenclaturePane, "boards", "URL sync must force the canonical Boards pane");

  console.log("Nomenclature auth/route guard QA passed: loopback-only bypass and symmetric canonical pane restoration.");
} finally {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousLocalStorageDescriptor) Object.defineProperty(globalThis, "localStorage", previousLocalStorageDescriptor);
  else delete globalThis.localStorage;
}
