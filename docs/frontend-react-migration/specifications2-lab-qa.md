# Specifications 2.0 React lab QA

Date: 2026-07-19
Status: production-integrated read-only proof; disabled by default; all commands remain legacy

## Vertical scenario

`Open Specifications 2.0 -> inspect the selected published PostgreSQL revision
-> expand/collapse its immutable tree -> return editing or route work to legacy.`

The legacy module exposes one compact `getSpecifications2ReactModel()` boundary.
It contains registry summaries plus the selected published revision only after
source entry, revision number and fingerprint match the PostgreSQL read model.
React never receives editor rows, publication callbacks, attachment commands,
work-order commands, storage handles or API clients.

## Evidence

`npm run qa:specifications2-react-lab` passes:

- 109 typed sources and the frozen-backend guard;
- two registry entries, PostgreSQL revision 7, four hierarchy rows and four
  revision metrics;
- local tree collapse and payload revision `7 -> 8`;
- upload, registry switch, editor, routes, norms and attachments return to
  legacy; disabled flag restores legacy;
- no viewport overflow and a clean browser console;
- independent entry `208,864 B` raw / `64,433 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full twenty-two-scenario lab `438,958 B / 104,836 B` under its development-
  only `445,000 B / 118,000 B` budget;
- shared lab CSS `13,852 B / 2,880 B` under its development-only
  `14,000 B / 4,000 B` budget.

## Production integration

The host requires two false-by-default runtime permissions, an explicit
read-only session request, a loaded legacy module and exact PostgreSQL parity
for the selected published revision. Missing, loading, errored, unpublished or
mismatched projections keep the legacy UI.

Production-shell QA proves default legacy, the same PostgreSQL revision and four
tree rows, scoped CSS, a first local commit below `20 ms`, editor fallback, zero
Specifications API writes, unchanged `0600` state and a clean console. The
production bundle is `204,557 B` raw / `64,193 B` gzip / `60,833 B` Brotli.
Pilot remains unchanged.
