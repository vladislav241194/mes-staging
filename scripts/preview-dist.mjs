import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const distDir = join(projectRoot, "dist");
const port = Number(process.env.PORT || 4174);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function responseHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };
}

function getSafePath(requestUrl) {
  const url = new URL(requestUrl || "/", `http://localhost:${port}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const fullPath = normalize(join(distDir, requestedPath));

  return fullPath.startsWith(distDir) ? fullPath : join(distDir, "index.html");
}

async function ensureDistExists() {
  try {
    const stats = await stat(join(distDir, "index.html"));
    return stats.isFile();
  } catch {
    return false;
  }
}

if (!(await ensureDistExists())) {
  console.error("dist/index.html not found. Run npm run build first.");
  process.exit(1);
}

createServer(async (req, res) => {
  const filePath = getSafePath(req.url);
  const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";

  try {
    const body = await readFile(filePath);
    res.writeHead(200, responseHeaders(contentType));
    res.end(body);
  } catch {
    const body = await readFile(join(distDir, "index.html"));
    res.writeHead(200, responseHeaders(mimeTypes[".html"]));
    res.end(body);
  }
}).listen(port, () => {
  console.log(`Static dist preview: http://localhost:${port}`);
});
