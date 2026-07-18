import {
  escapeAttribute,
  escapeHtml,
  joinUiClasses,
  normalizeUiTone,
} from "./html.js";

const DEFAULT_UI_MODULE_CONTRACTS = ["ops-soft-v1", "visual-parity-v2"];

export function createUiRenderers({ icon }) {
  const renderIcon = typeof icon === "function" ? icon : () => "";

  function renderUiPanelHead({ title, meta = "", className = "", actions = "", actionsClassName = "ui-panel-head-actions" }) {
    return `
    <div class="${escapeAttribute(joinUiClasses("ui-panel-head", className))}" data-ui-component="PanelHead">
      <div class="ui-panel-head-copy">
        <div>
          <strong>${escapeHtml(title || "")}</strong>
          ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
        </div>
      </div>
      ${actions ? `<div class="${escapeAttribute(joinUiClasses(actionsClassName))}">${actions}</div>` : ""}
    </div>
  `;
  }

  function renderUiPanel({
    title,
    meta = "",
    className = "",
    body = "",
    actions = "",
    actionsClassName = "ui-panel-head-actions",
    cornerMarker = "",
    attributes = "",
    surface = "",
    density = "",
    component = "Panel",
  }) {
    const componentAttribute = component === "Panel"
      ? 'data-ui-component="Panel"'
      : `data-ui-component="${escapeAttribute(component || "Panel")}"`;
    const contractAttributes = [
      surface ? `data-ui-surface="${escapeAttribute(surface)}"` : "",
      density ? `data-ui-density="${escapeAttribute(density)}"` : "",
      attributes,
    ].filter(Boolean).join(" ");
    return `
    <section class="${escapeAttribute(joinUiClasses("module-panel", "ui-panel", cornerMarker ? "ui-demo-marker-host" : "", className))}" ${componentAttribute} ${contractAttributes}>
      ${cornerMarker}
      ${title ? renderUiPanelHead({ title, meta, actions, actionsClassName }) : ""}
      ${body}
    </section>
  `;
  }

  function renderUiPanelBody({ body = "", className = "", attributes = "", density = "" }) {
    if (!body) return "";
    const densityAttribute = density ? `data-ui-density="${escapeAttribute(density)}"` : "";
    return `<div class="${escapeAttribute(joinUiClasses("ui-panel-body", className))}" data-ui-component="PanelBody" ${densityAttribute} ${attributes}>${body}</div>`;
  }

  function renderUiPanelFooter({ body = "", className = "", attributes = "", density = "" }) {
    if (!body) return "";
    const densityAttribute = density ? `data-ui-density="${escapeAttribute(density)}"` : "";
    return `<footer class="${escapeAttribute(joinUiClasses("ui-panel-footer", className))}" data-ui-component="PanelFooter" ${densityAttribute} ${attributes}>${body}</footer>`;
  }

  function renderUiEmptyState({ iconName = "info", title, text, action = "", className = "" }) {
    return `
    <div class="${escapeAttribute(joinUiClasses("bom-import-empty", "module-preview-empty", "ui-empty-state", className))}" data-ui-component="EmptyState">
      ${renderIcon(iconName)}
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
      ${action}
    </div>
  `;
  }

  function renderUiStatusToken(label, tone = "neutral", className = "") {
    const normalizedTone = normalizeUiTone(tone);
    return `<span class="${escapeAttribute(joinUiClasses("mes-signal", "ui-status-token", `is-${normalizedTone}`, className))}" data-ui-component="StatusToken">${escapeHtml(label || "")}</span>`;
  }

  function renderUiDemoBadge(label = "Демо-функция", text = "") {
    return `
    <span class="ui-demo-badge mes-signal is-demo-function" data-ui-component="DemoBadge" title="Демо-функция: редактируется в прототипе и не влияет на расчеты">
      <strong>${escapeHtml(label)}</strong>
      ${text ? `<small>${escapeHtml(text)}</small>` : ""}
    </span>
  `;
  }

  function renderUiDemoCornerMarker(label = "Демо-элемент: не влияет на систему", symbol = "D", className = "") {
    return `<span class="${escapeAttribute(joinUiClasses("ui-demo-corner-marker", className))}" data-ui-component="DemoMarker" aria-label="${escapeAttribute(label)}" title="${escapeAttribute(label)}">${escapeHtml(symbol)}</span>`;
  }

  function renderUiDemoInteractiveMarker(label = "UI-заглушка: элемент выглядит интерактивным, но пока не выполняет системное действие") {
    return renderUiDemoCornerMarker(label, "D", "is-interactive");
  }

  function renderUiDemoInlineMarker(label = "UI-заглушка: элемент выглядит интерактивным, но пока не выполняет системное действие") {
    return `<em class="ui-demo-inline-marker" data-ui-component="DemoMarkerInline" aria-label="${escapeAttribute(label)}" title="${escapeAttribute(label)}">D</em>`;
  }

  function renderUiActionButton({
    label,
    iconName = "",
    tone = "secondary",
    size = "",
    className = "",
    attributes = "",
    cornerMarker = "",
  }) {
    const normalizedTone = String(tone || "secondary").trim();
    const baseClass = normalizedTone === "primary"
      ? "primary-button"
      : normalizedTone === "icon"
        ? "icon-button"
        : normalizedTone === "table-icon"
          ? "table-icon-button"
          : "secondary-button";
    const toneClass = ["ghost", "danger", "compact", "touch"].includes(normalizedTone) ? `is-${normalizedTone}` : "";
    const inferredSize = normalizedTone === "icon"
      ? "icon"
      : normalizedTone === "table-icon"
        ? "table-icon"
        : normalizedTone === "compact"
          ? "compact"
          : normalizedTone === "touch"
            ? "touch"
            : "default";
    const normalizedSize = ["default", "compact", "touch", "icon", "table-icon"].includes(String(size || ""))
      ? String(size)
      : inferredSize;
    const semanticTone = /(?:^|\s)danger(?:-|\s|$)/.test(String(className || ""))
      ? "danger"
      : ["primary", "secondary", "ghost", "danger", "icon", "table-icon"].includes(normalizedTone)
        ? normalizedTone
        : "secondary";
    const mergedClassName = joinUiClasses(baseClass, "ui-action-button", toneClass, cornerMarker ? "ui-demo-marker-host" : "", className);
    return `
    <button class="${escapeAttribute(mergedClassName)}" data-ui-component="ActionButton" data-ui-variant="${escapeAttribute(`${semanticTone}:${normalizedSize}`)}" data-ui-tone="${escapeAttribute(semanticTone)}" data-ui-size="${escapeAttribute(normalizedSize)}" ${attributes || "type=\"button\""}>
      ${cornerMarker}
      ${iconName ? renderIcon(iconName) : ""}
      ${label ? `<span>${escapeHtml(label)}</span>` : ""}
    </button>
  `;
  }

  function renderUiActionBar(actions = "", className = "") {
    if (!actions) return "";
    return `<div class="${escapeAttribute(joinUiClasses("ui-action-bar", className))}" data-ui-component="ActionBar">${actions}</div>`;
  }

  function renderUiActionFileLabel({ label, iconName = "upload", size = "default", className = "", inputAttributes = "" }) {
    const normalizedSize = ["default", "compact", "touch"].includes(String(size || "")) ? String(size) : "default";
    return `
    <label class="${escapeAttribute(joinUiClasses("primary-button", "ui-action-button", className))}" data-ui-component="ActionButton" data-ui-variant="${escapeAttribute(`primary:${normalizedSize}`)}" data-ui-tone="primary" data-ui-size="${escapeAttribute(normalizedSize)}" role="button">
      ${iconName ? renderIcon(iconName) : ""}
      ${label ? `<span>${escapeHtml(label)}</span>` : ""}
      <input ${inputAttributes || "type=\"file\""} />
    </label>
  `;
  }

  function renderUiToolbar({ body = "", className = "", attributes = "" }) {
    if (!body) return "";
    return `<div class="${escapeAttribute(joinUiClasses("ui-toolbar", className))}" data-ui-component="Toolbar" ${attributes}>${body}</div>`;
  }

  function renderUiFilterBar({ body = "", className = "", attributes = "" }) {
    if (!body) return "";
    return `<div class="${escapeAttribute(joinUiClasses("ui-filter-bar", className))}" data-ui-component="FilterBar" ${attributes}>${body}</div>`;
  }

  function renderUiFormSection({ title = "", meta = "", body = "", actions = "", className = "", attributes = "", density = "" }) {
    if (!body && !title && !actions) return "";
    const densityAttribute = density ? `data-ui-density="${escapeAttribute(density)}"` : "";
    return `
    <section class="${escapeAttribute(joinUiClasses("ui-form-section", className))}" data-ui-component="FormSection" ${densityAttribute} ${attributes}>
      ${(title || meta || actions) ? `
        <header class="ui-form-section-head" data-ui-component="SectionHeader">
          <div class="ui-form-section-copy">
            ${title ? `<strong>${escapeHtml(title)}</strong>` : ""}
            ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
          </div>
          ${actions ? renderUiActionBar(actions, "ui-form-section-actions") : ""}
        </header>
      ` : ""}
      ${body ? `<div class="ui-form-section-body">${body}</div>` : ""}
    </section>
  `;
  }

  function renderUiFormGrid({ body = "", columns = "auto", className = "", attributes = "", density = "" }) {
    if (!body) return "";
    const normalizedColumns = ["1", "2", "3", "4", "auto"].includes(String(columns)) ? String(columns) : "auto";
    const densityAttribute = density ? `data-ui-density="${escapeAttribute(density)}"` : "";
    return `<div class="${escapeAttribute(joinUiClasses("ui-form-grid", className))}" data-ui-component="FormGrid" data-ui-columns="${normalizedColumns}" ${densityAttribute} ${attributes}>${body}</div>`;
  }

  function renderUiFormRow({ body = "", className = "", attributes = "", align = "stretch" }) {
    if (!body) return "";
    const normalizedAlign = ["start", "center", "end", "stretch"].includes(String(align)) ? String(align) : "stretch";
    return `<div class="${escapeAttribute(joinUiClasses("ui-form-row", className))}" data-ui-component="FormRow" data-ui-align="${normalizedAlign}" ${attributes}>${body}</div>`;
  }

  function renderUiFormActions({ actions = "", className = "", attributes = "" }) {
    if (!actions) return "";
    return `<div class="${escapeAttribute(joinUiClasses("ui-form-actions", "ui-action-bar", className))}" data-ui-component="FormActions" ${attributes}>${actions}</div>`;
  }

  function renderUiSidebarItem({
    title,
    meta = "",
    badge = "",
    badgeTone = "",
    badgeFit = "truncate",
    active = false,
    className = "",
    attributes = "",
    tag = "button",
  }) {
    const element = tag === "article" ? "article" : "button";
    const badgeClass = badgeTone ? `is-${normalizeUiTone(badgeTone)}` : "";
    const normalizedBadgeFit = badgeFit === "content" ? "content" : "truncate";
    const safeAttributes = attributes || (element === "button" ? "type=\"button\"" : "");
    return `
    <${element} class="${escapeAttribute(joinUiClasses("ui-sidebar-item", active ? "is-active" : "", className))}" data-ui-component="SidebarItem" ${safeAttributes}>
      <span class="ui-sidebar-item-body">
        <strong>${escapeHtml(title || "")}</strong>
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
      </span>
      ${badge ? `<em class="${escapeAttribute(joinUiClasses("ui-sidebar-item-badge", badgeClass))}" data-ui-fit="${escapeAttribute(normalizedBadgeFit)}">${escapeHtml(badge)}</em>` : ""}
    </${element}>
  `;
  }

  function renderUiModuleSidebar({
    eyebrow = "",
    title = "",
    actions = "",
    body = "",
    className = "",
    cornerMarker = "",
    attributes = "",
    variant = "list",
  }) {
    const normalizedVariant = ["list", "grouped", "queue", "filters", "registry"].includes(String(variant || ""))
      ? String(variant)
      : "list";
    const normalizedMode = normalizedVariant === "grouped"
      ? "grouped"
      : normalizedVariant === "filters"
        ? "filters"
        : "list";
    const normalizedDensity = ["queue", "registry"].includes(normalizedVariant) ? "metadata" : "default";
    return `
    <aside class="${escapeAttribute(joinUiClasses("directory-sidebar", "module-data-sidebar", "ui-module-sidebar", cornerMarker ? "ui-demo-marker-host" : "", className))}" data-layout="sidebar" data-ui-component="ModuleSidebar" data-ui-variant="${escapeAttribute(normalizedVariant)}" data-ui-mode="${escapeAttribute(normalizedMode)}" data-ui-density="${escapeAttribute(normalizedDensity)}" ${attributes}>
      ${cornerMarker}
      <div class="directory-sidebar-head" data-ui-component="ModuleSidebarHead">
        ${eyebrow ? `<span class="eyebrow">${escapeHtml(eyebrow)}</span>` : ""}
        <h1>${escapeHtml(title || "")}</h1>
      </div>
      ${actions ? `<div class="module-sidebar-actions" data-ui-component="ModuleSidebarActions">${actions}</div>` : ""}
      <div class="ui-module-sidebar-body" data-ui-component="ModuleSidebarBody">${body}</div>
    </aside>
  `;
  }

  function renderUiModulePage({
    ariaLabel = "",
    className = "",
    sidebar = "",
    header = "",
    content = "",
    workspaceClassName = "",
    contentClassName = "",
    attributes = "",
    visualContract = "",
    contractMode = "standard",
    density = "",
  }) {
    const hasSidebar = Boolean(String(sidebar || "").trim());
    const contractTokens = new Set();
    if (contractMode === "standard") DEFAULT_UI_MODULE_CONTRACTS.forEach((token) => contractTokens.add(token));
    String(visualContract || "").split(/\s+/).filter(Boolean).forEach((token) => contractTokens.add(token));
    const normalizedVisualContract = [...contractTokens].join(" ");
    const contractAttributes = [
      normalizedVisualContract ? `data-ui-contract="${escapeAttribute(normalizedVisualContract)}"` : "",
      contractMode !== "standard" ? `data-ui-contract-mode="${escapeAttribute(contractMode)}"` : "",
      density ? `data-ui-density="${escapeAttribute(density)}"` : "",
      attributes,
    ].filter(Boolean).join(" ");
    return `
    <section class="${escapeAttribute(joinUiClasses("module-data-page", "ui-module-page", hasSidebar ? "has-sidebar" : "is-full-width", className))}" data-layout="main-content" data-ui-component="ModulePage" data-ui-runtime="hard-v1" aria-label="${escapeAttribute(ariaLabel)}" ${contractAttributes}>
      ${sidebar}
      <div class="${escapeAttribute(joinUiClasses("directory-workspace", "module-data-workspace", "ui-module-workspace", workspaceClassName))}" data-layout="page-workspace" data-ui-component="ModuleWorkspace">
        ${header}
        <div class="${escapeAttribute(joinUiClasses("module-data-content", "ui-module-content", contentClassName))}" data-ui-component="ModuleContent">
          ${content}
        </div>
      </div>
    </section>
  `;
  }

  function renderUiModuleHeader({ eyebrow = "", title, description = "", actions = "", className = "directory-header", cornerMarker = "", attributes = "" }) {
    return `
    <header class="${escapeAttribute(joinUiClasses(className, "ui-module-header", cornerMarker ? "ui-demo-marker-host" : ""))}" data-ui-component="ModuleHeader" ${attributes}>
      ${cornerMarker}
      <div>
        ${eyebrow ? `<span class="eyebrow">${escapeHtml(eyebrow)}</span>` : ""}
        <h2>${escapeHtml(title || "")}</h2>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      </div>
      ${actions ? renderUiActionBar(actions, "ui-module-header-actions") : ""}
    </header>
  `;
  }

  function renderUiTableWrap({ className = "", body = "", attributes = "", scrollContract = "horizontal-only" }) {
    const normalizedScrollContract = String(scrollContract || "horizontal-only").trim().replace(/[^a-z0-9-]+/gi, "-") || "horizontal-only";
    return `
    <div class="${escapeAttribute(joinUiClasses("ui-table-wrap", className))}" data-layout="table" data-scroll-contract="${escapeAttribute(normalizedScrollContract)}" data-ui-component="TableWrap" ${attributes}>
      ${body}
    </div>
  `;
  }

  function renderUiTableControlAttributes({ variant = "standard", density = "default" } = {}) {
    const normalizedVariant = String(variant || "standard").trim().replace(/[^a-z0-9-]+/gi, "-") || "standard";
    const normalizedDensity = ["compact", "default", "touch"].includes(String(density || ""))
      ? String(density)
      : "default";
    return `data-ui-component="TableControl" data-ui-variant="${escapeAttribute(normalizedVariant)}" data-ui-density="${escapeAttribute(normalizedDensity)}"`;
  }

  function renderUiInfoGrid({ items = [], className = "", itemClassName = "", attributes = "" }) {
    if (!items.length) return "";
    return `
    <section class="${escapeAttribute(joinUiClasses("ui-info-grid", className))}" data-ui-component="InfoGrid" ${attributes}>
      ${items.map((item) => `
        <article class="${escapeAttribute(joinUiClasses("ui-info-card", itemClassName, item.className || ""))}" data-ui-component="InfoCard">
          ${item.label ? `<span>${escapeHtml(item.label)}</span>` : ""}
          ${item.value ? `<strong>${escapeHtml(item.value)}</strong>` : ""}
          ${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ""}
        </article>
      `).join("")}
    </section>
  `;
  }

  function renderUiMetricGrid({ items = [], className = "", itemClassName = "", attributes = "" }) {
    if (!items.length) return "";
    return `
    <div class="${escapeAttribute(joinUiClasses("ui-metric-grid", className))}" data-ui-component="MetricGrid" ${attributes}>
      ${items.map((item) => `
        <article class="${escapeAttribute(joinUiClasses("ui-metric-card", itemClassName, item.className || ""))}" data-ui-component="MetricCard">
          ${item.label ? `<span>${escapeHtml(item.label)}</span>` : ""}
          ${item.value ? `<strong>${escapeHtml(item.value)}</strong>` : ""}
          ${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ""}
        </article>
      `).join("")}
    </div>
  `;
  }

  function renderUiFormField({
    label = "",
    control = "",
    hint = "",
    message = "",
    state = "default",
    required = false,
    disabled = false,
    readOnly = false,
    className = "",
    attributes = "",
  }) {
    const normalizedState = ["default", "error", "warning", "success"].includes(String(state)) ? String(state) : "default";
    const stateClass = normalizedState === "default" ? "" : `is-${normalizedState}`;
    return `
    <label class="${escapeAttribute(joinUiClasses("ui-form-field", stateClass, required ? "is-required" : "", disabled ? "is-disabled" : "", readOnly ? "is-readonly" : "", className))}" data-ui-component="FormField" data-ui-state="${normalizedState}" ${required ? "data-ui-required=\"true\"" : ""} ${disabled ? "data-ui-disabled=\"true\"" : ""} ${readOnly ? "data-ui-readonly=\"true\"" : ""} ${attributes}>
      ${label ? `<span>${escapeHtml(label)}${required ? `<em class="ui-form-required" aria-hidden="true">*</em>` : ""}</span>` : ""}
      ${control}
      ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
      ${message ? `<small class="ui-form-field-message" data-ui-component="FormMessage">${escapeHtml(message)}</small>` : ""}
    </label>
  `;
  }

  function renderUiSystemState({ iconName = "info", title = "", text = "", action = "", tone = "neutral", className = "", attributes = "" }) {
    const normalizedTone = normalizeUiTone(tone);
    return `
    <div class="${escapeAttribute(joinUiClasses("ui-system-state", `is-${normalizedTone}`, className))}" data-ui-component="SystemState" data-ui-state="${escapeAttribute(normalizedTone)}" ${attributes}>
      ${iconName ? `<span class="ui-system-state-icon" aria-hidden="true">${renderIcon(iconName)}</span>` : ""}
      <div class="ui-system-state-copy">
        ${title ? `<strong>${escapeHtml(title)}</strong>` : ""}
        ${text ? `<span>${escapeHtml(text)}</span>` : ""}
      </div>
      ${action ? `<div class="ui-system-state-action">${action}</div>` : ""}
    </div>
  `;
  }

  function renderUiDropdownFrame({ trigger = "", body = "", className = "", attributes = "" }) {
    return `
    <details class="${escapeAttribute(joinUiClasses("ui-dropdown", className))}" data-ui-component="Dropdown" ${attributes}>
      <summary class="ui-dropdown-trigger">${trigger}</summary>
      <div class="ui-dropdown-menu">${body}</div>
    </details>
  `;
  }

  function renderUiModalFrame({ title = "", meta = "", body = "", actions = "", headActions = "", size = "default", className = "", attributes = "" }) {
    const modalClassName = joinUiClasses(className.includes("is-sample") ? "" : "modal", "ui-modal", className);
    return `
    <section class="${escapeAttribute(modalClassName)}" data-ui-component="Modal" data-ui-size="${escapeAttribute(size || "default")}" role="dialog" aria-modal="true" ${attributes}>
      ${renderUiPanelHead({ title, meta, actions: headActions, className: "ui-modal-head" })}
      ${renderUiPanelBody({ body, className: "ui-modal-body" })}
      ${actions ? renderUiPanelFooter({ body: actions, className: "ui-modal-footer" }) : ""}
    </section>
  `;
  }

  function renderUiModalShell({ className = "", attributes = "", content = "", sample = false, size = "default" }) {
    const modalClassName = joinUiClasses(sample ? "" : "modal", "ui-modal", className);
    return `
    <section class="${escapeAttribute(modalClassName)}" data-ui-component="Modal" data-ui-size="${escapeAttribute(size || "default")}" role="dialog" aria-modal="true" ${attributes}>
      ${content}
    </section>
  `;
  }

  function renderUiDrawerFrame({ title = "", meta = "", body = "", actions = "", size = "default", className = "", attributes = "" }) {
    return `
    <aside class="${escapeAttribute(joinUiClasses("detail-drawer", "ui-drawer", className))}" data-ui-component="Drawer" data-ui-size="${escapeAttribute(size || "default")}" ${attributes}>
      ${renderUiPanelHead({ title, meta, className: "ui-drawer-head" })}
      ${renderUiPanelBody({ body, className: "ui-drawer-body" })}
      ${actions ? renderUiPanelFooter({ body: actions, className: "ui-drawer-footer" }) : ""}
    </aside>
  `;
  }

  function renderUiDrawerShell({ className = "", attributes = "", content = "", size = "default" }) {
    return `
    <aside class="${escapeAttribute(joinUiClasses("detail-drawer", "ui-drawer", className))}" data-ui-component="Drawer" data-ui-size="${escapeAttribute(size || "default")}" ${attributes}>
      ${content}
    </aside>
  `;
  }

  function renderUiGanttBar({ label = "", meta = "", value = "", segments = [], className = "", attributes = "" }) {
    const normalizedSegments = segments.length ? segments : [{ tone: "is-plan", width: "100%", label: value || label }];
    return `
    <article class="${escapeAttribute(joinUiClasses("ui-gantt-bar", className))}" data-ui-component="GanttBar" ${attributes}>
      ${meta ? `<span class="ui-gantt-bar-meta">${escapeHtml(meta)}</span>` : ""}
      <div class="ui-gantt-bar-track" aria-label="${escapeAttribute(label || meta || "Gantt bar")}">
        ${normalizedSegments.map((segment) => `
          <span class="${escapeAttribute(joinUiClasses("ui-gantt-bar-segment", segment.tone || "is-plan"))}" style="--segment-width:${escapeAttribute(segment.width || "100%")}">
            ${segment.label ? `<b>${escapeHtml(segment.label)}</b>` : ""}
          </span>
        `).join("")}
        ${value ? `<strong class="ui-gantt-bar-value">${escapeHtml(value)}</strong>` : ""}
      </div>
    </article>
  `;
  }

  return {
    renderUiPanelHead,
    renderUiPanel,
    renderUiPanelBody,
    renderUiPanelFooter,
    renderUiEmptyState,
    renderUiStatusToken,
    renderUiDemoBadge,
    renderUiDemoCornerMarker,
    renderUiDemoInteractiveMarker,
    renderUiDemoInlineMarker,
    renderUiActionButton,
    renderUiActionFileLabel,
    renderUiActionBar,
    renderUiToolbar,
    renderUiFilterBar,
    renderUiFormSection,
    renderUiFormGrid,
    renderUiFormRow,
    renderUiFormActions,
    renderUiSidebarItem,
    renderUiModuleSidebar,
    renderUiModulePage,
    renderUiModuleHeader,
    renderUiTableWrap,
    renderUiTableControlAttributes,
    renderUiInfoGrid,
    renderUiMetricGrid,
    renderUiFormField,
    renderUiSystemState,
    renderUiDropdownFrame,
    renderUiModalFrame,
    renderUiModalShell,
    renderUiDrawerFrame,
    renderUiDrawerShell,
    renderUiGanttBar,
  };
}
