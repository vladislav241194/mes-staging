const QA_INSPECTOR_PARAM = "qa_inspector";
const QA_ROOT_ATTRIBUTE = "data-mes-qa-inspector";
const QA_UI_ATTRIBUTE = "data-mes-qa-ui";
const MAX_HTML_LENGTH = 6000;
const MAX_RULES = 40;

const COMPUTED_STYLE_PROPERTIES = [
  "display", "position", "z-index", "box-sizing",
  "width", "min-width", "max-width", "height", "min-height", "max-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "gap", "row-gap", "column-gap", "align-items", "justify-content",
  "grid-template-columns", "grid-template-rows", "flex", "flex-direction", "flex-wrap",
  "overflow", "overflow-x", "overflow-y",
  "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
  "color", "background", "background-color", "background-image",
  "border", "border-radius", "box-shadow", "opacity", "transform",
];

const state = {
  enabled: false,
  hovered: null,
  selected: null,
  origin: null,
  overlay: null,
  launcher: null,
  panel: null,
  comment: "",
  stylesheetText: new Map(),
};

function isInspectorRequested() {
  try {
    return new URL(window.location.href).searchParams.get(QA_INSPECTOR_PARAM) === "1";
  } catch {
    return false;
  }
}

function isInspectorUi(node) {
  return Boolean(node?.closest?.(`[${QA_UI_ATTRIBUTE}]`));
}

function escapeSelector(value = "") {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function getStableTarget(node) {
  if (!(node instanceof Element) || isInspectorUi(node)) return null;
  return node.closest("[data-qa-id]") || node;
}

function buildStableSelector(element) {
  if (!(element instanceof Element)) return "";
  const qaOwner = element.closest("[data-qa-id]");
  if (qaOwner?.dataset.qaId) return `[data-qa-id="${escapeSelector(qaOwner.dataset.qaId)}"]`;
  if (element.id) return `#${escapeSelector(element.id)}`;

  const parts = [];
  let current = element;
  while (current && current !== document.body && parts.length < 5) {
    let part = current.localName;
    const stableClasses = [...current.classList]
      .filter((name) => !/^(is-|has-|js-|qa-|active|selected|disabled|focus)/i.test(name))
      .slice(0, 2);
    if (stableClasses.length) part += stableClasses.map((name) => `.${escapeSelector(name)}`).join("");

    const parent = current.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((item) => item.localName === current.localName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    const selector = parts.join(" > ");
    try {
      if (document.querySelectorAll(selector).length === 1) return selector;
    } catch {}
    current = parent;
  }
  return parts.join(" > ");
}

function getAccessibleLabel(element) {
  return String(
    element.getAttribute("aria-label")
      || element.getAttribute("title")
      || element.labels?.[0]?.textContent
      || element.textContent
      || element.getAttribute("name")
      || element.localName,
  ).replace(/\s+/g, " ").trim().slice(0, 240);
}

function sanitizeOuterHtml(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll?.("input, textarea").forEach((field) => {
    if (field.type === "password") field.setAttribute("value", "[redacted]");
    else field.removeAttribute("value");
  });
  [clone, ...clone.querySelectorAll?.("*") || []].forEach((node) => {
    [...node.attributes || []].forEach((attribute) => {
      if (/(token|secret|password|authorization|cookie)/i.test(attribute.name)) {
        node.setAttribute(attribute.name, "[redacted]");
      }
    });
  });
  const html = clone.outerHTML || "";
  return html.length > MAX_HTML_LENGTH ? `${html.slice(0, MAX_HTML_LENGTH)}…` : html;
}

function readComputedStyles(element) {
  const computed = window.getComputedStyle(element);
  return Object.fromEntries(COMPUTED_STYLE_PROPERTIES.map((property) => [property, computed.getPropertyValue(property)]));
}

function readElementState(element) {
  return {
    disabled: Boolean(element.matches?.(":disabled") || element.getAttribute("aria-disabled") === "true"),
    focused: document.activeElement === element,
    checked: "checked" in element ? Boolean(element.checked) : null,
    selected: "selected" in element ? Boolean(element.selected) : null,
    expanded: element.getAttribute("aria-expanded"),
    hidden: Boolean(element.hidden || element.getAttribute("aria-hidden") === "true"),
    scrollTop: Math.round(element.scrollTop || 0),
    scrollLeft: Math.round(element.scrollLeft || 0),
  };
}

function isRuleActive(rule) {
  if (rule instanceof CSSMediaRule) return window.matchMedia(rule.conditionText).matches;
  if (rule instanceof CSSSupportsRule) return window.CSS?.supports?.(rule.conditionText) !== false;
  return true;
}

function collectMatchingRules(element) {
  const matches = [];
  const walk = (rules, href, context = []) => {
    for (const rule of rules || []) {
      if (matches.length >= MAX_RULES) return;
      if (rule instanceof CSSImportRule && rule.styleSheet) {
        try {
          walk(rule.styleSheet.cssRules, rule.href || rule.styleSheet.href || href, context);
        } catch {}
        continue;
      }
      if (rule instanceof CSSStyleRule) {
        try {
          if (element.matches(rule.selectorText)) {
            matches.push({
              stylesheet: href,
              selector: rule.selectorText,
              context,
              declarations: rule.style.cssText,
            });
          }
        } catch {}
        continue;
      }
      if (rule.cssRules && isRuleActive(rule)) {
        walk(rule.cssRules, href, [...context, rule.conditionText || rule.name || rule.constructor.name]);
      }
    }
  };

  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules, sheet.href || "inline");
    } catch {}
  }
  return matches;
}

