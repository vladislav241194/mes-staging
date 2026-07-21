# Planning Workbench React migration QA

Date: 2026-07-21
Status: authenticated Pilot read-only acceptance complete; start-date-only write rollout is prepared and default-off, but has not been executed on Pilot

## Vertical scenario

`Open Work Orders -> select an order -> change only the pre-placement start date -> survive a revision conflict or lost response -> prove the exact compatibility receipt -> read the same date through legacy.`

The legacy Planning Workbench now exposes `getPlanningWorkbenchModel()` as a
completed presentation read-model. It owns PostgreSQL list/detail projection,
snapshot fallback, selection, readiness, labor and structure calculations.
React accepts only that result and delegates the one admitted write to the
authenticated PostgreSQL start-date command owner. It does not reproduce Gantt
calculations. Quantity, slot placement and every other Planning command are not
part of this write evaluation.

## Evidence

- three work orders retain queue order, status and active selection;
- five readiness metrics preserve composition, transfer, revision, Gantt and
  shift state;
- four visible object/operation rows retain five columns and hierarchy level;
- payload revision `1 -> 2` changes Gantt readiness without remounting;
- route and tree-item selection stay inside React and update only host-owned UI
  selection; navigation itself does not mutate domain data;
- only the pre-placement start-date anchor is a React write scope; quantity is
  visibly read-only and no quantity or slot PATCH is emitted;
- invalid input is rejected before PATCH, a forced `409` does not mutate data,
  and retry advances exactly one PostgreSQL revision;
- React remains mounted, legacy reads the same start-date anchor, and the
  existing Gantt slot coordinates stay unchanged;
- migration `032_planning_work_order_start_date` adds the canonical PostgreSQL
  `DATE` and actor-scoped idempotency key. Production preflight admits the owner
  only when exact `DATE`/`TEXT` types and a ready, valid, unique partial index
  definition are proved through `pg_catalog`;
- independent disposable-clone QA copied the live `mes_pilot` database, applied
  migrations `028..032` in one `psql --single-transaction`, and repeated
  `031/032` idempotently. Exact `2028-02-29` metadata became `DATE`, impossible
  `2026-02-31` became `NULL`, and the unique index was valid/ready with the
  exact predicate. Migration `032` SHA-256 was
  `264433cdef356b15ba3760264addb4e5cea59c6bbabe5b8a8f7c209405e26ea9`;
  the disposable database was removed. This proves migration safety against a
  Pilot clone, not a Pilot write rollout;
- an impossible calendar date is rejected before PATCH; start-date conflict
  retry retains the exact original revision and idempotency key, and a simulated
  lost response replays the same command after an unrelated owner revision
  without a second start-date mutation. React and legacy reload the canonical
  anchor, while the existing Gantt slot start/end stay unchanged;
- if another actor replaces committed date A with canonical B before the lost
  response is reconciled, replaying A returns
  `superseded-idempotent-replay`, never overwrites B,
  clears the retained key and shows B. Choosing A again is a new explicit
  command with a new idempotency key;
- disabled activation restores the lab legacy fallback;
- page overflow and browser console remain clean;
- independent minified entry: `206,952 B` raw / `64,065 B` gzip, under the
  unchanged `225,000 B / 68,000 B` production-island ceiling.

Command:

```sh
npm run qa:planning-workbench-react-lab
```

The production host requires false-by-default React and start-date permissions,
a completed PostgreSQL list/detail bootstrap, an explicit session request, a
signed employee session whose exact actor is still authorized for Planning,
and the server capability projection.
The canonical start-date owner remains disabled unless the server is started
with `MES_ENABLE_PLANNING_START_DATE_COMMANDS=1`; deploying migration `032`
alone does not enable browser writes.
Production-shell QA proves parity for two work orders, five readiness metrics
and two visible hierarchy rows. Route and row selection stay mounted in React.
The localhost-only write gate changes only the start-date anchor through PATCH,
proves conflict and lost-response replay, reloads the authoritative value and
reads it through legacy without issuing quantity/slot PATCH. Start-date changes
do not move an existing Gantt slot. The console is clean. This local evidence is
not a live Pilot write acceptance.

Production command:

```sh
npm run qa:planning-workbench-react-island
```

Pilot read-only acceptance is complete. Pilot start-date write acceptance is a
separate, still-unexecuted gate; local QA is not counted as live acceptance.
Quantity, labor settings, send-to-Gantt, cancellation and all other commands
remain outside the React write scope.

