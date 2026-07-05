import {
  escapeAttribute,
  escapeHtml,
  joinUiClasses,
  normalizeUiTone,
} from "./html.js";

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

  function renderUiPanel({ title, meta = "", className = "", body = "", actions = "", cornerMarker = "", attributes = "" }) {
    return `
    <section class="${escapeAttribute(joinUiClasses("module-panel", "ui-panel", cornerMarker ? "ui-demo-marker-host" : "", className))}" data-ui-component="Panel" ${attributes}>
      ${cornerMarker}
      ${title ? renderUiPanelHead({ title, meta, actions }) : ""}
      ${body}
    </section>
  `;
  }

  function renderUiPanelBody({ body = "", className = "" }) {
    if (!body) return "";
    return `<div class="${escapeAttribute(joinUiClasses("ui-panel-body", className))}" data-ui-component="PanelBody">${body}</div>`;
  }

  function renderUiPanelFooter({ body = "", className = "" }) {
    if (!body) return "";
    return `<footer class="${escapeAttribute(joinUiClasses("ui-panel-footer", className))}" data-ui-component="PanelFooter">${body}</footer>`;
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

  function renderUiActionButton({ label, iconName = "", tone = "secondary", className = "", attributes = "", cornerMarker = "" }) {
    const normalizedTone = String(tone || "secondary").trim();
    const baseClass = normalizedTone === "primary"
      ? "primary-button"
      : normalizedTone === "icon"
        ? "icon-button"
        : normalizedTone === "table-icon"
          ? "table-icon-button"
          : "secondary-button";
    const toneClass = ["ghost", "danger", "compact", "touch"].includes(normalizedTone) ? `is-${normalizedTone}` : "";
    const mergedClassName = joinUiClasses(baseClass, "ui-action-button", toneClass, cornerMarker ? "ui-demo-marker-host" : "", className);
    return `
    <button class="${escapeAttribute(mergedClassName)}" data-ui-component="ActionButton" ${attributes || "type=\"button\""}>
      ${cornerMarker}
      ${iconName ? renderIcon(iconName) : ""}
      <span>${escapeHtml(label || "")}</span>
    </button>
  `;
  }

  function renderUiActionBar(actions = "", className = "") {
    if (!actions) return "";
    return `<div class="${escapeAttribute(joinUiClasses("ui-action-bar", className))}" data-ui-component="ActionBar">${actions}</div>`;
  }

  function renderUiToolbar({ body = "", className = "", attributes = "" }) {
    if (!body) return "";
    return `<div class="${escapeAttribute(joinUiClasses("ui-toolbar", className))}" data-ui-component="Toolbar" ${attributes}>${body}</div>`;
  }

  function renderUiFilterBar({ body = "", className = "", attributes = "" }) {
    if (!body) return "";
    return `<div class="${escapeAttribute(joinUiClasses("ui-filter-bar", className))}" data-ui-component="FilterBar" ${attributes}>${body}</div>`;
  }

  function renderUiSidebarItem({
    title,
    meta = "",
    badge = "",
    badgeTone = "",
    active = false,
    className = "",
    attributes = "",
    tag = "button",
  }) {
    const element = tag === "article" ? "article" : "button";
    const badgeClass = badgeTone ? `is-${normalizeUiTone(badgeTone)}` : "";
    const safeAttributes = attributes || (element === "button" ? "type=\"button\"" : "");
    return `
    <${element} class="${escapeAttribute(joinUiClasses("ui-sidebar-item", active ? "is-active" : "", className))}" data-ui-component="SidebarItem" ${safeAttributes}>
      <span class="ui-sidebar-item-body">
        <strong>${escapeHtml(title || "")}</strong>
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
      </span>
      ${badge ? `<em class="${escapeAttribute(joinUiClasses("ui-sidebar-item-badge", badgeClass))}">${escapeHtml(badge)}</em>` : ""}
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
  }) {
    return `
    <aside class="${escapeAttribute(joinUiClasses("directory-sidebar", "module-data-sidebar", "ui-module-sidebar", cornerMarker ? "ui-demo-marker-host" : "", className))}" data-layout="sidebar" data-ui-component="ModuleSidebar" ${attributes}>
      ${cornerMarker}
      <div class="directory-sidebar-head">
        ${eyebrow ? `<span class="eyebrow">${escapeHtml(eyebrow)}</span>` : ""}
        <h1>${escapeHtml(title || "")}</h1>
      </div>
      ${actions ? `<div class="module-sidebar-actions" data-ui-component="ActionBar">${actions}</div>` : ""}
      ${body}
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
  }) {
    const hasSidebar = Boolean(String(sidebar || "").trim());
    return `
    <section class="${escapeAttribute(joinUiClasses("module-data-page", "ui-module-page", hasSidebar ? "has-sidebar" : "is-full-width", className))}" data-layout="main-content" data-ui-component="ModulePage" data-ui-runtime="hard-v1" aria-label="${escapeAttribute(ariaLabel)}" ${attributes}>
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

  function renderUiTableWrap({ className = "", body = "" }) {
    return `
    <div class="${escapeAttribute(joinUiClasses("ui-table-wrap", className))}" data-layout="table" data-scroll-contract="horizontal-only" data-ui-component="TableWrap">
      ${body}
    </div>
  `;
  }

  function renderUiFormField({ label = "", control = "", hint = "", className = "", attributes = "" }) {
    return `
    <label class="${escapeAttribute(joinUiClasses("ui-form-field", className))}" data-ui-component="FormField" ${attributes}>
      ${label ? `<span>${escapeHtml(label)}</span>` : ""}
      ${control}
      ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
    </label>
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

  function renderUiModalFrame({ title = "", meta = "", body = "", actions = "", className = "", attributes = "" }) {
    const modalClassName = joinUiClasses(className.includes("is-sample") ? "" : "modal", "ui-modal", className);
    return `
    <section class="${escapeAttribute(modalClassName)}" data-ui-component="Modal" role="dialog" aria-modal="true" ${attributes}>
      ${renderUiPanelHead({ title, meta, className: "ui-modal-head" })}
      ${renderUiPanelBody({ body, className: "ui-modal-body" })}
      ${actions ? renderUiPanelFooter({ body: actions, className: "ui-modal-footer" }) : ""}
    </section>
  `;
  }

  function renderUiModalShell({ className = "", attributes = "", content = "", sample = false }) {
    const modalClassName = joinUiClasses(sample ? "" : "modal", "ui-modal", className);
    return `
    <section class="${escapeAttribute(modalClassName)}" data-ui-component="Modal" role="dialog" aria-modal="true" ${attributes}>
      ${content}
    </section>
  `;
  }

  function renderUiDrawerFrame({ title = "", meta = "", body = "", actions = "", className = "", attributes = "" }) {
    return `
    <aside class="${escapeAttribute(joinUiClasses("detail-drawer", "ui-drawer", className))}" data-ui-component="Drawer" ${attributes}>
      ${renderUiPanelHead({ title, meta, className: "ui-drawer-head" })}
      ${renderUiPanelBody({ body, className: "ui-drawer-body" })}
      ${actions ? renderUiPanelFooter({ body: actions, className: "ui-drawer-footer" }) : ""}
    </aside>
  `;
  }

  function renderUiDrawerShell({ className = "", attributes = "", content = "" }) {
    return `
    <aside class="${escapeAttribute(joinUiClasses("detail-drawer", "ui-drawer", className))}" data-ui-component="Drawer" ${attributes}>
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
    renderUiActionBar,
    renderUiToolbar,
    renderUiFilterBar,
    renderUiSidebarItem,
    renderUiModuleSidebar,
    renderUiModulePage,
    renderUiModuleHeader,
    renderUiTableWrap,
    renderUiFormField,
    renderUiDropdownFrame,
    renderUiModalFrame,
    renderUiModalShell,
    renderUiDrawerFrame,
    renderUiDrawerShell,
    renderUiGanttBar,
  };
}
