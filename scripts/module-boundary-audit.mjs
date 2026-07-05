import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_ROOT = path.join(ROOT, "src");
const JS_FILES = listJsFiles(SRC_ROOT);
const violations = [];
const graph = new Map();

for (const filePath of JS_FILES) {
  const rel = toPosix(path.relative(ROOT, filePath));
  const source = readFileSync(filePath, "utf8");
  const imports = findImports(source)
    .map((specifier) => resolveImport(rel, specifier))
    .filter(Boolean);
  graph.set(rel, imports);
  checkImportPolicy(rel, imports);
}

checkCycles(graph);

if (violations.length) {
  console.error("[module-boundary-audit] Boundary violations:");
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log(`[module-boundary-audit] OK: ${JS_FILES.length} JS files checked`);

function listJsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsFiles(absolute));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(absolute);
    }
  }
  return files;
}

function findImports(source) {
  const imports = [];
  const patterns = [
    /import\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g,
    /export\s+[^'";]+?\s+from\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      imports.push(match[1]);
    }
  }
  return imports;
}

function resolveImport(fromRel, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const fromDir = path.dirname(fromRel);
  const resolved = toPosix(path.normalize(path.join(fromDir, specifier)));
  if (resolved.endsWith(".js")) {
    return resolved;
  }
  return `${resolved}.js`;
}

function checkImportPolicy(fromRel, imports) {
  const from = toPosix(fromRel);
  const isUi = from.startsWith("src/ui/");
  const isUiContracts = from.startsWith("src/ui/contracts/");
  const isModule = from.startsWith("src/modules/");
  const isGantt = from.startsWith("src/gantt/");

  for (const target of imports) {
    if (!target.startsWith("src/")) {
      continue;
    }

    if (isUi && target.startsWith("src/modules/")) {
      violations.push(`${from} must not import module renderers (${target})`);
    }
    if (isUi && target === "src/app.js") {
      violations.push(`${from} must not import src/app.js`);
    }
    if (isUiContracts && (target.startsWith("src/modules/") || target === "src/app.js")) {
      violations.push(`${from} contract file must not import runtime render/state (${target})`);
    }
    if (isModule && target === "src/app.js") {
      violations.push(`${from} module renderer must not import src/app.js; pass dependencies explicitly`);
    }
    if (isGantt && target.startsWith("src/modules/")) {
      violations.push(`${from} Gantt code must not import ordinary module renderers (${target})`);
    }
  }
}

function checkCycles(importGraph) {
  const visiting = new Set();
  const visited = new Set();

  for (const node of importGraph.keys()) {
    visit(node, []);
  }

  function visit(node, stack) {
    if (visited.has(node)) {
      return;
    }
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node);
      const cycle = [...stack.slice(cycleStart), node].join(" -> ");
      violations.push(`circular import detected: ${cycle}`);
      return;
    }

    visiting.add(node);
    const nextStack = [...stack, node];
    for (const target of importGraph.get(node) || []) {
      if (importGraph.has(target)) {
        visit(target, nextStack);
      }
    }
    visiting.delete(node);
    visited.add(node);
  }
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
