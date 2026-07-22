#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  symlink,
  unlink,
} from "node:fs/promises";
import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FIXED_HELPER_PATH = "/usr/local/libexec/mes/active-bundle/release-switch-journal.mjs";
const FIXED_ROOT_SEAL_HELPER = "/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs";
const JOURNAL_PARENT = "/var/lib/mes";
const JOURNAL_ROOT = `${JOURNAL_PARENT}/release-switch`;
const AUTHORITY_LOCK_FILE = "/run/lock/mes/mes-authority-rollout.lock";
const AUTHORITY_LOCK_FD = 9;

export const RELEASE_SWITCH_CONTOURS = Object.freeze({
  pilot: Object.freeze({
    appPath: "/srv/mes/pilot/app",
    releasesPath: "/srv/mes/pilot/releases",
    service: "mes-pilot.service",
  }),
  staging: Object.freeze({
    appPath: "/srv/mes/dev/app",
    releasesPath: "/srv/mes/dev/releases",
    service: "mes-dev.service",
  }),
});

const SAFE_RELEASE_ID = /^[A-Za-z0-9._-]{1,96}$/;
const PHASES = new Set(["prepared", "pointer-switched", "record-committed"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertReleaseId(value, label) {
  const normalized = String(value || "");
  if (!SAFE_RELEASE_ID.test(normalized)) throw new Error(`${label} is not a safe release id`);
  return normalized;
}

async function syncDirectory(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); }
  finally { await handle.close(); }
}

