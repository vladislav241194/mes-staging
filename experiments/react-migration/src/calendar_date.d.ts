declare module "*calendar_date.js" {
  export function isExactIsoCalendarDate(value: unknown): boolean;
  export function isExactIsoInstantWithOffset(value: unknown): boolean;
  export function toExactIsoCalendarDate(value: unknown): string;
}
