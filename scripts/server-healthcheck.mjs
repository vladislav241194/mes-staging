const DEFAULT_TIMEOUT_MS = 8000;

function getArgValue(name, fallback = "") {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find((arg) => arg === name || arg.startsWith(prefix));
  if (!entry) return fallback;
  if (entry === name) return "true";
  return entry.slice(prefix.length);
}

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || "").replace(/\/+$/g, "");
  return `${base}${path}`;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const baseUrl = getArgValue("--url", process.env.APP_BASE_URL || "");
  if (!baseUrl) throw new Error("Base URL is required. Set APP_BASE_URL or pass --url=https://...");

  const appResponse = await fetchWithTimeout(joinUrl(baseUrl, "/"));
  if (!appResponse.ok) throw new Error(`App page healthcheck failed: ${appResponse.status}`);

  const stateResponse = await fetchWithTimeout(joinUrl(baseUrl, "/api/shared-state"));
  if (!stateResponse.ok) throw new Error(`Shared-state healthcheck failed: ${stateResponse.status}`);

  const state = await stateResponse.json();
  if (!state || typeof state !== "object") throw new Error("Shared-state response is not JSON object");
  if (state.configured !== true) throw new Error("Shared-state endpoint is not configured");

  console.log(`MES healthcheck OK: ${baseUrl}`);
  console.log(`Shared-state version: ${Number(state.version || 0)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
