# Gantt read-only React QA

Date: 2026-07-19
Status: production-integrated dependency-inspection proof; disabled by default; not deployed

## Vertical scenario

`Open Gantt -> inspect PostgreSQL schedule -> open a dependency -> inspect its
source, target and interval -> select the target slot`.

The existing Gantt runtime remains the owner of scale, rows, row heights and
slot placement. `getGanttReactModel(...)` serializes that completed geometry;
React does not recalculate scheduling or working-calendar rules. Toolbar,
filter and scale remain legacy. React now consumes the exact visible pairs from
the existing `getDependencyPairs(planningState)` owner, exposes their source,
target, type and time interval, and selects the target slot locally. Dependency
editing, drag, resize, optimization and every schedule mutation remain in the
unchanged legacy renderer.

Activation requires all of the following:

- `MES_REACT_GANTT=1`;
- `MES_REACT_GANTT_READ_ONLY_EVALUATION=1`;
- exact PostgreSQL runtime projection state `server`;
- loaded legacy Gantt runtime and completed geometry model;
- explicit authenticated `react-gantt-evaluation=1` request.

Local QA may use `qa-auth-bypass=1&react-gantt=1&react-gantt-readonly=1` only
on loopback hosts. Default navigation remains legacy.

## Evidence

`npm run qa:gantt-react-island` proves policy, typed-source boundaries, build,
production-shell rendering, local slot selection, one `Монтаж -> Контроль`
dependency with a 60-minute interval, target-slot selection, editor fallback,
zero Planning API writes and a clean browser console. The fixture rendered
three rows and two slots from PostgreSQL revision 19; first React commit was
`17.10 ms`.

The independent production bundle is `204,190 B` raw / `63,874 B` gzip /
`55,121 B` Brotli. The isolated entry measurement is `207,957 B` raw /
`64,253 B` gzip under the unchanged `225,000 B / 68,000 B` production budget.

Existing full Gantt guardrail QA currently requires a root
`bootstrap-snapshot.json`, which is absent from this worktree. The new browser
gate independently proves default legacy rendering and exact runtime-owned
slot geometry; the missing external fixture is not treated as a pass.

No Pilot/Admin deploy, version bump or feature activation was performed.
