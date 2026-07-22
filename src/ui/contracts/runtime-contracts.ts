import {
  MES_MODULE_BLUEPRINT_REGISTRY,
} from "../../module_registry.js";
import {
  MES_MODULE_RUNTIME_CONTRACTS,
  MES_MODULE_RUNTIME_KINDS,
} from "../../module_blueprint.js";
import type { MesReactCompletionModuleId } from "../../react_completion_registry.ts";

interface UiRuntimeBlueprint {
  readonly id: string;
  readonly runtime: {
    readonly kind: string;
    readonly contract: string;
    readonly component: string;
    readonly protection: string;
    readonly contractLabel: string;
  };
}

export interface PartialUiRuntimeContract {
  readonly status: string;
  readonly reason: string;
  readonly nextMigration: string;
}

export interface SpecialUiRuntimeContract {
  readonly runtime: string;
  readonly component: string;
  readonly protection: string;
  readonly contract: string;
}

export type UiRuntimeCoverageStatus = "hard" | "special" | "partial" | "headerless" | "legacy";

const UI_RUNTIME_BLUEPRINTS = MES_MODULE_BLUEPRINT_REGISTRY as readonly UiRuntimeBlueprint[];

export const HARD_UI_RUNTIME_MODULE_IDS: readonly MesReactCompletionModuleId[] = Object.freeze(UI_RUNTIME_BLUEPRINTS
  .filter((blueprint) => (
    blueprint.runtime.kind === MES_MODULE_RUNTIME_KINDS.STANDARD
    && blueprint.runtime.contract === MES_MODULE_RUNTIME_CONTRACTS.HARD
  ))
  .map((blueprint) => blueprint.id as MesReactCompletionModuleId));

export const PARTIAL_UI_RUNTIME_MODULE_IDS = Object.freeze([]) as readonly MesReactCompletionModuleId[];

export const PARTIAL_UI_RUNTIME_CONTRACTS = Object.freeze({}) as Readonly<Partial<Record<MesReactCompletionModuleId, PartialUiRuntimeContract>>>;

export const SPECIAL_UI_RUNTIME_MODULE_IDS: readonly MesReactCompletionModuleId[] = Object.freeze(UI_RUNTIME_BLUEPRINTS
  .filter((blueprint) => blueprint.runtime.kind === MES_MODULE_RUNTIME_KINDS.SPECIAL)
  .map((blueprint) => blueprint.id as MesReactCompletionModuleId));

export const SPECIAL_UI_RUNTIME_CONTRACTS = Object.freeze(Object.fromEntries(UI_RUNTIME_BLUEPRINTS
  .filter((blueprint) => blueprint.runtime.kind === MES_MODULE_RUNTIME_KINDS.SPECIAL)
  .map((blueprint) => [blueprint.id, Object.freeze({
    runtime: blueprint.runtime.contract,
    component: blueprint.runtime.component,
    protection: blueprint.runtime.protection,
    contract: blueprint.runtime.contractLabel,
  })]))) as Readonly<Partial<Record<MesReactCompletionModuleId, Readonly<SpecialUiRuntimeContract>>>>;

export const LEGACY_UI_RUNTIME_MODULE_IDS = Object.freeze([]) as readonly MesReactCompletionModuleId[];

export const UI_RUNTIME_COVERAGE_NOTES = Object.freeze({
  hard: "Собран через renderUiModulePage и защищен hard-runtime геометрическими QA-gates.",
  special: "Имеет специализированный runtime-gate, потому что модуль не является обычной панельной страницей.",
  partial: "Использует UI-kit helpers/markers, но верхняя оболочка еще не переведена на renderUiModulePage.",
  headerless: "Живой hard-runtime модуль сознательно работает без внутренней ModuleHeader, потому что заголовок уже вынесен в контекст страницы.",
  legacy: "Живой модуль на историческом layout/CSS; требует отдельной миграции перед жесткими gates.",
}) satisfies Readonly<Record<UiRuntimeCoverageStatus, string>>;
