# Frontend React Pilot readiness checkpoint

Date: 2026-07-19
Candidate branch: `codex/frontend-react-migration`
Current released commit: `bdf093c`

## Read-only live evidence

The authenticated Pilot path was inspected without changing configuration or
data:

- `GET https://pilot.mes-line.ru/healthz` returned `status=ok`, version
  `v.1.499.72`, and `sharedState=ready`;
- the browser loaded `./src/app.js?v=db3bbb28f842-v.1.499.72`;
- Nomenclature rendered the legacy create action and no React mount target;
- all three Nomenclature rollout values were `false`:
  `MES_REACT_NOMENCLATURE`,
  `MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION`, and
  `MES_REACT_NOMENCLATURE_WRITE_EVALUATION`;
- the live Nomenclature payload contained zero rows;
- the browser console contained no warnings or errors.

This proves a healthy unchanged baseline. It does not prove the candidate,
because commit `311fd5d` is not deployed.

## Candidate distance

`origin/main` is still the accepted PostgreSQL handoff `fc71e01`, and the
frontend candidate is a clean descendant with no new main-side divergence.
The live frontend release source recorded for `v.1.499.72` is `6985693`.
Candidate `311fd5d` is 34 commits ahead of that release source; the aggregate
diff contains 227 paths, 11,027 insertions and 346 deletions.

This is a multi-scenario candidate, not a safe one-file Pilot toggle. A release
must therefore be built and activated through the normal commit-derived,
checksummed release procedure with all React flags off first.

## Required acceptance sequence

1. Create a new visible application version and immutable release artifact from
   the exact candidate commit. Do not reuse `v.1.499.72`.
2. Deploy with every React feature and evaluation flag false. Verify health,
   loaded asset hashes, legacy module navigation, authorization, current Shift
   Execution scope and a clean console.
3. Preserve the current `v.1.499.72` artifact as the immediate rollback target.
4. Enable only one read-only island permission, then request it in one
   authenticated session. Do not enable write evaluation in the first pass.
5. Compare legacy and React on the same server projection, viewport and user.
   Record mount time, visible row/cell parity, fallback and console evidence.
6. Disable the permission and verify legacy restoration before moving to the
   next island.
7. Evaluate Nomenclature create/edit only after a non-production disposable
   record or an explicitly approved real record is available. The current live
   Nomenclature store is empty, so a non-empty or write-parity claim cannot be
   made without creating data.

## Pre-deployment decision

At the pre-deployment checkpoint, local source, browser and stabilization gates
were green, but authenticated candidate acceptance was still missing. The next visible version was prepared as
`v.1.499.73`; all React flags remain disabled by default. The complete
`qa:stabilize` gate passes, including release provenance, rollback and
activation diagnostics, and two consecutive production builds have the same
release-tree digest
`39ea1956930450f9b0385a9aa93ecb9fc576fd4d0b02b19d9e2b1bdc72d6db8d`
when the operational bootstrap artifact paths are excluded exactly as in the
release procedure.

At that checkpoint this was only a clean local release candidate: no server
staging, activation, rollout flag, real record or Pilot data had changed.

The exact all-flags-off candidate is locked at `b1b77cf` with release ID
`v.1.499.73-b1b77cf`. Later Nomenclature delete-parity commits are the next
development checkpoint and must not be substituted into that release ID.

## Refreshed authenticated baseline

The authenticated browser baseline was rechecked on 2026-07-19 without using
or persisting supplied credentials and without changing Pilot state:

- `/healthz` still returned `status=ok`, version `v.1.499.72`, and
  `sharedState=ready`;
- the browser loaded `./src/app.js?v=db3bbb28f842-v.1.499.72`;
- Nomenclature showed the legacy `Новая позиция` action and zero React mount
  targets;
- the browser console contained no warnings or errors;
- the HTTP response identified Caddy as the active reverse proxy.

This refresh proved only the unchanged pre-deployment baseline.

## All-flags-off deployment result

Release `v.1.499.73-b1b77cf` was staged and activated on Pilot after explicit
authorization. The release manifest records exact commit
`b1b77cf8c0c45fb661beaab44bb8373122744c10`, source digest
`fe530672634f023d27feef421430977fd014d5c3e3ae2219e746423dcb6f49cf`, and
dist digest
`39ea1956930450f9b0385a9aa93ecb9fc576fd4d0b02b19d9e2b1bdc72d6db8d`.

