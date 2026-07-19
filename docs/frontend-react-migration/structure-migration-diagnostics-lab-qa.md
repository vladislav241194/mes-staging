# Structure Migration Diagnostics React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Status: authenticated Pilot read-only acceptance complete on `v.1.499.98-6539459`; disabled by default

## Scope

Read-only vertical scenario: `open Structure and Employees -> Migration Diagnostics -> inspect report and legacy matrix`.

The adapter receives the already loaded migration report, System Domains and
embedded legacy matrix from the production host. React does not import, mutate
or become an authority for any of those sources.

## Evidence

- all `152` source rows and `51` source fields cross the typed boundary;
- five visible legacy cells and row order match React literally;
- six runtime metrics match legacy on the identical server payload;
- all four issue groups, seven registry links and Employees fallback render;
- the temporary `0600` state file remains byte-identical and console is clean;
- all six migrated Structure registries pass regression after seven-host routing;
- latest local first commit was `18.0 ms`.

The independent entry is `208,882 B` raw / `64,226 B` gzip. The production
artifact is `203,082 B` raw / `63,875 B` gzip / `55,020 B` Brotli. It remains
false by default.

## Pilot acceptance

Authenticated read-only acceptance completed on immutable release
`v.1.499.98-6539459`. React and legacy matched literally on all 152 rows, the
five headers, first and last row values, and metrics `152 / 0 / 0 / 0 / 0 / 0`.
The React island reached revision 1 in `56.9 ms`, had no document overflow and
exposed no create, save, delete or archive action. Selecting Employees returned
to the exact 76-row legacy registry.

The zero converted-entity metrics are the current legacy migration-report
payload, while the canonical registry links independently show 19 org units,
19 work centers, 49 positions, 76 employees and 6 equipment rows. React
preserves this inherited diagnostic meaning and its `требует проверки` status;
it does not reinterpret or repair the report during frontend migration.

The root-only rollout used the isolated
`87-react-structure-migration-diagnostics-evaluation.conf` drop-in. Before and
after evaluation PostgreSQL remained at System Domains revision 2 with counts
`19 / 19 / 49 / 76 / 6 / 0`. The drop-in is removed, health is `ok`, and the
exact legacy Diagnostics view again renders all 152 rows. No Pilot data was
written.
