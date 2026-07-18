import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };

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

console.log("Boards React runtime policy QA: OK");