Post-activation evidence:

- local and public health are `ok`; the public version is `v.1.499.73` and
  shared-state is `ready`;
- `/srv/mes/pilot/app` points to the immutable `.73-b1b77cf` artifact, while
  `.72-6985693` is recorded as the immediate rollback target;
- no `MES_REACT_*` values are present in the effective service environment, so
  every React island remains disabled by default;
- the authenticated browser loaded
  `./src/app.js?v=c8acd01fdb11-v.1.499.73`, rendered legacy Nomenclature and
  legacy authorization, found zero React mount targets, and logged no warnings
  or errors;
- all four domain readiness checks passed from PostgreSQL; a bounded
  Shift Execution dispatch read returned complete, server-authoritative
  coverage for its exact row/work-center/date scope without writes;
- the pre-deploy shared-state backup and metadata both have mode `0600`;
- the exact active commit was fast-forward promoted to GitHub `main`.

This completes acceptance steps 1-3.

## Nomenclature read-only Pilot evaluation

The root-owned Nomenclature evaluation permission was enabled for one bounded,
authenticated session and then disabled again. No write-evaluation flag was
enabled and no application data was changed.

Live evidence for the React path:

- the effective service environment contained only
  `MES_REACT_NOMENCLATURE=1` and
  `MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION=1`;
- the service remained active and public `/healthz` returned `200`;
- the authenticated user explicitly requested
  `react-nomenclature-evaluation=1` and received the React read-only view;
- the island reached `data-react-island-state=ready`, revision `1`, with a
  first-commit measurement of `60.30 ms`;
- React and legacy both showed zero Nomenclature rows and the same eleven
  registry sections with zero counts;
- React exposed no legacy `Новая позиция` action and its `Добавить позицию`
  control was disabled;
- no real or disposable record was created, updated or deleted.

Rollback evidence:

- the root-owned deactivation procedure removed all effective
  `MES_REACT_*` values;
- the service remained active and public `/healthz` still returned `200`;
- an authenticated reload with the same evaluation query rendered legacy,
  had no React mount target and restored the legacy `Новая позиция` action.

This completes acceptance steps 4-6 for the empty-state Nomenclature read-only
slice. A non-empty row/detail parity claim and every write command remain
unaccepted until a disposable test record is available. All sessions currently
use legacy Nomenclature.

## Structure Employees read-only Pilot evaluation

The second live slice evaluated the non-empty PostgreSQL-backed Employees
registry. Rollout controls from commit `97fb0ac` were executed from a temporary
root-only directory so the immutable `v.1.499.73-b1b77cf` release artifact was
not modified.

Live React evidence:

- the effective service environment contained only
  `MES_REACT_STRUCTURE_EMPLOYEES=1` and
  `MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION=1`;
- the service remained active and public `/healthz` stayed `200` with
  `sharedState=ready`;
- an existing authenticated session explicitly requested
  `react-structure-employees-evaluation=1`;
- the island reached `ready`, revision `1`, with a first-commit measurement of
  `31.50 ms`;
- all `76` React rows matched all `76` legacy rows in order and in all four
  read fields: employee, personnel number, assignment and status;
- the registry counts matched the same PostgreSQL projection:
  `19 / 19 / 49 / 76 / 6 / 0`;
- selecting a second employee updated the selected row and the full assignment
  passport, while `Новая запись` remained disabled;
- requesting `Подразделения` unmounted React and opened the exact legacy
  registry with `19` rows and its command surface.

Rollback evidence:

- deactivation removed every effective `MES_REACT_*` value;
- an authenticated reload with the same evaluation query mounted no React
  island and opened legacy;
- legacy Employees still contained the same `76` rows in the same order and
  with the same four read values captured before evaluation;
- the temporary root-only rollout directory was inspected and removed after
  deactivation.

No create, edit, archive or delete action was invoked. Structure Employees is
currently legacy for every session. The non-empty read-only Pilot gate is now
accepted; command migration remains a separate future slice.

## Structure Positions read-only Pilot evaluation

The third live slice reused the System Domains host contract for the
PostgreSQL-backed Positions registry. Rollout controls from commit `b2c8a1b`
were executed from an isolated root-only directory without modifying the active
release artifact.

- only `MES_REACT_STRUCTURE_POSITIONS=1` and
  `MES_REACT_STRUCTURE_POSITIONS_READ_ONLY_EVALUATION=1` were active;