async function syncRegularFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Release-switch durability barrier requires a regular file: ${path}`);
  }
  const handle = await open(path, "r");
  try { await handle.sync(); }
  finally { await handle.close(); }
}

async function syncServingState(config, { pointer = true, activeRecord = true } = {}) {
  if (pointer) await syncDirectory(dirname(config.appPath));
  if (activeRecord) {
    await syncRegularFile(join(config.releasesPath, "active-release.json"));
    await syncDirectory(config.releasesPath);
  }
}

async function atomicWriteJson(path, value, { enforceRootOwnership }) {
  const directory = dirname(path);
  const tempPath = join(directory, `.${path.split("/").at(-1)}.${process.pid}.${randomUUID()}.next`);
  let handle = null;
  try {
    handle = await open(tempPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    if (enforceRootOwnership) await assertRootRegularFile(tempPath, 0o600);
    await rename(tempPath, path);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

async function assertRootDirectory(path, mode) {
  const metadata = await lstat(path);
  if (!metadata.isDirectory()
    || metadata.isSymbolicLink()
    || metadata.uid !== 0
    || metadata.gid !== 0
    || (metadata.mode & 0o777) !== mode
    || await realpath(path) !== path) {
    throw new Error(`Release-switch journal directory is not canonical root:root ${mode.toString(8)}: ${path}`);
  }
}

async function assertRootControlledDirectory(path) {
  const metadata = await lstat(path);
  if (!metadata.isDirectory()
    || metadata.isSymbolicLink()
    || metadata.uid !== 0
    || metadata.gid !== 0
    || (metadata.mode & 0o022) !== 0
    || await realpath(path) !== path) {
    throw new Error(`Release-switch journal parent is not canonical root-controlled: ${path}`);
  }
}

async function assertRootRegularFile(path, mode) {
  const metadata = await lstat(path);
  if (!metadata.isFile()
    || metadata.isSymbolicLink()
    || metadata.uid !== 0
    || metadata.gid !== 0
    || (metadata.mode & 0o777) !== mode
    || await realpath(path) !== path) {
    throw new Error(`Release-switch journal file is not canonical root:root ${mode.toString(8)}: ${path}`);
  }
}

export function classifyReleaseSwitchState({ pointerTarget, activeReleaseId, journal }) {
  if (pointerTarget === journal.from.target && activeReleaseId === journal.from.releaseId) return "from/from";
  if (pointerTarget === journal.to.target && activeReleaseId === journal.to.releaseId) return "to/to";
  if (pointerTarget === journal.to.target && activeReleaseId === journal.from.releaseId) return "to/from";
  if (pointerTarget === journal.from.target && activeReleaseId === journal.to.releaseId) return "from/to";
  return "unknown";
}

export function createReleaseSwitchJournalController({
  contours = RELEASE_SWITCH_CONTOURS,
  journalParent = JOURNAL_PARENT,
  journalRoot = JOURNAL_ROOT,
  enforceRootOwnership = false,
  sealRelease = async () => {},
  sealPointer = async () => {},
  sealArtifact = async () => {},
  stopService = async () => {},
} = {}) {
  const configFor = (contour) => {
    const config = contours[contour];
    if (!config) throw new Error(`Unknown release-switch contour: ${contour}`);
    return config;
  };
  const journalPathFor = (contour) => join(journalRoot, `${contour}.json`);

  async function ensureJournalRoot() {
    if (!enforceRootOwnership) {
      await mkdir(journalRoot, { recursive: true, mode: 0o700 });
      return;
    }
    // Never let recursive mkdir traverse a not-yet-proved production parent.
    // Prove the fixed parent chain first, create only one direct child at a
    // time, then prove each new inode before using it.
    const parentOfJournalParent = dirname(journalParent);
    await assertRootControlledDirectory(parentOfJournalParent);
    try {
      await assertRootControlledDirectory(journalParent);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(journalParent, { mode: 0o755 });
      await syncDirectory(parentOfJournalParent);
      await assertRootControlledDirectory(journalParent);
    }
    try {
      await assertRootDirectory(journalRoot, 0o700);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(journalRoot, { mode: 0o700 });
      await syncDirectory(journalParent);
      await assertRootDirectory(journalRoot, 0o700);
    }
  }

  async function readActiveRecord(config) {
    const path = join(config.releasesPath, "active-release.json");
    await sealArtifact(path);
    const raw = await readFile(path, "utf8");
    const value = JSON.parse(raw);
    const releaseId = assertReleaseId(value?.releaseId, "active release id");
    return { path, raw, sha256: sha256(raw), releaseId, value };
  }

  async function readPointerTarget(config) {
    const metadata = await lstat(config.appPath);
    if (!metadata.isSymbolicLink()) throw new Error(`Active runtime is not a release pointer: ${config.appPath}`);
    return await realpath(config.appPath);
  }

  async function validateJournal(value, contour) {
    const config = configFor(contour);
    if (value?.schemaVersion !== 1 || value?.contour !== contour) throw new Error("Release-switch journal schema/contour mismatch");
    if (!new Set(["activation", "rollback"]).has(value?.operation)) throw new Error("Release-switch journal operation is invalid");
    if (!PHASES.has(value?.phase)) throw new Error("Release-switch journal phase is invalid");
    const fromReleaseId = assertReleaseId(value?.from?.releaseId, "journal from release id");
    const toReleaseId = assertReleaseId(value?.to?.releaseId, "journal to release id");
    if (fromReleaseId === toReleaseId) throw new Error("Release-switch journal cannot switch a release to itself");
    if (value.from.target !== join(config.releasesPath, fromReleaseId, "app")
      || value.to.target !== join(config.releasesPath, toReleaseId, "app")) {
      throw new Error("Release-switch journal target escaped the contour release store");
    }
    if (!/^[a-f0-9]{64}$/.test(String(value?.from?.activeRecordSha256 || ""))) {
      throw new Error("Release-switch journal lacks the exact prior active-record digest");
    }
    if (value.phase === "record-committed"
      && !/^[a-f0-9]{64}$/.test(String(value?.to?.activeRecordSha256 || ""))) {
      throw new Error("Committed release-switch journal lacks the exact new active-record digest");
    }
    return value;
  }

  async function readJournal(contour, { optional = false } = {}) {
    await ensureJournalRoot();
    const path = journalPathFor(contour);
    let raw;
    try { raw = await readFile(path, "utf8"); }
    catch (error) {
      if (optional && error?.code === "ENOENT") return null;
      throw error;
    }
    if (enforceRootOwnership) await assertRootRegularFile(path, 0o600);
    return await validateJournal(JSON.parse(raw), contour);
  }

  async function writeJournal(contour, value) {
    await ensureJournalRoot();
    const path = journalPathFor(contour);
    await atomicWriteJson(path, value, { enforceRootOwnership });
    if (enforceRootOwnership) await assertRootRegularFile(path, 0o600);
  }

  async function removeJournal(contour) {
    const path = journalPathFor(contour);
    await unlink(path).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
    await syncDirectory(journalRoot);
  }

  async function proveJournalReleases(config, journal) {
    await sealRelease(config.releasesPath, journal.from.releaseId, journal.from.target);
    await sealRelease(config.releasesPath, journal.to.releaseId, journal.to.target);
  }

  async function prepare({ contour, operation, fromReleaseId, toReleaseId }) {
    const config = configFor(contour);
    if (!new Set(["activation", "rollback"]).has(operation)) throw new Error("Release-switch operation must be activation or rollback");
    const fromId = assertReleaseId(fromReleaseId, "from release id");
    const toId = assertReleaseId(toReleaseId, "to release id");
    if (fromId === toId) throw new Error("Release-switch source and target must differ");
    const existing = await readJournal(contour, { optional: true });
    if (existing) throw new Error(`Unrecovered release-switch journal blocks ${operation}: ${journalPathFor(contour)}`);
    const fromTarget = join(config.releasesPath, fromId, "app");
    const toTarget = join(config.releasesPath, toId, "app");
    await sealRelease(config.releasesPath, fromId, fromTarget);
    await sealRelease(config.releasesPath, toId, toTarget);
    const pointerTarget = await readPointerTarget(config);
    const active = await readActiveRecord(config);
    if (pointerTarget !== fromTarget || active.releaseId !== fromId) throw new Error("Release-switch prepare requires a coherent source pointer and active record");
    await syncServingState(config);
    const now = new Date().toISOString();
    const journal = {
      schemaVersion: 1,
      contour,
      operation,
      phase: "prepared",
      transactionId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      from: { releaseId: fromId, target: fromTarget, activeRecordSha256: active.sha256 },
      to: { releaseId: toId, target: toTarget, activeRecordSha256: null },
    };
    await writeJournal(contour, journal);
    return journal;
  }

  async function mark({ contour, phase }) {
    if (!new Set(["pointer-switched", "record-committed"]).has(phase)) throw new Error("Unsupported release-switch journal phase");
    const config = configFor(contour);
    const journal = await readJournal(contour);
    await proveJournalReleases(config, journal);
    const pointerTarget = await readPointerTarget(config);
    if (pointerTarget !== journal.to.target) throw new Error(`Cannot mark ${phase}: active pointer is not the journal target`);
    await sealPointer(config.appPath, journal.to.target);
    await syncServingState(config, { pointer: true, activeRecord: phase === "record-committed" });
    const active = await readActiveRecord(config);
    if (phase === "pointer-switched") {
      if (![journal.from.releaseId, journal.to.releaseId].includes(active.releaseId)) {
        throw new Error("Cannot mark pointer-switched against an unrelated active record");
      }
    } else if (active.releaseId !== journal.to.releaseId) {
      throw new Error("Cannot mark record-committed before the target active record is durable");
    }
    const next = {
      ...journal,
      phase,
      updatedAt: new Date().toISOString(),
      to: {
        ...journal.to,
        activeRecordSha256: phase === "record-committed" ? active.sha256 : journal.to.activeRecordSha256,
      },
    };
    await writeJournal(contour, next);
    return next;
  }

  async function clearCommitted({ contour }) {
    const config = configFor(contour);
    const journal = await readJournal(contour);
    if (journal.phase !== "record-committed") throw new Error("Only a committed release-switch journal may be cleared directly");
    await proveJournalReleases(config, journal);
    const pointerTarget = await readPointerTarget(config);
    const active = await readActiveRecord(config);
    if (pointerTarget !== journal.to.target
      || active.releaseId !== journal.to.releaseId
      || active.sha256 !== journal.to.activeRecordSha256) {
      throw new Error("Committed release-switch journal does not match the serving pointer and active record");
    }
    await sealPointer(config.appPath, journal.to.target);
    await syncServingState(config);
    await removeJournal(contour);
    return { status: "cleared-committed", contour, releaseId: journal.to.releaseId };
  }

  async function restoreSourcePointer(config, journal) {
    await stopService(config.service);
    const active = await readActiveRecord(config);
    if (active.releaseId !== journal.from.releaseId || active.sha256 !== journal.from.activeRecordSha256) {
      throw new Error("Fail-closed recovery refused to bind the source pointer to a changed active record");
    }
    const tempPointer = `${config.appPath}.journal-recovery-${process.pid}-${randomUUID()}`;
    try {
      await symlink(journal.from.target, tempPointer);
      await sealPointer(tempPointer, journal.from.target);
      await rename(tempPointer, config.appPath);
      await syncDirectory(dirname(config.appPath));
    } finally {
      await unlink(tempPointer).catch(() => {});
    }
    await sealPointer(config.appPath, journal.from.target);
  }

  async function recover({ contour }) {
    const config = configFor(contour);
    const journal = await readJournal(contour, { optional: true });
    if (!journal) return { status: "none", contour };
    await proveJournalReleases(config, journal);
    const active = await readActiveRecord(config);
    let pointerTarget;
    try { pointerTarget = await readPointerTarget(config); }
    catch (error) {
      await stopService(config.service);
      throw new Error(`Fail-closed release-switch recovery stopped ${config.service}: ${error.message}`);
    }
    const state = classifyReleaseSwitchState({ pointerTarget, activeReleaseId: active.releaseId, journal });
    if (state === "from/from") {
      if (active.sha256 !== journal.from.activeRecordSha256) {
        await stopService(config.service);
        throw new Error("Fail-closed recovery found a changed source active record");
      }
      await sealPointer(config.appPath, journal.from.target);
      await syncServingState(config);
      await removeJournal(contour);
      return { status: "cleared-source", contour, releaseId: journal.from.releaseId };
    }
    if (state === "to/to") {
      if (journal.to.activeRecordSha256 && active.sha256 !== journal.to.activeRecordSha256) {
        await stopService(config.service);
        throw new Error("Fail-closed recovery found a changed target active record");
      }
      await sealPointer(config.appPath, journal.to.target);
      await syncServingState(config);
      await removeJournal(contour);
      return { status: "cleared-target", contour, releaseId: journal.to.releaseId };
    }
    if (state === "to/from") {
      await sealPointer(config.appPath, journal.to.target);
      await restoreSourcePointer(config, journal);
      await syncServingState(config);
      await removeJournal(contour);
      return {
        status: "restored-source-service-stopped",
        contour,
        releaseId: journal.from.releaseId,
      };
    }
    await stopService(config.service);
    throw new Error(`Fail-closed release-switch recovery retained the journal for operator inspection: ${state}`);
  }

  return { clearCommitted, mark, prepare, readJournal, recover };
}

function parseCli(argv) {
  const [command = "", ...entries] = argv;
  const options = {};
  for (const entry of entries) {
    if (!entry.startsWith("--") || !entry.includes("=")) throw new Error(`Invalid release-switch journal option: ${entry}`);
    const [key, ...parts] = entry.slice(2).split("=");
    options[key] = parts.join("=");
  }
  return { command, options };
}

function runSeal(args) {
  const result = spawnSync("/usr/bin/node", [FIXED_ROOT_SEAL_HELPER, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Fixed root seal verification failed: ${result.stderr || result.stdout}`);
}

