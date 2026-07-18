import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
const primary = getPublicRuntimeConfig({ APP_ENV: "pilot", MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "1", DATABASE_URL: "must-not-leak" });
const legacy = getPublicRuntimeConfig({ APP_ENV: "pilot", MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "0", DATABASE_URL: "must-not-leak" });
assert(primary.MES_SPECIFICATIONS2_SERVER_PUBLICATION_PRIMARY === true, "server-primary publication rollout policy must reach the browser bootstrap");
assert(legacy.MES_SPECIFICATIONS2_SERVER_PUBLICATION_PRIMARY === false, "legacy publication rollout must remain explicit when the flag is absent or disabled");
const script = renderRuntimeConfigScript({ MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "1", DATABASE_URL: "must-not-leak" });
assert(script.includes('"MES_SPECIFICATIONS2_SERVER_PUBLICATION_PRIMARY":true') && !script.includes("must-not-leak"), "runtime policy must be public but never expose deployment secrets");
console.log("Specifications 2.0 server-first runtime policy QA: OK");
