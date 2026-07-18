# Frontend React rebase preflight

Date: 2026-07-19
Frontend branch: `codex/frontend-react-migration`

## Compared commits

- merge base: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`;
- frontend HEAD before rebase: `7ed2545`;
- accepted `origin/main`: `fc71e01de31f573a4e1c0a5510e328630932aee9`;
- frontend HEAD after rebase: `5e3e1b7935d8c891af79c4bb735730867a4d8cd9`;
- accepted live PostgreSQL release contained in main: `c3b4059`.

## Dry-run evidence

The preflight compared every path changed from the shared merge base:

- frontend paths: 46;
- main/PostgreSQL paths: 50;
- paths changed by both sides: 0;
- merge-tree conflict markers: 0.

The earlier text match `ON CONFLICT (version) DO NOTHING` was a PostgreSQL SQL
clause, not a Git conflict. The final check only counted real
`<<<<<<<`/`=======`/`>>>>>>>` merge markers.

## Decision

Final handoff `fc71e01` closed the PostgreSQL goal and released the frontend
integration gate. The frontend branch was rebased onto that exact accepted
main commit. All 21 frontend commits were replayed without a conflict.

The old temporary stop-list assertion was replaced after rebase: host/build
files are now available for pure frontend integration, while changes after
`fc71e01` to the database schema, PostgreSQL operations, domain repositories,
server authority and Shift Execution/Specifications authority scripts fail the
React migration QA as frozen backend contract changes.

Post-rebase validation passed:

- React migration QA: 27 typed sources and the frozen backend guard;
- all four isolated bundle budgets;
- Production Structure canonical QA: 76 employees and seven registries;
- root production build at application version `v.1.499.70`;
- `git diff --check`.
