import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
const disabled = getPublicRuntimeConfig({ APP_ENV: "pilot" });
assert(disabled.MES_REACT_DIRECTORY_OPERATIONS === false, "Directory Operations rollout must be disabled by default");
assert(disabled.MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION === false, "Directory Operations evaluation must be disabled by default");
const enabled = getPublicRuntimeConfig({ MES_REACT_DIRECTORY_OPERATIONS: "1", MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert(enabled.MES_REACT_DIRECTORY_OPERATIONS === true, "explicit Operations rollout must reach browser bootstrap");
assert(enabled.MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION === true, "explicit Operations evaluation must reach browser bootstrap");
const nonExact = getPublicRuntimeConfig({ MES_REACT_DIRECTORY_OPERATIONS: "true", MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION: "yes" });
assert(nonExact.MES_REACT_DIRECTORY_OPERATIONS === false, "non-exact Operations rollout must fail closed");
assert(nonExact.MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION === false, "non-exact Operations evaluation must fail closed");
const script = renderRuntimeConfigScript({ MES_REACT_DIRECTORY_OPERATIONS: "1", MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert(script.includes('"MES_REACT_DIRECTORY_OPERATIONS":true'), "public runtime script must contain Operations rollout boolean");
assert(script.includes('"MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION":true'), "public runtime script must contain Operations evaluation boolean");
assert(!script.includes("must-not-leak"), "public runtime script must not expose deployment secrets");
console.log("Directory Operations React runtime policy QA: OK");
