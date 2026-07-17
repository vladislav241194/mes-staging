const PROTECTED_ADMIN_ROUTE_ENVS = new Set([
  "pilot",
  "staging",
  "production",
  "user-testing",
]);

const DEFAULT_ADMIN_HOSTS = new Set([
  "admin.mes-line.ru",
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

function getAppEnv() {
  return String(process.env.APP_ENV || process.env.MES_APP_ENV || "local")
    .trim()
    .toLowerCase();
}

function getAdminHosts() {
  const configuredHosts = String(process.env.MES_ADMIN_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return configuredHosts.length > 0 ? new Set(configuredHosts) : DEFAULT_ADMIN_HOSTS;
}

function normalizeRequestHost(req) {
  const rawHost = String(req.headers.host || "").trim().toLowerCase();
  if (rawHost.startsWith("[")) {
    const endIndex = rawHost.indexOf("]");
    return endIndex >= 0 ? rawHost.slice(0, endIndex + 1) : rawHost;
  }
  return rawHost.split(":")[0];
}

function isContourAdminRequest(url) {
  return url.searchParams.get("module") === "contourAdmin";
}

function getRequestedModule(url) {
  return String(url.searchParams.get("module") || url.searchParams.get("m") || "").trim();
}

function isAllowedAdminHost(req) {
  return getAdminHosts().has(normalizeRequestHost(req));
}

export function shouldRedirectAdminModule(req, url) {
  if (!isAllowedAdminHost(req)) {
    return false;
  }

  if (url.pathname !== "/") {
    return false;
  }

  const requestedModule = getRequestedModule(url);
  return !requestedModule || requestedModule !== "contourAdmin";
}

export function shouldBlockContourAdminRoute(req, url) {
  if (!isContourAdminRequest(url)) {
    return false;
  }

  if (!PROTECTED_ADMIN_ROUTE_ENVS.has(getAppEnv())) {
    return false;
  }

  return !isAllowedAdminHost(req);
}

export function shouldRedirectAdminRoot(req, url) {
  return shouldRedirectAdminModule(req, url);
}

export function writeAdminRouteNotFound(res, headers) {
  res.writeHead(404, headers("text/plain; charset=utf-8"));
  res.end("Not Found");
}

export function writeAdminRootRedirect(res) {
  res.writeHead(302, {
    "Location": "/?module=contourAdmin",
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  });
  res.end("");
}