## Bounded Pilot start-date evaluation

This is not a quantity/Gantt rollout. For the maximum 15-minute window:

- reads, route selection and navigation remain available;
- the React start-date command is the sole admitted Planning domain write;
- every browser legacy domain-value edit is temporarily paused system-wide,
  including old tabs; reads and navigation remain, while domain-backed
  `sharedUi` writes are also blocked; only the compatibility-safe
  `ganttDependencyRoutes` preference remains writable;
- trusted direct API compatibility mirrors remain available;
- the full Planning quantity/slot command owner remains OFF;
- disabling the flag and refreshing an already-open tab restores the legacy
  editing path exactly.

The public runtime proof must show
`MES_LEGACY_DOMAIN_WRITES_QUIESCED: false -> true -> false` across baseline,
active evaluation and deactivation. The transitional
`MES_PLANNING_LEGACY_WRITES_QUIESCED` alias must mirror the same sequence for
already-staged bundles. This is the explicit contract behind the system-wide
legacy-domain pause banner and old-tab rejection.

The explicit employee URL is:

```text
https://pilot.mes-line.ru/?module=planning&react-planning-workbench-write-evaluation=1
```

The user must use the visible employee/PIN confirmation in Planning. A query
parameter alone grants nothing. The signed server actor must equal the selected
employee and still hold the exact Planning edit capability.

Root activation and manual deactivation commands are:

```sh
/srv/mes/pilot/app/ops/frontend/activate-react-planning-workbench-write-evaluation.sh
/srv/mes/pilot/app/ops/frontend/deactivate-react-planning-workbench-write-evaluation.sh
```

Activation requires migration `032`, PostgreSQL storage, an exact v7 observed
generation parity marker, at least one currently authorized credentialed
employee, and no pending or conflict `work_order` compatibility row. It first
arms an infinitely retrying 15-minute auto-rollback service and only then puts
the evaluation drop-in under `/run/systemd/system`; a reboot therefore removes
the permission. Lock contention at timer fire is retried every five seconds.
Release activation and rollback inspect both `/etc` and `/run` and are blocked
while an evaluation drop-in or its release-anchored cleanup unit is loaded.

Deactivation removes both the current `/run` drop-in and a recognized exact
legacy `/etc` counterpart, restarts Pilot with the owner OFF, proves all three
Planning PATCH routes return owner-disabled, drains the compatibility outbox,
and reproves v7 parity. Before declaring live acceptance complete, an operator
must also open the previous immutable release UI and visually confirm the same
date. Blueprint UI is not used; immutable legacy rollback remains available.

## Historical Planning Workbench Pilot read-only checkpoint

The following is retained as historical evidence from 2026-07-19; it is not a
claim about the currently active Pilot release or the unexecuted write rollout.

Release `v.1.499.95-2c7dc1c` from upstream commit `2c7dc1c` is active on Pilot.
Its source digest is
`245e0e7f7cea2ac77e285b00b4cd4841e081279b4f3df9414b412af1d1df1460`
and its dist digest is
`f82a5f134ea55e5c83612712daaf98cfad8fc6d5eb2a64960c2ae2b8d626c321`.
The `.94` evaluation exposed one warm-cache lifecycle defect: after normal
authentication into Gantt, navigation to Planning restored the canonical
order from the PostgreSQL cache but skipped the final render because the
payload itself was unchanged. `.95` renders when either the payload or the
canonical selection changes, and production QA now reproduces the exact
module-away/module-back path.

Authenticated live acceptance then reached React `ready` through the normal
`Gantt -> Modules -> Work orders` flow. React matched two live work orders,
five readiness metrics and 88 hierarchy rows, with a `482.4 ms` first commit.
Desktop rendered two module columns, one workspace column, five KPI columns and
18 px panels without page overflow. The compact viewport rendered one module
column, two sidebar columns and two KPI columns without page overflow. Selecting
the second 1,000-unit order stayed inside React and retained all 88 rows. The
only visible domain command, `Send to planning`, remained disabled; no write
was invoked.

The root-only evaluation drop-in was removed after acceptance. A fresh
authorized session with the evaluation query retained proved zero React
targets and the exact legacy projection: two work orders, 88 rows and active
route `r2-eb5260e9`. The active immutable release remains `.95`; only its
false-by-default runtime permission was removed.
