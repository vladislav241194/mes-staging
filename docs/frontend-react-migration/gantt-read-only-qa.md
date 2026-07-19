# Gantt read-only React QA

Date: 2026-07-19
Status: authenticated Pilot read accepted on `v.1.499.85-9120f56`; disabled by default

## Vertical scenario

`Open Gantt -> inspect PostgreSQL schedule -> open a dependency -> inspect its
source, target and interval -> select the target slot`.

The existing Gantt runtime remains the owner of scale, rows, row heights and
slot placement. `getGanttReactModel(...)` serializes that completed geometry;
React does not recalculate scheduling or working-calendar rules. Toolbar,
filter and scale remain legacy. React now consumes the exact visible pairs from
the existing `getDependencyPairs(planningState)` owner, exposes their source,
target, type and time interval, and selects the target slot locally. Dependency
editing, drag, resize and optimization remain in the unchanged legacy renderer.
A localhost-only typed command proof may move the start of one existing
unlocked slot, but the host revalidates the PostgreSQL projection, RBAC,
route/operation binding, lock state and date before delegating to the existing
revision-checked `changeSlotSchedule` owner.

Activation requires all of the following:

- `MES_REACT_GANTT=1`;
- `MES_REACT_GANTT_READ_ONLY_EVALUATION=1`;
- exact PostgreSQL runtime projection state `server`;
- loaded legacy Gantt runtime and completed geometry model;
- explicit authenticated `react-gantt-evaluation=1` request.

Local QA may use `qa-auth-bypass=1&react-gantt=1&react-gantt-readonly=1` only
on loopback hosts. The schedule command proof additionally requires
`react-gantt-write=1`; it is unavailable on Pilot and every non-loopback host.
Default navigation remains legacy.

## Evidence

`npm run qa:gantt-react-island` proves policy, typed-source boundaries, build,
production-shell rendering, local slot selection, one `Монтаж -> Контроль`
dependency with a 60-minute interval, target-slot selection, editor fallback,
zero Planning API writes and a clean browser console. The fixture rendered
three rows and two slots from PostgreSQL revision 19; first React commit remains
under `25 ms` in the current local runs. The same production-shell gate proves locked and invalid
requests fail before the API, a revision conflict is presented without leaving
React, a retry performs exactly one successful owner mutation, preserves slot
duration and advances the authoritative revision once, and legacy reads the
updated slot geometry back from the same projection.

The independent production bundle is `204,190 B` raw / `63,874 B` gzip /
`55,121 B` Brotli. The isolated entry measurement is `207,957 B` raw /
`64,253 B` gzip under the unchanged `225,000 B / 68,000 B` production budget.

Existing full Gantt guardrail QA currently requires a root
`bootstrap-snapshot.json`, which is absent from this worktree. The new browser
gate independently proves default legacy rendering and exact runtime-owned
slot geometry; the missing external fixture is not treated as a pass.

Pilot evaluation first rejected `.83-d8d81dd` because the production shell did
not style KPI cards and the slot passport. `.84-f4a851d` fixed those contracts
but visual QA found the fifth toolbar action wrapping onto a separate row.
Accepted release `.85-9120f56` adds a five-column toolbar and an executable
single-row visual gate. Authenticated real-data QA reached `ready` in `192.6 ms`
with one route, nine rows, 69 slots and 50 dependency pairs. The inspector
opened an actual `Выдача в производство -> Слесарная операция` relationship;
no schedule mutation or write command was invoked. The evaluation drop-in was
then removed, a retained evaluation URL mounted zero React targets, legacy
Gantt returned, and Pilot remained healthy.
