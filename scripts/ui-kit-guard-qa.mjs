import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const requiredDocs = [
  "docs/phase-7-visual-polish-baseline.md",
  "docs/internal-ui-kit-map.md",
  "docs/internal-ui-kit.md",
  "docs/ui-kit-usage-guide.md",
  "docs/ui-kit-component-catalog.md",
  "docs/ui-kit-token-reference.md",
  "docs/ui-kit-migration-rules.md",
  "docs/mobile-limited-support-map.md",
  "docs/visual-polish-result.md",
  "docs/phase-7-visual-polish-result.md",
];

const requiredTokens = [
  "--mes-ui-surface-page",
  "--mes-ui-surface-panel",
  "--mes-ui-surface-control",
  "--mes-ui-border-soft",
  "--mes-ui-border-default",
  "--mes-ui-border-strong",
  "--mes-ui-focus-ring",
  "--mes-ui-table-row-group-bg",
  "--mes-ui-table-row-warning-bg",
  "--mes-ui-table-row-problem-bg",
  "--mes-ui-shadow-overlay",
  "--mes-ui-overlay-max-height",
  "--mes-ui-modal-width",
  "--mes-ui-drawer-width",
];

const requiredVisualSystemEvidence = [
  "visual-system-internal-ui-kit",
  "renderUiActionButton",
  "renderUiStatusToken",
  "renderUiPanel",
  "renderUiTableWrap",
  "renderUiFormField",
  "renderUiModalFrame",
  "renderUiDrawerFrame",
  "renderUiGanttBar",
];

const failures = [];

async function read(relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), "utf8");
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertIncludes(source, needle, label = needle) {
  assert(source.includes(needle), `missing ${label}`);
}

const [
  packageSource,
  stylesSource,
  cssAuditSource,
  coreCssSource,
  runtimeContractsSource,
  appSource,
  kitPolishSource,
] = await Promise.all([
  read("package.json"),
  read("styles.css"),
  read("scripts/css-layer-audit.mjs"),
  read("styles/mes-ui-core.css"),
  read("src/ui_runtime_contracts.ts"),
  read("src/app.js"),
  read("styles/ui/kit-polish.css"),
]);

const packageJson = JSON.parse(packageSource);
const qaUiScript = packageJson.scripts?.["qa:ui"] || "";
const qaSyntaxScript = packageJson.scripts?.["qa:syntax"] || "";

assertIncludes(stylesSource, "@import \"./styles/ui/kit-polish.css\";", "kit polish import");
assertIncludes(cssAuditSource, "./styles/ui/kit-polish.css", "css layer audit import registry");
assertIncludes(qaUiScript, "qa:ui-kit", "qa:ui includes qa:ui-kit");
assertIncludes(qaSyntaxScript, "scripts/ui-kit-guard-qa.mjs", "qa:syntax checks ui-kit guard");

requiredTokens.forEach((token) => {
  assertIncludes(coreCssSource, token, `core token ${token}`);
  assertIncludes(runtimeContractsSource, token, `runtime token contract ${token}`);
});

requiredVisualSystemEvidence.forEach((needle) => {
  assertIncludes(appSource, needle, `visualSystem evidence ${needle}`);
});

const hexMatches = kitPolishSource.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
assert(hexMatches.length === 0, `styles/ui/kit-polish.css must stay token-only; raw hex found: ${hexMatches.slice(0, 8).join(", ")}`);
assert(!/!important\b/.test(kitPolishSource), "styles/ui/kit-polish.css must not add !important rules");
assert(!/data-layout-page="(?:planning|gantt|shiftWorkOrders|routes|products|timesheet|roles|directories|nomenclature|shiftMasterBoard|authSessionPrototype)"/.test(kitPolishSource), "kit polish layer must not contain module-specific page fixes");

for (const relativePath of requiredDocs) {
  assert(await exists(relativePath), `missing UI Kit documentation: ${relativePath}`);
}

console.log("MES UI Kit Guard");
console.log(`Docs checked: ${requiredDocs.length}`);
console.log(`Tokens checked: ${requiredTokens.length}`);
console.log("Polish CSS: token-only, no !important, no page-specific selectors");
console.log("VisualSystem: production helper evidence present");

if (failures.length) {
  console.error("\nUI Kit guard failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("OK: UI Kit guardrails are present.");
