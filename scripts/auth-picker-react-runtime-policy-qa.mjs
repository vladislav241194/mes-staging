import { readFile } from "node:fs/promises";

const [app, host, scenario, adapter] = await Promise.all([
  readFile("src/app.js", "utf8"),
  readFile("src/modules/auth_render/auth_picker_react_island_host.js", "utf8"),
  readFile("experiments/react-migration/src/modules/auth-picker/AuthPickerScenario.tsx", "utf8"),
  readFile("experiments/react-migration/src/modules/auth-picker/adapter.ts", "utf8"),
]);
const failures = []; const expect = (condition, message) => { if (!condition) failures.push(message); };
const activationStart = app.indexOf("function getAuthPickerReactActivation() {");
const payloadStart = app.indexOf("function getAuthPickerReactProductionPayload(");
const hostStart = app.indexOf("const authPickerReactIslandHost = createAuthPickerReactIslandHost({");
const hostEnd = app.indexOf("function getContourAdminReactLocalQaOverrides()", hostStart);
const routeStart = app.indexOf("    authPrototype: {");
const routeEnd = app.indexOf("    authSessionPrototype: {", routeStart);
const elevationStart = app.indexOf("async function beginNomenclatureEmployeeElevation(");
const elevationEnd = app.indexOf("function beginPlanningEmployeeElevation()", elevationStart);
const activationSlice = app.slice(activationStart, hostStart);
const hostSlice = app.slice(hostStart, hostEnd);
const productionSlice = app.slice(payloadStart, hostEnd);
const routeSlice = app.slice(routeStart, routeEnd);
const elevationSlice = app.slice(elevationStart, elevationEnd);
expect(app.includes('systemDomainsServerReadState.status === "server"'), "Authorization picker must require PostgreSQL System Domains");
expect(app.includes('surfaceId: "authPicker"') && app.includes("resolveReactRuntimeActivation"), "permanent Authorization activation must come from the signed runtime policy");
expect(app.includes('accessMode === "read-only-evaluation"') && app.includes("serverEvaluationAllowed"), "legacy release read evaluation must retain its root-controlled permission");
expect(app.includes('params.get("react-auth-picker-write") === "1"'), "Authorization PIN evaluation must be localhost-gated");
expect(host.includes("canFallbackToLegacy: () => false"), "Authorization must fail closed without a same-release legacy fallback");
expect(host.includes("getShellState") && host.includes("server-read-pending"), "permanent host must own loading and read-error states before PostgreSQL is ready");
expect(!host.includes("requestLegacyRender") && !host.includes("onRequestLegacy"), "Authorization host must not expose an action-level legacy handoff");
expect(host.includes('activation.accessMode !== "write-evaluation"') && host.includes("executeCommand"), "rollback evaluation must retain only the explicit PIN command boundary");
expect(!scenario.includes("scheduleAuthPrototypePinValidation") && !scenario.includes("completeAuthPrototypeLogin") && !scenario.includes("unlockAuthGate"), "React scenario must not receive authentication authority");
expect(!scenario.includes("onRequestLegacy") && !scenario.includes("legacy"), "React picker must not retain a UI handoff to the retired auth renderer");
expect(!adapter.includes("pinDraft") && !adapter.includes("session"), "typed adapter must not expose PIN or session state");
expect(!scenario.includes("55555") && !scenario.includes("localStorage") && scenario.includes('type: "submit-pin"'), "React may hold PIN only in component memory and a transient typed command");
expect(!activationSlice.includes("authModulesReady") && !activationSlice.includes("moduleReady"), "Authorization activation must not depend on retired auth chunks");
expect(activationSlice.includes("authGateReady: permanentReact || elevation"), "permanent Authorization must retain React route ownership after signed activation");
expect(productionSlice.includes("productionModel:") && productionSlice.includes("registries: getSystemDomainsRegistries()") && productionSlice.includes("businessDate: toSystemDomainsBusinessDate(new Date())"), "permanent picker payload must be built from raw PostgreSQL System Domains registries");
expect(productionSlice.includes("employeeServerSessionState") && productionSlice.includes("nomenclatureEmployeeElevationState") && productionSlice.includes("authState:"), "production payload must carry current session, elevation and transient auth state");
expect(hostSlice.includes("getAuthPickerReactProductionPerson(productionPayload, personId)") && hostSlice.includes("createEmployeeServerSession({ employeeId: personId, pin })"), "PIN host must validate the employee against the exact raw projection before using the signed server-session owner");
expect(hostSlice.includes("getAuthPickerReactProductionPerson(getAuthPickerReactProductionPayload({ pinEntry: true }), personId)") && hostSlice.includes("await deleteEmployeeServerSession().catch"), "a successful PIN response must fail closed if the current PostgreSQL projection no longer contains the employee");
expect(hostSlice.includes("finishNomenclatureEmployeeElevation(result.actor)") && hostSlice.includes("personId !== nomenclatureEmployeeElevationState.employeeId"), "elevation must remain actor-bound and fail closed");
expect(hostSlice.includes("/^\\d{5}$/.test(pin)") && !hostSlice.includes("scheduleAuthPrototypePinValidation(pin, personId"), "permanent host must validate PIN shape without rebuilding the person through the legacy picker model");
expect(hostSlice.includes("getPayload: () => getAuthPickerReactProductionPayload({ pinEntry: true })") && !hostSlice.includes("getAuthPrototypeReactModel"), "Authorization must always build its typed payload from the PostgreSQL projection");
expect(!elevationSlice.includes("getAuthPrototypeReactModel"), "starting permanent elevation must not read the retired auth renderer model");
expect(routeSlice.indexOf("authPickerReactIslandHost.prepareRender()") >= 0
  && routeSlice.includes("return authPickerReactIslandHost.renderTarget()")
  && !/ensureAuthModules|renderAuthPrototypePage|bindAuthPrototypeEvents|syncLegacyElevationAuthSelection/.test(routeSlice), "Authorization route must be owned entirely by the fail-closed React host");
expect(!/auth_render\/(?:render|events)\.js/.test(app) && !app.includes("ensureAuthModules"), "current application runtime must not load the retired Auth renderer or events chunks");
if (failures.length) { console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n")); process.exit(1); }
console.log("Authorization picker permanent React security contract QA: OK");
