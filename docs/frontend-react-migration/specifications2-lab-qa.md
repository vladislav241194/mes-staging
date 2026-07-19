# Specifications 2.0 React lab QA

Date: 2026-07-19
Status: production-integrated read proof plus local-only existing draft-row edit; disabled by default

## Vertical scenario

`Open Specifications 2.0 -> inspect the selected published PostgreSQL revision
-> edit one existing row in its pre-publication draft through the legacy owner
-> keep the published revision immutable -> return structural editing, routes,
attachments, work orders and publication to legacy.`

The legacy module exposes one compact `getSpecifications2ReactModel()` boundary.
It contains registry summaries, allowlisted selected draft-row fields and the
selected published revision only after
source entry, revision number and fingerprint match the PostgreSQL read model.
React receives no storage handle, publication callback, attachment command,
work-order command or API client. Its typed `save-draft-row` callback is admitted
only by the localhost QA write gate and delegates to the existing editor owner.

## Evidence

`npm run qa:specifications2-react-lab` passes:

- 109 typed sources and the frozen-backend guard;
- two registry entries, PostgreSQL revision 7, four hierarchy rows and four
  revision metrics;
- local tree collapse and payload revision `7 -> 8`;
- upload, registry switch, editor, routes, norms and attachments return to
  legacy; disabled flag restores legacy;
- no viewport overflow and a clean browser console;
- independent entry `213,439 B` raw / `65,398 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full aggregate lab `509,333 B / 117,430 B` under its development-only
  `512,000 B / 124,000 B` budget;
- shared lab CSS `20,207 B / 4,010 B` under its development-only
  `20,500 B / 4,200 B` budget.

## Production integration

The host requires two false-by-default runtime permissions, an explicit
read-only session request, a loaded legacy module and exact PostgreSQL parity
for the selected published revision. Missing, loading, errored, unpublished or
mismatched projections keep the legacy UI.

Production-shell QA proves default legacy, the same PostgreSQL revision and four
tree rows, scoped CSS, one existing-row save through the current owner, exactly
one compatibility persistence, unchanged revision 7 metadata and published
tree, zero publication/attachment/work-order API writes, unchanged disposable
`0600` server state and a clean console. The isolated bundle is `213,439 B` raw
/ `65,398 B` gzip. Pilot remains unchanged; the write gate is localhost-only.
