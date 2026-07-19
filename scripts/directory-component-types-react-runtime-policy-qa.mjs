import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };

const disabled = getPublicRuntimeConfig({ APP_ENV: "pilot" });
assert(disabled.MES_REACT_DIRECTORY_COMPONENT_TYPES === false, "Directory Component Types rollout must be disabled by default");
assert(disabled.MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION === false, "Directory Component Types evaluation must be disabled by default");

const enabled = getPublicRuntimeConfig({
  MES_REACT_DIRECTORY_COMPONENT_TYPES: "1",
  MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(enabled.MES_REACT_DIRECTORY_COMPONENT_TYPES === true, "explicit rollout must reach browser bootstrap");
assert(enabled.MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION === true, "explicit evaluation permission must reach browser bootstrap");

const nonExact = getPublicRuntimeConfig({
  MES_REACT_DIRECTORY_COMPONENT_TYPES: "true",
  MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION: "yes",
});
assert(nonExact.MES_REACT_DIRECTORY_COMPONENT_TYPES === false, "non-exact rollout value must fail closed");
assert(nonExact.MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION === false, "non-exact evaluation value must fail closed");

const script = renderRuntimeConfigScript({
  MES_REACT_DIRECTORY_COMPONENT_TYPES: "1",
  MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(script.includes('"MES_REACT_DIRECTORY_COMPONENT_TYPES":true'), "public runtime script must contain rollout boolean");
assert(script.includes('"MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION":true'), "public runtime script must contain evaluation boolean");
assert(!script.includes("must-not-leak"), "public runtime script must not expose deployment secrets");

console.log("Directory Component Types React runtime policy QA: OK");
