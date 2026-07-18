import { promoteActiveReleaseToMain } from "./release-promote-main.mjs";

const commit = "a".repeat(40);
const mainCommit = "b".repeat(40);

function assert(value, message) {
  if (!value) throw new Error(message);
}

function gitResult(stdout = "", code = 0, stderr = "") {
  return { stdout, code, stderr };
}

function released({ activeReleaseId = "v.1.2.3-abcdef0", activeCommit = commit, manifestCommit = commit, activeAppPath = "/srv/mes/pilot/releases/v.1.2.3-abcdef0/app" } = {}) {
  return {
    active: {
      releaseId: activeReleaseId,
      manifest: { gitCommit: activeCommit },
      health: { local: "ok", public: "ok" },
    },
    manifest: {
      schemaVersion: 2,
      releaseId: "v.1.2.3-abcdef0",
      gitCommit: manifestCommit,
      gitProvenance: {
        schemaVersion: 1,
        gitCommit: manifestCommit,
        remote: "origin",
        verification: "fresh-upstream-fetch",
      },
    },
    activeAppPath,
  };
}

function createGitRunner({
  worktree = "",
  fetchedMain = mainCommit,
  mainAncestor = true,
  fetchCode = 0,
  pushCode = 0,
} = {}) {
  const calls = [];
  const runGit = async (args) => {
    calls.push(args);
    const key = args.join(" ");
    if (key === "status --porcelain") return gitResult(worktree ? `${worktree}\n` : "");
    if (key === `rev-parse --verify ${commit}^{commit}`) return gitResult(`${commit}\n`);
    if (key === "remote get-url origin") return gitResult("git@github.com:example/mes.git\n");
    if (key === "fetch --quiet --no-tags origin refs/heads/main") return gitResult("", fetchCode, fetchCode ? "network unavailable" : "");
    if (key === "rev-parse FETCH_HEAD") return gitResult(`${fetchedMain}\n`);
    if (key === `merge-base --is-ancestor ${fetchedMain} ${commit}`) return gitResult("", mainAncestor ? 0 : 1);
    if (key === `push --porcelain origin ${commit}:refs/heads/main`) return gitResult("", pushCode, pushCode ? "protected branch hook declined" : "");
    return gitResult("", 1, `Unexpected Git command: ${key}`);
  };
  return { calls, runGit };
}

async function expectFailure(action, expectedMessage) {
  try {
    await action();
  } catch (error) {
    assert(error.message.includes(expectedMessage), `Expected ${expectedMessage}, got ${error.message}`);
    return;
  }
  throw new Error(`Expected failure containing ${expectedMessage}`);
}

const baseInput = {
  releaseId: "v.1.2.3-abcdef0",
  contour: { appPath: "/srv/mes/pilot/app", releasesPath: "/srv/mes/pilot/releases" },
  readActiveRelease: async () => released(),
};

const fastForward = createGitRunner();
const promoted = await promoteActiveReleaseToMain({ ...baseInput, runGit: fastForward.runGit });
assert(promoted.state === "promoted" && promoted.pushed, "Fast-forward release must promote main");
assert(
  fastForward.calls.some((args) => args.join(" ") === `push --porcelain origin ${commit}:refs/heads/main`),
  "Promotion must push the exact release commit to main",
);
assert(
  !fastForward.calls.some((args) => args.some((value) => ["checkout", "reset", "merge", "rebase", "--force"].includes(value))),
  "Promotion must not mutate local branches or force-push",
);

const already = createGitRunner({ fetchedMain: commit });
const alreadyPromoted = await promoteActiveReleaseToMain({ ...baseInput, runGit: already.runGit });
assert(alreadyPromoted.state === "already-promoted" && !alreadyPromoted.pushed, "Matching main must be idempotent");
assert(!already.calls.some((args) => args[0] === "push"), "Matching main must not push");

const dryRun = createGitRunner();
const dryPromotion = await promoteActiveReleaseToMain({ ...baseInput, dryRun: true, runGit: dryRun.runGit });
assert(dryPromotion.state === "would-promote" && !dryPromotion.pushed, "Dry run must not push");
assert(!dryRun.calls.some((args) => args[0] === "push"), "Dry run must not invoke git push");

const dirty = createGitRunner({ worktree: " M src/app.js" });
await expectFailure(
  () => promoteActiveReleaseToMain({ ...baseInput, runGit: dirty.runGit }),
  "dirty worktree",
);
assert(dirty.calls.length === 1 && dirty.calls[0].join(" ") === "status --porcelain", "Dirty worktree must stop before remote or Git mutation");

const mismatchedActive = createGitRunner();
await expectFailure(
  () => promoteActiveReleaseToMain({
    ...baseInput,
    readActiveRelease: async () => released({ activeCommit: mainCommit }),
    runGit: mismatchedActive.runGit,
  }),
  "Git commits differ",
);
assert(!mismatchedActive.calls.some((args) => args[0] === "push"), "Mismatched active record must not push");

const wrongPointer = createGitRunner();
await expectFailure(
  () => promoteActiveReleaseToMain({
    ...baseInput,
    readActiveRelease: async () => released({ activeAppPath: "/srv/mes/pilot/releases/other/app" }),
    runGit: wrongPointer.runGit,
  }),
  "Active application pointer",
);

const divergentMain = createGitRunner({ mainAncestor: false });
await expectFailure(
  () => promoteActiveReleaseToMain({ ...baseInput, runGit: divergentMain.runGit }),
  "not an ancestor",
);
assert(!divergentMain.calls.some((args) => args[0] === "push"), "Divergent main must not push");

const failedFetch = createGitRunner({ fetchCode: 128 });
await expectFailure(
  () => promoteActiveReleaseToMain({ ...baseInput, runGit: failedFetch.runGit }),
  "Unable to refresh",
);

const rejectedPush = createGitRunner({ pushCode: 1 });
await expectFailure(
  () => promoteActiveReleaseToMain({ ...baseInput, runGit: rejectedPush.runGit }),
  "remains active, but Git main promotion was rejected",
);

console.log("Release main promotion QA: OK");
