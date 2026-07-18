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

`deploy-contour` is now intentionally refused once an app path is a release
pointer: direct `rsync` would mutate an immutable artifact and invalidate
rollback. Emergency recovery must activate a known staged release or first
explicitly restore a legacy runtime under a reviewed incident procedure.
