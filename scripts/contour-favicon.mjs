import { readFileSync } from "node:fs";

const FAVICON_THEMES = {
  admin: {
    background: "#10243a",
    accent: "#67e8f9",
  },
  pilot: {
    background: "#b42318",
    accent: "#fecaca",
  },
  default: {
    background: "#243143",
    accent: "#67e8f9",
  },
};

// Keep the user-provided vector as the canonical brand source. `favicon.svg`
// remains the public/runtime alias because login guards and old releases rely
// on that stable URL, while every generated contour mark comes from this file.
const logoSvgSource = readFileSync(new URL("../assets/brand/mes_logo_high_quality.svg", import.meta.url), "utf8");
const logoSvgBody = logoSvgSource.slice(
  logoSvgSource.indexOf(">") + 1,
  logoSvgSource.lastIndexOf("</svg>"),
).trim();

function normalizeHostHeader(req) {
  return String(req?.headers?.host || "").split(":")[0].trim().toLowerCase();
}

export function getContourFromRequest(req, env = process.env) {
  const host = normalizeHostHeader(req);
  if (host === "admin.mes-line.ru" || host.startsWith("admin.")) return "admin";
  if (host === "pilot.mes-line.ru" || host.startsWith("pilot.")) return "pilot";

  const appEnv = String(env.APP_ENV || env.MES_APP_ENV || "").trim().toLowerCase();
  if (appEnv === "pilot" || appEnv === "user-testing") return "pilot";
  if (appEnv === "admin") return "admin";

  return "default";
}

export function renderContourFavicon(contour) {
  const theme = FAVICON_THEMES[contour] || FAVICON_THEMES.default;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="MES ${contour}">
  <rect width="64" height="64" rx="12" fill="${theme.background}"/>
  <rect x="3" y="3" width="58" height="58" rx="10" fill="none" stroke="${theme.accent}" stroke-width="2" opacity="0.72"/>
  <svg x="7" y="7" width="50" height="50" viewBox="0 0 512 512" aria-hidden="true">
    ${logoSvgBody}
  </svg>
</svg>
`;
}

export function writeContourFavicon(req, res, headers, env = process.env) {
  const contour = getContourFromRequest(req, env);
  res.writeHead(200, headers("image/svg+xml; charset=utf-8"));
  res.end(renderContourFavicon(contour));
}
