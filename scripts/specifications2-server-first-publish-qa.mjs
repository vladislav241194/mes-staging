import { readFile } from "node:fs/promises";

import { publishSpecifications2EntryWithServerFirst } from "../src/modules/specifications2/publish_flow.js";

const assert = (value, message) => { if (!value) throw new Error(message); };
const entry = { id: "spec-1", updatedAt: "before", publication: null, fingerprint: "draft-a" };

const events = [];
const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const serverAdapterStart = appSource.indexOf("publishServerRevision:");
const serverAdapterEnd = appSource.indexOf("getServerPublicationCapability:", serverAdapterStart);
const serverAdapterSource = appSource.slice(serverAdapterStart, serverAdapterEnd);
const legacyCommitStart = appSource.indexOf("const commitSpecifications2Publication");
const legacyCommitEnd = appSource.indexOf("const result = buildSpecifications2Publication", legacyCommitStart);
const legacyCommitSource = appSource.slice(legacyCommitStart, legacyCommitEnd);
assert(serverAdapterStart >= 0 && serverAdapterEnd > serverAdapterStart
  && serverAdapterSource.includes("specifications2PublishCommands?.publishRevision?.")
  && !serverAdapterSource.includes("isLegacyDirectoryWriteBlocked"),
"server-first publication must remain callable when Nomenclature and Directory command owners are both primary");
assert(legacyCommitStart >= 0 && legacyCommitEnd > legacyCommitStart
  && legacyCommitSource.includes("isLegacyDirectoryWriteBlocked()"),
"combined command ownership must continue blocking only the legacy local compatibility commit");
const serverFirst = await publishSpecifications2EntryWithServerFirst({
  entry,
  getServerPublicationCapability: async () => ({ ok: true, enabled: true, serverPrimary: true }),
  preparePublication: (source) => ({
    entry: { ...source, updatedAt: "published-at", publication: { revision: 1, fingerprint: "draft-a", releasedAt: "published-at" } },
    publication: { revision: 1, fingerprint: "draft-a", releasedAt: "published-at" },
  }),
  publishServerRevision: async (_, options) => { events.push(`server:${options.expectedPreviousRevision}`); return { ok: true, created: true, item: { id: "server-revision", revisionNo: 4, releasedAt: "published-at" }, publication: { revision: 4, fingerprint: "draft-a", releasedAt: "published-at" }, snapshotSync: { applied: 1 } }; },
  commitPublication: () => { throw new Error("server-primary must not mirror full compatibility state in the browser"); },
  publishLegacyEntry: () => { events.push("legacy"); return { revision: 99 }; },
  readCurrentEntry: () => entry,
  getFingerprint: (item) => item.fingerprint,
});
assert(serverFirst.ok && serverFirst.mode === "server-first" && !serverFirst.mirrored && serverFirst.serverProjection, "enabled server-primary capability must acknowledge the server projection without a browser legacy mirror");
assert(events.join(",") === "server:0", "server-primary publication must send its expected base revision and must not write a competing local compatibility projection");
assert(serverFirst.publishedEntry.updatedAt === "published-at", "unchanged draft must receive the acknowledged publication timestamp");
assert(serverFirst.publication.revision === 4 && serverFirst.publishedEntry.publication.revision === 4 && !serverFirst.recoveryPending, "server acknowledgement must replace the browser candidate with the canonical server revision and expose completed snapshot delivery");

const serverFailure = await publishSpecifications2EntryWithServerFirst({
  entry,
  getServerPublicationCapability: async () => ({ ok: true, enabled: true, serverPrimary: true }),
  preparePublication: () => ({ entry: { ...entry, publication: { revision: 1 } }, publication: { revision: 1 } }),
  publishServerRevision: async () => ({ ok: false, error: "network" }),
  commitPublication: () => { throw new Error("must not mirror"); },
  publishLegacyEntry: () => { throw new Error("must not fallback after a server command failure"); },
});
assert(!serverFailure.ok && serverFailure.mode === "server-first" && !serverFailure.serverSaved, "failed primary command must not publish a false local revision");

const disabled = await publishSpecifications2EntryWithServerFirst({
  entry,
  getServerPublicationCapability: async () => ({ ok: true, enabled: false, serverPrimary: false }),
  publishLegacyEntry: () => ({ revision: 2, fingerprint: "draft-a" }),
});
assert(disabled.ok && disabled.mode === "legacy" && disabled.publication.revision === 2, "disabled capability must preserve the local publication path");

const compatibilityServer = await publishSpecifications2EntryWithServerFirst({
  entry,
  getServerPublicationCapability: async () => ({ ok: true, enabled: true, serverPrimary: false }),
  publishLegacyEntry: () => ({ revision: 3, fingerprint: "draft-a" }),
});
assert(compatibilityServer.ok && compatibilityServer.mode === "legacy" && compatibilityServer.publication.revision === 3, "an older compatibility server must not silently opt into server-first publication");

let unsafeLegacyCalls = 0;
const primaryCapabilityFailure = await publishSpecifications2EntryWithServerFirst({
  entry,
  serverPrimaryPolicy: true,
  getServerPublicationCapability: async () => ({ ok: false, enabled: false, serverPrimary: true, error: "capability unavailable" }),
  publishLegacyEntry: () => { unsafeLegacyCalls += 1; return { revision: 4 }; },
});
assert(!primaryCapabilityFailure.ok && primaryCapabilityFailure.mode === "server-first" && unsafeLegacyCalls === 0, "configured server-primary rollout must never fall back after capability failure");

const primaryDisabledAfterCheck = await publishSpecifications2EntryWithServerFirst({
  entry,
  serverPrimaryPolicy: true,
  getServerPublicationCapability: async () => ({ ok: true, enabled: true, serverPrimary: true }),
  preparePublication: () => ({ entry: { ...entry, publication: { revision: 1 } }, publication: { revision: 1 } }),
  publishServerRevision: async () => ({ ok: false, disabled: true, error: "server policy changed" }),
  commitPublication: () => { throw new Error("must not mirror"); },
  publishLegacyEntry: () => { unsafeLegacyCalls += 1; return { revision: 5 }; },
});
assert(!primaryDisabledAfterCheck.ok && primaryDisabledAfterCheck.mode === "server-first" && unsafeLegacyCalls === 0, "a primary command rejection must not degrade into a legacy publication");

const changedDraft = { ...entry, updatedAt: "newer", fingerprint: "draft-b" };
const changed = await publishSpecifications2EntryWithServerFirst({
  entry,
  getServerPublicationCapability: async () => ({ ok: true, enabled: true, serverPrimary: true }),
  preparePublication: (source) => ({ entry: { ...source, updatedAt: "published-at", publication: { revision: 1, fingerprint: "draft-a" } }, publication: { revision: 1, fingerprint: "draft-a" } }),
  publishServerRevision: async () => ({ ok: true, item: { id: "server" } }),
  commitPublication: (_, publication) => publication,
  readCurrentEntry: () => changedDraft,
  getFingerprint: (item) => item.fingerprint,
});
assert(changed.ok && changed.draftChanged && changed.publishedEntry.updatedAt === "newer", "edits made while the server command runs must remain a newer local draft");

console.log("Specifications 2.0 server-first publication QA: OK");
