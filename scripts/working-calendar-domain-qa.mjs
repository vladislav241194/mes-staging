import {
  addCalendarWorkingDuration,
  createWorkingCalendar,
  getCalendarWorkingIntervals,
  snapToCalendarWorkingTime,
} from "../src/domain/working_calendar.js";

function assert(condition, message) { if (!condition) throw new Error(message); }
function iso(value) { return value.toISOString(); }

const weekday = createWorkingCalendar({ workSchedule: "5/2", workMode: "08:00-17:00" });
assert(iso(snapToCalendarWorkingTime(weekday, "2026-07-17T18:00:00+03:00")) === "2026-07-20T05:00:00.000Z", "5/2 calendar must skip weekend and snap to Monday shift start");
assert(iso(addCalendarWorkingDuration(weekday, "2026-07-17T15:00:00+03:00", 3 * 60 * 60 * 1000)) === "2026-07-20T06:00:00.000Z", "Working duration must continue after a weekend");
const overnight = createWorkingCalendar({ workSchedule: "6/1", workMode: "20:00-08:00" });
assert(getCalendarWorkingIntervals(overnight, "2026-07-15T12:00:00+03:00").length === 2, "Overnight shift must split at midnight");
const aroundClock = createWorkingCalendar({ workSchedule: "24/7", workMode: "00:00-24:00" });
assert(iso(addCalendarWorkingDuration(aroundClock, "2026-07-17T10:00:00+03:00", 2 * 60 * 60 * 1000)) === "2026-07-17T09:00:00.000Z", "24/7 calendar must keep elapsed time continuous");
console.log("Working calendar domain QA: OK");
