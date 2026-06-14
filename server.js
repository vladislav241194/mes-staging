import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { saveWorkflowPreset } from "./scripts/workflow-preset-endpoint.mjs";

const root = new URL(".", import.meta.url).pathname;
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const fullPath = normalize(join(root, requested));
  return fullPath.startsWith(root) ? fullPath : join(root, "index.html");
}

function shouldFallbackToIndex(requestUrl) {
  const url = new URL(requestUrl || "/", `http://localhost:${port}`);
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
    .replace(/\.\/styles\.css(?:\?v=[^"]*)?/, `./styles.css?v=${stylesVersion}`)
    .replace(/\.\/src\/app\.js(?:\?v=[^"]*)?/, `./src/app.js?v=${appVersion}`);
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${port}`);
  if (req.method === "POST" && url.pathname === "/api/workflow-preset") {
    await saveWorkflowPreset(req, res, {
      targetPaths: [join(root, "workflow-preset.json")],
      headers: noCacheHeaders,
    });
    return;
  }

  const filePath = safePath(req.url || "/");
  const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";

  try {
    const isIndex = extname(filePath) === ".html";
    const body = isIndex ? await renderIndexHtml() : await readFile(filePath);
    res.writeHead(200, noCacheHeaders(contentType, isIndex));
    res.end(body);
  } catch {
    if (!shouldFallbackToIndex(req.url)) {
      res.writeHead(404, noCacheHeaders(contentType));
      res.end("");
      return;
    }
    const body = await renderIndexHtml();
    res.writeHead(200, noCacheHeaders(mimeTypes[".html"], true));
    res.end(body);
  }
}).listen(port, () => {
  console.log(`MES planning prototype: http://localhost:${port}`);
});
