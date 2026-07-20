import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { handleSharedStateRequest } from "./scripts/shared-state-endpoint.mjs";
import { handleDomainApiRequest } from "./scripts/domain-api.mjs";
import {
  shouldBlockContourAdminRoute,
  shouldRedirectAdminModule,
  writeAdminRootRedirect,
  writeAdminRouteNotFound,
} from "./scripts/admin-route-guard.mjs";
import { handleAdminAuthRequest } from "./scripts/admin-auth-guard.mjs";
import { handleContourAdminActionRequest } from "./scripts/contour-admin-endpoint.mjs";
import {
  getSharedStateServerPaths,
  renderRuntimeConfigScript,
} from "./scripts/shared-state-storage.mjs";
import { writeContourFavicon } from "./scripts/contour-favicon.mjs";
import { handlePublicAuthRequest } from "./scripts/public-auth-guard.mjs";

const root = new URL(".", import.meta.url).pathname;
const host = process.env.HOST || "localhost";
const port = Number(process.env.PORT || 4174);
const sharedStatePaths = getSharedStateServerPaths({
  projectRoot: root,
  fallbackFile: join(root, ".mes-shared-state.json"),
});
const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const immutableAssetExtensions = new Set([".css", ".js", ".json", ".png", ".svg"]);
const compressionMinBytes = 1024;

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = decoded === "/"
    ? "/index.html"
    : decoded === "/pilot/marking-preview" || decoded === "/pilot/marking-preview/"
      ? "/dist/prototypes/marking/index.html"
      : decoded;
  const fullPath = normalize(join(root, requested));
  return fullPath.startsWith(root) ? fullPath : join(root, "index.html");
}

function shouldFallbackToIndex(requestUrl) {
  const url = new URL(requestUrl || "/", `http://${host}:${port}`);
  const extension = extname(url.pathname);
  return url.pathname === "/" || extension === "" || extension === ".html";
}

function noCacheHeaders(contentType, clearCache = false) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Surrogate-Control": "no-store",
    ...(clearCache ? { "Clear-Site-Data": "\"cache\"" } : {}),
  };
}

function immutableAssetHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  };
}

function responseHeadersForUrl(url, contentType, clearCache = false) {
  const extension = extname(url.pathname);
  const isVersionedAsset = url.searchParams.has("v") && immutableAssetExtensions.has(extension);
  return isVersionedAsset ? immutableAssetHeaders(contentType) : noCacheHeaders(contentType, clearCache);
}

function isCompressibleContentType(contentType) {
  return (
    contentType.startsWith("text/") ||
    contentType.startsWith("application/json") ||
    contentType.startsWith("image/svg+xml")
  );
}

async function maybeCompressBody(req, body, headers, contentType) {
  if (!isCompressibleContentType(contentType)) return { body, headers };

  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  if (buffer.length < compressionMinBytes) return { body: buffer, headers };

  const acceptEncoding = String(req.headers["accept-encoding"] || "");
  if (/\bbr\b/.test(acceptEncoding)) {
    return {
      body: await brotliCompressAsync(buffer, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
        },
      }),
      headers: {
        ...headers,
        "Content-Encoding": "br",
        "Vary": "Accept-Encoding",
      },
    };
  }

  if (/\bgzip\b/.test(acceptEncoding)) {
    return {
      body: await gzipAsync(buffer),
      headers: {
        ...headers,
        "Content-Encoding": "gzip",
        "Vary": "Accept-Encoding",
      },
    };
  }

  return { body: buffer, headers };
}

async function fileVersion(relativePath) {
  try {
    const fileStat = await stat(join(root, relativePath));
    return String(Math.round(fileStat.mtimeMs));
  } catch {
    return String(Date.now());
  }
}

