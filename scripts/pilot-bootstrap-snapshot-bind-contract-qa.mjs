import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dropInPath = fileURLToPath(new URL(
  "../ops/frontend/mes-pilot-bootstrap-snapshot-bind.conf",
  import.meta.url,
));

const SOURCE_DIRECTORY = "/srv/mes/pilot/bootstrap-recovery";
const SOURCE = `${SOURCE_DIRECTORY}/bootstrap-snapshot.json`;
const TARGETS = Object.freeze([
  "/srv/mes/pilot/app/bootstrap-snapshot.json",
  "/srv/mes/pilot/app/dist/bootstrap-snapshot.json",
]);

function significantLines(source) {
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function parseBind(line) {
  assert.match(line, /^BindReadOnlyPaths=\/[^:\s]+:\/[^:\s]+$/u);
  const [source, target] = line.slice("BindReadOnlyPaths=".length).split(":");
  for (const path of [source, target]) {
    assert.equal(path.includes(".."), false, `Bind path must not contain traversal: ${path}`);
    assert.equal(path.includes("*"), false, `Bind path must not contain a glob: ${path}`);
    assert.equal(path.startsWith("-/"), false, `Bind path must not be optional: ${path}`);
  }
  return { source, target };
}

function permissionBits(mode, ownerMatch, groupMatch) {
  if (ownerMatch) return (mode >> 6) & 0o7;
  if (groupMatch) return (mode >> 3) & 0o7;
  return mode & 0o7;
}

function hasPermission({ identity, node, permission }) {
  if (identity.uid === ROOT_UID) return true;
  const bits = permissionBits(
    node.mode,
    identity.uid === node.uid,
    identity.groups.includes(node.gid),
  );
  return Boolean(bits & permission);
}

function canReadSealedSnapshot({ identity, directory, file }) {
  return hasPermission({ identity, node: directory, permission: 0o1 })
    && hasPermission({ identity, node: file, permission: 0o4 });
}

function canWriteSealedSnapshot({ identity, directory, file }) {
  return hasPermission({ identity, node: directory, permission: 0o1 })
    && hasPermission({ identity, node: file, permission: 0o2 });
}

function canUnlinkSealedSnapshot({ identity, directory }) {
  // Directory write plus search, not the file's own mode, controls unlink.
  return hasPermission({ identity, node: directory, permission: 0o2 })
    && hasPermission({ identity, node: directory, permission: 0o1 });
}

function canAtomicallyReplaceSealedSnapshot({ identity, directory }) {
  // Creating the next inode and renaming it over the mirror also requires
  // write plus search on the parent. Only root may perform that refresh.
  return hasPermission({ identity, node: directory, permission: 0o2 })
    && hasPermission({ identity, node: directory, permission: 0o1 });
}

function canReadBoundSnapshot({ identity, file }) {
  // systemd resolves the root-only source before dropping privileges. Inside
  // the service namespace mes-pilot reads the 0444 bind target, while the
  // BindReadOnlyPaths mount contract prevents mutation through that target.
  return hasPermission({ identity, node: file, permission: 0o4 });
}

const source = await readFile(dropInPath, "utf8");
const lines = significantLines(source);
assert.deepEqual(lines.slice(0, 1), ["[Service]"]);
assert.equal(lines.length, 3, "The drop-in must contain only the service section and two exact binds");

const binds = lines.slice(1).map(parseBind);
assert.deepEqual(binds.map((entry) => entry.source), [SOURCE, SOURCE]);
assert.deepEqual(binds.map((entry) => entry.target), TARGETS);
assert.equal(new Set(binds.map((entry) => entry.target)).size, TARGETS.length);
assert.doesNotMatch(source, /BindPaths=|ReadWritePaths=|\.json\.(?:gz|br)/u);
assert.doesNotMatch(source, /\/srv\/mes\/pilot\/runtime\//u);
const systemdCanApplyRequiredBinds = ({ sourceExists }) => sourceExists
  && binds.every((entry) => entry.source === SOURCE && !entry.source.startsWith("-"));
assert.equal(systemdCanApplyRequiredBinds({ sourceExists: false }), false,
  "an absent sealed mirror must fail service startup instead of falling back to mutable runtime bytes");
assert.equal(systemdCanApplyRequiredBinds({ sourceExists: true }), true);

// The direct source is deliberately unreadable and irreplaceable by every
// unprivileged identity. systemd (root) resolves it and creates read-only bind
// targets before starting the service as mes-pilot. A root-only atomic refresh
// may replace the mirror through its parent directory.
const ROOT_UID = 0;
const ROOT_GID = 0;
const DEPLOY_UID = 1001;
const DEPLOY_GID = 1001;
const MES_STAGE_UID = 1002;
const MES_STAGE_GID = 1002;
const MES_PILOT_UID = 1003;
const MES_PILOT_GID = 1003;
const sealedDirectory = Object.freeze({ uid: ROOT_UID, gid: ROOT_GID, mode: 0o700, symlink: false });
const sealedFile = Object.freeze({ uid: ROOT_UID, gid: ROOT_GID, mode: 0o444, nlink: 1, symlink: false });
const root = Object.freeze({ uid: ROOT_UID, groups: [ROOT_GID] });
const deploy = Object.freeze({ uid: DEPLOY_UID, groups: [DEPLOY_GID] });
const mesStage = Object.freeze({ uid: MES_STAGE_UID, groups: [MES_STAGE_GID] });
const mesPilot = Object.freeze({ uid: MES_PILOT_UID, groups: [MES_PILOT_GID] });

assert.equal(SOURCE.startsWith(`${SOURCE_DIRECTORY}/`), true);
assert.equal(canReadSealedSnapshot({ identity: root, directory: sealedDirectory, file: sealedFile }), true);
assert.equal(canWriteSealedSnapshot({ identity: root, directory: sealedDirectory, file: sealedFile }), true);
assert.equal(canUnlinkSealedSnapshot({ identity: root, directory: sealedDirectory }), true);
assert.equal(canAtomicallyReplaceSealedSnapshot({ identity: root, directory: sealedDirectory }), true);
for (const [name, identity] of Object.entries({ deploy, mesStage, mesPilot })) {
  assert.equal(
    canReadSealedSnapshot({ identity, directory: sealedDirectory, file: sealedFile }),
    false,
    `${name} must not read the direct sealed mirror`,
  );
  assert.equal(
    canWriteSealedSnapshot({ identity, directory: sealedDirectory, file: sealedFile }),
    false,
    `${name} must not write the direct sealed mirror`,
  );
  assert.equal(
    canUnlinkSealedSnapshot({ identity, directory: sealedDirectory }),
    false,
    `${name} must not unlink the sealed mirror`,
  );
  assert.equal(
    canAtomicallyReplaceSealedSnapshot({ identity, directory: sealedDirectory }),
    false,
    `${name} must not atomically replace the sealed mirror`,
  );
}
assert.equal(canReadBoundSnapshot({ identity: mesPilot, file: sealedFile }), true);
assert.equal(sealedDirectory.symlink, false, "The sealed parent must be a real directory");
assert.equal(sealedFile.symlink, false, "The sealed mirror must be a regular file, not a symlink");
assert.equal(sealedFile.nlink, 1, "The sealed mirror must have exactly one hard link");
assert.equal(sealedDirectory.mode & 0o022, 0, "The sealed parent must not be group/world writable");
assert.equal(sealedFile.mode & 0o222, 0, "The sealed mirror bytes must not be writable");

console.log("Pilot bootstrap snapshot bind contract QA: OK");
