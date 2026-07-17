import {
  MES_MODULE_HEADER_MODES,
  MES_MODULE_SIDEBAR_MODES,
} from "../module_blueprint.js";

function mergeClassNames(...values) {
  return values
    .flatMap((value) => String(value || "").split(/\s+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, items) => items.indexOf(value) === index)
    .join(" ");
}

function renderPatternPart(part, renderer, defaults = {}) {
  if (!part) return "";
  if (typeof part === "string") return part;
  return renderer({
    ...defaults,
    ...part,
    className: mergeClassNames(defaults.className, part.className),
  });
}

export function createMesModulePatternRenderer({
  getBlueprint,
  renderUiModuleHeader,
  renderUiModulePage,
  renderUiModuleSidebar,
} = {}) {
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
  } = {}) {
    const blueprint = getBlueprint(moduleId);
    if (!blueprint) throw new Error(`Unknown MES module blueprint: ${moduleId}`);
    const layout = blueprint.layout;
    const renderedSidebar = renderPatternPart(sidebar, renderUiModuleSidebar, {
      className: layout.sidebarClassName,
    });
    const renderedHeader = renderPatternPart(header, renderUiModuleHeader);

    if (layout.sidebar === MES_MODULE_SIDEBAR_MODES.REQUIRED && !renderedSidebar.trim()) {
      throw new Error(`${moduleId} blueprint requires a ModuleSidebar slot.`);
    }
    if (layout.sidebar === MES_MODULE_SIDEBAR_MODES.ABSENT && renderedSidebar.trim()) {
      throw new Error(`${moduleId} blueprint forbids a ModuleSidebar slot.`);
    }
    if (layout.header === MES_MODULE_HEADER_MODES.REQUIRED && !renderedHeader.trim()) {
      throw new Error(`${moduleId} blueprint requires a ModuleHeader slot.`);
    }
    if (layout.header === MES_MODULE_HEADER_MODES.ABSENT && renderedHeader.trim()) {
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

