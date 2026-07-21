# Structure Migration Diagnostics React migration QA

Date: 2026-07-19

Permanent Pilot update: 2026-07-21
Branch: `codex/frontend-react-migration`
Status: permanent default-on accepted on `v.1.500.21-8fb92d9`; desktop Pilot verified, narrow Pilot not claimed

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
artifact at this historical checkpoint was `203,082 B` raw / `63,875 B` gzip /
`55,020 B` Brotli. The scenario remained false by default at that checkpoint.

## Historical evaluation Pilot acceptance

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

## Permanent Pilot acceptance

Release `v.1.500.21-8fb92d9` permanently enables
`structureMigrationDiagnostics` through the immutable runtime policy. It does
not depend on an evaluation environment variable, systemd drop-in, query flag
or session request. The final service environment contains no `MES_REACT_*`
evaluation value, active evaluation surfaces are empty, and local/public health
are `ok`.

Authenticated desktop acceptance on the normal Pilot route proved:

- the island root is `ready`, runtime mode is `react`, and `aria-busy=false`;
- all `152` rows, `5` visible headers and `51` source fields cross the production
  boundary;
- metrics are `152 / 76 / 19 / 49 / 0 / 0`;
- all four issue groups render, including the two ignored rows, together with
  all seven registry links;
- the page has no horizontal overflow and exposes zero inputs or write controls;
- the accessible browser log contains no warning or error;
- query parameters that try to request legacy/evaluation mode do not override
  the permanent policy;
- Employees opens the canonical 76-row legacy registry, Org Units opens the
  canonical 19-row legacy registry, an invalid registry value canonicalizes to
  Org Units, and returning to Diagnostics restores the same ready React root.

Narrow Pilot acceptance is deliberately not recorded. The controllable browser
platform did not expose a lawful viewport-resize operation for the authenticated
Pilot tab. This is a platform restriction, not evidence that the narrow layout
passed or failed.

The release drill covered the exact chain
`v.1.500.21-8fb92d9 -> v.1.500.20-a4d8b2f -> v.1.500.21-8fb92d9 ->
v.1.500.18-93d02ed -> v.1.500.19-53022a2 -> v.1.500.20-a4d8b2f ->
v.1.500.21-8fb92d9`. The immutable `.20` artifact reproduced its known
historical `aria-busy=true` state, confirming an exact previous-release rollback
rather than a rebuilt approximation. The pinned `.18` policy exposed zero React
surfaces; the Diagnostics deep link canonicalized to the 19-row legacy Org Units
registry. Reactivation restored `.21`, `aria-busy=false`, both permanent
read-only surfaces, no evaluation drop-ins and no evaluation environment
values. No Pilot data was written during acceptance or rollback.
