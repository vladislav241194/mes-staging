import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };

const disabled = getPublicRuntimeConfig({ APP_ENV: "pilot" });
assert(disabled.MES_REACT_STRUCTURE_EMPLOYEES === false, "Structure Employees React rollout must be disabled by default");
assert(disabled.MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION === false, "Structure Employees evaluation must be disabled by default");

const enabled = getPublicRuntimeConfig({
  APP_ENV: "pilot",
  MES_REACT_STRUCTURE_EMPLOYEES: "1",
  MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(enabled.MES_REACT_STRUCTURE_EMPLOYEES === true, "explicit Structure Employees rollout must reach the browser bootstrap");
assert(enabled.MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION === true, "explicit Structure Employees evaluation permission must reach the browser bootstrap");

const nonExact = getPublicRuntimeConfig({
  MES_REACT_STRUCTURE_EMPLOYEES: "true",
  MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION: "yes",
});
assert(nonExact.MES_REACT_STRUCTURE_EMPLOYEES === false, "non-exact Structure Employees rollout values must fail closed");
assert(nonExact.MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION === false, "non-exact Structure Employees evaluation values must fail closed");

const script = renderRuntimeConfigScript({
  MES_REACT_STRUCTURE_EMPLOYEES: "1",
  MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(script.includes('"MES_REACT_STRUCTURE_EMPLOYEES":true'), "public runtime script must contain the Structure Employees rollout boolean");
assert(script.includes('"MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION":true'), "public runtime script must contain the Structure Employees evaluation boolean");
assert(!script.includes("must-not-leak"), "public runtime script must never expose deployment secrets");

console.log("Structure Employees React runtime policy QA: OK");
