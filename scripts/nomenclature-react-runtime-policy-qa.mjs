import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };

const disabled = getPublicRuntimeConfig({ APP_ENV: "pilot" });
assert(disabled.MES_REACT_NOMENCLATURE === false, "Nomenclature React rollout must be disabled by default");
assert(disabled.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === false, "read-only evaluation must be disabled by default");

const enabled = getPublicRuntimeConfig({
  APP_ENV: "pilot",
  MES_REACT_NOMENCLATURE: "1",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(enabled.MES_REACT_NOMENCLATURE === true, "explicit Nomenclature React rollout must reach the browser bootstrap");
assert(enabled.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === true, "explicit read-only evaluation rollout must reach the browser bootstrap");

const nonExact = getPublicRuntimeConfig({
  MES_REACT_NOMENCLATURE: "true",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "yes",
});
assert(nonExact.MES_REACT_NOMENCLATURE === false, "non-exact rollout values must fail closed");
assert(nonExact.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === false, "non-exact evaluation values must fail closed");

const script = renderRuntimeConfigScript({
  MES_REACT_NOMENCLATURE: "1",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(script.includes('"MES_REACT_NOMENCLATURE":true'), "public runtime script must contain the rollout boolean");
assert(script.includes('"MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION":true'), "public runtime script must contain the evaluation boolean");
assert(!script.includes("must-not-leak"), "public runtime script must never expose deployment secrets");

console.log("Nomenclature React runtime policy QA: OK");
