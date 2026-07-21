# Reproducible release process

## Rule

A pilot release is built from a clean Git commit that is present on the
freshly fetched upstream branch, never from a dirty or local-only working
directory and never by editing the active application folder in place.

Operational data remains outside a release:

- shared state and its backups;
- PostgreSQL data and migrations' operational records;
- audit logs;
- `/etc/mes` environment files and credentials.

The recovery `bootstrap-snapshot.json` is also operational compatibility data.
It is preserved once per contour at `runtime/bootstrap-snapshot.json`, checked
as JSON, hashed in the release manifest, and copied into the staged app and
its `dist/` folder. It is never committed to Git and staging never overwrites
the preserved operational copy.

## Stage a release

Use a fresh Git worktree at the exact commit that is to be released. From that
clean worktree run:

```bash
npm run release:stage:pilot -- --release-id=<version-and-commit>
```

The command deliberately refuses a dirty Git worktree, ignored files inside
the allowlisted source paths, a detached branch, or a local commit that has
not reached its configured upstream. It performs:

1. fetches the configured upstream branch and confirms that the release HEAD
   is contained in it; a dry run uses only the locally cached upstream ref and
   does not require Git-network access;
2. `npm ci` and two production builds locally; their complete `dist/` digests
   must match before the release can continue;
3. repeats the clean-worktree, ignored-input and HEAD checks after the build,
   then calculates SHA-256 digests of the allowlisted runtime source and
   `dist/` artifact;
4. uploads into a new, inactive `/srv/mes/pilot/releases/<id>/app` directory;
5. production-only dependency installation and server preflight in that new
   directory;
6. a remote digest comparison against the local artifact;
7. a release manifest containing commit, upstream provenance, app version,
   lockfile and artifact digests.

Staging does not switch `/srv/mes/pilot/app`, does not restart the service,
and does not modify production data.

### First root-trust bootstrap: ordered legacy, previous and active re-inode

On the first run after installing the fixed root-trust helpers, the sealed
`/srv/mes/pilot/bootstrap-recovery/bootstrap-snapshot.json` mirror does not yet
exist. `release:stage:pilot` deliberately stops with exit code `78` before it
creates a candidate release. The root bootstrap does **not** publish
`06-bootstrap-snapshot-bind.conf` in this state, so the already running Pilot
remains restartable. It also never copies the mutable operational runtime file
into the sealed mirror.

The active re-inode deliberately requires existing `root-reinode-copy`
attestations for both rollback targets. Therefore do not invoke it immediately
after exit `78`. Use clean, published worktrees for the exact releases to obtain
every reviewed manifest/root-attestation anchor. Do not derive these values
from mutable live runtime bytes. Through the authenticated root SSH alias,
perform the following order exactly.

1. Re-inode the pinned legacy release while it is inactive:

```bash
/usr/bin/node /usr/local/libexec/mes/active-bundle/release-root-reinode-active.mjs \
  --mode=inactive \
  --release-id=<pinned-legacy-release-id> \
  --expected-git-commit=<legacy-published-commit> \
  --expected-source-sha256=<legacy-source-sha256> \
  --expected-dist-sha256=<legacy-dist-sha256> \
  --expected-package-lock-sha256=<legacy-package-lock-sha256> \
  --expected-runtime-policy-sha256=<legacy-runtime-policy-sha256> \
  --expected-bootstrap-sha256=<legacy-bootstrap-sha256> \
  --expected-bootstrap-gzip-sha256=<legacy-bootstrap-gzip-sha256> \
  --expected-bootstrap-brotli-sha256=<legacy-bootstrap-brotli-sha256> \
  --confirm=REINODE_INACTIVE_PILOT_RELEASE
```

2. If the immediate previous release ID differs from the pinned legacy release
   ID, re-inode that inactive release separately. If both IDs are identical,
   skip this second command; the first command already produced its attestation.

```bash
/usr/bin/node /usr/local/libexec/mes/active-bundle/release-root-reinode-active.mjs \
  --mode=inactive \
  --release-id=<immediate-previous-release-id> \
  --expected-git-commit=<previous-published-commit> \
  --expected-source-sha256=<previous-source-sha256> \
  --expected-dist-sha256=<previous-dist-sha256> \
  --expected-package-lock-sha256=<previous-package-lock-sha256> \
  --expected-runtime-policy-sha256=<previous-runtime-policy-sha256> \
  --expected-bootstrap-sha256=<previous-bootstrap-sha256> \
  --expected-bootstrap-gzip-sha256=<previous-bootstrap-gzip-sha256> \
  --expected-bootstrap-brotli-sha256=<previous-bootstrap-brotli-sha256> \
  --confirm=REINODE_INACTIVE_PILOT_RELEASE
```

3. Only after both rollback targets carry verified re-inode attestations,
   re-inode the currently active release:

