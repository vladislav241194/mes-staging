import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_PATH = path.join(ROOT, "src/app.js");
const REPORT_PATH = path.join(ROOT, "reports/app-runtime-map.json");
const DOC_PATH = path.join(ROOT, "docs/app-runtime-decomposition-map.md");

const source = readFileSync(APP_PATH, "utf8");
const lineStarts = getLineStarts(source);
const functions = findFunctions(source);

const mapped = functions.map((entry) => {
  const body = source.slice(entry.bodyStart, entry.bodyEnd);
  const type = classifyFunction(entry.name, body);
  const dependencies = collectDependencies(body);
  const risk = classifyRisk(entry.name, body, type);
  return {
    name: entry.name,
    kind: entry.kind,
    location: `src/app.js:${lineFor(entry.index)}`,
    line: lineFor(entry.index),
    type,
    risk,
    dependencies,
    suggestedTargetFile: suggestTarget(entry.name, type, risk),
  };
});

const summary = mapped.reduce(
  (acc, entry) => {
    acc.total += 1;
    acc.byType[entry.type] = (acc.byType[entry.type] || 0) + 1;
    acc.byRisk[entry.risk] = (acc.byRisk[entry.risk] || 0) + 1;
    return acc;
  },
  { total: 0, byType: {}, byRisk: {} },
);

mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
mkdirSync(path.dirname(DOC_PATH), { recursive: true });
writeFileSync(
  REPORT_PATH,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), file: "src/app.js", summary, functions: mapped }, null, 2)}\n`,
);
writeFileSync(DOC_PATH, renderMarkdown(summary, mapped));

console.log(`[app-runtime-map] ${mapped.length} functions mapped`);
console.log(`[app-runtime-map] report: ${path.relative(ROOT, REPORT_PATH)}`);
console.log(`[app-runtime-map] docs: ${path.relative(ROOT, DOC_PATH)}`);

function getLineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineFor(index) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return high + 1;
}

function findFunctions(text) {
  const entries = [];
  const patterns = [
    {
      kind: "function-declaration",
      regex: /(?:^|\n)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
      nameGroup: 1,
    },
    {
      kind: "function-expression",
      regex: /(?:^|\n)(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\(/g,
      nameGroup: 1,
    },
    {
      kind: "arrow-function",
      regex: /(?:^|\n)(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
      nameGroup: 1,
    },
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(text))) {
      const openBrace = text.indexOf("{", pattern.regex.lastIndex);
      if (openBrace === -1) {
        continue;
      }
      const closeBrace = findMatchingBrace(text, openBrace);
      if (closeBrace === -1) {
        continue;
      }
      entries.push({
        name: match[pattern.nameGroup],
        kind: pattern.kind,
        index: match.index + match[0].indexOf(match[pattern.nameGroup]),
        bodyStart: openBrace,
        bodyEnd: closeBrace + 1,
      });
    }
  }

  return entries
    .sort((a, b) => a.index - b.index)
    .filter((entry, index, list) => index === 0 || entry.name !== list[index - 1].name || entry.index !== list[index - 1].index);
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let templateDepth = 0;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (quote === "`" && char === "$" && next === "{") {
        templateDepth += 1;
        index += 1;
      } else if (quote === "`" && templateDepth > 0 && char === "}") {
        templateDepth -= 1;
      } else if (char === quote && templateDepth === 0) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "/" && next === "/") {
      index = text.indexOf("\n", index);
      if (index === -1) {
        return -1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      if (end === -1) {
        return -1;
      }
      index = end + 1;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function classifyFunction(name, body) {
  const lowerName = name.toLowerCase();
  const lowerBody = body.toLowerCase();

  if (lowerName.includes("gantt") || lowerBody.includes("operation-slot") || lowerBody.includes("gantt-")) {
    return "gantt-runtime";
  }
  if (lowerName.includes("auth") || lowerName.includes("session") || lowerBody.includes("auth-session")) {
    return "auth-runtime";
  }
  if (lowerName.includes("print") || lowerName.includes("pdf") || lowerBody.includes("window.print")) {
    return "print-runtime";
  }
  if (lowerName.startsWith("handle") || lowerName.includes("event") || lowerName.includes("click") || lowerBody.includes("addEventListener")) {
    return "event-handler";
  }
  if (lowerName.startsWith("renderui") || lowerName.includes("status") && lowerName.includes("token")) {
    return "ui-helper";
  }
  if (lowerName.startsWith("render") && (lowerName.includes("table") || lowerBody.includes("<table") || lowerBody.includes("data-layout=\"table\""))) {
    return "table-renderer";
  }
  if (lowerName.startsWith("render") && (lowerName.includes("modal") || lowerName.includes("drawer") || lowerName.includes("dropdown") || lowerBody.includes("modal-backdrop"))) {
    return "overlay-renderer";
  }
  if (lowerName.startsWith("render")) {
    return "module-renderer";
  }
  if (lowerName.startsWith("format") || lowerName.startsWith("escape") || lowerName.startsWith("join") || lowerName.startsWith("normalize")) {
    return "pure-format-helper";
  }
  if (lowerName.startsWith("get") || lowerName.startsWith("create") || lowerName.startsWith("build")) {
    return "view-model-helper";
  }
  if (lowerBody.includes("state.") || lowerBody.includes("saveState") || lowerBody.includes("localStorage") || lowerName.startsWith("set") || lowerName.startsWith("update")) {
    return "state-mutation";
  }
  if (lowerName.includes("calculate") || lowerName.includes("compute") || lowerBody.includes("reduce(")) {
    return "data-calculation";
  }
  return "unknown";
}

function collectDependencies(body) {
  const dependencies = [];
  const checks = [
    ["DOM", /\bdocument\b|\bwindow\b|querySelector|addEventListener/],
    ["state", /\bstate\b|saveState|loadState|localStorage|sessionStorage/],
    ["HTML", /`[\s\S]*<|escapeHtml|escapeAttribute/],
    ["UI helpers", /renderUi[A-Z]/],
    ["Gantt", /gantt|operation-slot|dependency/i],
    ["Print", /print|pdf|preview/i],
    ["Auth", /auth|session/i],
    ["Forms", /FormData|input|select|textarea/i],
  ];
  for (const [label, regex] of checks) {
    if (regex.test(body)) {
      dependencies.push(label);
    }
  }
  return dependencies.length ? dependencies : ["none-detected"];
}

function classifyRisk(name, body, type) {
  if (["gantt-runtime", "print-runtime", "auth-runtime", "event-handler", "state-mutation"].includes(type)) {
    return "do-not-extract-phase-6";
  }
  if (/\bdocument\b|\bwindow\b|saveState|localStorage|sessionStorage|state\./.test(body)) {
    return "do-not-extract-phase-6";
  }
  if (["ui-helper", "pure-format-helper"].includes(type)) {
    return "safe-to-extract";
  }
  if (["table-renderer", "overlay-renderer", "view-model-helper", "module-renderer"].includes(type)) {
    return "extract-with-tests";
  }
  return "unknown";
}

function suggestTarget(name, type, risk) {
  if (risk === "do-not-extract-phase-6") {
    return "src/app.js (map only in Phase 6)";
  }
  if (type === "ui-helper") {
    return "src/ui/components.js";
  }
  if (type === "pure-format-helper") {
    return "src/ui/html.ts or src/ui/formatters.ts";
  }
  if (type === "overlay-renderer") {
    return "src/ui/overlays.js or module render file";
  }
  if (type === "table-renderer") {
    return "src/ui/table.js or module render file";
  }
  if (type === "module-renderer" && name.startsWith("renderDispatch")) {
    return "src/modules/dispatch/render.js";
  }
  if (type === "module-renderer") {
    return "src/modules/<module>/render.js after smoke";
  }
  return "review manually";
}

function renderMarkdown(summary, rows) {
  const interestingRows = rows
    .filter((row) => row.risk !== "do-not-extract-phase-6" || ["gantt-runtime", "auth-runtime", "print-runtime"].includes(row.type))
    .slice(0, 220);

  const byType = Object.entries(summary.byType)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `- ${type}: ${count}`)
    .join("\n");

  const byRisk = Object.entries(summary.byRisk)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([risk, count]) => `- ${risk}: ${count}`)
    .join("\n");

  return `# App Runtime Decomposition Map

Generated by \`scripts/app-runtime-map.mjs\`.

## Summary

- Source: \`src/app.js\`
- Functions mapped: ${summary.total}

## By Type

${byType}

## By Risk

${byRisk}

## Function Map

| section/function | current location | type | dependencies | risk | suggested target file |
| --- | --- | --- | --- | --- | --- |
${interestingRows.map((row) => `| \`${row.name}\` | \`${row.location}\` | ${row.type} | ${row.dependencies.join(", ")} | ${row.risk} | \`${row.suggestedTargetFile}\` |`).join("\n")}

## Notes

- \`do-not-extract-phase-6\` means the function is coupled to state, DOM, Gantt geometry, print, auth/session or event delegation and should only be mapped in this phase.
- \`extract-with-tests\` means the function may be moved only with render/module smoke and preserved selectors.
- The full machine-readable map is in \`reports/app-runtime-map.json\`.
`;
}
