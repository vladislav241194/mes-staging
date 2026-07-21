# Pilot runtime identity and credential isolation

This contract removes the SSH `deploy` UID from the long-running Pilot process
and from every database migration/import process. It does not activate React,
does not change the active release pointer and does not replace the legacy
rollback release.

## Identities and files

- `mes-pilot` is a locked, `nologin` runtime account.
- `mes-pilot-migrator` is a separate locked, `nologin` schema/import account.
- `mes-pilot-data` grants only those two accounts access to the controlled
  shared-state import source and backup output directory. Both directories use
  setgid inheritance so atomically replaced snapshots keep this group.
  `deploy` must never be a member.
- `/etc/mes/mes-pilot-domain.env` is `root:root 0600` and contains exactly
  `DATABASE_URL` for `mes_app`.
- `/etc/mes/mes-pilot-domain-migrator.env` is `root:root 0600` and contains
  exactly `MES_DOMAIN_MIGRATOR_DATABASE_URL` for `mes_migrator`.
- Admin, public and employee auth configuration use separate `root:root 0600`
  env files. Password hashes and usernames are preserved during cutover;
  session-signing secrets are rotated, so existing browser sessions expire.
- Server command flags are never stored in either database env. They remain
  owned only by reviewed root systemd drop-ins.
- The root-owned base env is rebuilt from an exact safe-key allowlist. Existing
  safe Pilot values win over repository defaults; credentials, command flags,
  unknown keys and paths outside `/srv/mes/pilot/` fail closed.
- Lock, gate, journal and recovery executables are published as one immutable
  content-addressed directory below
  `/usr/local/libexec/mes/runtime-security-bundles/`. Systemd reaches them only
  through the invariant dispatcher and the single root-owned relative symlink
  `/usr/local/libexec/mes/runtime-security-active`. The installer verifies the
  exact membership, modes, link counts and SHA-256 manifest before switching
  that pointer, and restores the previous pointer if post-switch dispatch
  validation fails. A `.prepare.*` directory left by SIGKILL is inert: neither
  the dispatcher nor any unit can resolve it, and later runs publish or reuse
  only a 64-hex manifest-addressed directory.

## Controlled Pilot sequence

The staged release and active release must first be recursively root-sealed by
the atomically selected `/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs` trust anchor.
Then, as root, execute the cutover from the exact staged candidate path:

```bash
/srv/mes/pilot/releases/<release-id>/app/ops/security/install-pilot-runtime-uid-isolation.sh \
  --release-id=<release-id>
```

The installer verifies the active pointer and both complete release trees,
rejects non-canonical mutable directories, symlinks, special files and
multiply-linked files before stat/ownership/systemd work,
splits the legacy combined database env, removes any command flag embedded in
that old env, moves inline admin secrets to a protected env, rotates both
database passwords and all three session secrets, restarts the still-active
release under `mes-pilot`, checks both database roles and checks internal and
public health. A failure restores previous credentials, auth sessions, units,
directory owners and service availability.

Next run the staged command-surface OFF bridge. It removes the remaining
reviewed command drop-ins and restarts Pilot. Prove the complete OFF state and
the UID boundary together:

```bash
/srv/mes/pilot/releases/<release-id>/app/ops/postgres/deactivate-staged-candidate-command-surfaces.sh \
  --release-id=<release-id>

/srv/mes/pilot/releases/<release-id>/app/ops/security/verify-pilot-runtime-uid-isolation.sh \
  --require-command-flags-off
```

Only after both checks pass should the normal database backup, candidate
activation, migration and controlled command re-enable sequence continue. The
previous immutable release remains the code rollback target; database backups
and shared-state are not deleted or overwritten by this identity cutover.

The migration unit invokes `domain-postgres-migrate.mjs --schema-only` and has
no shared-state, backup or audit write path. Shift Execution authority
reconciliation remains a separate explicit operation through
`domain-shift-execution-authority-reconcile.mjs`; a schema migration can never
commit SQL and then fail while performing snapshot/authority side effects.

## Later credential rotation

After the candidate is active, rotate credentials from the exact active sealed
release:

```bash
/srv/mes/pilot/app/ops/security/rotate-pilot-credentials.sh --confirm-rotate-all
```

The rotation masks migration/import/sync writers during the short maintenance
window, alters both PostgreSQL roles in one transaction, atomically replaces
the two DB env files, rotates admin/public/employee session secrets, verifies
each role under its dedicated UID, restarts Pilot, verifies internal/public
health and restores the previous credentials automatically on failure. No
secret value is written to stdout or a command-line argument.

Before the PostgreSQL transaction, all five old credential/session env files
and the timer state are atomically placed in the fsynced root-only journal
`/var/lib/mes/pilot-credential-rotation`. Every irreversible step advances a
durable phase. A normal failure rolls back from that journal. After SIGKILL,
host reboot, or a later service start, the root recovery unit runs before
`mes-pilot.service` and the database writer units: every non-committed phase
restores both PostgreSQL roles and all old env files; a committed phase keeps
the verified new pair. If a live rotation starts Pilot for its own health
check, the shared identity lock tells the recovery unit not to interfere.

The outer UID-isolation installer commits its already verified identity split
and discards its pre-cutover env backup before entering credential rotation.
Therefore a late outer failure cannot restore old env files after new database
role passwords have committed; from that boundary onward the durable rotation
journal is the sole rollback authority.
