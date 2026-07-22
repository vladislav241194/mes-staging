declare module "*production_structure_default_work_centers.js" {
  export const DEFAULT_PRODUCTION_WORK_CENTERS: Array<Record<string, unknown>>;
}

declare module "*ui/formatters.js" {
  export function formatPersonDisplayName(
    value?: unknown,
    options?: { fallback?: string },
  ): string;
}
