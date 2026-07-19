import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderContourFavicon } from "./contour-favicon.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(projectRoot, path), "utf8");
const normalizeSvg = (source) => String(source || "").trim();

const [brandSource, faviconSource, appSource, runtimeSource, publicAuthSource, adminAuthSource, registryGeneratorSource] = await Promise.all([
  read("assets/brand/mes_logo_high_quality.svg"),
  read("favicon.svg"),
  read("src/app.js"),
  read("src/modules/operational_runtime/service.js"),
  read("scripts/public-auth-guard.mjs"),
  read("scripts/admin-auth-guard.mjs"),
  read("scripts/generate-mes-icon-registry.mjs"),
]);

assert.equal(normalizeSvg(faviconSource), normalizeSvg(brandSource), "Public favicon alias must match the canonical MES LINE brand source");
assert.match(appSource, /startup-error-logo[^]*?<img src="\.\/favicon\.svg"/, "Startup error must render the brand logo");
assert.match(runtimeSource, /module-menu-brand-logo" src="\.\/favicon\.svg"/, "Runtime sidebar must render the brand logo");
assert.match(publicAuthSource, /brand-mark"><img src="\/favicon\.svg"/, "Public login must render the brand logo");
assert.match(adminAuthSource, /brand-mark"><img src="\/favicon\.svg"/, "Admin login must render the brand logo");
assert.match(registryGeneratorSource, /brandLogoSvg[^]*?href="\.\/favicon\.svg"/, "Service icon registry must retain the brand logo alias");

for (const contour of ["pilot", "admin", "default"]) {
  const rendered = renderContourFavicon(contour);
  assert.match(rendered, /viewBox="0 0 512 512"/, `${contour} contour favicon must embed the canonical vector`);
  assert.doesNotMatch(rendered, /<text[^>]*>MES<\/text>/, `${contour} contour favicon must not restore the legacy text mark`);
}

console.log("MES brand logo QA passed: canonical source, runtime alias and all visible brand surfaces are aligned.");
