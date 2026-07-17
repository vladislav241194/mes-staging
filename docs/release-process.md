# Reproducible release process

## Rule

A pilot release is built from a clean Git commit, never from a dirty working
directory and never by editing the active application folder in place.

Operational data remains outside a release:

- shared state and its backups;
- PostgreSQL data and migrations' operational records;
- audit logs;
- `/etc/mes` environment files and credentials.

## Stage a release

Use a fresh Git worktree at the exact commit that is to be released. From that
clean worktree run:

```bash
npm run release:stage:pilot -- --release-id=<version-and-commit>
```

The command deliberately refuses a dirty Git worktree. It performs:

1. `npm ci` and two production builds locally; their complete `dist/` digests
   must match before the release can continue;
2. a SHA-256 digest of the allowlisted runtime source and `dist/` artifact;
3. upload into a new, inactive `/srv/mes/pilot/releases/<id>/app` directory;
4. production-only dependency installation and server preflight in that new
   directory;
5. a remote digest comparison against the local artifact;
6. a release manifest containing commit, app version, lockfile and artifact
   digests.

Staging does not switch `/srv/mes/pilot/app`, does not restart the service,
and does not modify production data.

## Activation and rollback

Activation must be introduced as a separate reviewed step. It will make
`/srv/mes/pilot/app` a pointer to a verified staged release, restart the
service, run health checks, and preserve the previous target for rollback.
The initial directory-to-pointer conversion is intentionally not hidden in
the staging command because it is the only cutover that changes the active
filesystem topology.

Until activation is implemented, the legacy `deploy-contour` path is reserved
for emergency recovery only. Each emergency change needs an explicit source
backup, build, restart, and live browser verification before it is accepted.
