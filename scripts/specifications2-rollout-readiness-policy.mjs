function commandStatus(payload, name) {
  const commands = payload?.readiness?.commands;
  return payload?.ok === true && Object.hasOwn(commands || {}, name)
    ? commands[name]
    : null;
}

export function specifications2RolloutReadinessSatisfied(mode, payload) {
  const publication = commandStatus(payload, "specifications2RevisionPublication");
  const workOrders = commandStatus(payload, "specifications2WorkOrderCreation");
  const attachments = commandStatus(payload, "specifications2AttachmentUpload");
  if (mode === "attachments-disabled") return attachments?.enabled === false;
  if (mode === "attachments-schema-ready") return attachments?.schemaReady === true;
  if (mode === "attachments-ready") return attachments?.enabled === true && attachments?.schemaReady === true;
  if (mode === "publication-disabled") return publication?.enabled === false;
  if (mode === "publication-schema-ready") return publication?.schemaReady === true;
  if (mode === "publication-ready") return publication?.enabled === true && publication?.schemaReady === true;
  if (mode === "work-orders-disabled") return workOrders?.enabled === false;
  if (mode === "work-orders-schema-ready") {
    return payload?.readiness?.workOrders?.ready === true
      && workOrders?.schemaReady === true
      && publication?.schemaReady === true;
  }
  if (mode === "work-orders-ready") {
    return payload?.readiness?.workOrders?.ready === true
      && workOrders?.enabled === true
      && workOrders?.schemaReady === true
      && publication?.schemaReady === true;
  }
  return false;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const mode = String(process.argv[2] || "");
  let payload = null;
  try { payload = JSON.parse(process.argv[3] || "null"); } catch { payload = null; }
  if (!specifications2RolloutReadinessSatisfied(mode, payload)) process.exit(1);
}
