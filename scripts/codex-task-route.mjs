import { MES_FEATURE_REGISTRY } from "../src/feature_registry.js";

const ROUTES = {
  "ui-only": {
    label: "UI/CSS/client-only change",
    version: true,
    checks: ["npm run qa:syntax", "npm run build", "git diff --check"],
    pilot: "npm run deploy:pilot -- --module=<module>",
    restart: false,
    stage: "promote after manual QA only",
    notes: [
      "Use when changes touch src/app.js, src/ui, styles, or client-only modules.",
      "No shared-state copy and no service restart unless server scripts changed.",
    ],
  },
  "server-api": {
    label: "Server/API/runtime route change",
    version: true,
    checks: ["npm run qa:syntax", "npm run build", "git diff --check", "curl/endpoint smoke"],
    pilot: "npm run deploy:pilot -- --module=<module> --restart",
    restart: true,
    stage: "promote after endpoint smoke and manual QA",
    notes: [
      "Use when server.js or scripts/*-endpoint.mjs changed.",
      "Restart pilot because Node must reload server code.",
    ],
  },
  "data-sync": {
    label: "Contour data/shared-state operation",
    version: false,
    checks: ["dry-run", "backup target", "execute", "compare source/target metrics"],
    pilot: "npm run sync:stage-to-pilot:shared-state:dry && npm run sync:stage-to-pilot:shared-state",
    restart: false,
    stage: "never write pilot data back into stage",
    notes: [
      "Use only for one-way stage -> pilot shared-state refresh.",
      "Always verify values/sharedUi sizes after execution.",
    ],
  },
  "stage-promote": {
    label: "Promote verified pilot dist to stage",
    version: false,
    checks: ["npm run promote:pilot-to-staging:dry", "manual QA on pilot", "npm run promote:pilot-to-staging"],
    pilot: "already verified",
    restart: false,
    stage: "dist-only promote with backup",
    notes: [
      "Do not copy shared-state during promote.",
      "Use when users should receive the already-tested pilot frontend.",
    ],
  },
  "feature-removal": {
    label: "Remove feature/subsystem",
    version: true,
    checks: ["npm run qa:features", "npm run qa:syntax", "npm run build", "rg old feature id", "git diff --check"],
    pilot: "route depends on touched files: ui-only or server-api",
    restart: "depends",
    stage: "promote after manual QA",
    notes: [
      "Start from src/feature_registry.js before deleting code.",
      "Remove UI, storage, API, CSS, QA and build/deploy references in one pass.",
    ],
  },
};

function getArgValue(name, fallback = "") {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find((arg) => arg === name || arg.startsWith(prefix));
  if (!entry) return fallback;
  if (entry === name) return "true";
  return entry.slice(prefix.length);
}

const routeId = getArgValue("--type", process.argv[2] || "ui-only");
const featureId = getArgValue("--feature", "");
const route = ROUTES[routeId];

if (!route) {
  console.error(`Unknown route: ${routeId}`);
  console.error(`Available routes: ${Object.keys(ROUTES).join(", ")}`);
  process.exit(2);
}

const feature = featureId ? MES_FEATURE_REGISTRY.find((item) => item.id === featureId) : null;
if (featureId && !feature) {
  console.error(`Unknown feature: ${featureId}`);
  console.error(`Known features: ${MES_FEATURE_REGISTRY.map((item) => item.id).join(", ")}`);
  process.exit(2);
}

console.log(JSON.stringify({
  routeId,
  ...route,
  feature: feature ? {
    id: feature.id,
    label: feature.label,
    status: feature.status,
    domains: feature.domains,
    files: feature.files,
    qa: feature.qa,
    removalContract: feature.removalContract,
  } : null,
}, null, 2));
