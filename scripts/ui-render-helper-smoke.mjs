import { createUiRenderers } from "../src/ui/components.js";
import { escapeAttribute, escapeHtml, joinUiClasses, normalizeUiTone } from "../src/ui/html.js";

const icon = (name) => `<svg data-smoke-icon="${escapeAttribute(name)}"></svg>`;
const ui = createUiRenderers({ icon });
const failures = [];

assertEqual(escapeHtml("<b>MES</b> & \"quote\""), "&lt;b&gt;MES&lt;/b&gt; &amp; &quot;quote&quot;", "escapeHtml escapes HTML");
assertEqual(escapeAttribute("\"quoted\" & <tag>"), "&quot;quoted&quot; &amp; &lt;tag&gt;", "escapeAttribute escapes attributes");
assertEqual(joinUiClasses("a", "", null, "b", false, "c"), "a b c", "joinUiClasses filters empty values");
assertEqual(normalizeUiTone("success"), "success", "normalizeUiTone preserves known success tone");
assertEqual(normalizeUiTone("unknown-tone"), "neutral", "normalizeUiTone falls back to neutral");

check("ActionButton primary", ui.renderUiActionButton({
  label: "<Save>",
  iconName: "save",
  tone: "primary",
  attributes: "type=\"button\"",
}), ["data-ui-component=\"ActionButton\"", "primary-button", "&lt;Save&gt;", "data-smoke-icon=\"save\""]);

check("ActionButton icon", ui.renderUiActionButton({
  label: "Настройки",
  iconName: "settings",
  tone: "icon",
}), ["icon-button", "data-smoke-icon=\"settings\"", "<span>Настройки</span>"]);

check("ActionButton danger", ui.renderUiActionButton({
  label: "Удалить",
  iconName: "trash",
  tone: "danger",
}), ["danger", "ui-action-button"]);

check("StatusToken warning", ui.renderUiStatusToken("Риск", "warning"), ["data-ui-component=\"StatusToken\"", "is-warning", "Риск"]);
check("Panel", ui.renderUiPanel({
  title: "Панель",
  meta: "мета",
  actions: ui.renderUiActionButton({ label: "OK", tone: "secondary" }),
  body: ui.renderUiPanelBody({ body: "<p>body</p>" }),
}), ["data-ui-component=\"Panel\"", "data-ui-component=\"PanelHead\"", "data-ui-component=\"PanelBody\"", "ui-panel-head-actions"]);
check("PanelFooter", ui.renderUiPanelFooter({ body: "<button>done</button>" }), ["data-ui-component=\"PanelFooter\"", "ui-panel-footer"]);
check("TableWrap", ui.renderUiTableWrap({ className: "sample-wrap", body: "<table></table>" }), ["data-ui-component=\"TableWrap\"", "data-layout=\"table\"", "sample-wrap"]);
check("FormField", ui.renderUiFormField({ label: "Поле", control: "<input />", hint: "подсказка" }), ["data-ui-component=\"FormField\"", "form-field", "ui-form-field"]);
check("DropdownFrame", ui.renderUiDropdownFrame({ trigger: "<button>open</button>", body: "<div>menu</div>" }), ["data-ui-component=\"Dropdown\"", "ui-dropdown-menu"]);
check("ModalFrame", ui.renderUiModalFrame({ title: "Модалка", meta: "meta", body: "<p>body</p>", actions: "<button>ok</button>" }), ["data-ui-component=\"Modal\"", "ui-modal-head", "ui-modal-footer"]);
check("ModalShell", ui.renderUiModalShell({ content: "<section>modal</section>" }), ["data-ui-component=\"Modal\"", "<section>modal</section>"]);
check("DrawerFrame", ui.renderUiDrawerFrame({ title: "Drawer", body: "<p>body</p>", actions: "<button>ok</button>" }), ["data-ui-component=\"Drawer\"", "ui-drawer-head", "ui-drawer-footer"]);
check("DrawerShell", ui.renderUiDrawerShell({ content: "<aside>drawer</aside>" }), ["data-ui-component=\"Drawer\"", "<aside>drawer</aside>"]);
check("EmptyState", ui.renderUiEmptyState({ title: "Пусто", text: "Нет данных", iconName: "info" }), ["data-ui-component=\"EmptyState\"", "ui-empty-state", "Нет данных"]);
check("GanttBar", ui.renderUiGanttBar({
  label: "План",
  meta: "1000 шт.",
  segments: [{ label: "700", value: "70", tone: "plan", width: "70%" }],
}), ["data-ui-component=\"GanttBar\"", "ui-gantt-bar-segment", "--segment-width:70%"]);

if (failures.length) {
  console.error("[ui-render-helper-smoke] Failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("[ui-render-helper-smoke] OK");

function check(label, html, expectedParts) {
  if (html.includes("undefined")) {
    failures.push(`${label}: output contains undefined`);
  }
  if (html.includes("[object Object]")) {
    failures.push(`${label}: output contains [object Object]`);
  }
  for (const part of expectedParts) {
    if (!html.includes(part)) {
      failures.push(`${label}: missing ${part}`);
    }
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
}
