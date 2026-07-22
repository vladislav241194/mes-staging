export interface PersonDisplayNameOptions {
  fallback?: string;
}

export function formatDecimalNumber(value: unknown, digits: number = 1): string {
  const number = Number(value || 0);
  const rounded = Math.round(number * 10 ** digits) / 10 ** digits;
  return rounded.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

export function formatRussianCount(
  value: unknown = 0,
  forms: readonly string[] = ["", "", ""],
): string {
  const normalized = Math.max(0, Math.trunc(Number(value || 0)));
  const mod100 = normalized % 100;
  const mod10 = normalized % 10;
  const word = mod100 >= 11 && mod100 <= 14
    ? forms[2]
    : mod10 === 1
      ? forms[0]
      : mod10 >= 2 && mod10 <= 4
        ? forms[1]
        : forms[2];
  return `${normalized.toLocaleString("ru-RU")} ${word || ""}`.trim();
}

export function formatPlanningOperationCount(value: unknown = 0): string {
  return formatRussianCount(value, ["операция", "операции", "операций"]);
}

export function formatPlanningProblemCount(value: unknown = 0): string {
  return formatRussianCount(value, ["проблема", "проблемы", "проблем"]);
}

export function formatPlanningObjectCount(value: unknown = 0): string {
  return formatRussianCount(value, ["объект", "объекта", "объектов"]);
}

function isRussianPersonNamePart(value: unknown = ""): boolean {
  return /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/.test(String(value || "").trim());
}

function isRussianPatronymicPart(value: unknown = ""): boolean {
  const part = String(value || "").trim();
  return isRussianPersonNamePart(part)
    && /(вич|ич|вна|чна|инич|инична|оглы|кызы)$/i.test(part);
}

export function formatPersonDisplayName(
  value: unknown = "",
  options: PersonDisplayNameOptions = {},
): string {
  const fallback = options.fallback || "";
  const parts = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length < 3) return parts.join(" ");
  const [lastName, firstName, middleName] = parts;
  if (!isRussianPersonNamePart(lastName) || !isRussianPersonNamePart(firstName)) {
    return parts.join(" ");
  }
  if (!isRussianPatronymicPart(middleName)) return parts.join(" ");
  return [lastName, firstName].join(" ");
}
