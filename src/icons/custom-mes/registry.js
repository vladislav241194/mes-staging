import {
  getMesRuntimeIconEntry,
  getMesRuntimeIconName,
  getMesRuntimeIconNameForRuntimeId,
  getMesRuntimeIconSvg,
  loadMesRuntimeCustomIconSvgs,
} from "../runtime_registry.js";

export function getMesCustomIconEntryBySemanticSlug(value) {
  return getMesRuntimeIconEntry(value);
}

export function getMesCustomIconName(value) {
  return getMesRuntimeIconName(value);
}

export function getMesCustomIconSvg(value) {
  return getMesRuntimeIconSvg(value);
}

export function loadMesCustomIconSvgs() {
  return loadMesRuntimeCustomIconSvgs();
}

export function getMesCustomIconNameForRuntimeId(runtimeId) {
  return getMesRuntimeIconNameForRuntimeId(runtimeId);
}
