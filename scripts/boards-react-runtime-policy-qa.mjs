import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBoardsReactIslandHost } from "../src/modules/nomenclature/boards_react_island_host.js";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const disabled = getPublicRuntimeConfig({ APP_ENV: "pilot" });
assert(disabled.MES_REACT_BOARDS === false, "Boards React rollout must be disabled by default");
assert(disabled.MES_REACT_BOARDS_READ_ONLY_EVALUATION === false, "Boards evaluation must be disabled by default");

const enabled = getPublicRuntimeConfig({
  APP_ENV: "pilot",
  MES_REACT_BOARDS: "1",
  MES_REACT_BOARDS_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(enabled.MES_REACT_BOARDS === true, "explicit Boards rollout must reach the browser bootstrap");
assert(enabled.MES_REACT_BOARDS_READ_ONLY_EVALUATION === true, "explicit Boards evaluation permission must reach the browser bootstrap");

const nonExact = getPublicRuntimeConfig({
  MES_REACT_BOARDS: "true",
  MES_REACT_BOARDS_READ_ONLY_EVALUATION: "yes",
});
assert(nonExact.MES_REACT_BOARDS === false, "non-exact Boards rollout values must fail closed");
assert(nonExact.MES_REACT_BOARDS_READ_ONLY_EVALUATION === false, "non-exact Boards evaluation values must fail closed");

const script = renderRuntimeConfigScript({
  MES_REACT_BOARDS: "1",
  MES_REACT_BOARDS_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(script.includes('"MES_REACT_BOARDS":true'), "public runtime script must contain the Boards rollout boolean");
assert(script.includes('"MES_REACT_BOARDS_READ_ONLY_EVALUATION":true'), "public runtime script must contain the Boards evaluation boolean");
assert(!script.includes("must-not-leak"), "public runtime script must never expose deployment secrets");

const [appSource, hostSource] = await Promise.all([
  readFile(join(root, "src/app.js"), "utf8"),
  readFile(join(root, "src/modules/nomenclature/boards_react_island_host.js"), "utf8"),
]);
assert(/canFallbackToLegacy:\s*\(\)\s*=>\s*false/.test(hostSource), "Boards renderer failures must remain fail-closed in React");
assert(!/requestLegacyRender/.test(hostSource), "Boards host must not expose a legacy-render callback");
assert(/react-required/.test(hostSource), "Boards host must own a deterministic React-required shell");
assert(/loadIsland:[^]*import\(islandUrl\.href\)/.test(hostSource), "eligible Boards ownership must retain its lazy React bundle load");
assert(!/modules\/nomenclature\/render\.js|ensureNomenclatureRenderModule|renderNomenclaturePage/.test(appSource), "current application runtime must not reach the retired Nomenclature/Boards renderer");

const disabledHost = createBoardsReactIslandHost({
  getActivation: () => ({
    runtimeMode: "disabled",
    accessMode: "legacy",
    featureFlagEnabled: false,
    activePane: "boards",
  }),
  getPayload: () => ({}),
  getTargetRoot: () => null,
});
assert(/data-react-island-state="error"/.test(disabledHost.renderTarget()), "disabled Boards policy must render an error shell");
assert(/react-required/.test(disabledHost.renderTarget()), "disabled Boards policy must explain that React ownership is required");
assert(disabledHost.prepareRender().activateReact === false, "disabled Boards policy must not attempt a mount or legacy fallback");

const permanentHost = createBoardsReactIslandHost({
  getActivation: () => ({
    runtimeMode: "react",
    accessMode: "react",
    featureFlagEnabled: true,
    activePane: "boards",
  }),
  getPayload: () => ({}),
  getTargetRoot: () => null,
});
assert(permanentHost.prepareRender().activateReact === true, "permanent Boards policy must select the React bundle");
assert(/data-react-island-runtime-mode="react"/.test(permanentHost.renderTarget()), "permanent Boards shell must identify React runtime ownership");
assert(/data-react-island-state="loading"/.test(permanentHost.renderTarget()), "permanent Boards shell must remain loading until its lazy bundle mounts");

console.log("Boards React runtime policy QA: OK");
