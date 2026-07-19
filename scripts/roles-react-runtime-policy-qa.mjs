import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };

const disabled = getPublicRuntimeConfig({ APP_ENV: "pilot" });
assert(disabled.MES_REACT_ROLES === false, "Roles React rollout must be disabled by default");
assert(disabled.MES_REACT_ROLES_READ_ONLY_EVALUATION === false, "Roles evaluation must be disabled by default");

const enabled = getPublicRuntimeConfig({
  APP_ENV: "pilot",
  MES_REACT_ROLES: "1",
  MES_REACT_ROLES_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(enabled.MES_REACT_ROLES === true, "explicit Roles rollout must reach the browser bootstrap");
assert(enabled.MES_REACT_ROLES_READ_ONLY_EVALUATION === true, "explicit Roles evaluation permission must reach the browser bootstrap");

const nonExact = getPublicRuntimeConfig({
  MES_REACT_ROLES: "true",
  MES_REACT_ROLES_READ_ONLY_EVALUATION: "yes",
});
assert(nonExact.MES_REACT_ROLES === false, "non-exact Roles rollout values must fail closed");
assert(nonExact.MES_REACT_ROLES_READ_ONLY_EVALUATION === false, "non-exact Roles evaluation values must fail closed");

const script = renderRuntimeConfigScript({
  MES_REACT_ROLES: "1",
  MES_REACT_ROLES_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(script.includes('"MES_REACT_ROLES":true'), "public runtime script must contain the Roles rollout boolean");
assert(script.includes('"MES_REACT_ROLES_READ_ONLY_EVALUATION":true'), "public runtime script must contain the Roles evaluation boolean");
assert(!script.includes("must-not-leak"), "public runtime script must never expose deployment secrets");

console.log("Roles React runtime policy QA: OK");
