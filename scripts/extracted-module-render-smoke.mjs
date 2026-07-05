import { renderDispatchModulePage } from "../src/modules/dispatch/render.js";
import { createUiRenderers } from "../src/ui/components.js";
import { escapeAttribute } from "../src/ui/html.js";

const icon = (name) => `<svg data-smoke-icon="${escapeAttribute(name)}"></svg>`;
const renderers = createUiRenderers({ icon });
const failures = [];

const dispatchHtml = renderDispatchModulePage({
  renderUiModulePage: renderers.renderUiModulePage,
  renderUiPanel: renderers.renderUiPanel,
  renderUiPanelBody: renderers.renderUiPanelBody,
  icon,
});

check("dispatch module", dispatchHtml, [
  "data-ui-component=\"ModulePage\"",
  "data-ui-runtime=\"hard-v1\"",
  "dispatch-placeholder-page",
  "data-ui-component=\"Panel\"",
  "Модуль отключен",
]);

if (failures.length) {
  console.error("[extracted-module-render-smoke] Failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("[extracted-module-render-smoke] OK");

function check(label, html, expectedParts) {
  if (!String(html || "").trim()) {
    failures.push(`${label}: empty output`);
  }
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
