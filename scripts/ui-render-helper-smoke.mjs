import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-ui-render-helpers-"));
let typedUi;
try {
  const output = join(temporaryRoot, "ui-render-helpers.mjs");
  await build({
    stdin: {
      contents: [
        'export { createUiRenderers } from "./src/ui/components.ts";',
        'export { escapeAttribute, escapeHtml, isKnownUiSignalTone, joinUiClasses, normalizeUiTone } from "./src/ui/html.ts";',
      ].join("\n"),
      resolveDir: fileURLToPath(new URL("..", import.meta.url)),
      sourcefile: "ui-render-helpers-entry.mjs",
      loader: "js",
    },
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "silent",
  });
  typedUi = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

const {
  createUiRenderers,
  escapeAttribute,
  escapeHtml,
  isKnownUiSignalTone,
  joinUiClasses,
  normalizeUiTone,
} = typedUi;

const icon = (name) => `<svg data-smoke-icon="${escapeAttribute(name)}"></svg>`;
const ui = createUiRenderers({ icon });
const failures = [];

assertEqual(escapeHtml("<b>MES</b> & \"quote\""), "&lt;b&gt;MES&lt;/b&gt; &amp; &quot;quote&quot;", "escapeHtml escapes HTML");
assertEqual(escapeHtml(null), "", "escapeHtml preserves null as empty text");
assertEqual(escapeHtml(0), "0", "escapeHtml preserves numeric zero");
assertEqual(escapeAttribute("\"quoted\" & <tag>"), "&quot;quoted&quot; &amp; &lt;tag&gt;", "escapeAttribute escapes attributes");
assertEqual(escapeAttribute("line 1\nline 2"), "line 1 line 2", "escapeAttribute replaces line feeds");
assertEqual(joinUiClasses("a", "", null, "b", false, "c"), "a b c", "joinUiClasses filters empty values");
assertEqual(joinUiClasses(" a  b ", 0, ["c", "d"]), "a b c,d", "joinUiClasses preserves legacy string coercion");
assertEqual(isKnownUiSignalTone("system-error"), true, "isKnownUiSignalTone accepts registered system tone");
assertEqual(isKnownUiSignalTone(" success "), false, "isKnownUiSignalTone remains an exact membership check");
assertEqual(normalizeUiTone("success"), "success", "normalizeUiTone preserves known success tone");
assertEqual(normalizeUiTone(" success "), "success", "normalizeUiTone trims a known tone");
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
check("FormField state", ui.renderUiFormField({ label: "Обязательное поле", control: "<input required />", required: true, state: "error", message: "Заполните поле" }), ["data-ui-state=\"error\"", "data-ui-required=\"true\"", "ui-form-required", "data-ui-component=\"FormMessage\""]);
check("FormSection", ui.renderUiFormSection({ title: "Параметры", meta: "Основные данные", body: "<div>body</div>" }), ["data-ui-component=\"FormSection\"", "data-ui-component=\"SectionHeader\"", "ui-form-section-body"]);
check("FormGrid", ui.renderUiFormGrid({ body: "<label>field</label>", columns: "2" }), ["data-ui-component=\"FormGrid\"", "data-ui-columns=\"2\""]);
check("FormRow", ui.renderUiFormRow({ body: "<button>row</button>", align: "end" }), ["data-ui-component=\"FormRow\"", "data-ui-align=\"end\""]);
check("FormActions", ui.renderUiFormActions({ actions: "<button>save</button>" }), ["data-ui-component=\"FormActions\"", "ui-action-bar"]);
check("SystemState", ui.renderUiSystemState({ title: "Ошибка", text: "Повторите позже", tone: "danger", action: "<button>retry</button>" }), ["data-ui-component=\"SystemState\"", "is-danger", "ui-system-state-action"]);
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
