const pilotUrl = normalizeBaseUrl(process.env.MES_SECURITY_PILOT_URL || "https://pilot.mes-line.ru");
const stagingUrl = normalizeBaseUrl(process.env.MES_SECURITY_STAGING_URL || "https://staging.mes-line.ru");
const adminUrl = normalizeBaseUrl(process.env.MES_SECURITY_ADMIN_URL || "https://admin.mes-line.ru");
const adminMode = String(process.env.MES_SECURITY_ADMIN_MODE || "form").trim().toLowerCase();
const adminUsername = String(process.env.MES_SECURITY_ADMIN_USERNAME || "");
const adminPassword = String(process.env.MES_SECURITY_ADMIN_PASSWORD || "");
const publicMode = String(process.env.MES_SECURITY_PUBLIC_MODE || "open").trim().toLowerCase();
const publicUsername = String(process.env.MES_SECURITY_PUBLIC_USERNAME || "");
const publicPassword = String(process.env.MES_SECURITY_PUBLIC_PASSWORD || "");

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function withModule(baseUrl, moduleName) {
  return `${baseUrl}/?module=${encodeURIComponent(moduleName)}`;
}

function getBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function getAdminAuthHeaders() {
  if (adminMode !== "basic-authenticated") return {};
  if (!adminUsername || !adminPassword) {
    throw new Error("MES_SECURITY_ADMIN_USERNAME and MES_SECURITY_ADMIN_PASSWORD are required for basic-authenticated mode");
  }
  return { "Authorization": getBasicAuthHeader(adminUsername, adminPassword) };
}

async function checkRoute({ label, url, expectedStatus, expectedLocation, headers = {} }) {
  const response = await fetch(url, { redirect: "manual", headers });
  const location = response.headers.get("location") || "";
  const statusOk = Array.isArray(expectedStatus)
    ? expectedStatus.includes(response.status)
    : response.status === expectedStatus;
  const locationOk = expectedLocation === undefined || location === expectedLocation;

  if (!statusOk || !locationOk) {
    throw new Error(
      `${label}: expected status ${expectedStatus}${expectedLocation ? ` and location ${expectedLocation}` : ""}, got ${response.status}${location ? ` location ${location}` : ""}`,
    );
  }

  console.log(`OK  ${label}: ${response.status}${location ? ` -> ${location}` : ""}`);
}

