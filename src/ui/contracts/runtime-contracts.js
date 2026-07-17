import {
  MES_MODULE_BLUEPRINT_REGISTRY,
} from "../../module_registry.js";
import {
  MES_MODULE_RUNTIME_CONTRACTS,
  MES_MODULE_RUNTIME_KINDS,
} from "../../module_blueprint.js";

export const HARD_UI_RUNTIME_MODULE_IDS = Object.freeze(MES_MODULE_BLUEPRINT_REGISTRY
  .filter((blueprint) => (
    blueprint.runtime.kind === MES_MODULE_RUNTIME_KINDS.STANDARD
    && blueprint.runtime.contract === MES_MODULE_RUNTIME_CONTRACTS.HARD
  ))
  .map((blueprint) => blueprint.id));

export const PARTIAL_UI_RUNTIME_MODULE_IDS = Object.freeze([]);

export const PARTIAL_UI_RUNTIME_CONTRACTS = Object.freeze({});

export const SPECIAL_UI_RUNTIME_MODULE_IDS = Object.freeze(MES_MODULE_BLUEPRINT_REGISTRY
  .filter((blueprint) => blueprint.runtime.kind === MES_MODULE_RUNTIME_KINDS.SPECIAL)
  .map((blueprint) => blueprint.id));

export const SPECIAL_UI_RUNTIME_CONTRACTS = Object.freeze(Object.fromEntries(MES_MODULE_BLUEPRINT_REGISTRY
  .filter((blueprint) => blueprint.runtime.kind === MES_MODULE_RUNTIME_KINDS.SPECIAL)
  .map((blueprint) => [blueprint.id, Object.freeze({
    runtime: blueprint.runtime.contract,
    component: blueprint.runtime.component,
    protection: blueprint.runtime.protection,
    contract: blueprint.runtime.contractLabel,
  })])));

export const LEGACY_UI_RUNTIME_MODULE_IDS = Object.freeze([]);

export const UI_RUNTIME_COVERAGE_NOTES = Object.freeze({
  hard: "Собран через renderUiModulePage и защищен hard-runtime геометрическими QA-gates.",
  special: "Имеет специализированный runtime-gate, потому что модуль не является обычной панельной страницей.",
  partial: "Использует UI-kit helpers/markers, но верхняя оболочка еще не переведена на renderUiModulePage.",
  headerless: "Живой hard-runtime модуль сознательно работает без внутренней ModuleHeader, потому что заголовок уже вынесен в контекст страницы.",
  legacy: "Живой модуль на историческом layout/CSS; требует отдельной миграции перед жесткими gates.",
});
