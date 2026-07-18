function assert(value, message) {
  if (!value) throw new Error(message);
}

function isGitObjectId(value) {
  return /^[a-f0-9]{40,64}$/i.test(String(value || ""));
}

function commandSummary(result) {
  return String(result?.stderr || result?.stdout || "unknown Git failure")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 400);
}

async function requireGitText(runGit, args, description) {
  const result = await runGit(args);
  if (result?.code !== 0) {
    throw new Error(`${description}: ${commandSummary(result)}`);
  }
  const value = String(result?.stdout || "").trim();
  if (!value) throw new Error(`${description}: Git returned no value`);
  return value;
}

async function assertGitAncestor(runGit, ancestor, descendant, description) {
  const result = await runGit(["merge-base", "--is-ancestor", ancestor, descendant]);
  if (result?.code !== 0) {
    throw new Error(description);
  }
}

function assertSafeRemoteBranchRef(value) {
  const normalized = String(value || "").trim();
  assert(
    /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(normalized),
    `Release branch has an unsupported upstream ref: ${normalized || "(empty)"}`,
  );
  return normalized;
}

/**
 * Reject ignored files inside the paths copied into a release artifact.
 *
 * `git status --porcelain` does not report ignored files. Because staging uses
 * rsync over source directories, an ignored local file could otherwise enter a
 * production artifact despite a clean worktree.
 */
export async function assertNoIgnoredReleaseInputs({ runGit, sourceIncludes }) {
  assert(typeof runGit === "function", "runGit is required");
  assert(Array.isArray(sourceIncludes) && sourceIncludes.length, "sourceIncludes are required");
  const result = await runGit([
    "ls-files", "--others", "--ignored", "--exclude-standard", "--", ...sourceIncludes,
  ]);
  if (result?.code !== 0) {
    throw new Error(`Unable to inspect ignored release inputs: ${commandSummary(result)}`);
  }
  const paths = String(result?.stdout || "").split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
  if (paths.length) {
    throw new Error(`Refusing release staging with ignored source inputs: ${paths.join(", ")}`);
  }
}

/**
 * Proves that HEAD is contained in the configured upstream branch.
 *
 * With refreshRemote=false this is intentionally an offline, cached-ref check
 * for local dry-runs. Real staging calls it with refreshRemote=true, fetches the
 * upstream branch immediately before the artifact is built, and rejects a
 * commit that has not been pushed.
 */
export async function collectPublishedGitProvenance({ runGit, refreshRemote = false }) {
  assert(typeof runGit === "function", "runGit is required");
  const gitCommit = await requireGitText(runGit, ["rev-parse", "HEAD"], "Unable to resolve release commit");
  assert(isGitObjectId(gitCommit), `Release commit is not a Git object id: ${gitCommit}`);

  const branch = await requireGitText(
    runGit,
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    "Refusing release staging from a detached HEAD; use a branch with an upstream",
  );
  const remote = await requireGitText(
    runGit,
    ["config", "--get", `branch.${branch}.remote`],
    `Release branch ${branch} has no configured upstream remote`,
  );
  const upstreamBranchRef = assertSafeRemoteBranchRef(await requireGitText(
    runGit,
    ["config", "--get", `branch.${branch}.merge`],
    `Release branch ${branch} has no configured upstream branch`,
  ));
  const upstreamRef = await requireGitText(
    runGit,
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    `Release branch ${branch} has no resolvable local upstream ref`,
  );
  const cachedUpstreamCommit = await requireGitText(
    runGit,
    ["rev-parse", upstreamRef],
    `Release branch ${branch} has no cached upstream commit`,
  );
  assert(isGitObjectId(cachedUpstreamCommit), `Cached upstream is not a Git object id: ${cachedUpstreamCommit}`);
  await assertGitAncestor(
    runGit,
    gitCommit,
    cachedUpstreamCommit,
    `Refusing release staging: HEAD ${gitCommit} is not contained in cached upstream ${upstreamRef}`,
  );

  let upstreamCommit = cachedUpstreamCommit;
  let verification = "cached-upstream";
  if (refreshRemote) {
    const fetchResult = await runGit(["fetch", "--quiet", "--no-tags", remote, upstreamBranchRef]);
    if (fetchResult?.code !== 0) {
      throw new Error(`Unable to refresh upstream ${remote}/${upstreamBranchRef}: ${commandSummary(fetchResult)}`);
    }
    upstreamCommit = await requireGitText(
      runGit,
      ["rev-parse", "FETCH_HEAD"],
      `Unable to resolve freshly fetched upstream ${remote}/${upstreamBranchRef}`,
    );
    assert(isGitObjectId(upstreamCommit), `Fetched upstream is not a Git object id: ${upstreamCommit}`);
    await assertGitAncestor(
      runGit,
      gitCommit,
      upstreamCommit,
      `Refusing release staging: HEAD ${gitCommit} is not published on ${remote}/${upstreamBranchRef}`,
    );
    verification = "fresh-upstream-fetch";
  }

  return {
    gitCommit,
    branch,
    remote,
    upstreamRef,
    upstreamBranchRef,
    upstreamCommit,
    verification,
  };
}