async function getAdminFormCookie() {
  if (!adminUsername || !adminPassword) {
    throw new Error("MES_SECURITY_ADMIN_USERNAME and MES_SECURITY_ADMIN_PASSWORD are required for form-authenticated mode");
  }

  const response = await fetch(`${adminUrl}/api/admin-login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: adminUsername, password: adminPassword }),
  });
  const location = response.headers.get("location") || "";
  const cookie = response.headers.get("set-cookie") || "";

  if (response.status !== 302 || location !== "/?module=contourAdmin" || !cookie.includes("mes_admin_session=")) {
    throw new Error(`admin form login: expected 302 with session cookie, got ${response.status}${location ? ` location ${location}` : ""}`);
  }

  console.log(`OK  admin form login: ${response.status} -> ${location}`);
  return cookie.split(";")[0];
}

async function getPublicFormCookie(baseUrl, label) {
  if (!publicUsername || !publicPassword) {
    throw new Error("MES_SECURITY_PUBLIC_USERNAME and MES_SECURITY_PUBLIC_PASSWORD are required for public form-authenticated mode");
  }

  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: publicUsername, password: publicPassword }),
  });
  const location = response.headers.get("location") || "";
  const cookie = response.headers.get("set-cookie") || "";

  if (response.status !== 302 || location !== "/" || !cookie.includes("mes_user_session=")) {
    throw new Error(`${label} public form login: expected 302 with session cookie, got ${response.status}${location ? ` location ${location}` : ""}`);
  }

  console.log(`OK  ${label} public form login: ${response.status} -> ${location}`);
  return cookie.split(";")[0];
}

async function main() {
  const checks = [];

  if (publicMode === "open") {
    checks.push(
      {
        label: "pilot root",
        url: `${pilotUrl}/`,
        expectedStatus: 200,
      },
      {
        label: "staging root",
        url: `${stagingUrl}/`,
        expectedStatus: 200,
      },
      {
        label: "pilot contourAdmin blocked",
        url: withModule(pilotUrl, "contourAdmin"),
        expectedStatus: 404,
      },
      {
        label: "staging contourAdmin blocked",
        url: withModule(stagingUrl, "contourAdmin"),
        expectedStatus: 404,
      },
    );
  } else if (publicMode === "form" || publicMode === "form-authenticated") {
    checks.push(
      {
        label: "pilot root redirects to public login",
        url: `${pilotUrl}/`,
        expectedStatus: 302,
        expectedLocation: "/login",
      },
      {
        label: "staging root redirects to public login",
        url: `${stagingUrl}/`,
        expectedStatus: 302,
        expectedLocation: "/login",
      },
      {
        label: "pilot public login form",
        url: `${pilotUrl}/login`,
        expectedStatus: 200,
      },
      {
        label: "staging public login form",
        url: `${stagingUrl}/login`,
        expectedStatus: 200,
      },
      {
        label: "pilot app asset protected",
        url: `${pilotUrl}/src/app.js`,
        expectedStatus: 401,
      },
      {
        label: "staging app asset protected",
        url: `${stagingUrl}/src/app.js`,
        expectedStatus: 401,
      },
      {
        label: "pilot shared-state API protected",
        url: `${pilotUrl}/api/shared-state`,
        expectedStatus: 401,
      },
      {
        label: "staging shared-state API protected",
        url: `${stagingUrl}/api/shared-state`,
        expectedStatus: 401,
      },
    );

    if (publicMode === "form-authenticated") {
      const pilotCookie = await getPublicFormCookie(pilotUrl, "pilot");
      const stagingCookie = await getPublicFormCookie(stagingUrl, "staging");
      checks.push(
        {
          label: "pilot root allowed after public form auth",
          url: `${pilotUrl}/`,
          expectedStatus: 200,
          headers: { "Cookie": pilotCookie },
        },
        {
          label: "staging root allowed after public form auth",
          url: `${stagingUrl}/`,
          expectedStatus: 200,
          headers: { "Cookie": stagingCookie },
        },
        {
          label: "pilot contourAdmin still blocked after public auth",
          url: withModule(pilotUrl, "contourAdmin"),
          expectedStatus: 404,
          headers: { "Cookie": pilotCookie },
        },
        {
          label: "staging contourAdmin still blocked after public auth",
          url: withModule(stagingUrl, "contourAdmin"),
          expectedStatus: 404,
          headers: { "Cookie": stagingCookie },
        },
      );
    }
  } else {
    throw new Error(`Unknown MES_SECURITY_PUBLIC_MODE: ${publicMode}`);
  }

  if (adminMode === "forbid") {
    checks.push(
      {
        label: "admin root forbidden for this client",
        url: `${adminUrl}/`,
        expectedStatus: 403,
      },
      {
        label: "admin contourAdmin forbidden for this client",
        url: withModule(adminUrl, "contourAdmin"),
        expectedStatus: 403,
      },
    );
  } else if (adminMode === "basic") {
    checks.push(
      {
        label: "admin root requires basic auth",
        url: `${adminUrl}/`,
        expectedStatus: 401,
      },
      {
        label: "admin non-admin module requires basic auth",
        url: withModule(adminUrl, "gantt"),
        expectedStatus: 401,
      },
      {
        label: "admin contourAdmin requires basic auth",
        url: withModule(adminUrl, "contourAdmin"),
        expectedStatus: 401,
      },
    );
  } else if (adminMode === "form") {
    checks.push(
      {
        label: "admin root redirects to login form",
        url: `${adminUrl}/`,
        expectedStatus: 302,
        expectedLocation: "/admin-login",
      },
      {
        label: "admin login form",
        url: `${adminUrl}/admin-login`,
        expectedStatus: 200,
      },
      {
        label: "admin contourAdmin redirects to login form",
        url: withModule(adminUrl, "contourAdmin"),
        expectedStatus: 302,
        expectedLocation: "/admin-login",
      },
    );
  } else if (adminMode === "form-authenticated") {
    const cookie = await getAdminFormCookie();
    const adminFormHeaders = { "Cookie": cookie };
    checks.push(
      {
        label: "admin root redirects after form auth",
        url: `${adminUrl}/`,
        expectedStatus: 302,
        expectedLocation: "/?module=contourAdmin",
        headers: adminFormHeaders,
      },
      {
        label: "admin non-admin module redirects after form auth",
        url: withModule(adminUrl, "gantt"),
        expectedStatus: 302,
        expectedLocation: "/?module=contourAdmin",
        headers: adminFormHeaders,
      },
      {
        label: "admin contourAdmin allowed after form auth",
        url: withModule(adminUrl, "contourAdmin"),
        expectedStatus: 200,
        headers: adminFormHeaders,
      },
    );
  } else {
    const adminAuthHeaders = getAdminAuthHeaders();
    checks.push(
      {
        label: "admin root redirects",
        url: `${adminUrl}/`,
        expectedStatus: 302,
        expectedLocation: "/?module=contourAdmin",
        headers: adminAuthHeaders,
      },
      {
        label: "admin non-admin module redirects",
        url: withModule(adminUrl, "gantt"),
        expectedStatus: 302,
        expectedLocation: "/?module=contourAdmin",
        headers: adminAuthHeaders,
      },
      {
        label: "admin contourAdmin allowed",
        url: withModule(adminUrl, "contourAdmin"),
        expectedStatus: 200,
        headers: adminAuthHeaders,
      },
    );
  }

  for (const check of checks) {
    await checkRoute(check);
  }
}

main().catch((error) => {
  console.error(`Security route QA failed: ${error?.message || error}`);
  process.exit(1);
});
