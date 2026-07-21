export function systemDomainsPrimaryTombstoneReady(payload) {
  const consistency = payload?.consistency;
  const promotion = consistency?.details?.reconciliation?.promotion;
  return consistency?.ok === true
    && consistency?.details?.authority?.mode === "postgres-primary"
    && promotion?.readEligible === true
    && promotion?.retirementEligible === true;
}

export function stagedCommandSurfacesDisabled({
  readinessPayload,
  systemDomainsCapabilitiesPayload,
  shiftCapabilitiesPayload,
  directoryNomenclatureTypesCapabilitiesPayload,
  directoryBoardsCapabilitiesPayload,
  processEnvironment = "",
} = {}) {
  const readiness = readinessPayload?.readiness;
  const commands = readiness?.commands;
  const systemCapabilities = systemDomainsCapabilitiesPayload?.capabilities;
  const shiftCapabilities = shiftCapabilitiesPayload?.capabilities;
  const environment = Object.fromEntries(String(processEnvironment)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf("=");
      return index < 0 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)];
    }));
  const onFlags = [
    "MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS",
    "MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS",
    "MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS",
    "MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS",
    "MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS",
    "MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS",
    "MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS",
  ];
  if (onFlags.some((name) => environment[name] === "1")) return false;
  if (String(environment.MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES || "").trim()) return false;
  if (String(environment.MES_SYSTEM_DOMAINS_COMMAND_ACTORS || "").trim()) return false;
  return readinessPayload?.ok === true
    && readiness?.specifications2?.ready === true
    && readiness?.specifications2?.storageBackend === "postgresql"
    && readiness?.shiftExecution?.ready === true
    && readiness?.shiftExecution?.storageBackend === "postgresql"
    && readiness?.shiftExecution?.migrationState === "postgres-primary"
    && commands?.specifications2WorkOrderCreation?.enabled === false
    && commands?.specifications2RevisionPublication?.enabled === false
    && commands?.specifications2AttachmentUpload?.enabled === false
    && commands?.shiftExecutionAssignments?.enabled === false
    && systemDomainsCapabilitiesPayload?.ok === true
    && systemCapabilities?.primaryPostgres === true
    && systemCapabilities?.serverCommandsConfigured === false
    && Array.isArray(systemCapabilities?.configuredServerCommandSurfaces)
    && systemCapabilities.configuredServerCommandSurfaces.length === 0
    && shiftCapabilitiesPayload?.ok === true
    && shiftCapabilities?.primaryPostgres === true
    && shiftCapabilities?.schemaReady === true
    && shiftCapabilities?.serverAuthoritative === true
    && shiftCapabilities?.assignmentCreationEnabled === false
    && shiftCapabilities?.carryoverCancellationEnabled === false
    && directoryNomenclatureTypesCapabilitiesPayload?.ok === true
    && directoryNomenclatureTypesCapabilitiesPayload?.capabilities?.serverCommandsConfigured === false
    && directoryBoardsCapabilitiesPayload?.ok === true
    && directoryBoardsCapabilitiesPayload?.capabilities?.serverCommandsConfigured === false;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const mode = String(process.argv[2] || "");
  let payloads;
  try { payloads = JSON.parse(process.argv[3] || "null"); } catch { payloads = null; }
  const ok = mode === "system-domains-primary-tombstone"
    ? systemDomainsPrimaryTombstoneReady(payloads)
    : mode === "all-command-surfaces-disabled"
      ? stagedCommandSurfacesDisabled(payloads)
      : false;
  if (!ok) process.exit(1);
}
