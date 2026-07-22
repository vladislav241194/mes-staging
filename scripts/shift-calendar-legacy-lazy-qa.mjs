import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createShiftCalendarLegacyApi } from "../src/modules/app_events/shift_calendar_legacy.js";

const assert = (value, message) => {
  if (!value) throw new Error(message);
};

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const servicePath = join(root, "src", "modules", "app_events", "service.js");
const helperPath = join(root, "src", "modules", "app_events", "shift_calendar_legacy.js");
const [serviceSource, helperSource] = await Promise.all([
  readFile(servicePath, "utf8"),
  readFile(helperPath, "utf8"),
]);

assert(
  !serviceSource.includes('from "./shift_calendar_legacy.js"'),
  "Shift calendar legacy runtime must not be a static app-events import",
);
assert(
  serviceSource.includes('import("./shift_calendar_legacy.js")'),
  "Shift calendar legacy runtime must load through a dynamic import",
);
assert(
  serviceSource.includes("function ensureShiftCalendarLegacyApi()")
    && serviceSource.includes("if (shiftCalendarLegacyApi) return Promise.resolve(shiftCalendarLegacyApi);")
    && serviceSource.includes("if (!shiftCalendarLegacyLoad)"),
  "Shift calendar legacy runtime must use a single-flight loader",
);
assert(
  serviceSource.includes("if (!renderRoot || app.firstElementChild !== renderRoot) return false;")
    && serviceSource.includes("if (shiftCalendarLegacyPendingRoot === renderRoot) return false;"),
  "Shift calendar lazy bind must reject stale DOM and duplicate pending binds",
);
assert(
  !serviceSource.includes('app.querySelector("[data-shift-calendar-date]")')
    && !serviceSource.includes('app.querySelectorAll("[data-shift-calendar-step]")')
    && !serviceSource.includes('app.querySelectorAll("[data-shift-calendar-open]")'),
  "Shift calendar selectors and listeners must not remain in the boot service",
);
assert(
  helperSource.includes('app.querySelector("[data-shift-calendar-date]")')
    && helperSource.includes('app.querySelectorAll("[data-shift-calendar-step]")')
    && helperSource.includes('app.querySelectorAll("[data-shift-calendar-open]")'),
  "Lazy helper must retain the legacy calendar controls",
);

const makeElement = (dataset = {}) => {
  const listeners = new Map();
  return {
    dataset,
    focusOptions: null,
    pickerCount: 0,
    value: "",
    addEventListener(type, listener) {
      const handlers = listeners.get(type) || [];
      handlers.push(listener);
      listeners.set(type, handlers);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener({ target: this, ...event });
    },
    focus(options) { this.focusOptions = options; },
    showPicker() { this.pickerCount += 1; },
  };
};

const dateField = makeElement();
dateField.value = "2026-07-22";
const stepButton = makeElement({ shiftCalendarStep: "-1" });
const todayButton = makeElement();
const openButton = makeElement({ shiftCalendarOpen: "shift-date" });
const selectors = new Map([
  ["[data-shift-calendar-date]", dateField],
  ["[data-shift-calendar-today]", todayButton],
  ["#shift-date", dateField],
]);
const selectorLists = new Map([
  ["[data-shift-calendar-step]", [stepButton]],
  ["[data-shift-calendar-open]", [openButton]],
]);
const app = {
  querySelector: (selector) => selectors.get(selector) || null,
  querySelectorAll: (selector) => selectorLists.get(selector) || [],
};

const calls = { dates: [], steps: [], today: 0 };
const api = createShiftCalendarLegacyApi({
  app,
  escapeCssIdentifier: (value) => value,
  moveShiftWorkbenchDate: (step) => { calls.steps.push(step); },
  setShiftWorkbenchDate: (date) => { calls.dates.push(date); },
  setShiftWorkbenchToday: () => { calls.today += 1; },
});
assert(api.bindShiftCalendarEvents() === true, "Valid legacy calendar DOM must bind successfully");

dateField.dispatch("change");
stepButton.dispatch("click");
todayButton.dispatch("click");
openButton.dispatch("click");
assert(calls.dates[0] === "2026-07-22", "Date control must preserve its change behavior");
assert(calls.steps[0] === "-1", "Step control must preserve its navigation behavior");
assert(calls.today === 1, "Today control must preserve its navigation behavior");
assert(dateField.focusOptions?.preventScroll === true && dateField.pickerCount === 1,
  "Calendar-open control must preserve focus and native picker behavior");
assert(createShiftCalendarLegacyApi().bindShiftCalendarEvents() === false,
  "Missing runtime dependencies must fail closed");

if (process.argv.includes("--require-dist")) {
  const bundledApp = await readFile(join(root, "dist", "src", "app.js"), "utf8");
  const chunkDir = join(root, "dist", "src", "chunks");
  const chunkEntries = (await readdir(chunkDir)).filter((entry) => entry.endsWith(".js"));
  const chunks = await Promise.all(chunkEntries.map(async (entry) => ({
    entry,
    source: await readFile(join(chunkDir, entry), "utf8"),
  })));
  const calendarChunk = chunks.find(({ entry, source }) => (
    entry.startsWith("shift_calendar_legacy-")
      && source.includes("[data-shift-calendar-step]")
  ));
  assert(calendarChunk, "Build must emit a dedicated legacy shift-calendar chunk");
  assert(!bundledApp.includes("[data-shift-calendar-step]"),
    "Boot bundle must not inline legacy shift-calendar selectors");
  assert(bundledApp.includes(`./chunks/${calendarChunk.entry}`),
    "Boot bundle must reach legacy shift-calendar logic only through its dynamic chunk");
}

console.log("Shift calendar legacy lazy-load QA passed");