- the authenticated session requested
  `react-structure-positions-evaluation=1`;
- the island reached `ready`, revision `1`, in `32.50 ms`;
- all `49` React rows matched all `49` legacy rows in order and in all five
  read fields: position, category, organization unit, work center and status;
- registry counts remained `19 / 19 / 49 / 76 / 6 / 0`;
- selecting `Упаковщик` opened the expected stable ID, category, unit, work
  center, schedule and status passport;
- `Новая запись` remained disabled, while requesting `Подразделения` returned
  to the exact `19`-row legacy registry.

After deactivation, every `MES_REACT_*` value was absent, health remained
green, the retained session query mounted no React island, and legacy still
contained the same `49` rows and values. The temporary rollout directory was
removed. No Pilot data was written. Structure Positions is currently legacy
for every session.

## Structure Org Units read-only Pilot evaluation

The fourth live slice evaluated the PostgreSQL-backed organization hierarchy.
Rollout controls from commit `9b5c938` were executed from an isolated root-only
directory without changing the immutable release artifact.

- only `MES_REACT_STRUCTURE_ORG_UNITS=1` and
  `MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION=1` were active;
- the authenticated session requested
  `react-structure-org-units-evaluation=1`;
- the island reached `ready`, revision `1`, in `33.30 ms`;
- all `19` React rows matched all `19` legacy rows in order and in all five
  read fields: unit, type, parent, code and status;
- selecting `Участок упаковки и маркировки изделий` preserved its `Склад`
  parent and opened the expected stable-ID passport;
- registry counts stayed `19 / 19 / 49 / 76 / 6 / 0`, and create remained
  disabled;
- requesting `Рабочие центры` unmounted React and opened the exact `19`-row
  legacy registry with its command surface.

Deactivation removed all React flags. Health stayed green, the retained session
query mounted no island, and the same `19` legacy rows remained unchanged. The
temporary rollout directory was removed and no Pilot data was written. Org
Units is currently legacy for every session.

## Structure Work Centers read-only Pilot evaluation

The fifth live slice evaluated the PostgreSQL-backed Work Centers registry.
Rollout controls from commit `fda32cc` ran from an isolated root-only directory
without changing the immutable release.

- only `MES_REACT_STRUCTURE_WORK_CENTERS=1` and
  `MES_REACT_STRUCTURE_WORK_CENTERS_READ_ONLY_EVALUATION=1` were active;
- the authenticated session requested
  `react-structure-work-centers-evaluation=1`;
- the island reached `ready`, revision `1`, in `33.80 ms`;
- all `19` React rows matched all `19` legacy rows in order and in all five
  read fields: center, organization unit, parent, planning and status;
- selecting `Участок упаковки и маркировки изделий` preserved the `Склад`
  parent, planning state and stable-ID passport;
- registry counts remained `19 / 19 / 49 / 76 / 6 / 0`, and create stayed
  disabled;
- requesting `Оборудование` unmounted React and opened the exact six-row legacy
  registry with its command surface.

Deactivation removed all React flags. Health stayed green, the retained query
mounted no island, and the same `19` legacy rows remained unchanged. The
temporary rollout directory was removed and no Pilot data was written. Work
Centers is currently legacy for every session.

## Structure Equipment read-only Pilot evaluation

The sixth live slice completed the primary System Domains registry checkpoint
with the PostgreSQL-backed Equipment registry. Rollout controls from commit
`631ddb6` ran from an isolated root-only directory without modifying the
immutable release.

- only `MES_REACT_STRUCTURE_EQUIPMENT=1` and
  `MES_REACT_STRUCTURE_EQUIPMENT_READ_ONLY_EVALUATION=1` were active;
- the authenticated session requested
  `react-structure-equipment-evaluation=1`;
- the island reached `ready`, revision `1`, in `32.10 ms`;
- all six React rows matched all six legacy rows in order and in all five read
  fields: equipment, work center, quantity, schedule and status;
- selecting `S2 + L2` opened the expected stable ID, work center, quantity,
  `2/2 · 08:00–20:00` schedule and status passport;
- registry counts remained `19 / 19 / 49 / 76 / 6 / 0`, and create stayed
  disabled;
- requesting `Подразделения` unmounted React and opened the exact `19`-row
  legacy registry.

