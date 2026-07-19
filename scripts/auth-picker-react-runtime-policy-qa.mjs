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
expect(app.includes('accessMode === "read-only-evaluation"') && app.includes("serverEvaluationAllowed"), "pre-PIN read evaluation must require the root-controlled read-only permission");
expect(app.includes('params.get("react-auth-picker-write") === "1"'), "Authorization PIN evaluation must be localhost-gated");
expect(host.includes('pickerReady) return "pin-step-owned-by-legacy"'), "host must fail closed when legacy owns PIN");
expect(host.includes('activation.accessMode !== "write-evaluation"') && host.includes("executeCommand"), "host must admit only the explicit PIN command evaluation");
expect(render.includes("function getAuthPrototypeReactModel"), "legacy auth renderer must own the allowlisted picker read model");
expect(!scenario.includes("scheduleAuthPrototypePinValidation") && !scenario.includes("completeAuthPrototypeLogin") && !scenario.includes("unlockAuthGate"), "React scenario must not receive authentication authority");
expect(!adapter.includes("pinDraft") && !adapter.includes("session"), "typed adapter must not expose PIN or session state");
expect(!scenario.includes("55555") && !scenario.includes("localStorage") && scenario.includes('type: "submit-pin"'), "React may hold PIN only in component memory and a transient typed command");
expect(app.includes("scheduleAuthPrototypePinValidation(pin, personId, { renderOnChange: false })") && app.includes("/^\\d{5}$/.test(pin)"), "host must validate shape and delegate PIN authority to the existing owner");
expect(app.includes('authPrototypePinDraft = "";') && app.includes("resetAuthPrototypeAttempts();"), "legacy fallback must start from a clean PIN boundary");
if (failures.length) { console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n")); process.exit(1); }
console.log("Authorization picker React security policy QA: OK");
