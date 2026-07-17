import { readFile } from "node:fs/promises";
import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { loadSystemDomains, serializeSystemDomains } from "../src/modules/system_domains/service.js";

function arg(name, fallback = "") {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || fallback;
}

function firstDifference(source, target, path = "$") {
  if (Object.is(source, target)) return null;
  if (typeof source !== typeof target || source === null || target === null) return { path, source, target };
  if (Array.isArray(source)) {
    if (source.length !== target.length) return { path: `${path}.length`, source: source.length, target: target.length };
    for (let index = 0; index < source.length; index += 1) {
      const difference = firstDifference(source[index], target[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (typeof source === "object") {
    for (const key of [...new Set([...Object.keys(source), ...Object.keys(target)])].sort()) {
      const difference = firstDifference(source[key], target[key], `${path}.${key}`);
      if (difference) return difference;
    }
  }
  return { path, source, target };
}

const input = arg("--input");
const origin = arg("--origin", "http://127.0.0.1:4175");
if (!input) throw new Error("Usage: node scripts/domain-system-domains-http-diff.mjs --input=/path/to/shared-state.json [--origin=http://127.0.0.1:4175]");

const snapshot = JSON.parse(await readFile(input, "utf8"));
const source = loadSystemDomains(snapshot?.values?.[SYSTEM_DOMAINS_STORAGE_KEY] || "", { strict: true }).domains;
const response = await fetch(`${origin}/api/v1/system-domains`, { headers: { Host: "mes-internal" } });
if (!response.ok) throw new Error(`System Domains API failed: ${response.status}`);
const payload = await response.json();
const target = payload?.item;
if (!target) throw new Error("System Domains API did not return a projection");

const sourceJson = serializeSystemDomains(source);
const targetJson = serializeSystemDomains(target);
console.log(JSON.stringify({
  ok: sourceJson === targetJson,
  difference: firstDifference(JSON.parse(sourceJson), JSON.parse(targetJson)),
  sourceBytes: Buffer.byteLength(sourceJson),
  targetBytes: Buffer.byteLength(targetJson),
}, null, 2));
