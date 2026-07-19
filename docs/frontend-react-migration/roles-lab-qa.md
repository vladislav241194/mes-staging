# Roles and Access React migration lab QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Baseline: `fc71e01de31f573a4e1c0a5510e328630932aee9`

## Scope

Standalone read scenario plus a bounded local metadata command scenario:

`open Roles and Access -> select role -> inspect passport -> edit label/description/default module -> inspect six-action grants -> inspect explicit employee assignments`.

The typed adapter consumes a host-supplied System Domains snapshot plus the
existing module registry. It joins `accessRoles`, `grants`, `roleAssignments`,
`employees`, `employmentAssignments`, `positions`, and `orgUnits`. It does not
call an API, persist UI/data, or infer a role from position text. The production
host alone exposes a local-only metadata command and delegates it to the
existing revision-checked `access-control` owner. Grant, assignment, scope,
read-only, active and reset commands remain outside React.

## Contract preserved

- stable role IDs and source order remain unchanged;
- six actions are `view`, `edit`, `print`, `assign`, `approve`, `configure`;
- a module is visible only when `view` is explicitly effective;
- inactive roles fail closed;
- read-only roles retain only `view` and `print`;
- `authPrototype` remains outside the grants matrix;
- explicit assignments join canonical employee, position, and organization
  labels; missing references are not invented;
- position is displayed as employment context and never treated as an access
  role.

The adapter is compared action-by-action with the production
`createAccessControlService(...).grants(...)` result on the same canonical
fixture. All role/module/action decisions match.

## Automated evidence

Command:

```sh
npm run qa:roles-react-lab
```

Result:

- 32 TypeScript/TSX sources compile;
- invalid role containers and missing stable IDs fail closed;
- three roles expose visible-module counts `4`, `2`, and `2`;
- each role resolves one explicit employee assignment;
- the master assignment resolves `Иванов Сергей`, personnel number `0105`,
  position `Мастер участка`, and organization `Производство`;
- auditor `print` remains allowed while `edit` is denied by the read-only rule;
- independent Roles artifact is `212,831 B` raw / `65,382 B` gzip, within the
  `225,000 B` / `68,000 B` production-island budget;
- frozen backend and persistence/network isolation guards pass.

## Browser evidence

Automated Chromium/CDP check at `1280x720` proves:

1. Three roles, four module rows, six grant actions, one selected role, and one
   assignment row render on the initial revision.
2. Administrator metrics show four visible modules, six explicit grants, and
   one assignment.
3. Payload update commits revision `1 -> 2` without remount and updates the
   selected role description.
4. Keyboard `Enter` selects `Мастер производства`; exactly one sidebar item is
   active, `Иванов Сергей` is assigned, and four effective actions are visible.
5. Mouse selection opens `Аудитор`, preserves four view/print grants, read-only
   status, and the `Орлова Марина` assignment.
6. The grants table owns horizontal overflow; the page does not overflow.
7. `access=editor` produces `write-parity-incomplete`; `react=0` produces the
   disabled legacy fallback.
8. Browser console remains clean.

## Production integration

`mountRolesReactIsland(...)` now uses the shared production island host. It is
disabled by default and requires both explicit server flags, a PostgreSQL-
hydrated System Domains read-model, and the per-session
`react-roles-evaluation=1` request for reads. The separate localhost-only
`react-roles-write=1` gate exposes only label, description and default-module
editing when the current subject has `roles:configure` and the `access-control`
server command surface is ready. Missing readiness or permission retains the
full legacy Roles page and its commands.

`npm run qa:roles-react-island` proves the production shell with eight
canonical roles, thirteen module definitions, explicit employee assignments,
default legacy, a revision conflict without mutation, successful retry, legacy
read-back, unchanged grants/assignments/scope/read-only/active/hidden fields,
an unchanged compatibility snapshot, clean console, production styling and a
compact `487 px` contract. The production artifact is `207,239 B` raw /
`65,088 B` gzip / `56,024 B` Brotli.

## Pilot acceptance

Authenticated read-only acceptance completed on immutable release
`v.1.499.91-78a872e`. The live PostgreSQL projection contained seven roles,
thirteen modules and no explicit employee assignments; React preserved those
actual counts, selected one role, kept every command disabled and committed in
`13.1 ms` in the compact check. Desktop QA proved the two-column registry,
18 px panels and no page overflow. Effective `487 x 1055` QA proved one-column
content, two-column role and metric grids, table-local horizontal scrolling and
no document overflow.

The first live evaluation exposed that the Roles host class was absent from the
shared production CSS selector; the next check exposed the fixed desktop rail
in the compact shell. Both regressions now fail automated UI-contract QA. The
session fallback and the retained-query server fallback each restored the exact
seven-role legacy page. All Roles flags are off, health is green, and no Pilot
write or real-data mutation was performed.
