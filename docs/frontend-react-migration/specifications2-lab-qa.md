# Specifications 2.0 React lab QA

Date: 2026-07-19
Status: authenticated Pilot read acceptance complete; disabled by default

## Vertical scenario

`Open Specifications 2.0 -> inspect the selected published PostgreSQL revision
-> edit one existing row in its pre-publication draft through the legacy owner
-> keep the published revision immutable -> confirm the exact specification ID
and previous revision -> publish through the existing server-primary owner ->
force PostgreSQL read-back -> verify the same revision and tree in React and
legacy -> create an idempotent work order from that exact immutable revision.
Structural add/remove/reparent, route editing and attachments remain legacy.`

The legacy module exposes one compact `getSpecifications2ReactModel()` boundary.
It contains registry summaries, allowlisted selected draft-row fields and the
selected published revision only after source entry and revision number match
the PostgreSQL read model and the server exposes either the original legacy
fingerprint or its immutable `sha256:` migration digest.
React receives no storage handle, API client or attachment command.
Its typed `save-draft-row` and `publish-draft` callbacks are admitted only by
the localhost QA write gate. Publication uses a two-step exact-ID confirmation,
rechecks the immutable previous revision, delegates to the existing server-first
owner, handles `409` conflict/retry and forces a PostgreSQL read after `201`.
The work-order command is exposed only after the existing capability reports
PostgreSQL-primary readiness and carries exact revision, route, quantity and
idempotency coordinates through the unchanged owner.

## Evidence

`npm run qa:specifications2-react-lab` passes:

- 132 typed sources and the frozen-backend guard;
- two registry entries, PostgreSQL revision 7, four hierarchy rows and four
  revision metrics;
- local tree collapse and payload revision `7 -> 8`;
- upload, registry switch, editor, routes, norms and attachments return to
  legacy; disabled flag restores legacy;
- no viewport overflow and a clean browser console;
- independent entry `218,918 B` raw / `66,198 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full aggregate lab `562,628 B / 127,063 B` under its development-only
  `564,000 B / 128,000 B` budget;
- shared lab CSS `29,860 B / 5,345 B` under its development-only
  `30,000 B / 5,350 B` budget.

## Production integration

The host requires two false-by-default runtime permissions, an explicit
read-only session request, a loaded legacy module and exact PostgreSQL parity
for the selected published revision. Missing, loading, errored, unpublished or
mismatched projections keep the legacy UI.

Production-shell QA proves default legacy, the same PostgreSQL revision and four
tree rows, scoped CSS, one existing-row save through the current owner, exactly
one compatibility persistence, unchanged revision 7 until confirmation,
cancel-without-write, one simulated conflict and one successful retry to
revision 8, forced PostgreSQL read-back, promoted legacy tree baseline, zero
attachment writes, exactly one confirmed work-order write, unchanged disposable `0600` server state and a
clean console. The owner repair also makes publication fingerprints prefer the
actual `editorRows` instead of stale imported `treeRows`; a newer concurrent
draft remains separate. A second two-step proof covers work-order cancel and one
successful exact-revision command without changing the draft. The isolated
entry is `218,918 B` raw / `66,198 B` gzip; the built production artifact is
`212,193 B` raw / `65,914 B` gzip / `56,703 B` Brotli. The write gate is
localhost-only.

## Pilot acceptance

Authenticated read-only acceptance completed on
`v.1.499.97-1304535` (`1304535`). The live React slice rendered the selected
`АБВГ.469659.001 Калоша` PostgreSQL revision 6 with 91 positions, 18 routes,
66 operations and four metrics. The draft remained visibly marked as changed
after revision 6; React showed only the immutable published tree. Collapsing
the root changed the visible count from `91 из 91` to `1 из 91`, and expanding
restored `91 из 91` without persistence.

Live evaluation exposed and closed two compatibility defects before acceptance:

- an unchanged cached revalidation completed without repainting the eligibility
  transition from loading to ready;
- the legacy full JSON fingerprint and the migrated PostgreSQL `sha256:` digest
  represented the same authority boundary in different formats.

The accepted view had no document overflow, four desktop metric columns and no
publication or work-order command. The compact one-column/two-metric-column
contract is covered by production-shell QA. Before and after evaluation the
database contained exactly one Specifications revision, revision 6, with the
same digest. The evaluation drop-in is removed, health is `ok`, the active
release remains `.97-1304535`, and a retained-query reload restored the exact
legacy registry and 91-row tree with zero React target.
