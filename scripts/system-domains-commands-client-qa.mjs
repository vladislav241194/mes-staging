import { createSystemDomainsCommands } from "../src/modules/domain_api/system_domains_commands.js";

const assert = (value, message) => { if (!value) throw new Error(message); };
let request = null;
const commands = createSystemDomainsCommands({ fetchImpl: async (_url, options) => {
  request = options;
  if (options.method === "GET") return { status: 200, ok: true, json: async () => ({ ok: true, capabilities: { serverCommandsEnabled: true, serverCommandSurfaces: ["production-structure"], primaryPostgres: true } }) };
  return { status: 200, ok: true, json: async () => ({ ok: true, revision: 3, item: { registries: {} }, snapshotSync: { applied: 1 } }) };
} });
const capabilities = await commands.getCapabilities();
assert(capabilities.ok && capabilities.enabled && capabilities.capabilities?.primaryPostgres && capabilities.capabilities?.serverCommandSurfaces?.includes("production-structure"), "client must expose the server-command capability without inferring it from a write failure");
const success = await commands.replace({ registries: {} }, { expectedRevision: 2, surface: "production-structure", idempotencyKey: "qa-key" });
assert(success.ok && success.revision === 3 && success.snapshotSync?.applied === 1, "successful command must expose the authoritative projection and sync result");
assert(request.method === "PUT" && request.headers["If-Match"] === '"2"' && request.headers["Idempotency-Key"] === "qa-key", "client must send optimistic concurrency and idempotency headers");
const conflict = createSystemDomainsCommands({ fetchImpl: async () => ({ status: 409, ok: false, json: async () => ({ conflict: true, revision: 4, error: "revision conflict" }) }) });
const conflicted = await conflict.replace({ registries: {} }, { expectedRevision: 2, surface: "production-structure" });
assert(!conflicted.ok && conflicted.conflict && conflicted.revision === 4, "revision conflict must remain explicit for the form layer");
const expired = createSystemDomainsCommands({ fetchImpl: async () => ({ status: 401, ok: false, json: async () => ({ code: "employee-session-expired", error: "expired" }) }) });
const expiredResult = await expired.replace({ registries: {} }, { expectedRevision: 2, surface: "production-structure" });
assert(!expiredResult.ok && expiredResult.status === 401 && expiredResult.code === "employee-session-expired" && expiredResult.authenticationRequired === true, "expired employee session must reach the frontend lifecycle handler");
const revoked = createSystemDomainsCommands({ fetchImpl: async () => ({ status: 401, ok: false, json: async () => ({ code: "revoked-session", error: "revoked" }) }) });
const revokedResult = await revoked.replace({ registries: {} }, { expectedRevision: 2, surface: "production-structure" });
assert(!revokedResult.ok && revokedResult.code === "revoked-session" && revokedResult.authenticationRequired === true, "revoked employee session must request a fresh PIN lifecycle");
const denied = createSystemDomainsCommands({ fetchImpl: async () => ({ status: 403, ok: false, json: async () => ({ code: "production-structure-write-forbidden", error: "denied" }) }) });
const deniedResult = await denied.replace({ registries: {} }, { expectedRevision: 2, surface: "production-structure" });
assert(!deniedResult.ok && deniedResult.status === 403 && deniedResult.code === "production-structure-write-forbidden" && deniedResult.authorizationDenied === true, "RBAC denial must remain distinct from missing employee authentication");
const invalid = await commands.replace(null, { expectedRevision: 2, surface: "production-structure" });
assert(!invalid.ok && /required/.test(invalid.error), "invalid command input must not call the network");
console.log("System Domains command client QA: OK");
