export function formatRecordCount(count: number): string {
  const normalized = Math.max(0, Math.trunc(Number(count) || 0));
  const tens = normalized % 100;
  const ones = normalized % 10;
  const word = tens >= 11 && tens <= 14 ? "записей" : ones === 1 ? "запись" : ones >= 2 && ones <= 4 ? "записи" : "записей";
  return `${normalized} ${word}`;
}
