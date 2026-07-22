import type {
  UiModuleHeaderOptions,
  UiModulePageOptions,
  UiModuleSidebarOptions,
  UiRenderers,
} from "./components.ts";

const REQUIRED_MODULE_SLOT = "required";
const ABSENT_MODULE_SLOT = "absent";

type UiModuleHeaderRenderer = UiRenderers["renderUiModuleHeader"];
type UiModulePageRenderer = UiRenderers["renderUiModulePage"];
type UiModuleSidebarRenderer = UiRenderers["renderUiModuleSidebar"];

type PatternPart<T extends { className?: string }> = string | T | null | undefined | false;

export interface MesModulePatternLayout {
  pattern: string;
  header: string;
  sidebar: string;
  pageClassName: string;
  sidebarClassName: string;
  workspaceClassName: string;
  contentClassName: string;
  ariaLabel: string;
  visualContract: string;
  contractMode: string;
  density: string;
}

export interface MesModulePatternBlueprint {
  id: string;
  layout: MesModulePatternLayout;
}

export interface MesModulePatternRendererDependencies {
  getBlueprint?: (moduleId?: string) => MesModulePatternBlueprint | null | undefined;
  renderUiModuleHeader?: UiModuleHeaderRenderer;
  renderUiModulePage?: UiModulePageRenderer;
  renderUiModuleSidebar?: UiModuleSidebarRenderer;
}

export interface MesModulePatternPageOptions {
  moduleId?: string;
  sidebar?: PatternPart<UiModuleSidebarOptions>;
  header?: PatternPart<UiModuleHeaderOptions>;
  content?: string;
  attributes?: string;
}

function mergeClassNames(...values: unknown[]): string {
  return values
    .flatMap((value) => String(value || "").split(/\s+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, items) => items.indexOf(value) === index)
    .join(" ");
}

function renderPatternPart<T extends { className?: string }>(
  part: PatternPart<T>,
  renderer: (options: T) => string,
  defaults: Partial<T> = {},
): string {
  if (!part) return "";
  if (typeof part === "string") return part;
  return renderer({
    ...defaults,
    ...part,
    className: mergeClassNames(defaults.className, part.className),
  } as T);
}

export function createMesModulePatternRenderer({
  getBlueprint,
  renderUiModuleHeader,
  renderUiModulePage,
  renderUiModuleSidebar,
}: MesModulePatternRendererDependencies = {}) {
  if (typeof getBlueprint !== "function") throw new Error("Module pattern renderer requires getBlueprint().");
  if (typeof renderUiModuleHeader !== "function") throw new Error("Module pattern renderer requires renderUiModuleHeader().");
  if (typeof renderUiModulePage !== "function") throw new Error("Module pattern renderer requires renderUiModulePage().");
  if (typeof renderUiModuleSidebar !== "function") throw new Error("Module pattern renderer requires renderUiModuleSidebar().");

  return function renderMesModulePatternPage({
    moduleId,
    sidebar = null,
    header = null,
    content = "",
    attributes = "",
  }: MesModulePatternPageOptions = {}) {
    const blueprint = getBlueprint(moduleId);
    if (!blueprint) throw new Error(`Unknown MES module blueprint: ${moduleId}`);
    const layout = blueprint.layout;
    const renderedSidebar = renderPatternPart(sidebar, renderUiModuleSidebar, {
      className: layout.sidebarClassName,
    });
    const renderedHeader = renderPatternPart(header, renderUiModuleHeader);

    if (layout.sidebar === REQUIRED_MODULE_SLOT && !renderedSidebar.trim()) {
      throw new Error(`${moduleId} blueprint requires a ModuleSidebar slot.`);
    }
    if (layout.sidebar === ABSENT_MODULE_SLOT && renderedSidebar.trim()) {
      throw new Error(`${moduleId} blueprint forbids a ModuleSidebar slot.`);
    }
    if (layout.header === REQUIRED_MODULE_SLOT && !renderedHeader.trim()) {
      throw new Error(`${moduleId} blueprint requires a ModuleHeader slot.`);
    }
    if (layout.header === ABSENT_MODULE_SLOT && renderedHeader.trim()) {
      throw new Error(`${moduleId} blueprint forbids a ModuleHeader slot.`);
    }

    const blueprintAttributes = [
      `data-module-blueprint="${blueprint.id}"`,
      `data-ui-blueprint="mes-module-blueprint/v1"`,
      `data-ui-pattern="${layout.pattern}"`,
      attributes,
    ].filter(Boolean).join(" ");

    return renderUiModulePage({
      ariaLabel: layout.ariaLabel,
      className: mergeClassNames(`ui-module-pattern-${layout.pattern}`, layout.pageClassName),
      sidebar: renderedSidebar,
      header: renderedHeader,
      content,
      workspaceClassName: layout.workspaceClassName,
      contentClassName: layout.contentClassName,
      attributes: blueprintAttributes,
      visualContract: layout.visualContract,
      contractMode: layout.contractMode,
      density: layout.density,
    });
  };
}

export type MesModulePatternPageRenderer = ReturnType<typeof createMesModulePatternRenderer>;