Deactivation removed all React flags. Health stayed green, the retained query
mounted no island, and the same six legacy rows remained unchanged. The
temporary rollout directory was removed and no Pilot data was written.
Equipment is currently legacy for every session.

The accepted System Domains read-only family now covers Employees (`76`),
Positions (`49`), Org Units (`19`), Work Centers (`19`) and Equipment (`6`) on
the same PostgreSQL-authoritative payload and shared React host/UI contracts.
Responsibility Policies and Migration Diagnostics remain separate semantic
slices rather than implied by this checkpoint.

## Directory Component Types read-only Pilot evaluation

The seventh live slice started the Directories cluster with the existing
Component Types data. Rollout controls from commit `8cc9aee` ran from an
isolated root-only directory without changing the immutable release.

- only `MES_REACT_DIRECTORY_COMPONENT_TYPES=1` and
  `MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION=1` were active;
- the authenticated session requested
  `react-directory-component-types-evaluation=1`;
- the island reached `ready`, revision `1`, in `137.40 ms`;
- Pilot contained eight current rows rather than the four-row local fixture;
  all `8/8` React rows matched all `8/8` legacy rows in order and in every one
  of the eight formatted cells;
- family counters were `R/C/L 3`, `Дискреты 1`, `Микросхемы 3`, `Крупные 1`;
- filtering to `Микросхемы` produced the expected three rows and selecting
  `BGA` opened its coefficient, rate, setup and default-quantity passport;
- `Добавить тип` remained disabled, while `Все справочники` unmounted React
  and restored the complete legacy navigation with four directories.

Deactivation removed all React flags. Health stayed green, an authenticated
session retaining the evaluation query mounted no island, and the same eight
legacy rows remained unchanged. The temporary rollout directory was removed
and no Pilot data was written. Component Types is currently legacy for every
session. Local command parity is now complete: an isolated RBAC-enabled QA
contour creates, edits, verifies through legacy and removes one disposable row,
restoring the original fixture and preserving Planning routes, steps and slots.
No Pilot write flag has been introduced; live write acceptance remains a
separate checkpoint for a `directories:edit` role.

## Directory Operations read-only Pilot evaluation

The eighth live slice continued the Directories cluster on release
`v.1.499.73-b1b77cf`. Rollout controls from commit `264e127` ran from an
isolated root-only directory and enabled only
`MES_REACT_DIRECTORY_OPERATIONS=1` plus
`MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION=1`.

- the authenticated session retained
  `react-directory-operations-evaluation=1` through the normal authorization
  module and opened Directories without a page reload;
- the island reached `ready`, revision `1`, in `25.20 ms`;
- all `22/22` React rows matched all `22/22` legacy rows in order and in the
  operation, resolved work-center and status fields;
- the `Склад` filter exposed seven operations, and `Приход от поставщика`
  opened code `WH-010`, stable ID `D1_OP1`, work center `Склад` and
  `300 ед./ч`;
- add remained disabled, there was no page overflow, and the browser console
  contained no warnings or errors;
- `Все справочники` unmounted React and restored the exact 22-row legacy
  Operations section plus the four-directory navigation.

Deactivation removed every React flag. Health stayed `ok`; a newly
authenticated session retaining the evaluation query mounted no island and
showed the same 22 legacy rows. The exact temporary rollout directory was
removed and no Pilot data was written. Operations is currently legacy for every
Pilot session. Local create/edit parity is now complete through the existing
RBAC owner: hidden fields survive, ordinary and overridden route steps follow
the established rules, only unfinished unlocked slots recalculate, and legacy
reads back the result. A separately gated Pilot create/edit checkpoint remains
pending. Delete stays legacy because it also clears Specifications references.

## Weekly Production Control read-only Pilot evaluation

The ninth live slice was released as immutable artifact
`v.1.499.74-7784ab4`; the previous `.73-b1b77cf` artifact is its immediate
rollback target. Before activation, shared-state and metadata backups were
created with mode `0600`. Local and public health remained `ok` with
`sharedState=ready`.

- only `MES_REACT_WEEKLY_PRODUCTION_CONTROL=1` and
  `MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION=1` were enabled;
- the authenticated session explicitly requested
  `react-weekly-production-control-evaluation=1`;
- React reached `ready`, revision `1`, in `214.80 ms` and rendered the current
  25-row, 11-column week matrix;
- the summary remained `28 171` planned, `1` actual, `17` deviations and zero
  workplace reports;
