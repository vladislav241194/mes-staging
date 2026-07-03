import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  UI_RUNTIME_CONTROLLED_CLASS_PREFIXES,
  UI_RUNTIME_DYNAMIC_CSS_ONLY_CLASSES,
  UI_RUNTIME_DYNAMIC_CSS_ONLY_PREFIXES,
} from "../src/ui_runtime_contracts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const runtimeClassPrefixes = UI_RUNTIME_CONTROLLED_CLASS_PREFIXES;
const dynamicCssOnlyPrefixes = UI_RUNTIME_DYNAMIC_CSS_ONLY_PREFIXES;
const dynamicCssOnlyClasses = new Set(UI_RUNTIME_DYNAMIC_CSS_ONLY_CLASSES);

async function collectCssFiles(relativeDir = "styles") {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await collectCssFiles(relativePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".css")) files.push(relativePath);
  }
  return files;
}

function getLineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function getClassPrefix(className) {
  return runtimeClassPrefixes.find((prefix) => className.startsWith(prefix)) || "";
}

function maskCssNonSelectorText(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(["'])(?:\\.|(?!\1)[\s\S])*\1/g, (match) => match.replace(/[^\n]/g, " "));
}

const appSource = await fs.readFile(path.join(rootDir, "src", "app.js"), "utf8");
const cssFiles = ["styles.css", ...await collectCssFiles()];
const classes = new Map();
const allClasses = new Map();

for (const relativePath of cssFiles) {
  const source = await fs.readFile(path.join(rootDir, relativePath), "utf8");
  const selectorSource = maskCssNonSelectorText(source);
  for (const match of selectorSource.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]+)/g)) {
    const className = match[1];
    if (!allClasses.has(className)) allClasses.set(className, { locations: [] });
    allClasses.get(className).locations.push(`${relativePath}:${getLineNumber(source, match.index || 0)}`);
    const prefix = getClassPrefix(className);
    if (!prefix) continue;
    if (!classes.has(className)) classes.set(className, { prefix, locations: [] });
    classes.get(className).locations.push(`${relativePath}:${getLineNumber(source, match.index || 0)}`);
  }
}

const cssOnlyClasses = [...classes.entries()]
  .filter(([className]) => !appSource.includes(className))
  .map(([className, meta]) => ({ className, ...meta }))
  .sort((left, right) => left.className.localeCompare(right.className));
const isAllowedDynamicCssOnly = (className) =>
  dynamicCssOnlyClasses.has(className) ||
  dynamicCssOnlyPrefixes.some((prefix) => className.startsWith(prefix));
const allCssOnlyClasses = [...allClasses.entries()]
  .filter(([className]) => !appSource.includes(className))
  .map(([className, meta]) => ({ className, ...meta }))
  .sort((left, right) => left.className.localeCompare(right.className));
const unexpectedCssOnlyClasses = allCssOnlyClasses
  .filter(({ className }) => !isAllowedDynamicCssOnly(className));

const byPrefix = new Map();
for (const { prefix } of classes.values()) {
  byPrefix.set(prefix, (byPrefix.get(prefix) || 0) + 1);
}

console.log("MES UI Runtime Class Audit");
console.log(`Prefixes: ${runtimeClassPrefixes.join(", ")}`);
console.log(`CSS classes checked: ${classes.size}`);
console.log(`CSS-only runtime classes: ${cssOnlyClasses.length}`);
console.log(`Global CSS-only classes: ${allCssOnlyClasses.length}`);
console.log(`Unexpected global CSS-only classes: ${unexpectedCssOnlyClasses.length}`);
console.log(`Allowed dynamic CSS-only prefixes: ${dynamicCssOnlyPrefixes.join(", ")}`);
console.log(`Allowed dynamic CSS-only classes: ${[...dynamicCssOnlyClasses].sort().join(", ")}`);
console.log("Classes by prefix:");
[...byPrefix.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .forEach(([prefix, count]) => console.log(`- ${prefix}: ${count}`));

if (cssOnlyClasses.length) {
  console.error("\nFailures:");
  cssOnlyClasses.slice(0, 80).forEach((item) => {
    console.error(`- ${item.className}: ${item.locations.slice(0, 6).join(", ")}`);
  });
  if (cssOnlyClasses.length > 80) {
    console.error(`- ...and ${cssOnlyClasses.length - 80} more`);
  }
  process.exit(1);
}

if (unexpectedCssOnlyClasses.length) {
  console.error("\nUnexpected global CSS-only classes:");
  unexpectedCssOnlyClasses.slice(0, 80).forEach((item) => {
    console.error(`- ${item.className}: ${item.locations.slice(0, 6).join(", ")}`);
  });
  if (unexpectedCssOnlyClasses.length > 80) {
    console.error(`- ...and ${unexpectedCssOnlyClasses.length - 80} more`);
  }
  process.exit(1);
}

console.log("OK: selected hard-runtime CSS classes are backed by src/app.js runtime classes.");
console.log("OK: global CSS-only classes are limited to documented dynamic patterns.");
