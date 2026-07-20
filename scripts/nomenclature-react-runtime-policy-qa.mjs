import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const disabled = getPublicRuntimeConfig({ APP_ENV: "pilot" });
assert(disabled.MES_REACT_NOMENCLATURE === false, "Nomenclature React rollout must be disabled by default");
assert(disabled.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === false, "read-only evaluation must be disabled by default");
assert(disabled.MES_REACT_NOMENCLATURE_WRITE_EVALUATION === false, "write evaluation must be disabled by default");

const enabled = getPublicRuntimeConfig({
  APP_ENV: "pilot",
  MES_REACT_NOMENCLATURE: "1",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "1",
  MES_REACT_NOMENCLATURE_WRITE_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(enabled.MES_REACT_NOMENCLATURE === true, "explicit Nomenclature React rollout must reach the browser bootstrap");
assert(enabled.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === true, "explicit read-only evaluation permission must reach the browser bootstrap");
assert(enabled.MES_REACT_NOMENCLATURE_WRITE_EVALUATION === true, "explicit write evaluation permission must reach the browser bootstrap");

const nonExact = getPublicRuntimeConfig({
  MES_REACT_NOMENCLATURE: "true",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "yes",
  MES_REACT_NOMENCLATURE_WRITE_EVALUATION: "yes",
});
assert(nonExact.MES_REACT_NOMENCLATURE === false, "non-exact rollout values must fail closed");
assert(nonExact.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === false, "non-exact evaluation values must fail closed");
assert(nonExact.MES_REACT_NOMENCLATURE_WRITE_EVALUATION === false, "non-exact write values must fail closed");

const script = renderRuntimeConfigScript({
  MES_REACT_NOMENCLATURE: "1",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "1",
  MES_REACT_NOMENCLATURE_WRITE_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(script.includes('"MES_REACT_NOMENCLATURE":true'), "public runtime script must contain the rollout boolean");
assert(script.includes('"MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION":true'), "public runtime script must contain the evaluation boolean");
assert(script.includes('"MES_REACT_NOMENCLATURE_WRITE_EVALUATION":true'), "public runtime script must contain the write evaluation boolean");
assert(!script.includes("must-not-leak"), "public runtime script must never expose deployment secrets");

const [appSource, productsEventsSource, runtimeStateSource] = await Promise.all([
  readFile(join(root, "src/app.js"), "utf8"),
  readFile(join(root, "src/modules/products/events.js"), "utf8"),
  readFile(join(root, "src/modules/runtime_state/service.js"), "utf8"),
]);
assert(appSource.includes("requireDurable: true"), "Pilot Nomenclature React saves must require a durable owner acknowledgement");
assert(productsEventsSource.includes('persistDirectoryStateDurably("nomenclature-save")'), "Nomenclature owner must await the exact durable directory write");
assert(productsEventsSource.includes('code: "persistence-unconfirmed"'), "Nomenclature save must fail closed when persistence is not confirmed");
assert(runtimeStateSource.includes("sharedStateStatus.saveInFlight || sharedStateStatus.pollInFlight"), "Durable directory writes must serialize with both shared-state writes and polls");
assert(runtimeStateSource.includes("attempt <= 6") && runtimeStateSource.includes(":durable-retry-"), "Durable directory writes must use bounded CAS retries under live shared-UI contention");

console.log("Nomenclature React runtime policy QA: OK");
