import { readFile } from "node:fs/promises";

const app = await readFile("src/app.js", "utf8");
const runtime = await readFile("src/modules/gantt_runtime/render.js", "utf8");
const host = await readFile("src/modules/gantt_runtime/react_island_host.js", "utf8");
const scenario = await readFile("experiments/react-migration/src/modules/gantt/GanttScenario.tsx", "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(app.includes('MES_REACT_GANTT === true'), "Gantt React activation must require an explicit server or local QA feature flag");
expect(app.includes('planningRuntimeProjectionState.status === "server"'), "Gantt React activation must require the PostgreSQL runtime projection");
expect(app.includes('react-gantt-evaluation'), "server-enabled Gantt React must still require a per-session evaluation request");
expect(host.includes('["read-only-evaluation", "write-evaluation"].includes(activation.accessMode)'), "Gantt React host must allow only explicit read or local write evaluation modes");
expect(app.includes('params.get("react-gantt-write") === "1"'), "Gantt React schedule command must require the localhost QA write gate");
expect(app.includes('command.type !== "reschedule-slot"'), "Gantt React host must expose only the typed reschedule command");
expect(app.includes("await changePlanningSlotSchedule(routeId, operationId, plannedStart.toISOString(), { renderOnConflict: false })"), "Gantt React must call the existing Planning schedule owner without unmounting typed conflict feedback");
expect(app.includes('authorizeSystemDomainAction("planning", "edit")'), "Gantt React schedule command must recheck Planning edit authorization");
expect(runtime.includes("function getGanttReactModel"), "legacy Gantt runtime must own the React geometry read model");
expect(runtime.includes("calculateSlotPlacements([slot], scaleInfo, isAggregate)"), "React read model must reuse legacy placement calculation");
expect(runtime.includes("getDependencyPairs(planningState).flatMap"), "legacy Gantt runtime must own the visible dependency read model");
expect(scenario.includes("data-gantt-dependency-detail"), "React Gantt must expose the bounded dependency inspector");
expect(scenario.includes('type: "reschedule-slot"') && scenario.includes("data-gantt-react-schedule-form"), "React Gantt must present the typed schedule form");
expect(!scenario.includes("getDependencyPairs") && !scenario.includes("planningState"), "React Gantt must not duplicate dependency or planning ownership");
expect(!app.includes("MES_REACT_GANTT: true"), "Gantt React must remain disabled by default");
expect(!app.includes("MES_REACT_GANTT_WRITE"), "Gantt React must not add a Pilot write flag");
if (failures.length) { console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n")); process.exit(1); }
console.log("Gantt React runtime policy QA: OK");
