export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

export function joinUiClasses(...values) {
  return values
    .flatMap((value) => String(value || "").split(/\s+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

export function isKnownUiSignalTone(tone) {
  return [
    "neutral",
    "active",
    "info",
    "ready",
    "ok",
    "success",
    "positive",
    "primary",
    "warning",
    "pending",
    "attention",
    "risk",
    "danger",
    "error",
    "negative",
    "critical",
    "blocked",
    "problem",
    "disabled",
    "manual",
    "test",
    "calc",
    "calculated",
    "demo",
    "system-error",
    "demo-function",
  ].includes(tone);
}

export function normalizeUiTone(tone = "neutral") {
  const value = String(tone || "neutral").trim();
  return isKnownUiSignalTone(value) ? value : "neutral";
}