async function addSourceLocations(rules) {
  return Promise.all(rules.map(async (rule) => {
    if (!rule.stylesheet || rule.stylesheet === "inline") return rule;
    try {
      const url = new URL(rule.stylesheet, window.location.href);
      if (url.origin !== window.location.origin) return rule;
      url.search = "";
      const key = url.href;
      if (!state.stylesheetText.has(key)) {
        state.stylesheetText.set(key, fetch(key, { cache: "no-store" }).then((response) => response.ok ? response.text() : ""));
      }
      const source = await state.stylesheetText.get(key);
      const index = source.indexOf(rule.selector);
      const line = index < 0 ? null : source.slice(0, index).split("\n").length;
      return { ...rule, stylesheet: url.pathname.replace(/^\//, ""), line };
    } catch {
      return rule;
    }
  }));
}

async function buildQaPacket(element, comment = "") {
  const rect = element.getBoundingClientRect();
  const qaOwner = element.closest("[data-qa-id]");
  const rawRules = collectMatchingRules(element);
  const rules = await addSourceLocations(rawRules);
  const moduleId = new URL(window.location.href).searchParams.get("module") || "";
  return {
    qaVersion: 1,
    comment: String(comment || "").trim(),
    page: {
      url: window.location.href,
      module: moduleId,
      version: window.__MES_DEPLOY_VERSION__ || "",
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
    },
    target: {
      qaId: qaOwner?.dataset.qaId || "",
      qaSource: qaOwner?.dataset.qaSource || "",
      qaContract: qaOwner?.dataset.qaContract || "",
      tag: element.localName,
      role: element.getAttribute("role") || element.localName,
      label: getAccessibleLabel(element),
      selector: buildStableSelector(element),
      classes: [...element.classList],
      outerHTML: sanitizeOuterHtml(element),
    },
    geometry: {
      x: Math.round(rect.x), y: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height),
      top: Math.round(rect.top), right: Math.round(rect.right),
      bottom: Math.round(rect.bottom), left: Math.round(rect.left),
    },
    state: readElementState(element),
    computed: readComputedStyles(element),
    matchedCssRules: rules,
    capturedAt: new Date().toISOString(),
  };
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {}
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Браузер запретил доступ к буферу обмена");
}

function positionOverlay(element) {
  if (!state.overlay || !(element instanceof Element)) return;
  const rect = element.getBoundingClientRect();
  Object.assign(state.overlay.style, {
    transform: `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`,
    width: `${Math.max(0, Math.round(rect.width))}px`,
    height: `${Math.max(0, Math.round(rect.height))}px`,
  });
  state.overlay.hidden = false;
}

function setSelected(element) {
  if (!state.origin) state.origin = element;
  state.selected = element;
  positionOverlay(element);
  state.overlay.dataset.selected = "1";
  state.panel.hidden = false;
  state.panel.querySelector("[data-qa-target-label]").textContent = getAccessibleLabel(element) || element.localName;
  state.panel.querySelector("[data-qa-target-selector]").textContent = buildStableSelector(element);
  state.panel.querySelector("textarea").focus();
}

function closePanel() {
  state.panel.hidden = true;
  state.selected = null;
  state.origin = null;
  if (state.overlay) {
    state.overlay.hidden = true;
    delete state.overlay.dataset.selected;
  }
}

function setEnabled(enabled) {
  state.enabled = Boolean(enabled);
  document.documentElement.toggleAttribute(QA_ROOT_ATTRIBUTE, state.enabled);
  state.launcher.setAttribute("aria-pressed", String(state.enabled));
  state.launcher.querySelector("span").textContent = state.enabled ? "QA: выбор" : "QA: пауза";
  if (!state.enabled) closePanel();
}

function createInspectorUi() {
  const overlay = document.createElement("div");
  overlay.className = "mes-qa-inspector-overlay";
  overlay.hidden = true;
  overlay.setAttribute(QA_UI_ATTRIBUTE, "overlay");

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "mes-qa-inspector-launcher";
  launcher.setAttribute(QA_UI_ATTRIBUTE, "launcher");
  launcher.innerHTML = `<span>QA: выбор</span><small>Ctrl/⌘+Shift+Q — включить</small>`;

  const panel = document.createElement("aside");
  panel.className = "mes-qa-inspector-panel";
  panel.hidden = true;
  panel.setAttribute(QA_UI_ATTRIBUTE, "panel");
  panel.innerHTML = `
    <header>
      <div><small>Выбранный элемент</small><strong data-qa-target-label></strong></div>
      <button type="button" data-qa-close aria-label="Закрыть">×</button>
    </header>
    <code data-qa-target-selector></code>
    <label>Комментарий<textarea rows="4" placeholder="Что требуется изменить?"></textarea></label>
    <div class="mes-qa-inspector-panel-actions">
      <button type="button" data-qa-parent>↑ Родитель</button>
      <button type="button" data-qa-origin>↩ Исходный</button>
      <button type="button" data-qa-copy>Скопировать QA-пакет</button>
    </div>
    <p data-qa-status>Пакет содержит DOM, геометрию, computed styles и CSS-правила.</p>
  `;

  document.body.append(overlay, launcher, panel);
  state.overlay = overlay;
  state.launcher = launcher;
  state.panel = panel;

  launcher.addEventListener("click", () => setEnabled(!state.enabled));
  panel.querySelector("[data-qa-close]").addEventListener("click", closePanel);
  panel.querySelector("textarea").addEventListener("input", (event) => { state.comment = event.target.value; });
  panel.querySelector("[data-qa-parent]").addEventListener("click", () => {
    const parent = state.selected?.parentElement;
    if (parent && parent !== document.body && !isInspectorUi(parent)) setSelected(parent);
  });
  panel.querySelector("[data-qa-origin]").addEventListener("click", () => {
    if (state.origin && state.origin.isConnected) setSelected(state.origin);
  });
  panel.querySelector("[data-qa-copy]").addEventListener("click", async (event) => {
    if (!state.selected) return;
    const button = event.currentTarget;
    const status = panel.querySelector("[data-qa-status]");
    button.disabled = true;
    status.textContent = "Собираю CSS-правила…";
    try {
      const packet = await buildQaPacket(state.selected, state.comment);
      await copyText(JSON.stringify(packet, null, 2));
      state.comment = "";
      panel.querySelector("textarea").value = "";
      setEnabled(false);
    } catch (error) {
      status.textContent = `Не удалось скопировать: ${error?.message || error}`;
    } finally {
      button.disabled = false;
    }
  });
}

function bindInspectorEvents() {
  document.addEventListener("pointermove", (event) => {
    if (!state.enabled || state.selected || isInspectorUi(event.target)) return;
    const target = getStableTarget(event.target);
    if (!target || target === state.hovered) return;
    state.hovered = target;
    positionOverlay(target);
  }, true);

  document.addEventListener("click", (event) => {
    if (!state.enabled || state.selected || isInspectorUi(event.target)) return;
    const target = getStableTarget(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    setSelected(target);
  }, true);

  window.addEventListener("scroll", () => {
    if (state.selected) positionOverlay(state.selected);
    else if (state.hovered) positionOverlay(state.hovered);
  }, true);
  window.addEventListener("resize", () => {
    if (state.selected) positionOverlay(state.selected);
    else if (state.hovered) positionOverlay(state.hovered);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.panel && !state.panel.hidden) closePanel();
      else if (state.enabled) setEnabled(false);
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "q") {
      event.preventDefault();
      setEnabled(!state.enabled);
    }
  }, true);
}

export function startQaInspector({ enabled = isInspectorRequested() } = {}) {
  if (document.querySelector(`[${QA_UI_ATTRIBUTE}="launcher"]`)) return;
  const start = () => {
    createInspectorUi();
    bindInspectorEvents();
    setEnabled(enabled);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
