import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const baselinePath = path.join(rootDir, "scripts", "ui-raw-token-baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");

const cssLayerDir = path.join(rootDir, "styles", "layers");
const tokenLayerFiles = new Set(["styles/mes-ui-core.css"]);
const reportFiles = [
  "src/app.js",
  "styles.css",
  "styles/mes-ui-core.css",
];

const rules = [
  { id: "hex", label: "raw hex colors", regexp: /#[0-9a-fA-F]{3,8}\b/g },
  { id: "important", label: "!important", regexp: /!important\b/g },
  { id: "fontSizePx", label: "font-size px", regexp: /font-size\s*:\s*\d+(?:\.\d+)?px\b/g },
  { id: "fontWeightLiteral", label: "font-weight literal", regexp: /font-weight\s*:\s*(?:[5-9]\d{2}|[1-9]\d{3,})\b/g },
  { id: "lineHeightRaw", label: "line-height raw", regexp: /line-height\s*:\s*(?:\d+(?:\.\d+)?px|\d+(?:\.\d+)?)\b/g },
  { id: "borderRadiusPx", label: "border-radius px", regexp: /border-radius\s*:\s*\d+(?:\.\d+)?px\b/g },
  { id: "rawSpacingPx", label: "spacing/position px", regexp: /\b(?:padding|margin|gap|inset|top|right|bottom|left)\s*:\s*[^;{}]*\d+(?:\.\d+)?px\b/g },
];

async function collectLayerFiles() {
  const entries = await fs.readdir(cssLayerDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => `styles/layers/${entry.name}`)
    .sort();
}

function maskComments(source = "") {
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "));
}

function normalizeSnippet(line = "") {
  return line.trim().replace(/\s+/g, " ").slice(0, 220);
}

function getLineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function addCount(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function makeFindingKey(finding) {
  return `${finding.file}|${finding.rule}|${finding.snippet}`;
}

function summarizeFindings(findings) {
  const totals = Object.fromEntries(rules.map((rule) => [rule.id, 0]));
  const byFile = new Map();
  const uniqueHex = new Set();
  findings.forEach((finding) => {
    totals[finding.rule] = (totals[finding.rule] || 0) + 1;
    if (!byFile.has(finding.file)) {
      byFile.set(finding.file, Object.fromEntries(rules.map((rule) => [rule.id, 0])));
    }
    byFile.get(finding.file)[finding.rule] += 1;
    if (finding.rule === "hex") uniqueHex.add(finding.match.toLowerCase());
  });
  return {
    totals,
    uniqueHex: uniqueHex.size,
    byFile: Object.fromEntries([...byFile.entries()].sort(([left], [right]) => left.localeCompare(right))),
  };
}

async function collectFindings() {
  const cssLayerFiles = await collectLayerFiles();
  const files = [...new Set([...reportFiles, ...cssLayerFiles])];
  const findings = [];

  for (const file of files) {
    const absolutePath = path.join(rootDir, file);
    const source = await fs.readFile(absolutePath, "utf8").catch(() => "");
    const searchable = maskComments(source);
    for (const rule of rules) {
      for (const match of searchable.matchAll(rule.regexp)) {
        const line = getLineNumber(source, match.index || 0);
        const lineText = source.split("\n")[line - 1] || "";
        findings.push({
          file,
          rule: rule.id,
          match: match[0],
          line,
          snippet: normalizeSnippet(lineText),
          tokenLayer: tokenLayerFiles.has(file),
        });
      }
    }
  }
  return { files, findings };
}

async function readBaseline() {
  try {
    return JSON.parse(await fs.readFile(baselinePath, "utf8"));
  } catch {
    return null;
  }
}

function buildBaselinePayload(files, findings) {
  const entries = new Map();
  findings
    .filter((finding) => !finding.tokenLayer)
    .forEach((finding) => addCount(entries, makeFindingKey(finding)));
  return {
    version: 1,
    mode: "baseline-aware",
    generatedAt: new Date().toISOString(),
    tokenLayerFiles: [...tokenLayerFiles],
    files,
    summary: summarizeFindings(findings),
    entries: Object.fromEntries([...entries.entries()].sort(([left], [right]) => left.localeCompare(right))),
  };
}

const { files, findings } = await collectFindings();
const summary = summarizeFindings(findings);
const baselinePayload = buildBaselinePayload(files, findings);

if (updateBaseline) {
  await fs.writeFile(baselinePath, `${JSON.stringify(baselinePayload, null, 2)}\n`);
  console.log("MES UI Raw Token Audit");
  console.log("Mode: update-baseline");
  console.log(`Baseline: ${path.relative(rootDir, baselinePath)}`);
  console.log(`Files scanned: ${files.length}`);
  console.log(`Raw hex usages: ${summary.totals.hex}`);
  console.log(`Unique hex colors: ${summary.uniqueHex}`);
  console.log(`!important usages: ${summary.totals.important}`);
  console.log(`font-size px declarations: ${summary.totals.fontSizePx}`);
  console.log(`font-weight literal declarations: ${summary.totals.fontWeightLiteral}`);
  console.log(`line-height raw declarations: ${summary.totals.lineHeightRaw}`);
  console.log(`border-radius px declarations: ${summary.totals.borderRadiusPx}`);
  console.log(`spacing/position px declarations: ${summary.totals.rawSpacingPx}`);
  process.exit(0);
}

const baseline = await readBaseline();
if (!baseline?.entries) {
  console.error("MES UI Raw Token Audit");
  console.error(`Baseline file is missing: ${path.relative(rootDir, baselinePath)}`);
  console.error("Run: node scripts/ui-raw-token-audit.mjs --update-baseline");
  process.exit(1);
}

const baselineEntries = new Map(Object.entries(baseline.entries));
const currentEntries = new Map();
const findingByKey = new Map();
findings
  .filter((finding) => !finding.tokenLayer)
  .forEach((finding) => {
    const key = makeFindingKey(finding);
    addCount(currentEntries, key);
    if (!findingByKey.has(key)) findingByKey.set(key, []);
    findingByKey.get(key).push(finding);
  });

const newViolations = [];
for (const [key, currentCount] of currentEntries.entries()) {
  const baselineCount = baselineEntries.get(key) || 0;
  if (currentCount <= baselineCount) continue;
  const extraCount = currentCount - baselineCount;
  const findingsForKey = findingByKey.get(key) || [];
  findingsForKey.slice(0, extraCount).forEach((finding) => newViolations.push(finding));
}

const topRows = Object.entries(summary.byFile)
  .map(([file, row]) => ({ file, ...row }))
  .sort((left, right) => (
    (right.hex + right.important + right.fontSizePx + right.fontWeightLiteral + right.lineHeightRaw + right.borderRadiusPx + right.rawSpacingPx)
    - (left.hex + left.important + left.fontSizePx + left.fontWeightLiteral + left.lineHeightRaw + left.borderRadiusPx + left.rawSpacingPx)
  ))
  .slice(0, 10);

console.log("MES UI Raw Token Audit");
console.log("Mode: baseline-aware");
console.log(`Baseline: ${path.relative(rootDir, baselinePath)}`);
console.log(`Files scanned: ${files.length}`);
console.log(`Raw hex usages: ${summary.totals.hex}`);
console.log(`Unique hex colors: ${summary.uniqueHex}`);
console.log(`!important usages: ${summary.totals.important}`);
console.log(`font-size px declarations: ${summary.totals.fontSizePx}`);
console.log(`font-weight literal declarations: ${summary.totals.fontWeightLiteral}`);
console.log(`line-height raw declarations: ${summary.totals.lineHeightRaw}`);
console.log(`border-radius px declarations: ${summary.totals.borderRadiusPx}`);
console.log(`spacing/position px declarations: ${summary.totals.rawSpacingPx}`);
console.log("\nTop visual-debt files:");
topRows.forEach((row) => {
  console.log(`- ${row.file}: hex=${row.hex}, !important=${row.important}, fontSizePx=${row.fontSizePx}, fontWeight=${row.fontWeightLiteral}, lineHeight=${row.lineHeightRaw}, radiusPx=${row.borderRadiusPx}, spacingPx=${row.rawSpacingPx}`);
});

if (newViolations.length) {
  console.error("\nNew raw visual values outside token layer:");
  newViolations.slice(0, 80).forEach((finding) => {
    const rule = rules.find((item) => item.id === finding.rule);
    console.error(`- ${finding.file}:${finding.line} ${rule?.label || finding.rule}: ${finding.snippet}`);
  });
  if (newViolations.length > 80) {
    console.error(`- ...and ${newViolations.length - 80} more`);
  }
  console.error("\nMove the value to styles/mes-ui-core.css token layer, reuse an existing token, or intentionally update the baseline after review.");
  process.exit(1);
}

console.log("\nOK: no new raw visual values outside the recorded baseline.");
