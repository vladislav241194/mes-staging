import { readFile } from "node:fs/promises";

const [app, host, render, scenario, adapter] = await Promise.all([
  readFile("src/app.js", "utf8"),
  readFile("src/modules/auth_render/auth_picker_react_island_host.js", "utf8"),
  readFile("src/modules/auth_render/render.js", "utf8"),
  readFile("experiments/react-migration/src/modules/auth-picker/AuthPickerScenario.tsx", "utf8"),
  readFile("experiments/react-migration/src/modules/auth-picker/adapter.ts", "utf8"),
]);
const failures = []; const expect = (condition, message) => { if (!condition) failures.push(message); };
expect(app.includes('systemDomainsServerReadState.status === "server"'), "Authorization picker must require PostgreSQL System Domains");
expect(app.includes('surfaceId: "authPicker"') && app.includes("resolveReactRuntimeActivation"), "permanent Authorization activation must come from the signed runtime policy");
expect(app.includes('accessMode === "read-only-evaluation"') && app.includes("serverEvaluationAllowed"), "legacy release read evaluation must retain its root-controlled permission");
expect(app.includes('params.get("react-auth-picker-write") === "1"'), "Authorization PIN evaluation must be localhost-gated");
expect(host.includes('canFallbackToLegacy: (activation) => activation.accessMode !== "react"'), "permanent Authorization must fail closed without live legacy fallback");
expect(host.includes('if (activation.accessMode === "react") return "";') && host.includes("getShellState"), "permanent host must own loading and read-error states before PostgreSQL is ready");
expect(host.includes('getActivation?.().accessMode === "react" ? undefined : onRequestLegacy'), "permanent React must not expose an action-level legacy handoff");
expect(host.includes('activation.accessMode !== "write-evaluation"') && host.includes("executeCommand"), "rollback evaluation must retain only the explicit PIN command boundary");
expect(render.includes("function getAuthPrototypeReactModel"), "legacy auth renderer must own the allowlisted picker read model");
expect(!scenario.includes("scheduleAuthPrototypePinValidation") && !scenario.includes("completeAuthPrototypeLogin") && !scenario.includes("unlockAuthGate"), "React scenario must not receive authentication authority");
expect(!adapter.includes("pinDraft") && !adapter.includes("session"), "typed adapter must not expose PIN or session state");
expect(!scenario.includes("55555") && !scenario.includes("localStorage") && scenario.includes('type: "submit-pin"'), "React may hold PIN only in component memory and a transient typed command");
expect(app.includes("scheduleAuthPrototypePinValidation(pin, personId, { renderOnChange: false })") && app.includes("/^\\d{5}$/.test(pin)"), "host must validate shape and delegate PIN authority to the existing owner");
expect(app.includes('capabilities: { pinEntry: permanentReact || elevation || localQa.writeEvaluation }'), "signed permanent React must keep the PIN keypad inside the typed island");
if (failures.length) { console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n")); process.exit(1); }
console.log("Authorization picker permanent React security contract QA: OK");
