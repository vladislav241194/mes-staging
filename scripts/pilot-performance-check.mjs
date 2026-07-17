import { mkdir, writeFile } from "node:fs/promises";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(projectRoot, "reports", "pilot-performance-check.json");
const targetOrigin = process.env.PILOT_PERFORMANCE_URL || "https://pilot.mes-line.ru";
// The public pilot is intentionally behind a login wall. A server-local probe
// may use an internal Host header to measure the application response without
// storing a human password in CI or in this script.
const hostHeader = String(process.env.PILOT_PERFORMANCE_HOST_HEADER || "").trim();
// Optional, externally supplied session cookie for measuring the protected
// browser application.  It is intentionally never persisted in a report.
const sessionCookie = String(process.env.PILOT_PERFORMANCE_COOKIE || "").trim();
const maxAppTransferBytes = Number(process.env.PILOT_PERFORMANCE_MAX_APP_BYTES || 350_000);

function getHeader(headers, name) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(", ") : String(value || "");
}

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function getAppScriptPath(html) {
  const match = html.match(/src=["']([^"']*src\/app\.js[^"']*)["']/);
  return match?.[1] || "";
}

async function requestBytes(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "http:" ? requestHttp : requestHttps;
    const req = client(url, { headers: { ...(hostHeader ? { Host: hostHeader } : {}), ...headers } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        response,
        buffer: Buffer.concat(chunks),
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const targetUrl = new URL(`/?__mes_perf_probe=${Date.now()}`, targetOrigin);
  const index = await requestBytes(targetUrl, sessionCookie ? { cookie: sessionCookie } : {});
  const html = index.buffer.toString("utf-8");
  const appScriptPath = getAppScriptPath(html);
  const redirectedToLogin = index.response.statusCode >= 300
    && index.response.statusCode < 400
    && /(?:^|\/)login(?:$|[?#])/.test(getHeader(index.response.headers, "location"));
  if (redirectedToLogin && !sessionCookie) {
    const result = {
      checkedAt: new Date().toISOString(),
      targetOrigin,
      hostHeader: hostHeader || undefined,
      authGate: true,
      authenticatedTransferChecked: false,
      index: {
        url: targetUrl.toString(),
        status: index.response.statusCode,
        location: getHeader(index.response.headers, "location"),
        cacheControl: getHeader(index.response.headers, "cache-control"),
      },
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log("pilot-performance-check: protected contour confirmed; authenticated asset transfer was not measured (set PILOT_PERFORMANCE_COOKIE)");
    console.log(`report: ${reportPath}`);
    return;
  }
  assert(appScriptPath, "Cannot find src/app.js script in pilot HTML", {
    targetUrl: targetUrl.toString(),
  });

  const appUrl = new URL(appScriptPath, targetOrigin);
  const app = await requestBytes(appUrl, { "accept-encoding": "br,gzip", ...(sessionCookie ? { cookie: sessionCookie } : {}) });
  const result = {
    checkedAt: new Date().toISOString(),
      targetOrigin,
      hostHeader: hostHeader || undefined,
    index: {
      url: targetUrl.toString(),
      status: index.response.statusCode,
      bytes: index.buffer.length,
      cacheControl: getHeader(index.response.headers, "cache-control"),
      contentEncoding: getHeader(index.response.headers, "content-encoding"),
      clearSiteData: getHeader(index.response.headers, "clear-site-data"),
    },
    app: {
      url: appUrl.toString(),
      status: app.response.statusCode,
      transferBytes: app.buffer.length,
      maxTransferBytes: maxAppTransferBytes,
      cacheControl: getHeader(app.response.headers, "cache-control"),
      contentEncoding: getHeader(app.response.headers, "content-encoding"),
      contentType: getHeader(app.response.headers, "content-type"),
      clearSiteData: getHeader(app.response.headers, "clear-site-data"),
    },
  };

  assert(index.response.statusCode >= 200 && index.response.statusCode < 300, "Pilot HTML request failed", result.index);
  assert(!result.index.clearSiteData, "Pilot HTML must not emit Clear-Site-Data on normal load", result.index);
  assert(app.response.statusCode >= 200 && app.response.statusCode < 300, "Pilot app.js request failed", result.app);
  assert(
    result.app.cacheControl.includes("immutable"),
    "Pilot app.js must be immutable versioned asset",
    result.app,
  );
  assert(
    result.app.contentEncoding === "br" || result.app.contentEncoding === "gzip",
    "Pilot app.js must be compressed",
    result.app,
  );
  assert(
    result.app.transferBytes <= maxAppTransferBytes,
    `Pilot app.js transfer size must stay <= ${maxAppTransferBytes} bytes`,
    result.app,
  );

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`pilot-performance-check: pass (${result.app.transferBytes} bytes, ${result.app.contentEncoding})`);
  console.log(`report: ${reportPath}`);
}

main().catch(async (error) => {
  const failure = {
    checkedAt: new Date().toISOString(),
    targetOrigin,
    status: "fail",
    message: error.message,
    details: error.details || {},
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(failure, null, 2)}\n`);
  console.error(`pilot-performance-check: fail: ${error.message}`);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exit(1);
});
