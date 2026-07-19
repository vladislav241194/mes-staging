# Structure Migration Diagnostics React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

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
false by default and has not been released or activated on Pilot.
