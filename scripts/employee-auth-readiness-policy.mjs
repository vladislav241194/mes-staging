import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const EMPLOYEE_AUTH_RUNTIME_KEYS = Object.freeze([
  "MES_EMPLOYEE_AUTH_HOSTS",
  "MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS",
  "MES_EMPLOYEE_AUTH_MAX_ATTEMPTS",
  "MES_EMPLOYEE_AUTH_LOCK_SECONDS",
  "MES_EMPLOYEE_AUTH_SESSION_SECRET",
]);

export function parseProtectedEmployeeAuthEnvironment(source = "") {
  const entries = {};
  const allowed = new Set(EMPLOYEE_AUTH_RUNTIME_KEYS);
  for (const raw of String(source || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || !allowed.has(match[1]) || Object.hasOwn(entries, match[1])) {
      throw new Error("Employee-auth env contains an unsupported or duplicate entry");
    }
    entries[match[1]] = match[2];
  }
  return entries;
}

export function parseProcessEnvironment(source = "") {
  return Object.fromEntries(String(source || "").split("\0").filter(Boolean).map((line) => {
    const index = line.indexOf("=");
    return index > 0 ? [line.slice(0, index), line.slice(index + 1)] : [line, ""];
  }));
}

export function assertEmployeeAuthRuntimeMatches({ protectedSource = "", processSource = "", requiredHost = "" } = {}) {
  const expected = parseProtectedEmployeeAuthEnvironment(protectedSource);
  const runtime = parseProcessEnvironment(processSource);
  const hosts = String(expected.MES_EMPLOYEE_AUTH_HOSTS || "").split(",").map((value) => value.trim());
  if (!hosts.includes(String(requiredHost || ""))) throw new Error("Required employee-auth host is missing");
  if (!/^[A-Za-z0-9_-]{32,}$/.test(String(expected.MES_EMPLOYEE_AUTH_SESSION_SECRET || ""))) {
    throw new Error("Employee-auth session secret is missing or invalid");
  }
  const bounds = {
    MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS: [300, 86400],
    MES_EMPLOYEE_AUTH_MAX_ATTEMPTS: [1, 20],
    MES_EMPLOYEE_AUTH_LOCK_SECONDS: [1, 86400],
  };
  for (const [key, [minimum, maximum]] of Object.entries(bounds)) {
    if (expected[key] === undefined) continue;
    const value = Number(expected[key]);
    if (!/^\d+$/.test(expected[key]) || !Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${key} must be between ${minimum} and ${maximum}`);
    }
  }
  if (runtime.MES_ENABLE_EMPLOYEE_AUTH !== "1") throw new Error("Employee-auth is not enabled in the running process");
  for (const key of EMPLOYEE_AUTH_RUNTIME_KEYS) {
    if (String(runtime[key] || "") !== String(expected[key] || "")) {
      throw new Error(`Running employee-auth value differs from the protected environment: ${key}`);
    }
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [protectedPath, processPath, requiredHost] = process.argv.slice(2);
  if (!protectedPath || !processPath || !requiredHost) throw new Error("protected env, process env and required host are required");
  assertEmployeeAuthRuntimeMatches({
    protectedSource: await readFile(protectedPath, "utf8"),
    processSource: (await readFile(processPath)).toString("utf8"),
    requiredHost,
  });
}
