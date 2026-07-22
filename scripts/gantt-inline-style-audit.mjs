import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { withBundledTypeScriptClient } from "./typescript-client-qa-loader.mjs";

const {
  GANTT_UI_GEOMETRY_INLINE_STYLE_KEYS,
  GANTT_UI_VISUAL_INLINE_STYLE_KEYS,
} = await withBundledTypeScriptClient(
  new URL("../src/gantt_ui_contracts.ts", import.meta.url),
  (contractModule) => contractModule,
  { prefix: "mes-gantt-inline-style-contracts-qa-" },
);

const sourcePaths = ["experiments/react-migration/src/modules/gantt/GanttScenario.tsx"];
const reportJsonPath = "reports/gantt-inline-style-audit.json";
const reportMarkdownPath = "docs/gantt-inline-style-classification.md";
const writeReport = process.argv.includes("--write-report");

function parseStyleKeys(styleValue = "") {
  return styleValue
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(":")[0]?.trim())
    .filter(Boolean);
}

function classifyStyleKey(key = "") {
  if (GANTT_UI_GEOMETRY_INLINE_STYLE_KEYS.includes(key)) return "geometry";
  if (key.startsWith("--")) return "geometry-css-variable";
  if (GANTT_UI_VISUAL_INLINE_STYLE_KEYS.includes(key)) return "visual";
  return "unknown";
}

function buildMarkdown(report) {
  const rows = report.entries.map((entry) => (
    `| ${entry.sourcePath} | ${entry.line} | \`${entry.keys.join("`, `")}\` | ${entry.classification} | ${entry.status} |`
  ));
  return `# Gantt Inline Style Classification

Generated: ${report.generatedAt}

## Summary

- inline style entries: ${report.entries.length}
- geometry entries: ${report.summary.geometry}
- geometry CSS variable entries: ${report.summary.geometryCssVariable}
- visual inline violations: ${report.summary.visualViolations}
- unknown inline warnings: ${report.summary.unknownWarnings}

Geometry inline styles are allowed because Gantt is an absolute-positioned timeline. Visual inline styles are not allowed unless explicitly moved into the Gantt token contract.

## Entries

| source | line | style keys | classification | status |
| --- | ---: | --- | --- | --- |
${rows.join("\n")}

## Allowed Geometry Keys

${GANTT_UI_GEOMETRY_INLINE_STYLE_KEYS.map((key) => `- \`${key}\``).join("\n")}

## Visual Keys That Must Stay Out Of Inline Styles

${GANTT_UI_VISUAL_INLINE_STYLE_KEYS.map((key) => `- \`${key}\``).join("\n")}
`;
}

async function writeJson(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function run() {
  const entries = [];

  for (const sourcePath of sourcePaths) {
    const source = await readFile(sourcePath, "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.includes("style=")) return;
      const matches = [...line.matchAll(/style="([^"]*)"/g)];
      matches.forEach((match) => {
        const keys = parseStyleKeys(match[1]);
        if (!keys.length) return;
        const classes = keys.map(classifyStyleKey);
        const hasVisual = classes.includes("visual");
        const hasUnknown = classes.includes("unknown");
        entries.push({
          sourcePath,
          line: index + 1,
          style: match[1],
          keys,
          keyClassifications: keys.map((key, keyIndex) => ({ key, classification: classes[keyIndex] })),
          classification: hasVisual ? "visual" : hasUnknown ? "unknown" : classes.includes("geometry") ? "geometry" : "geometry-css-variable",
          status: hasVisual ? "fail" : hasUnknown ? "warn" : "ok",
        });
      });
    });
  }
  const visualViolations = entries.filter((entry) => entry.status === "fail");
  const unknownWarnings = entries.filter((entry) => entry.status === "warn");
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePaths,
    summary: {
      entries: entries.length,
      geometry: entries.filter((entry) => entry.classification === "geometry").length,
      geometryCssVariable: entries.filter((entry) => entry.classification === "geometry-css-variable").length,
      visualViolations: visualViolations.length,
      unknownWarnings: unknownWarnings.length,
    },
    entries,
    visualViolations,
    unknownWarnings,
  };

  if (writeReport) {
    await writeJson(reportJsonPath, report);
    await writeFile(reportMarkdownPath, buildMarkdown(report));
  }

  console.log("Gantt Inline Style Audit");
  console.log(`- entries: ${entries.length}`);
  console.log(`- visual violations: ${visualViolations.length}`);
  console.log(`- unknown warnings: ${unknownWarnings.length}`);
  console.log(writeReport
    ? `- report: ${reportMarkdownPath}`
    : "- report: not written (pass --write-report to refresh the tracked audit artifacts)");

  if (visualViolations.length) {
    throw new Error(`Gantt visual inline styles detected: ${visualViolations.map((entry) => `${entry.sourcePath}:${entry.line}`).join(", ")}`);
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