- a live deviation-cell focus exposed the owner-prepared plan/fact/reason
  context in a viewport-safe popover;
- normalized React and post-deactivation legacy rows had the same SHA-256
  signature, proving exact same-data semantic parity for all 25 rows;
- no page overflow, warning or browser error was present.

No Pilot record was created, edited or deleted. The isolated drop-in was
removed, both Weekly runtime values are again `false`, and an authenticated
reload with the retained query rendered legacy with the same `25 x 11` matrix.
Pilot is healthy on `v.1.499.74`; Weekly is legacy for every session.
The exact active release commit `7784ab4` was then fast-forward promoted to
GitHub `main`; the later evidence-only documentation commit remains on the
frontend migration branch.

## Shift Master Board read-only Pilot evaluation

The operational board was released and evaluated through three immutable
all-flags-off checkpoints. No Pilot assignment, fact, carryover or other
production record was written during any live evaluation.

Release `v.1.499.75-94698e7` proved data and lifecycle parity but failed the
visual gate: the React board mounted with the same three lanes, two cards,
`126 / 1 / 0` summary, eight permitted masters and a first commit of
`1166.10 ms`, while its production stylesheet was absent. The evaluation
drop-in was removed immediately and legacy was restored.

Release `v.1.499.76-5e63b63` added a scoped production stylesheet and a
computed-style regression gate. The live board then rendered its shell, KPI,
panels, lanes and cards correctly, but the physical-transfer projection still
appeared as unstructured inline text. This second evaluation was also rejected
and deactivated without writes.

Release `v.1.499.77-c97b5a9` from exact commit
`c97b5a939527613fb46f2c8e345598d8e6264329` completed the scoped transfer
contract. Its manifest records source digest
`b33a0a9a3313bf9722e5278161d532ef134a63efff12f7b10a86723a66b1939d`
and dist digest
`e8ed771db456844fe1b8f96976f8ecb2b6838d9ab8787d949de81213315988a1`.

Accepted live evidence:

- public health returned `ok`, version `v.1.499.77`, with shared-state ready;
- all four PostgreSQL domain readiness checks passed;
- the authenticated session explicitly requested the read-only board island;
- React reached `ready` and showed the same current scope: three lanes, two
  cards, summary `126 / 1 / 0`, date `2026-07-16` and eight master options;
- the board, KPI, selected work card, lane cards and physical-transfer
  `Откуда / Куда / Результат` projection rendered as bounded MES panels;
- the transfer preserved the owner-provided semantics: `Слесарная операция ->
  Оптическая инспекция -> Следующая операция`, remainder `60`;
- no horizontal overflow or visually unscoped raw board content remained.

After acceptance the root-owned evaluation drop-in was removed. A retained
evaluation query mounted zero React targets and restored all three legacy
lanes. The service remained active and healthy on `.77`; every session now uses
legacy Shift Master Board. Default-on activation and manual lane movement are
separate future checkpoints.

## Shift Work Orders read-only Pilot evaluation

Release `v.1.499.78-83b3976` first added a five-column React transfer matching
the existing MES `До -> Сейчас -> После` contract, two connector slots, a
computed-style production gate and fail-closed root rollout controls. Its live
data, tree and transfer rendered correctly, but the three React actions still
appeared as unstyled native buttons. The evaluation was rejected and disabled
without invoking a command or changing data.

Release `v.1.499.79-b987e90` from exact commit
`b987e90a684615bc544b6a9063ddad070d8a227e` added the missing scoped action
contract. Its manifest records source digest
`07c6619d396254c3ba90b3411eda981063fe5dc4c2c8e5ea41c9e8438d05cb4e`
and dist digest
`b0501e6f684f0ec13baf2c392ea6efbdb71156c6fb5085346d9fbf3a614a3732`.

Accepted live evidence on the existing `2026-07-16` shift scope:

- public health returned `ok`, version `v.1.499.79`, and all four PostgreSQL
  readiness domains passed;
- legacy and React both exposed one work order, one operation, one assignment
  and the same eight journal columns;
- the React island reached `ready`, revision `1`, with first commit
  `503.90 ms`;
- the selected SZN preserved plan `61`, assigned `1`, fact `0`, remainder `60`,
  master, executor and typed `До / Сейчас / После` transfer;
- primary and secondary actions rendered through the scoped MES action
  contract rather than native browser buttons;
