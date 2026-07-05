import {
  MES_ICON_ENTRIES,
  MES_ICON_RUNTIME_ALIASES,
  MES_ICON_SVG_BY_SLUG,
  getMesIconEntries,
  getMesIconEntry,
  getMesIconName,
  getMesIconNameForRuntimeId,
  getMesIconReferenceAssetPath,
  getMesIconSummary,
  getMesIconSvg,
} from "../registry.js";

export const MES_CUSTOM_ICON_GROUPS = [...new Set(MES_ICON_ENTRIES.map((entry) => entry.group))];

export const MES_CUSTOM_ICON_STATUSES = [...new Set(MES_ICON_ENTRIES.map((entry) => entry.status))];

export const MES_CUSTOM_ICON_SOURCES = [...new Set(MES_ICON_ENTRIES.map((entry) => entry.source))];

export const MES_CUSTOM_ICON_REGISTRY = MES_ICON_ENTRIES;

export const MES_CUSTOM_ICON_SVG_BY_NAME = MES_ICON_SVG_BY_SLUG;

export const MES_CUSTOM_ICON_RUNTIME_ALIASES = MES_ICON_RUNTIME_ALIASES;

export function getMesCustomIconEntries() {
  return getMesIconEntries();
}

export function getMesCustomIconEntryBySemanticSlug(value) {
  return getMesIconEntry(value);
}

export function getMesCustomIconName(value) {
  return getMesIconName(value);
}

export function getMesCustomIconSvg(value) {
  return getMesIconSvg(value);
}

export function getMesCustomIconNameForRuntimeId(runtimeId) {
  return getMesIconNameForRuntimeId(runtimeId);
}

export function getMesCustomIconReferenceAssetPath(entryOrKey) {
  return getMesIconReferenceAssetPath(entryOrKey);
}

export function getMesCustomIconSummary() {
  return getMesIconSummary();
}
