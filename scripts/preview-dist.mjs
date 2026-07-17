import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { handleSharedStateRequest } from "./shared-state-endpoint.mjs";
import { handleDomainApiRequest } from "./domain-api.mjs";
import {
  shouldBlockContourAdminRoute,
  shouldRedirectAdminModule,
  writeAdminRootRedirect,
  writeAdminRouteNotFound,
} from "./admin-route-guard.mjs";
import { handleAdminAuthRequest } from "./admin-auth-guard.mjs";
import { handleContourAdminActionRequest } from "./contour-admin-endpoint.mjs";
import {
  getSharedStateServerPaths,
  renderRuntimeConfigScript,
} from "./shared-state-storage.mjs";
import { writeContourFavicon } from "./contour-favicon.mjs";
import { handlePublicAuthRequest } from "./public-auth-guard.mjs";

const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const distDir = join(projectRoot, "dist");
const host = process.env.HOST || "localhost";
const port = Number(process.env.PORT || 4174);
const sharedStatePaths = getSharedStateServerPaths({
  projectRoot,
  fallbackFile: join(projectRoot, ".mes-shared-state.json"),
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

function noCacheHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };
}

function immutableAssetHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  };
}

function responseHeadersForUrl(url, contentType) {
  const extension = extname(url.pathname);
  const isVersionedAsset = url.searchParams.has("v") && immutableAssetExtensions.has(extension);
  return isVersionedAsset ? immutableAssetHeaders(contentType) : noCacheHeaders(contentType);
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

async function maybeUsePrecompressedBody(req, filePath, body, headers, contentType) {
  if (!isCompressibleContentType(contentType)) return { body, headers };
  const acceptEncoding = String(req.headers["accept-encoding"] || "");
  const extension = /\bbr\b/.test(acceptEncoding) ? "br" : /\bgzip\b/.test(acceptEncoding) ? "gz" : "";
  if (!extension) return { body, headers };
  try {
    const precompressed = await readFile(`${filePath}.${extension}`);
    return {
      body: precompressed,
      headers: {
        ...headers,
        "Content-Encoding": extension === "br" ? "br" : "gzip",
        "Vary": "Accept-Encoding",
      },
    };
  } catch {
    return maybeCompressBody(req, body, headers, contentType);
  }
}

function getSafePath(requestUrl) {
  const url = new URL(requestUrl || "/", `http://${host}:${port}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const fullPath = normalize(join(distDir, requestedPath));

  return fullPath.startsWith(distDir) ? fullPath : join(distDir, "index.html");
}

function shouldFallbackToIndex(requestUrl) {
  const url = new URL(requestUrl || "/", `http://${host}:${port}`);
  const extension = extname(url.pathname);
  return url.pathname === "/" || extension === "" || extension === ".html";
}

async function ensureDistExists() {
  try {
    const stats = await stat(join(distDir, "index.html"));
    return stats.isFile();
  } catch {
    return false;
  }
}

async function renderPreviewIndexHtml() {
  const html = await readFile(join(distDir, "index.html"), "utf-8");
  return html.replace("</head>", `${renderRuntimeConfigScript(process.env)}\n  </head>`);
}

if (!(await ensureDistExists())) {
  console.error("dist/index.html not found. Run npm run build first.");
  process.exit(1);
}

createServer(async (req, res) => {
  // Domain API responses use the same negotiated compression as static assets.
  // Keep it on the response because the domain handler is shared with server.js.
  res.__mesAcceptEncoding = String(req.headers?.["accept-encoding"] || "");
  const url = new URL(req.url || "/", `http://${host}:${port}`);
  if (url.pathname === "/favicon.svg") {
    writeContourFavicon(req, res, (contentType) => responseHeadersForUrl(url, contentType));
    return;
  }

  if (await handlePublicAuthRequest(req, res, url, noCacheHeaders)) {
    return;
  }

  // Keep normal domain calls behind the public-user perimeter, but outside
  // the admin-only guard used for contour management endpoints.
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
    projectRoot,
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

  const filePath = getSafePath(req.url);
  const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";

  try {
    const isIndex = extname(filePath) === ".html";
    const body = isIndex ? await renderPreviewIndexHtml() : await readFile(filePath);
    const headers = responseHeadersForUrl(url, contentType);
    const encoded = isIndex
      ? await maybeCompressBody(req, body, headers, contentType)
      : await maybeUsePrecompressedBody(req, filePath, body, headers, contentType);
    res.writeHead(200, encoded.headers);
    res.end(encoded.body);
  } catch {
    if (!shouldFallbackToIndex(req.url)) {
      res.writeHead(404, noCacheHeaders(contentType));
      res.end("");
      return;
    }
    const body = await renderPreviewIndexHtml();
    const headers = noCacheHeaders(mimeTypes[".html"]);
    const encoded = await maybeCompressBody(req, body, headers, mimeTypes[".html"]);
    res.writeHead(200, encoded.headers);
    res.end(encoded.body);
  }
}).listen(port, host, () => {
  console.log(`Static dist preview: http://${host}:${port}`);
});