- both the SZN preview and the complete work-order package opened inside React,
  including the actual executor and physical-transfer tables; `Печать / PDF`
  was not invoked;
- no assignment, fact, report or other Pilot write was issued.

The evaluation drop-in was removed after acceptance. A reload retaining all
three evaluation query parameters mounted zero React targets and restored the
legacy journal with its one assignment row. Pilot remains healthy on `.79` and
all sessions currently use legacy Shift Work Orders.

## Employee Desktop read-only Pilot evaluation

Release `v.1.499.80-6589841` added the isolated fail-closed rollout permission.
Real data and React state were correct, but live visual QA showed that the lab
CSS had not entered the production stylesheet. The unstyled evaluation was
rejected and disabled immediately; no task, fact or Report command was invoked.

Release `v.1.499.81-bdf093c` from exact commit
`bdf093c5b8f29bd58e21ad6dae8ccf5302fc6ecb` adds scoped production CSS and a
computed-style gate for the grid, panels, summary cards, tasks and actions. Its
manifest records source digest
`d5e431e280d922fa735b448424f31d242e219bfa0a3113fba8657bfade4c543e`
and dist digest
`32afd5920eb946dfcefa1e9d22fc1c1af3dd86b131477bd10f896dd87290927d`.

Authenticated acceptance covered one current completed task, seven metrics,
SZN `СЗН-20260716-S-LOCKSMITH-1-9C43`, assigned/fact/good `1 / 1 / 1` and
defect `0`. The island reached `ready`, revision `1`, in `557.70 ms`. `Взять`
stayed disabled; Structure exposed five rows, Route three nodes with one
current node and PDF three instruction steps. A clean `.81` tab had no browser
warnings or errors. After deactivation a retained-query reload mounted zero
React targets and restored legacy; Pilot remained healthy and all sessions use
legacy by default.

## Specifications 2.0 and Gantt checkpoints

Specifications 2.0 release `.82-fe0ba0c` correctly stayed in legacy on Pilot.
The selected source `АБВГ.469659.001 Калоша` has a current 91-row draft marked
changed after published revision 6, so its fingerprint does not match the
immutable published projection. The fail-closed gate was not weakened and no
draft, revision, attachment or work-order data was changed.

Gantt `.83-d8d81dd` was rejected because KPI and passport styles were absent in
the production shell. `.84-f4a851d` fixed those elements, but the fifth toolbar
action wrapped to a second row and was also rejected. Release
`v.1.499.85-9120f56` from exact commit
`9120f560b8db43dd37470aeb546ea8f47e321621` was accepted. Its manifest records
source digest `35adb66b22bd2248e901b1fc052476fb0fcb1ed20b261a2722a164bfb7b7ce70`
and dist digest `a0b4f5ecf0fc7146bdc0b6e23c3a8cbf82823e9d9730ddb46e2c8c8d926f88c6`.
Authenticated QA reached `ready` in `192.6 ms` with one route, nine rows, 69
slots, 50 dependencies, four styled KPI cards, one-row toolbar, bounded slot
passport and no page overflow. The dependency inspector opened a real
production relationship; no schedule write was invoked. Evaluation was
disabled, retained-query reload mounted zero React targets, legacy returned,
and health remained `ok` on `.85`.

## Nomenclature Types read-only Pilot evaluation

Release `v.1.499.86-6b5cec6` from exact commit
`6b5cec6696f177c434e34ec0428f565c6778cc40` added isolated root-owned
read-only rollout controls and connected the Nomenclature Types host to the
shared MES React UI contract. Its manifest records source digest
`7b6785301b97148b3a75440d0757a14f9db668f1e8f93080fc5e56b001c36c71`
and dist digest `1eec2e3e97802e5f9e48a5ecb061d0ac78cf3b28c6e4c22038b968c013339ac8`.

Authenticated acceptance rendered all 10 current types and the same four
columns, reached revision `1` in `42 ms`, kept exactly one selected row and a
matching detail card, and rendered the table panel, sidebar, disabled action
and detail through the scoped common UI contract without overflow. Selecting
`Упаковка и маркировка` updated the detail locally. Add/create/edit stayed
disabled, no write command was invoked, and the clean tab had no warnings or
errors. Evaluation was removed; the retained URL mounted zero React targets
and restored the 10-row legacy directory. Pilot remained healthy on `.86`.
