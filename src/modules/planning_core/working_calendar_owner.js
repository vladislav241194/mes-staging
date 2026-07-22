import {
  addCalendarWorkingDuration,
  createWorkingCalendar,
  getCalendarWorkingIntervals,
  normalizeWorkMode,
  normalizeWorkSchedule,
  snapToCalendarWorkingTime,
} from "../../domain/working_calendar.js";

const DEFAULT_SMT_WORK_CENTER_IDS = ["D3_L1", "D3_L2"];
const DEFAULT_SMT_LINE_PREFIX = "smt-line:";

function identity(value = "") {
  return String(value || "").trim();
}

function toDate(value) {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function startOfDay(value) {
  const date = toDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days = 1) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function resolvePlanningCalendarWorkCenterId(workCenterId = "", options = {}) {
  const mapLegacyWorkCenterId = options.mapLegacyWorkCenterId || identity;
  const smtWorkCenterIds = options.smtWorkCenterIds?.length
    ? options.smtWorkCenterIds
    : DEFAULT_SMT_WORK_CENTER_IDS;
  const smtLinePrefix = String(options.smtLinePrefix || DEFAULT_SMT_LINE_PREFIX);
  const mappedId = mapLegacyWorkCenterId(workCenterId);
  if (!mappedId.startsWith(smtLinePrefix)) return mappedId;
  return mapLegacyWorkCenterId(mappedId.slice(smtLinePrefix.length))
    || smtWorkCenterIds[0]
    || mappedId;
}

export function createPlanningWorkingCalendarOwner(options = {}) {
  const {
    getPlanningState = () => ({}),
    getRuntimePlanningState = getPlanningState,
    mapLegacyWorkCenterId = identity,
    isWarehouseWorkCenterId = (workCenterId = "") => mapLegacyWorkCenterId(workCenterId) === "D1",
    smtWorkCenterIds = DEFAULT_SMT_WORK_CENTER_IDS,
    smtLinePrefix = DEFAULT_SMT_LINE_PREFIX,
  } = options;

  function getCalendarWorkCenterId(workCenterId = "") {
    return resolvePlanningCalendarWorkCenterId(workCenterId, {
      mapLegacyWorkCenterId,
      smtWorkCenterIds,
      smtLinePrefix,
    });
  }

  function getCalendarWorkCenter(workCenterId = "", state = null) {
    const requestedId = String(workCenterId || "").trim();
    const calendarWorkCenterId = getCalendarWorkCenterId(requestedId);
    const sourceState = state || getPlanningState?.() || {};
    const runtimeState = getRuntimePlanningState?.() || {};
    return sourceState?.workCenters?.find((center) => center.id === calendarWorkCenterId)
      || runtimeState?.workCenters?.find((center) => center.id === calendarWorkCenterId)
      || {
        id: calendarWorkCenterId || requestedId,
        name: calendarWorkCenterId || requestedId || "Отдел",
        workSchedule: smtWorkCenterIds.includes(calendarWorkCenterId) ? "2/2" : "24/7",
        workMode: smtWorkCenterIds.includes(calendarWorkCenterId) ? "08:00-20:00" : "00:00-24:00",
        shift: smtWorkCenterIds.includes(calendarWorkCenterId) ? "2/2 08:00-20:00" : "24/7 00:00-24:00",
        isPlanningUnit: true,
      };
  }

  function getWorkingCalendar(workCenterId = "", state = null) {
    const workCenter = getCalendarWorkCenter(workCenterId, state);
    const isWarehouse = isWarehouseWorkCenterId(workCenter?.id) || workCenter?.unitType === "warehouse";
    const fallbackSchedule = isWarehouse ? "24/7" : "5/2";
    const workSchedule = normalizeWorkSchedule(workCenter?.workSchedule || workCenter?.shift, fallbackSchedule);
    const fallbackMode = workSchedule === "24/7" || isWarehouse ? "00:00-24:00" : "08:00-20:00";
    const workMode = normalizeWorkMode(workCenter?.workMode || workCenter?.shift, fallbackMode);
    return createWorkingCalendar({
      ...workCenter,
      workSchedule,
      workMode,
    }, { isWarehouse });
  }

  function snapToWorkingTime(workCenterId, value, state = null) {
    return snapToCalendarWorkingTime(getWorkingCalendar(workCenterId, state), value);
  }

  function addWorkingDuration(workCenterId, start, durationMs, state = null) {
    return addCalendarWorkingDuration(getWorkingCalendar(workCenterId, state), start, durationMs);
  }

  function getWorkingIntervalsBetween(workCenterId, start, end, state = null) {
    const rangeStart = toDate(start);
    const rangeEnd = toDate(end);
    if (rangeEnd <= rangeStart) return [];

    const calendar = getWorkingCalendar(workCenterId, state);
    const intervals = [];
    let cursor = startOfDay(rangeStart);
    for (let guard = 0; cursor < rangeEnd && guard < 370; guard += 1) {
      getCalendarWorkingIntervals(calendar, cursor).forEach((interval) => {
        const clippedStart = new Date(Math.max(interval.start.getTime(), rangeStart.getTime()));
        const clippedEnd = new Date(Math.min(interval.end.getTime(), rangeEnd.getTime()));
        if (clippedEnd > clippedStart) intervals.push({ start: clippedStart, end: clippedEnd });
      });
      cursor = addDays(cursor, 1);
    }
    return intervals;
  }

  function getWorkingDurationBetween(workCenterId, start, end, state = null) {
    return getWorkingIntervalsBetween(workCenterId, start, end, state)
      .reduce((sum, interval) => sum + Math.max(0, interval.end - interval.start), 0);
  }

  return {
    addWorkingDuration,
    getCalendarWorkCenter,
    getCalendarWorkCenterId,
    getWorkingCalendar,
    getWorkingDurationBetween,
    getWorkingIntervalsBetween,
    snapToWorkingTime,
  };
}
