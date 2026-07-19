import { readFile } from "node:fs/promises";

const app = await readFile("src/app.js", "utf8");
const runtime = await readFile("src/modules/gantt_runtime/render.js", "utf8");
const host = await readFile("src/modules/gantt_runtime/react_island_host.js", "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(app.includes('MES_REACT_GANTT === true'), "Gantt React activation must require an explicit server or local QA feature flag");
expect(app.includes('planningRuntimeProjectionState.status === "server"'), "Gantt React activation must require the PostgreSQL runtime projection");
expect(app.includes('react-gantt-evaluation'), "server-enabled Gantt React must still require a per-session evaluation request");
expect(host.includes('accessMode !== "read-only-evaluation"'), "Gantt React must fail closed until write parity exists");
expect(runtime.includes("function getGanttReactModel"), "legacy Gantt runtime must own the React geometry read model");
expect(runtime.includes("calculateSlotPlacements([slot], scaleInfo, isAggregate)"), "React read model must reuse legacy placement calculation");
expect(!app.includes("MES_REACT_GANTT: true"), "Gantt React must remain disabled by default");
if (failures.length) { console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n")); process.exit(1); }
console.log("Gantt React runtime policy QA: OK");
