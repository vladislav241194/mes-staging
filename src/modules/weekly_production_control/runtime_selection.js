export function selectWeeklyProductionControlRuntime({
  accessMode = "",
  productionInstance = null,
  loadLegacyRuntime,
} = {}) {
  if (accessMode === "react") {
    if (!productionInstance || typeof productionInstance !== "object") {
      throw new Error("Weekly Production Control React runtime is unavailable");
    }
    return productionInstance;
  }
  if (typeof loadLegacyRuntime !== "function") {
    throw new Error("Weekly Production Control legacy rollback loader is unavailable");
  }
  return loadLegacyRuntime();
}
