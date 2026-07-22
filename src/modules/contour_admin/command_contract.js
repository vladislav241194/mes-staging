export const CONTOUR_ADMIN_SCENARIO_ACTIONS = Object.freeze({
  "backup-stage": Object.freeze(["backup-stage-shared-state"]),
  "sync-stage-to-pilot": Object.freeze(["sync-stage-to-pilot"]),
  "deploy-to-pilot": Object.freeze(["request-deploy-to-pilot"]),
  "promote-pilot-to-stage": Object.freeze(["dry-promote-pilot-to-stage", "promote-pilot-to-stage"]),
  "rollback-stage": Object.freeze(["rollback-stage-dry-run"]),
});

export const CONTOUR_ADMIN_CLIENT_ACTION_IDS = Object.freeze(
  [...new Set(Object.values(CONTOUR_ADMIN_SCENARIO_ACTIONS).flat())].sort(),
);

export function isContourAdminCommandAllowed(scenarioId = "", actionId = "") {
  return CONTOUR_ADMIN_SCENARIO_ACTIONS[String(scenarioId || "")]?.includes(String(actionId || "")) === true;
}
