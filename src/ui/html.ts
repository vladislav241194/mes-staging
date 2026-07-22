const KNOWN_UI_SIGNAL_TONES = [
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
] as const;

export type UiSignalTone = typeof KNOWN_UI_SIGNAL_TONES[number];

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replaceAll("\n", " ");
}

export function joinUiClasses(...values: unknown[]): string {
  return values
    .flatMap((value) => String(value || "").split(/\s+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

export function isKnownUiSignalTone(tone: unknown): tone is UiSignalTone {
  return typeof tone === "string"
    && (KNOWN_UI_SIGNAL_TONES as readonly string[]).includes(tone);
}

export function normalizeUiTone(tone: unknown = "neutral"): UiSignalTone {
  const value = String(tone || "neutral").trim();
  return isKnownUiSignalTone(value) ? value : "neutral";
}
