export const CONTOUR_ADMIN_SCENARIO_ACTIONS = Object.freeze({
  "backup-stage": Object.freeze(["backup-stage-shared-state"]),
  "sync-stage-to-pilot": Object.freeze(["sync-stage-to-pilot"]),
  "deploy-to-pilot": Object.freeze(["request-deploy-to-pilot"]),
  "promote-pilot-to-stage": Object.freeze(["dry-promote-pilot-to-stage", "promote-pilot-to-stage"]),
  "rollback-stage": Object.freeze(["rollback-stage-dry-run"]),
});

type ContourAdminScenarioId = keyof typeof CONTOUR_ADMIN_SCENARIO_ACTIONS;

export const CONTOUR_ADMIN_CLIENT_ACTION_IDS = Object.freeze(
  [...new Set(Object.values(CONTOUR_ADMIN_SCENARIO_ACTIONS).flat())].sort(),
);

export function isContourAdminCommandAllowed(scenarioId: unknown = "", actionId: unknown = ""): boolean {
  const normalizedScenarioId = String(scenarioId || "");
  const normalizedActionId = String(actionId || "");
  if (!Object.hasOwn(CONTOUR_ADMIN_SCENARIO_ACTIONS, normalizedScenarioId)) return false;
  const scenarioActions = CONTOUR_ADMIN_SCENARIO_ACTIONS[normalizedScenarioId as ContourAdminScenarioId];
  return scenarioActions.some((candidateActionId) => candidateActionId === normalizedActionId);
}
