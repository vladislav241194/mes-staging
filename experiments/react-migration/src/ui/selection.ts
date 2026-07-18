export function resolveAvailableFilter<T extends string>(availableIds: readonly T[], selectedId: T, fallbackId: T): T {
  return availableIds.includes(selectedId) ? selectedId : fallbackId;
}
