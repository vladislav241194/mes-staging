import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const assert = (value, message) => { if (!value) throw new Error(message); };
const appPath = fileURLToPath(new URL("../src/app.js", import.meta.url));
const app = await readFile(appPath, "utf-8");

assert(!app.includes('import { renderNomenclatureModulePage } from "./modules/nomenclature/render.js";'), "Nomenclature render must not remain in the initial static import graph");
assert(app.includes('import("./modules/nomenclature/render.js")'), "Nomenclature render must load through a dedicated dynamic import");
assert(app.includes("function ensureNomenclatureRenderModule()"), "Nomenclature module must use a single-flight lazy loader");
assert(app.includes('title: "Загружаем номенклатуру"'), "Nomenclature navigation must render a safe loading state while its chunk loads");
assert(app.includes('if (ui.activeModule === "nomenclature") render();'), "Nomenclature module must re-render only after its chunk is ready on the active route");
console.log("Nomenclature render lazy-load QA passed");