```bash
/usr/bin/node /usr/local/libexec/mes/active-bundle/release-root-reinode-active.mjs \
  --mode=active \
  --release-id=<active-release-id> \
  --expected-git-commit=<published-active-commit> \
  --expected-source-sha256=<active-source-sha256> \
  --expected-dist-sha256=<active-dist-sha256> \
  --expected-package-lock-sha256=<active-package-lock-sha256> \
  --expected-runtime-policy-sha256=<active-runtime-policy-sha256> \
  --expected-bootstrap-sha256=<active-bootstrap-sha256> \
  --expected-bootstrap-gzip-sha256=<active-bootstrap-gzip-sha256> \
  --expected-bootstrap-brotli-sha256=<active-bootstrap-brotli-sha256> \
  --expected-previous-release-id=<immediate-previous-release-id> \
  --expected-legacy-release-id=<pinned-legacy-release-id> \
  --confirm=REINODE_ACTIVE_PILOT_RELEASE
```

Before writing the mirror, a journal, or either application pointer, the fixed
helper verifies that the active, immediate previous and pinned legacy root
attestations carry the same `bootstrapSha256`. A mismatch is a hard stop with
the mirror and pointers unchanged. When they match, the helper seeds the mirror
from the manifest-bound active release, publishes the exact read-only bind,
re-inodes the active release, and completes its normal health/rollback checks.

4. Verify the mirror, the on-disk bind, the effective systemd bind and the
   served bytes before repeating stage:

```bash
expected_bootstrap_sha256=<active-bootstrap-sha256>
mirror=/srv/mes/pilot/bootstrap-recovery/bootstrap-snapshot.json
bind=/etc/systemd/system/mes-pilot.service.d/06-bootstrap-snapshot-bind.conf
app_binding=/srv/mes/pilot/bootstrap-recovery/bootstrap-snapshot.json:/srv/mes/pilot/app/bootstrap-snapshot.json
dist_binding=/srv/mes/pilot/bootstrap-recovery/bootstrap-snapshot.json:/srv/mes/pilot/app/dist/bootstrap-snapshot.json

test "$(stat -Lc '%u:%g:%a:%h' -- "$mirror")" = 0:0:444:1
test "$(sha256sum "$mirror" | awk '{print $1}')" = "$expected_bootstrap_sha256"
test "$(stat -Lc '%u:%g:%a:%h' -- "$bind")" = 0:0:644:1
grep -Fxq "BindReadOnlyPaths=$app_binding" "$bind"
grep -Fxq "BindReadOnlyPaths=$dist_binding" "$bind"
systemctl show mes-pilot.service --property=BindReadOnlyPaths --value | tr ' ' '\n' | grep -Fxq "$app_binding"
systemctl show mes-pilot.service --property=BindReadOnlyPaths --value | tr ' ' '\n' | grep -Fxq "$dist_binding"
test "$(systemctl show mes-pilot.service --property=NeedDaemonReload --value)" = no
systemctl is-active --quiet mes-pilot.service
test "$(curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
  -H 'Host: mes-internal' http://127.0.0.1:4175/bootstrap-snapshot.json | sha256sum | awk '{print $1}')" \
  = "$expected_bootstrap_sha256"
```

5. Rerun `release:stage:pilot`. This bootstrap observes the sealed mirror and
   keeps the mandatory bind published.

## Activation and rollback

Activate only a staged release that has passed manifest verification:

```bash
npm run release:activate:pilot -- --release-id=<version-and-commit>
```

The activation command performs these gates in order:

1. validates the manifest, code tree, built tree and compatibility artifacts
   on the server immediately before changing the active target;
2. preserves the current app as a named legacy release on the first cutover,
   or records the previous release pointer on later cutovers;
3. switches `/srv/mes/pilot/app` to the immutable staged artifact and restarts
   the service;
4. requires local and public `GET /healthz` to return a ready shared-state
   status; and
5. records the active release only after both health checks pass.

If restart or either health check fails, it restores the previous directory or
release pointer, restarts the service again, and retains both failed and
previous artifacts for diagnosis. Use `--dry-run` to validate a candidate
without changing the active target.

When the remote activation script reaches a failure, the command also prints a bounded
`ACTIVATION_DIAGNOSTICS` block to its error output. It identifies the failed
phase, candidate release, active runtime target, service state, a short
`systemctl status`, and up to 30 recent service-journal lines when they are
readable. Common credential-bearing lines and URL credentials are omitted. The
diagnostics are read-only: they do not alter the activation, rollback, or
release-artifact semantics.

## Reflect an activated pilot release in GitHub `main`

After activation, make the exact active release visible on the default GitHub
branch from the same clean isolated worktree:

```bash
npm run release:promote-main -- --contour=pilot --release-id=<version-and-commit>
```

This is deliberately a separate finalization step rather than an implicit side
effect of activation. It reads the server's `active-release.json` and release
manifest, requires the exact release pointer, recorded local/public health and
freshly fetched Git provenance, then fetches `origin/main`. It only permits a
fast-forward push of the manifest commit to `main`; it never checks out,
resets, merges, rebases, or force-pushes a branch. A protected or diverged
`main` is reported as a Git finalization failure while the already healthy
pilot remains active. Use `--dry-run` to inspect the pending promotion.

`deploy-contour` is now intentionally refused once an app path is a release
pointer: direct `rsync` would mutate an immutable artifact and invalidate
rollback. Emergency recovery must activate a known staged release or first
explicitly restore a legacy runtime under a reviewed incident procedure.
