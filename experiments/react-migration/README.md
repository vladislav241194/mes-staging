# React migration lab

Standalone React + TypeScript lab for the first MES registry migration scenarios. It does
not import or mutate the legacy runtime, server API, shared state, or PostgreSQL
contracts.

Build from the repository root:

```sh
node experiments/react-migration/build.mjs
```

Run the isolated contract and stop-list checks:

```sh
node experiments/react-migration/qa.mjs
```

Run deterministic minified raw/gzip budgets for the production Nomenclature
entry, full lab, and CSS:

```sh
node experiments/react-migration/performance-budget.mjs
```

Then serve `experiments/react-migration/dist` with any static server.

Available routes:

- `/` — Nomenclature;
- `/?scenario=component-types` — Component Types;
- `/?scenario=boards` — Boards/BOM;
- `/?scenario=structure-employees` — Structure and Employees;
- `/?scenario=structure-positions` — Structure Positions;
- `/?scenario=structure-org-units` — Structure Org Units;
- `/?scenario=structure-work-centers` — Structure Work Centers;
- `/?scenario=roles` — Roles and access grants;
- `/?scenario=operations` — Operations directory;
- `/?scenario=nomenclature-types` — Nomenclature Types directory;
- `/?scenario=statuses` — Statuses system directory;
- append `&lifecycle_qa=1` (or `?lifecycle_qa=1` for Nomenclature) to expose
  the host-owned mount/update/error/unmount test controls.
- append `react=0` to prove the disabled-by-default path: React is not mounted
  and the host renders the legacy fallback immediately.

The fixture boundary intentionally mirrors a future API adapter. Replacing the
fixture with live data is blocked until the PostgreSQL authority slice is
accepted and this branch is rebased onto that commit.
