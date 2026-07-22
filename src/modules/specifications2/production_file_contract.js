function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSpecifications2ProductionFile(value = {}) {
  if (!value || typeof value !== "object") return null;
  const storageKey = cleanText(value.storageKey);
  const name = cleanText(value.name);
  if (!storageKey || !name) return null;
  return {
    storageKey,
    name,
    size: Math.max(0, Number(value.size) || 0),
    type: cleanText(value.type),
    uploadedAt: cleanText(value.uploadedAt),
    serverAttachmentId: cleanText(value.serverAttachmentId),
    contentDigest: cleanText(value.contentDigest),
    inlineDataUrl: typeof value.inlineDataUrl === "string" && value.inlineDataUrl.startsWith("data:")
      ? value.inlineDataUrl
      : "",
  };
}
export function normalizeSpecifications2ProductionFiles(value = {}) {
  return {
    pnp: normalizeSpecifications2ProductionFile(value?.pnp),
    gerber: normalizeSpecifications2ProductionFile(value?.gerber),
    instructionDoc: normalizeSpecifications2ProductionFile(value?.instructionDoc),
    instructionPdf: normalizeSpecifications2ProductionFile(value?.instructionPdf),
  };
}

export function isSpecifications2ProductionFileAccepted(kind, fileName) {
  const extension = cleanText(fileName).toLowerCase().split(".").pop();
  return (kind === "pnp" && extension === "txt")
    || (kind === "gerber" && extension === "zip")
    || (kind === "instructionDoc" && ["doc", "docx"].includes(extension))
    || (kind === "instructionPdf" && extension === "pdf");
}
export function getSpecifications2AoiProductionFiles(sourceDraft = {}) {
  return (Array.isArray(sourceDraft.operations) ? sourceDraft.operations : [])
    .filter((item) => item?.operationId === "D3_L1_OP" || item?.operationId === "D3_L2_OP" || /smt/i.test(item?.name || ""))
    .flatMap((item) => {
      const files = normalizeSpecifications2ProductionFiles(item.productionFiles);
      return [
        files.pnp ? { kind: "pnp", file: files.pnp, sourceOperationId: item.id } : null,
        files.gerber ? { kind: "gerber", file: files.gerber, sourceOperationId: item.id } : null,
      ].filter(Boolean);
    });
}
