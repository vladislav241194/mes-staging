import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as LucideIcons from "lucide-react";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(projectRoot, "src", "icons", "mes-mixed", "source");
const outputPath = join(projectRoot, "src", "icons", "registry.js");

const runtimeRegistry = JSON.parse(await readFile(join(sourceRoot, "mappings", "runtime-mixed-registry.json"), "utf-8"));
const mixedManifest = JSON.parse(await readFile(join(sourceRoot, "reports", "mixed-icon-manifest.json"), "utf-8"));
const brandLogoSvg = normalizeSvg(
  (await readFile(join(projectRoot, "favicon.svg"), "utf-8"))
    .replaceAll('fill="#fff"', 'fill="currentColor"')
    .replaceAll('fill="#ffffff"', 'fill="currentColor"'),
);

const LEGACY_ALIASES = {
  arrowLeft: "arrow-left",
  arrowRight: "arrow-right",
  backspaceApple: "pin-backspace-apple",
  bom: "pcb-bom",
  chevronDown: "chevron-down",
  chevronRight: "chevron-right",
  chevronUp: "chevron-up",
  departments: "missing-departments",
  open: "missing-open",
  package: "package-inventory",
  print: "missing-print",
  routeEdit: "route-edit",
  trashSoft: "trash-soft",
  users: "missing-users",
};

const RUNTIME_ALIASES = {
  D1: "department-warehouse",
  D2: "department-technology",
  D3: "department-smt",
  D3_AOI: "unit-aoi",
  D3_CC: "department-coating",
  D3_CC_LINE: "unit-selective-coating-line",
  D3_L1: "unit-smt-line-1",
  D3_L2: "unit-smt-line-2",
  D3_UW: "unit-ultrasonic-cleaning",
  D4: "department-qc",
  D5: "department-manual-assembly",
  D5_L1: "unit-tht-line-1",
  D5_L2: "unit-tht-line-2",
  D5_L3: "unit-tht-line-3",
  D5_L4: "unit-tht-line-4",
  D5_WORKPLACE: "unit-soldering-workplace",
  D6: "department-firmware",
  D6_WORKPLACE: "unit-firmware-workplace",
  D9: "department-mechanical-assembly",
  D11: "department-marking-packaging",
  D11_MARKING: "unit-marking",
  D11_PACKING: "unit-packaging",
  D_SERVICE: "department-service",
};

const LEGACY_CUSTOM_ICON_ALIASES = {
  "custom-aoi-machine-vision": "unit-aoi",
  "custom-coating-nozzle-drop": "department-coating",
  "custom-gost-document": "unit-technology-docs",
  "custom-manual-solder-wrench": "department-manual-assembly",
  "custom-marking-packaging": "department-marking-packaging",
  "custom-mechanical-assembly": "department-mechanical-assembly",
  "custom-production-technology-support": "department-technology",
  "custom-programming-pogopins": "department-firmware",
  "custom-qc-microscope": "department-qc",
  "custom-service-repair-claim": "department-service",
  "custom-smt-nozzle-chip": "department-smt",
  "custom-soldering-iron-only": "unit-soldering-workplace",
  "custom-warehouse-boxes-handlift": "department-warehouse",
};

const CUSTOM_SVG_READABILITY_OVERRIDES = {
  "department-service": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 18.8 15.7 8.3"/><path d="M15.2 4.2 19.8 8.8"/><path d="M17.7 3.5 20.5 6.3"/><path d="M4.4 17.7a2.2 2.2 0 1 0 3.1 3.1"/></svg>`,
};

const SOURCE_LABELS = {
  "custom-svg": "Custom MES SVG",
  "lucide-react": "Lucide React",
  "local-fallback-svg": "Local fallback SVG",
  "brand-asset": "MES brand asset",
  "virtual-custom": "Virtual custom placeholder",
};

const LUCIDE_COMPONENT_FALLBACKS = {
  Figma: "Component",
};

function normalizeSvg(svg) {
  return String(svg || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "")
    .replace(/\s+width="[^"]*"/, "")
    .replace(/\s+height="[^"]*"/, "")
    .replace(/\s+class="lucide[^"]*"/, "")
    .replace(/\s+aria-hidden="true"/, "")
    .replace(/\s+focusable="false"/, "")
    .replace(/>\s+</g, "><")
    .trim();
}

function renderLucideSvg(componentName) {
  if (!componentName || componentName === "Custom") return "";
  const resolvedComponentName = LucideIcons[componentName] ? componentName : LUCIDE_COMPONENT_FALLBACKS[componentName];
  const Component = LucideIcons[resolvedComponentName];
  if (!Component) return "";
  return normalizeSvg(renderToStaticMarkup(React.createElement(Component, {
    size: 24,
    strokeWidth: 1.9,
    color: "currentColor",
    "aria-hidden": "true",
    focusable: "false",
  })));
}