async function renderIndexHtml() {
  const [html, stylesVersion, appVersion] = await Promise.all([
    readFile(join(root, "index.html"), "utf-8"),
    fileVersion("styles.css"),
    fileVersion("src/app.js"),
  ]);

  return html
    .replace("</head>", `${renderRuntimeConfigScript(process.env)}\n  </head>`)
    .replace(/\.\/styles\.css(?:\?v=[^"]*)?/g, `./styles.css?v=${stylesVersion}`)
    .replace(/\.\/src\/app\.js(?:\?v=[^"]*)?/, `./src/app.js?v=${appVersion}`);
}

async function writeRuntimeHealth(res) {
  let statusCode = 200;
  let sharedState = "ready";
  try {
    const sharedStateStat = await stat(sharedStatePaths.filePath);
    if (!sharedStateStat.isFile() || sharedStateStat.size <= 0) throw new Error("shared state is unavailable");
  } catch {
    statusCode = 503;
    sharedState = "unavailable";
  }

  let version = "unknown";
  try {
    version = String(JSON.parse(await readFile(join(root, "app-version.json"), "utf8")).version || version);
  } catch {
    // Health must not reveal filesystem details or fail because of display metadata.
  }

  res.writeHead(statusCode, noCacheHeaders("application/json; charset=utf-8"));
  res.end(JSON.stringify({ status: statusCode === 200 ? "ok" : "degraded", version, sharedState }));
}

createServer(async (req, res) => {
  res.__mesAcceptEncoding = String(req.headers?.["accept-encoding"] || "");
  const url = new URL(req.url || "/", `http://${host}:${port}`);
  if (url.pathname === "/healthz") {
    await writeRuntimeHealth(res);
    return;
  }
  if (url.pathname === "/favicon.svg") {
    writeContourFavicon(req, res, (contentType) => responseHeadersForUrl(url, contentType));
    return;
  }

  if (await handlePublicAuthRequest(req, res, url, noCacheHeaders)) {
    return;
  }

  // Public authentication above remains the perimeter for pilot users. The
  // domain API must run before the separate admin perimeter, otherwise normal
  // `/api/v1/*` calls are rendered as the admin login page.
  if (await handleDomainApiRequest(req, res, url, {
    filePath: sharedStatePaths.filePath,
    headers: noCacheHeaders,
  })) return;

  if (await handleAdminAuthRequest(req, res, url, noCacheHeaders)) {
    return;
  }

  if (shouldRedirectAdminModule(req, url)) {
    writeAdminRootRedirect(res);
    return;
  }

  if (shouldBlockContourAdminRoute(req, url)) {
    writeAdminRouteNotFound(res, noCacheHeaders);
    return;
  }

  if (await handleContourAdminActionRequest(req, res, url, {
    projectRoot: root,
    headers: noCacheHeaders,
  })) {
    return;
  }

  if (url.pathname === "/api/shared-state") {
    await handleSharedStateRequest(req, res, {
      filePath: sharedStatePaths.filePath,
      backupDir: sharedStatePaths.backupDir,
      auditLogPath: sharedStatePaths.auditLogPath,
      headers: noCacheHeaders,
    });
    return;
  }

  const filePath = safePath(req.url || "/");
  const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";

  try {
    const isIndex = extname(filePath) === ".html";
    const body = isIndex ? await renderIndexHtml() : await readFile(filePath);
    const headers = responseHeadersForUrl(url, contentType);
    const encoded = await maybeCompressBody(req, body, headers, contentType);
    res.writeHead(200, encoded.headers);
    res.end(encoded.body);
  } catch {
    if (!shouldFallbackToIndex(req.url)) {
      res.writeHead(404, noCacheHeaders(contentType));
      res.end("");
      return;
    }
    const body = await renderIndexHtml();
    const headers = noCacheHeaders(mimeTypes[".html"]);
    const encoded = await maybeCompressBody(req, body, headers, mimeTypes[".html"]);
    res.writeHead(200, encoded.headers);
    res.end(encoded.body);
  }
}).listen(port, host, () => {
  console.log(`MES planning prototype: http://${host}:${port}`);
});
