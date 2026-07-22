import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  access,
  appendFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createReleaseSwitchJournalController,
  fdInfoProvesCanonicalFlock,
} from "./release-switch-journal.mjs";

const selfPath = fileURLToPath(import.meta.url);
const workerRootArg = process.argv.find((entry) => entry.startsWith("--worker-root="));
const boundaryArg = process.argv.find((entry) => entry.startsWith("--boundary="));

if (workerRootArg && boundaryArg) {
  await runWorker(workerRootArg.slice("--worker-root=".length), boundaryArg.slice("--boundary=".length));
} else {
  await runQa();
}

async function runQa() {
  const source = await readFile(new URL("./release-switch-journal.mjs", import.meta.url), "utf8");
  const fixturePid = 4242;
  const fixtureInode = 777n;
  assert.equal(fdInfoProvesCanonicalFlock({
    fdInfo: `pos:\t0\nlock:\t1: FLOCK ADVISORY WRITE ${fixturePid} 00:2a:${fixtureInode} 0 EOF\n`,
    ownerPid: fixturePid,
    inode: fixtureInode,
  }), true, "the journal boundary must accept one exact owner/inode flock proof");
  assert.equal(fdInfoProvesCanonicalFlock({
    fdInfo: `pos:\t0\nlock:\t1: FLOCK ADVISORY WRITE ${fixturePid + 1} 00:2a:${fixtureInode} 0 EOF\n`,
    ownerPid: fixturePid,
    inode: fixtureInode,
  }), false, "a FLOCK WRITE owned by another PID must fail closed");
  assert.equal(fdInfoProvesCanonicalFlock({
    fdInfo: "pos:\t0\nflags:\t0100002\n",
    ownerPid: fixturePid,
    inode: fixtureInode,
  }), false, "an opened but unlocked authority fd must fail closed");
  assert.equal(fdInfoProvesCanonicalFlock({
    fdInfo: `lock:\t1: FLOCK ADVISORY WRITE ${fixturePid} 00:2a:${fixtureInode + 1n} 0 EOF\n`,
    ownerPid: fixturePid,
    inode: fixtureInode,
  }), false, "a lock line for another inode must fail closed");
  assert(source.includes('const JOURNAL_ROOT = `${JOURNAL_PARENT}/release-switch`')
    && source.includes("await handle.sync()")
    && source.includes("await syncDirectory(directory)")
    && source.includes("await syncDirectory(dirname(config.appPath))"),
  "journal writes, journal renames and recovered pointer renames must be crash-durable");
  assert(source.includes('spawnSync("/usr/bin/systemctl", ["stop", service]')
    && source.includes("restored-source-service-stopped")
    && !source.includes('systemctl", ["restart"'),
  "mismatch recovery must stop the service and must never restart an unaccepted runtime");
  assert(source.includes('FIXED_HELPER_PATH = "/usr/local/libexec/mes/active-bundle/release-switch-journal.mjs"')
    && source.includes('FIXED_ROOT_SEAL_HELPER = "/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"')
    && source.includes('runSeal(["bundle"])'),
  "boot/manual recovery must execute only the fixed root-owned helper and fixed seal verifier");
  assert(source.includes("MES_RELEASE_AUTHORITY_LOCK_OWNER_PID")
    && source.includes("ownerPid !== process.pid && ownerPid !== process.ppid")
    && source.includes('stat(`/proc/${ownerPid}/fd/${AUTHORITY_LOCK_FD}`')
    && source.includes("ownerProcessMetadata.uid !== 0n")
    && source.includes("fdInfo: ownerFdInfo, ownerPid"),
  "the production journal may run only as the exact lock owner or its direct root child while proving both fd9 views");
  const trustedRootCreation = source.slice(
    source.indexOf("Never let recursive mkdir traverse"),
    source.indexOf("async function readActiveRecord"),
  );
  assert(trustedRootCreation.indexOf("assertRootControlledDirectory(parentOfJournalParent)")
      < trustedRootCreation.indexOf("await mkdir(journalParent, { mode: 0o755 })")
    && trustedRootCreation.indexOf("assertRootControlledDirectory(journalParent)")
      < trustedRootCreation.indexOf("await mkdir(journalRoot, { mode: 0o700 })")
    && !trustedRootCreation.includes("recursive: true"),
  "production journal creation must prove each canonical root parent before one-level mkdir and never recursively follow an unsafe parent");

  for (const scenario of [
    { boundary: "before-pointer", signal: "SIGKILL", expectedRelease: "from", expectedStatus: "cleared-source", expectedStops: 0 },
    { boundary: "after-pointer", signal: "SIGKILL", expectedRelease: "from", expectedStatus: "restored-source-service-stopped", expectedStops: 1 },
    { boundary: "after-record", signal: "SIGKILL", expectedRelease: "to", expectedStatus: "cleared-target", expectedStops: 0 },
    { boundary: "health-fail", exitCode: 47, expectedRelease: "from", expectedStatus: "restored-source-service-stopped", expectedStops: 1 },
  ]) {
    const root = await realpath(await mkdtemp(join(tmpdir(), `mes-release-switch-${scenario.boundary}-`)));
    try {
      await setupRuntime(root);
      const worker = spawnSync(process.execPath, [selfPath, `--worker-root=${root}`, `--boundary=${scenario.boundary}`], {
        encoding: "utf8",
      });
      if (scenario.signal) assert.equal(worker.signal, scenario.signal, `${scenario.boundary} worker must cross the boundary via ${scenario.signal}: status=${worker.status} stderr=${worker.stderr}`);
      else assert.equal(worker.status, scenario.exitCode, `${scenario.boundary} worker must model the failed health path`);

      const controller = controllerFor(root);
      const recovered = await controller.recover({ contour: "qa" });
      assert.equal(recovered.status, scenario.expectedStatus, `${scenario.boundary} must select the deterministic recovery direction`);
      await assertCoherentRelease(root, scenario.expectedRelease);
      assert.equal(await readFile(pathsFor(root).bootstrapMirrorPath, "utf8"), "shared-bootstrap\n",
        `${scenario.boundary} must leave the pre-proved immutable bootstrap mirror unchanged`);
      assert.equal(await readFile(join(pathsFor(root).releasesPath, scenario.expectedRelease, "app", "bootstrap-snapshot.json"), "utf8"),
        await readFile(pathsFor(root).bootstrapMirrorPath, "utf8"),
      `${scenario.boundary} recovery may select either release only because both were proved digest-identical to the mirror before the switch`);
      assert.equal(await stopCount(root), scenario.expectedStops, `${scenario.boundary} must stop only an uncommitted target runtime`);
      assert.equal((await controller.recover({ contour: "qa" })).status, "none", `${scenario.boundary} recovery must be idempotent`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  const tamperRoot = await realpath(await mkdtemp(join(tmpdir(), "mes-release-switch-tamper-")));
  try {
    await setupRuntime(tamperRoot);
    const controller = controllerFor(tamperRoot);
    await controller.prepare({ contour: "qa", operation: "activation", fromReleaseId: "from", toReleaseId: "to" });
    await writeActiveRecord(tamperRoot, "to");
    await assert.rejects(controller.recover({ contour: "qa" }), /retained the journal for operator inspection: from\/to/,
      "an impossible pointer/record direction must fail closed");
    assert.equal(await stopCount(tamperRoot), 1, "an impossible direction must stop the service");
    await access(join(tamperRoot, "journal", "qa.json"));
    await assertCoherentState(tamperRoot, "from", "to");
  } finally {
    await rm(tamperRoot, { recursive: true, force: true });
  }

  console.log("Release switch durable journal QA: OK");
  console.log("- SIGKILL before pointer: coherent source retained and journal cleared");
  console.log("- SIGKILL after pointer / health failure: source pointer restored, service remains stopped");
  console.log("- SIGKILL after active record: committed target retained and journal cleared");
  console.log("- impossible pointer/record direction: service stopped, evidence retained");
  console.log("- SIGKILL boundaries preserve the read-only, digest-identical bootstrap mirror invariant");
}

async function runWorker(root, boundary) {
  const controller = controllerFor(root);
  await controller.prepare({ contour: "qa", operation: "activation", fromReleaseId: "from", toReleaseId: "to" });
  if (boundary === "before-pointer") process.kill(process.pid, "SIGKILL");
  await switchPointer(root, "to");
  if (boundary === "after-pointer") process.kill(process.pid, "SIGKILL");
  await controller.mark({ contour: "qa", phase: "pointer-switched" });
  if (boundary === "health-fail") process.exit(47);
  await writeActiveRecord(root, "to");
  if (boundary === "after-record") process.kill(process.pid, "SIGKILL");
  throw new Error(`Unsupported QA boundary: ${boundary}`);
}

function pathsFor(root) {
  const releasesPath = join(root, "releases");
  return {
    appPath: join(root, "app"),
    releasesPath,
    activeRecordPath: join(releasesPath, "active-release.json"),
    bootstrapMirrorPath: join(root, "bootstrap-recovery", "bootstrap-snapshot.json"),
    stopLogPath: join(root, "service-stop.log"),
  };
}

function controllerFor(root) {
  const paths = pathsFor(root);
  return createReleaseSwitchJournalController({
    contours: { qa: { appPath: paths.appPath, releasesPath: paths.releasesPath, service: "mes-qa.service" } },
    journalParent: root,
    journalRoot: join(root, "journal"),
    sealRelease: async (releasesPath, releaseId, appPath) => {
      assert.equal(appPath, join(releasesPath, releaseId, "app"));
      assert((await lstat(appPath)).isDirectory());
    },
    sealPointer: async (pointer, expectedTarget) => {
      assert((await lstat(pointer)).isSymbolicLink());
      assert.equal(await realpath(pointer), expectedTarget);
    },
    sealArtifact: async (artifact) => { assert((await lstat(artifact)).isFile()); },
    stopService: async (service) => {
      assert.equal(service, "mes-qa.service");
      await appendFile(paths.stopLogPath, "stopped\n", "utf8");
    },
  });
}

async function setupRuntime(root) {
  const paths = pathsFor(root);
  await mkdir(join(paths.releasesPath, "from", "app"), { recursive: true });
  await mkdir(join(paths.releasesPath, "to", "app"), { recursive: true });
  await mkdir(dirname(paths.bootstrapMirrorPath), { recursive: true });
  await writeFile(join(paths.releasesPath, "from", "app", "sealed.txt"), "from\n");
  await writeFile(join(paths.releasesPath, "to", "app", "sealed.txt"), "to\n");
  await writeFile(join(paths.releasesPath, "from", "app", "bootstrap-snapshot.json"), "shared-bootstrap\n");
  await writeFile(join(paths.releasesPath, "to", "app", "bootstrap-snapshot.json"), "shared-bootstrap\n");
  await writeFile(paths.bootstrapMirrorPath, "shared-bootstrap\n");
  await writeActiveRecord(root, "from");
  await symlink(join(paths.releasesPath, "from", "app"), paths.appPath);
}

async function switchPointer(root, releaseId) {
  const paths = pathsFor(root);
  const next = `${paths.appPath}.next`;
  await symlink(join(paths.releasesPath, releaseId, "app"), next);
  await rename(next, paths.appPath);
  await syncDirectory(dirname(paths.appPath));
}

async function writeActiveRecord(root, releaseId) {
  const paths = pathsFor(root);
  const next = `${paths.activeRecordPath}.next`;
  await mkdir(dirname(paths.activeRecordPath), { recursive: true });
  const handle = await open(next, "w", 0o600);
  await handle.writeFile(`${JSON.stringify({ schemaVersion: 2, releaseId })}\n`, "utf8");
  await handle.sync();
  await handle.close();
  await rename(next, paths.activeRecordPath);
  await syncDirectory(dirname(paths.activeRecordPath));
}

async function syncDirectory(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); }
  finally { await handle.close(); }
}

async function assertCoherentRelease(root, releaseId) {
  await assertCoherentState(root, releaseId, releaseId);
}

async function assertCoherentState(root, pointerReleaseId, recordReleaseId) {
  const paths = pathsFor(root);
  assert.equal(await realpath(paths.appPath), join(paths.releasesPath, pointerReleaseId, "app"));
  const active = JSON.parse(await readFile(paths.activeRecordPath, "utf8"));
  assert.equal(active.releaseId, recordReleaseId);
}

async function stopCount(root) {
  try { return (await readFile(pathsFor(root).stopLogPath, "utf8")).trim().split("\n").filter(Boolean).length; }
  catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}