function renderMissingIconSvg(label = "?") {
  const safeLabel = String(label || "?").slice(0, 2).replace(/[<>&"]/g, "");
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"></rect><text x="12" y="15.2" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor" stroke="none">${safeLabel}</text></svg>`;
}

function slugToTitle(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

const manifestBySlug = new Map(mixedManifest.entries.map((entry) => [entry.semanticSlug, entry]));
const runtimeIdsBySlug = Object.entries(RUNTIME_ALIASES).reduce((map, [runtimeId, semanticSlug]) => {
  if (!map.has(semanticSlug)) map.set(semanticSlug, []);
  map.get(semanticSlug).push(runtimeId);
  return map;
}, new Map());
const entries = [];
const svgBySlug = {};
const lucideMissing = [];

for (const [semanticSlug, relativeSvgPath] of Object.entries(runtimeRegistry.customSvg)) {
  const manifest = manifestBySlug.get(semanticSlug) || {};
  const hasReadabilityOverride = Boolean(CUSTOM_SVG_READABILITY_OVERRIDES[semanticSlug]);
  const svg = normalizeSvg(CUSTOM_SVG_READABILITY_OVERRIDES[semanticSlug] || await readFile(join(sourceRoot, relativeSvgPath), "utf-8"));
  svgBySlug[semanticSlug] = svg;
  entries.push({
    semanticSlug,
    iconName: semanticSlug,
    title: manifest.displayNameRu || slugToTitle(semanticSlug),
    group: manifest.groupRu || "Custom MES Icons",
    status: manifest.productionReady ? "approved" : "needs-review",
    source: "custom-svg",
    sourceLabel: SOURCE_LABELS["custom-svg"],
    lucideComponent: "",
    referenceAsset: manifest.referenceCrop ? `./assets/icon-references/mes-mixed/${manifest.referenceCrop.split("/").pop()}` : "",
    runtimeIds: runtimeIdsBySlug.get(semanticSlug) || [],
    usage: "MES production entity",
    note: hasReadabilityOverride
      ? "Readability override for small auth tiles: simplified local custom SVG based on the service/repair semantic."
      : manifest.productionReady ? "Approved custom SVG from mixed icon package." : "Custom SVG from mixed icon package; manual visual review required.",
  });
}

for (const [semanticSlug, componentName] of Object.entries(runtimeRegistry.openSourceLucide)) {
  const manifest = manifestBySlug.get(semanticSlug) || {};
  const resolvedLucideComponent = LucideIcons[componentName] || componentName === "Custom"
    ? componentName
    : LUCIDE_COMPONENT_FALLBACKS[componentName] || componentName;
  const svg = componentName === "Custom"
    ? brandLogoSvg
    : renderLucideSvg(componentName);

  if (!svg) lucideMissing.push(`${semanticSlug}:${componentName}`);

  svgBySlug[semanticSlug] = svg || renderMissingIconSvg();
  entries.push({
    semanticSlug,
    iconName: semanticSlug,
    title: manifest.displayNameRu || slugToTitle(semanticSlug),
    group: manifest.groupRu || "System Lucide Icons",
    status: componentName === "Custom" ? "compatibility" : "approved",
    source: componentName === "Custom" ? "brand-asset" : "lucide-react",
    sourceLabel: componentName === "Custom" ? SOURCE_LABELS["brand-asset"] : SOURCE_LABELS["lucide-react"],
    lucideComponent: resolvedLucideComponent,
    requestedLucideComponent: componentName,
    referenceAsset: "",
    runtimeIds: runtimeIdsBySlug.get(semanticSlug) || [],
    usage: "System UI icon",
    note: componentName === "Custom"
      ? "Current MES brand asset; kept outside the production action-icon set."
      : resolvedLucideComponent === componentName
        ? "Official Lucide React component rendered into the vanilla runtime registry."
        : `Archive mapping requested ${componentName}; lucide-react package does not export it, so official Lucide ${resolvedLucideComponent} is used as a review fallback.`,
  });
}

for (const [semanticSlug, relativeSvgPath] of Object.entries(runtimeRegistry.localFallback)) {
  const manifest = manifestBySlug.get(semanticSlug) || {};
  const svg = normalizeSvg(await readFile(join(sourceRoot, relativeSvgPath), "utf-8"));
  svgBySlug[semanticSlug] = svg;
  entries.push({
    semanticSlug,
    iconName: semanticSlug,
    title: manifest.displayNameRu || slugToTitle(semanticSlug),
    group: manifest.groupRu || "Special fallback icons",
    status: "approved",
    source: "local-fallback-svg",
    sourceLabel: SOURCE_LABELS["local-fallback-svg"],
    lucideComponent: "",
    referenceAsset: "",
    runtimeIds: runtimeIdsBySlug.get(semanticSlug) || [],
    usage: "Special MES fallback icon",
    note: "Special case from the mixed icon package: production-floor-plan must stay local.",
  });
}

const groupOrder = [
  "Отделы",
  "Участки / линии",
  "Оборудование",
  "Функциональные направления",
  "Складские зоны",
  "System Lucide Icons",
  "Special fallback icons",
];

entries.sort((left, right) => {
  const leftIndex = groupOrder.indexOf(left.group);
  const rightIndex = groupOrder.indexOf(right.group);
  const normalizedLeft = leftIndex === -1 ? 99 : leftIndex;
  const normalizedRight = rightIndex === -1 ? 99 : rightIndex;
  if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
  return left.semanticSlug.localeCompare(right.semanticSlug);
});

const entrySlugs = new Set(entries.map((entry) => entry.semanticSlug));
const normalizedAliases = {
  ...LEGACY_ALIASES,
  ...RUNTIME_ALIASES,
  ...LEGACY_CUSTOM_ICON_ALIASES,
};

for (const entry of entries) {
  normalizedAliases[entry.semanticSlug] = entry.semanticSlug;
  normalizedAliases[entry.semanticSlug.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = entry.semanticSlug;
}

const unresolvedAliases = Object.entries(normalizedAliases)
  .filter(([, target]) => !entrySlugs.has(target))
  .map(([alias, target]) => `${alias}:${target}`);

if (lucideMissing.length) {
  throw new Error(`Missing Lucide components: ${lucideMissing.join(", ")}`);
}

if (unresolvedAliases.length) {
  throw new Error(`Icon aliases point to missing entries: ${unresolvedAliases.join(", ")}`);
}

const file = `// Generated by scripts/generate-mes-icon-registry.mjs from mes_mixed_custom_opensource_icon_pack.zip.
// Do not hand-edit icon SVG strings here; update source package files or mapping, then rerun the generator.

export const MES_ICON_SOURCE_PACKAGE = ${JSON.stringify({
  archive: "mes_mixed_custom_opensource_icon_pack.zip",
  generatedAt: mixedManifest.generatedAt,
  customSvgCount: Object.keys(runtimeRegistry.customSvg).length,
  lucideReactCount: Object.keys(runtimeRegistry.openSourceLucide).length,
  localFallbackCount: Object.keys(runtimeRegistry.localFallback).length,
}, null, 2)};

export const MES_ICON_ENTRIES = ${JSON.stringify(entries, null, 2)};

export const MES_ICON_SVG_BY_SLUG = ${JSON.stringify(svgBySlug, null, 2)};

export const MES_ICON_ALIASES = ${JSON.stringify(normalizedAliases, null, 2)};

export const MES_ICON_RUNTIME_ALIASES = ${JSON.stringify(RUNTIME_ALIASES, null, 2)};

const ICON_ENTRY_BY_SLUG = new Map(MES_ICON_ENTRIES.map((entry) => [entry.semanticSlug, entry]));
const NORMALIZED_ALIAS_BY_KEY = new Map(Object.entries(MES_ICON_ALIASES).map(([alias, target]) => [String(alias).toLowerCase(), target]));

export function normalizeMesIconName(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  return NORMALIZED_ALIAS_BY_KEY.get(key.toLowerCase()) || "";
}

export function getMesIconEntry(value) {
  const slug = normalizeMesIconName(value);
  return slug ? ICON_ENTRY_BY_SLUG.get(slug) || null : null;
}

export function getMesIconEntries() {
  return MES_ICON_ENTRIES.map((entry) => ({ ...entry }));
}

export function getMesIconName(value) {
  return getMesIconEntry(value)?.semanticSlug || "";
}

export function getMesIconSvg(value) {
  const slug = normalizeMesIconName(value);
  return slug ? MES_ICON_SVG_BY_SLUG[slug] || "" : "";
}

export function getMesIconNameForRuntimeId(runtimeId) {
  return MES_ICON_RUNTIME_ALIASES[String(runtimeId || "")] || "";
}

export function getMesIconReferenceAssetPath(entryOrKey) {
  if (typeof entryOrKey === "string") return getMesIconEntry(entryOrKey)?.referenceAsset || "";
  return entryOrKey?.referenceAsset || "";
}

export function getMesIconSummary() {
  const entries = MES_ICON_ENTRIES;
  const customCount = entries.filter((entry) => entry.source === "custom-svg").length;
  const lucideCount = entries.filter((entry) => entry.source === "lucide-react").length;
  const fallbackCount = entries.filter((entry) => entry.source === "local-fallback-svg").length;
  const readyCount = entries.filter((entry) => entry.status === "approved").length;
  const reviewCount = entries.filter((entry) => entry.status === "needs-review").length;
  const appliedCount = entries.filter((entry) => entry.source === "custom-svg" || entry.source === "lucide-react" || entry.source === "local-fallback-svg" || entry.source === "brand-asset").length;
  return {
    semanticCount: entries.length,
    uniqueSvgCount: new Set(entries.map((entry) => MES_ICON_SVG_BY_SLUG[entry.semanticSlug])).size,
    customCount,
    lucideCount,
    fallbackCount,
    readyCount,
    reviewCount,
    redrawCount: 0,
    appliedCount,
  };
}
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, file);
console.log(`Generated ${entries.length} icon entries -> ${outputPath}`);