export function fdInfoProvesCanonicalFlock({ fdInfo, ownerPid, inode }) {
  const lockLines = String(fdInfo || "").split(/\r?\n/).filter((line) => /^\s*lock:\s/.test(line));
  if (lockLines.length !== 1) return false;
  const fields = lockLines[0].trim().split(/\s+/);
  if (fields[0] !== "lock:"
    || fields[2] !== "FLOCK"
    || fields[4] !== "WRITE"
    || fields[5] !== String(ownerPid)) return false;
  const deviceAndInode = fields[6] || "";
  const separator = deviceAndInode.lastIndexOf(":");
  if (separator < 0) return false;
  try {
    return BigInt(deviceAndInode.slice(separator + 1)) === BigInt(inode);
  } catch {
    return false;
  }
}

async function assertProductionBoundary() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) throw new Error("Release-switch journal helper requires uid 0");
  if (await realpath(process.argv[1]) !== await realpath(FIXED_HELPER_PATH)) throw new Error(`Release-switch journal must execute from ${FIXED_HELPER_PATH}`);
  runSeal(["bundle"]);
  if (process.env.MES_RELEASE_AUTHORITY_LOCK_HELD !== "1"
    || Number(process.env.MES_RELEASE_AUTHORITY_LOCK_FD) !== AUTHORITY_LOCK_FD) {
    throw new Error("Release-switch journal requires the inherited authority lock on fd9");
  }
  const ownerPid = Number(process.env.MES_RELEASE_AUTHORITY_LOCK_OWNER_PID);
  if (!Number.isSafeInteger(ownerPid) || ownerPid < 1
    || (ownerPid !== process.pid && ownerPid !== process.ppid)) {
    throw new Error("Release-switch journal requires the exact self or direct-parent authority owner PID");
  }
  const [lockMetadata, fdMetadata, fdInfo, ownerProcessMetadata, ownerFdMetadata, ownerFdInfo] = await Promise.all([
    stat(AUTHORITY_LOCK_FILE, { bigint: true }),
    stat(`/proc/self/fd/${AUTHORITY_LOCK_FD}`, { bigint: true }),
    readFile(`/proc/self/fdinfo/${AUTHORITY_LOCK_FD}`, "utf8"),
    stat(`/proc/${ownerPid}`, { bigint: true }),
    stat(`/proc/${ownerPid}/fd/${AUTHORITY_LOCK_FD}`, { bigint: true }),
    readFile(`/proc/${ownerPid}/fdinfo/${AUTHORITY_LOCK_FD}`, "utf8"),
  ]);
  if (!lockMetadata.isFile()
    || lockMetadata.uid !== 0n
    || lockMetadata.gid !== 0n
    || (lockMetadata.mode & 0o777n) !== 0o600n
    || lockMetadata.dev !== fdMetadata.dev
    || lockMetadata.ino !== fdMetadata.ino
    || ownerProcessMetadata.uid !== 0n
    || ownerFdMetadata.dev !== lockMetadata.dev
    || ownerFdMetadata.ino !== lockMetadata.ino
    || !fdInfoProvesCanonicalFlock({ fdInfo, ownerPid, inode: lockMetadata.ino })
    || !fdInfoProvesCanonicalFlock({ fdInfo: ownerFdInfo, ownerPid, inode: lockMetadata.ino })) {
    throw new Error("Release-switch journal could not prove the canonical authority flock on fd9");
  }
}

