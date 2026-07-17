import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const ADMIN_AUTH_COOKIE = "mes_admin_session";
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;
const MAX_LOGIN_BODY_BYTES = 16 * 1024;
const DEFAULT_ADMIN_HOSTS = new Set([
  "admin.mes-line.ru",
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

function normalizeHost(req) {
  const rawHost = String(req?.headers?.host || "").trim().toLowerCase();
  if (rawHost.startsWith("[")) {
    const endIndex = rawHost.indexOf("]");
    return endIndex >= 0 ? rawHost.slice(0, endIndex + 1) : rawHost;
  }
  return rawHost.split(":")[0];
}

function getAdminHosts(env = process.env) {
  const configuredHosts = String(env.MES_ADMIN_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return configuredHosts.length > 0 ? new Set(configuredHosts) : DEFAULT_ADMIN_HOSTS;
}

function isAdminHost(req, env = process.env) {
  return getAdminHosts(env).has(normalizeHost(req));
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf-8");
}

function safeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function getSessionSecret(env = process.env) {
  return String(env.MES_ADMIN_SESSION_SECRET || "").trim();
}

function getConfiguredUsername(env = process.env) {
  return String(env.MES_ADMIN_USERNAME || "admin").trim();
}

function getConfiguredPasswordHash(env = process.env) {
  return String(env.MES_ADMIN_PASSWORD_HASH || "").trim();
}

function getTtlSeconds(env = process.env) {
  const configured = Number(env.MES_ADMIN_SESSION_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_SECONDS;
}

export function createAdminPasswordHash(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(password || ""), salt, 64).toString("hex");
  return `scrypt:v1:${salt}:${hash}`;
}

export function verifyAdminPassword(password, storedHash) {
  const [algorithm, version, salt, expectedHash] = String(storedHash || "").split(":");
  if (algorithm !== "scrypt" || version !== "v1" || !salt || !expectedHash) return false;

  const actualHash = scryptSync(String(password || ""), salt, 64).toString("hex");
  return safeEqualText(actualHash, expectedHash);
}

function signPayload(payload, secret) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyPayload(token, secret) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return null;

  const expectedSignature = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqualText(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    if (!payload || typeof payload !== "object") return null;
    if (Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req?.headers?.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function hasValidSession(req, env = process.env) {
  const secret = getSessionSecret(env);
  if (!secret) return false;

  const token = parseCookies(req)[ADMIN_AUTH_COOKIE];
  const payload = verifyPayload(token, secret);
  return payload?.user === getConfiguredUsername(env);
}

export function isAuthorizedAdminRequest(req, env = process.env) {
  return isAdminHost(req, env) && hasValidSession(req, env);
}

function createSessionCookie(username, env = process.env) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = getTtlSeconds(env);
  const token = signPayload({ user: username, iat: now, exp: now + ttl }, getSessionSecret(env));
  return `${ADMIN_AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${ttl}; HttpOnly; Secure; SameSite=Strict`;
}

function createClearSessionCookie() {
  return `${ADMIN_AUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function writeRedirect(res, location, extraHeaders = {}) {
  res.writeHead(302, {
    "Location": location,
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    ...extraHeaders,
  });
  res.end("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderAdminLoginPage({ error = "", username = "" } = {}) {
  const safeError = escapeHtml(error);
  const safeUsername = escapeHtml(username);

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>MES Admin</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=admin-login" />
    <style>
      :root {
        color-scheme: light;
        --admin-bg: #10243a;
        --admin-panel: #ffffff;
        --admin-text: #102033;
        --admin-muted: #64748b;
        --admin-line: #dbe4ef;
        --admin-blue: #2563eb;
        --admin-blue-strong: #1d4ed8;
        --admin-blue-soft: #eff6ff;
        --admin-cyan: #67e8f9;
        --admin-error: #b42318;
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 32px;
        background:
          linear-gradient(135deg, rgba(37, 99, 235, 0.26) 0%, rgba(37, 99, 235, 0) 42%),
          linear-gradient(180deg, #071527 0%, var(--admin-bg) 56%, #0a1b30 100%);
        font-family: Inter, Arial, Helvetica, sans-serif;
        color: var(--admin-text);
      }
      main {
        width: min(440px, 100%);
        display: grid;
        gap: 14px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        color: #ffffff;
      }
      .brand-mark {
        width: 40px;
        height: 40px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: linear-gradient(135deg, var(--admin-blue), #1e40af);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0;
      }
      .brand strong {
        display: block;
        font-size: 16px;
        line-height: 20px;
      }
      .brand span {
        display: block;
        margin-top: 2px;
        color: rgba(255, 255, 255, 0.68);
        font-size: 12px;
        line-height: 16px;
      }
      .panel {
        display: grid;
        gap: 18px;
        padding: 24px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 12px;
        background: var(--admin-panel);
        box-shadow: 0 24px 80px rgba(3, 13, 27, 0.34);
      }
      .panel header {
        display: grid;
        gap: 4px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--admin-line);
      }
      h1 {
        margin: 0;
        font-size: 24px;
        line-height: 30px;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        color: var(--admin-muted);
        font-size: 13px;
        line-height: 18px;
      }
      form {
        display: grid;
        gap: 12px;
      }
      label {
        display: grid;
        gap: 6px;
        color: #334155;
        font-size: 11px;
        font-weight: 760;
        line-height: 14px;
      }
      input {
        width: 100%;
        height: 44px;
        padding: 0 12px;
        border: 1px solid var(--admin-line);
        border-radius: 8px;
        background: #f8fafc;
        color: var(--admin-text);
        font-size: 14px;
        line-height: 20px;
        outline: none;
      }
      input:focus {
        border-color: var(--admin-blue);
        background: #ffffff;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
      }
      button {
        height: 44px;
        border: 0;
        border-radius: 8px;
        background: linear-gradient(135deg, var(--admin-blue), #1e40af);
        color: #ffffff;
        font-size: 13px;
        font-weight: 780;
        line-height: 18px;
        cursor: pointer;
      }
      button:hover { background: linear-gradient(135deg, var(--admin-blue-strong), #1e3a8a); }
      .notice {
        padding: 10px 12px;
        border: 1px solid #bfdbfe;
        border-radius: 8px;
        background: var(--admin-blue-soft);
        color: #1e3a8a;
        font-size: 12px;
        line-height: 16px;
      }
      .error {
        padding: 10px 12px;
        border: 1px solid #fecaca;
        border-radius: 8px;
        background: #fff1f2;
        color: var(--admin-error);
        font-size: 12px;
        font-weight: 680;
        line-height: 16px;
      }
      .footnote {
        color: rgba(255, 255, 255, 0.62);
        font-size: 11px;
        line-height: 16px;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="brand" aria-label="MES Admin">
        <span class="brand-mark">MES</span>
        <span>
          <strong>MES Admin</strong>
          <span>Управление контурами и безопасными обновлениями</span>
        </span>
      </section>
      <section class="panel">
        <header>
          <h1>Вход в админ-панель</h1>
          <p>Доступ только для обслуживания контуров pilot и staging.</p>
        </header>
        ${safeError ? `<div class="error">${safeError}</div>` : `<div class="notice">Введите административные учетные данные.</div>`}
        <form method="post" action="/api/admin-login" autocomplete="off">
          <label>
            Логин
            <input name="username" type="text" value="${safeUsername}" autocomplete="username" autofocus />
          </label>
          <label>
            Пароль
            <input name="password" type="password" autocomplete="current-password" />
          </label>
          <button type="submit">Войти</button>
        </form>
      </section>
      <p class="footnote">Admin contour · защищено cookie-сессией и внешним IP-периметром</p>
    </main>
  </body>
</html>`;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_LOGIN_BODY_BYTES) throw new Error("Login body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function readLoginPayload(req) {
  const rawBody = await readBody(req);
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (contentType.includes("application/json")) {
    return JSON.parse(rawBody || "{}");
  }

  return Object.fromEntries(new URLSearchParams(rawBody));
}

function writeLoginPage(res, headers, status = 200, options = {}) {
  res.writeHead(status, headers("text/html; charset=utf-8"));
  res.end(renderAdminLoginPage(options));
}

function writeAdminAuthMisconfigured(res, headers) {
  res.writeHead(503, headers("text/html; charset=utf-8"));
  res.end(renderAdminLoginPage({
    error: "Admin login не настроен: отсутствуют MES_ADMIN_PASSWORD_HASH или MES_ADMIN_SESSION_SECRET.",
  }));
}

export async function handleAdminAuthRequest(req, res, url, headers, env = process.env) {
  if (!isAdminHost(req, env)) return false;

  const passwordHash = getConfiguredPasswordHash(env);
  const sessionSecret = getSessionSecret(env);
  const isLoginPath = url.pathname === "/admin-login";
  const isLoginApi = url.pathname === "/api/admin-login";
  const isLogoutPath = url.pathname === "/admin-logout";

  if (isLogoutPath) {
    writeRedirect(res, "/admin-login", { "Set-Cookie": createClearSessionCookie() });
    return true;
  }

  if (!passwordHash || !sessionSecret) {
    writeAdminAuthMisconfigured(res, headers);
    return true;
  }

  if (isLoginPath && req.method === "GET") {
    if (hasValidSession(req, env)) {
      writeRedirect(res, "/?module=contourAdmin");
      return true;
    }
    writeLoginPage(res, headers);
    return true;
  }

  if (isLoginApi && req.method === "POST") {
    try {
      const payload = await readLoginPayload(req);
      const username = String(payload.username || "").trim();
      const password = String(payload.password || "");
      const valid = username === getConfiguredUsername(env) && verifyAdminPassword(password, passwordHash);
      if (!valid) {
        writeLoginPage(res, headers, 401, {
          error: "Неверный логин или пароль.",
          username,
        });
        return true;
      }

      writeRedirect(res, "/?module=contourAdmin", {
        "Set-Cookie": createSessionCookie(username, env),
      });
      return true;
    } catch {
      writeLoginPage(res, headers, 400, {
        error: "Не удалось обработать форму входа.",
      });
      return true;
    }
  }

  if (hasValidSession(req, env)) return false;

  if (req.method === "GET" && (url.pathname === "/" || url.pathname.endsWith(".html"))) {
    writeRedirect(res, "/admin-login");
    return true;
  }

  res.writeHead(401, headers("text/plain; charset=utf-8"));
  res.end("Unauthorized");
  return true;
}
