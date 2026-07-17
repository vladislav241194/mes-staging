# Pilot runtime baseline — v1.499.28

## Purpose

This commit captures the application source that was actually running on the
pilot after the cold-start Weekly Control / Gantt recovery. It is a recovery
baseline, not a normal feature branch and not a database-data export.

## Provenance

- Captured from: `/srv/mes/pilot/app`
- Captured application version: `v.1.499.28`
- Base Git commit on the pilot before capture:
  `2c05f36ec50bd841379efce3b084150af72669c3`
- Captured `src/app.js` SHA-256:
  `4e547e541cc27c6cdc56f326723c5a57b08aceea9764df5fdbb931000c9b8b53`
- Tracked-change patch SHA-256:
  `f8cc02b80d7a734236f2a3fbaa835113116e5393544d6188ec23a1fc7a0da9a9`
- Untracked runtime archive SHA-256:
  `99f2b3697aab5873e4fd850e2c6538f6b2b6172e31abf27399cbc0597b0cf661`

The patch and archive were checked before capture:

- the patch applies cleanly to the base commit;
- file names and source text were scanned for private keys and literal
  connection credentials;
- runtime data, generated bundles, local backups, and ignored `.env` files
  were deliberately excluded.

The source snapshot contains pre-existing whitespace warnings in legacy
template files. They are intentionally preserved here: automatic formatting
would make this recovery baseline less exact. Syntax and lazy-runtime checks
were run separately.

## Scope deliberately excluded

`bootstrap-snapshot.json`, operational data, generated `dist/`, compressed
assets, backup folders, and deployment reports are not source-of-truth code.
They stay in controlled server storage and must be handled through backup and
data-migration procedures, not through Git commits.

## Recovery guarantee

This branch makes the source of the live v1.499.28 application reviewable and
rebuildable. It does not authorize a checkout or cleanup of the live pilot
worktree. The next release mechanism must build a staged artifact from a
specific Git commit, validate it, record a manifest, and only then promote it
atomically with a rollback pointer.
