const FAVICON_THEMES = {
  admin: {
    background: "#10243a",
    accent: "#67e8f9",
    lower: "#d7e0ea",
  },
  pilot: {
    background: "#b42318",
    accent: "#fecaca",
    lower: "#fee2e2",
  },
  default: {
    background: "#243143",
    accent: "#67e8f9",
    lower: "#d7e0ea",
  },
};

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
  <path d="M12 15h40v4H12z" fill="${theme.accent}"/>
  <text x="32" y="42" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="900" letter-spacing="0" fill="#ffffff">MES</text>
  <path d="M13 49h38" stroke="${theme.lower}" stroke-width="3" stroke-linecap="round" opacity="0.88"/>
</svg>
`;
}

export function writeContourFavicon(req, res, headers, env = process.env) {
  const contour = getContourFromRequest(req, env);
  res.writeHead(200, headers("image/svg+xml; charset=utf-8"));
  res.end(renderContourFavicon(contour));
}