async function productionMain() {
  await assertProductionBoundary();
  const { command, options } = parseCli(process.argv.slice(2));
  const prestart = options.prestart === "true";
  const recoveryConsumer = String(process.env.MES_RELEASE_RECOVERY_CONSUMER || "");
  if (recoveryConsumer && !["app", "writer"].includes(recoveryConsumer)) {
    throw new Error("Release recovery consumer must be app or writer");
  }
  const controller = createReleaseSwitchJournalController({
    enforceRootOwnership: true,
    sealRelease: async (releasesPath, releaseId, appPath) => runSeal([
      "release", `--releases-root=${releasesPath}`, `--release-id=${releaseId}`, `--app=${appPath}`,
    ]),
    sealPointer: async (pointer, expectedTarget) => runSeal([
      "pointer", `--pointer=${pointer}`, `--expected-target=${expectedTarget}`,
    ]),
    sealArtifact: async (artifact) => runSeal([
      "artifact", `--trusted-root=${dirname(artifact)}`, `--artifact=${artifact}`,
    ]),
    stopService: async (service) => {
      if (prestart) {
        const active = spawnSync("/usr/bin/systemctl", ["is-active", "--quiet", service], { encoding: "utf8" });
        if (active.status !== 0) return;
        spawnSync("/usr/bin/systemctl", ["stop", "--no-block", service], { encoding: "utf8" });
        throw new Error(`Cannot recover ${service} inside its pre-start gate while an old main process is active`);
      }
      const result = spawnSync("/usr/bin/systemctl", ["stop", service], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(`Cannot stop ${service} for fail-closed recovery: ${result.stderr || result.stdout}`);
    },
  });
  let result;
  if (command === "prepare") {
    result = await controller.prepare({
      contour: options.contour,
      operation: options.operation,
      fromReleaseId: options["from-release-id"],
      toReleaseId: options["to-release-id"],
    });
  } else if (command === "mark") {
    result = await controller.mark({ contour: options.contour, phase: options.phase });
  } else if (command === "clear-committed") {
    result = await controller.clearCommitted({ contour: options.contour });
  } else if (command === "recover") {
    result = await controller.recover({ contour: options.contour });
  } else {
    throw new Error("Usage: release-switch-journal.mjs prepare|mark|clear-committed|recover --contour=pilot|staging ...");
  }
  console.log(JSON.stringify(result));
  if (command === "recover" && recoveryConsumer) {
    console.log(`PILOT_RELEASE_RECOVERY_OK consumer=${recoveryConsumer}`);
  }
}

function isProductionCliEntrypoint() {
  const declaredMain = process.env.MES_RELEASE_QA_FORCE_NODE20_ENTRYPOINT === "1"
    ? undefined
    : import.meta.main;
  if (typeof declaredMain === "boolean") return declaredMain;
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  const modulePath = fileURLToPath(import.meta.url);
  if (basename(invokedPath) !== basename(modulePath)) return false;
  let invokedCanonical;
  let moduleCanonical;
  try {
    invokedCanonical = realpathSync(invokedPath);
    moduleCanonical = realpathSync(modulePath);
  } catch (error) {
    console.error(`Release-switch journal helper entrypoint identity resolution failed: ${error?.message || error}`);
    process.exit(1);
  }
  if (invokedCanonical !== moduleCanonical) {
    console.error("Release-switch journal helper CLI entrypoint identity mismatch");
    process.exit(1);
  }
  return true;
}

if (isProductionCliEntrypoint()) {
  productionMain().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
