import { createSystemDomainsRepository } from "./domain-system-domains-repository.mjs";
import { syncPendingSystemDomainsSnapshotChanges } from "./domain-system-domains-snapshot-sync.mjs";

const primary = createSystemDomainsRepository();
try {
  console.log(JSON.stringify(await syncPendingSystemDomainsSnapshotChanges({ primary, filePath: process.env.MES_SHARED_STATE_FILE || "" })));
} finally { await primary.close(); }
