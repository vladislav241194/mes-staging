# Roles and Access React migration lab QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Baseline: `fc71e01de31f573a4e1c0a5510e328630932aee9`

## Scope

Standalone read scenario plus bounded local metadata, grant and default-scope command scenarios:

`open Roles and Access -> select role -> inspect passport -> edit label/description/default module -> toggle one six-action grant -> change role default scope -> inspect explicit employee assignments`.

The typed adapter consumes a host-supplied System Domains snapshot plus the
existing module registry. It joins `accessRoles`, `grants`, `roleAssignments`,
`employees`, `employmentAssignments`, `positions`, and `orgUnits`. It does not
call an API, persist UI/data, or infer a role from position text. The production
host alone exposes local-only typed metadata, grant and role-default-scope
commands and delegates them to the existing revision-checked `access-control`
owner. Assignment, personal/assignment scope, read-only, active and reset
commands remain outside React.

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
- independent Roles artifact is `215,726 B` raw / `65,944 B` gzip, within the
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
`react-roles-write=1` gate exposes label, description, default-module, one
six-action grant coordinate and the role default scope when the current subject has `roles:configure` and
the `access-control` server command surface is ready. The host rejects unknown
modules/actions, mutating grants for read-only roles and removal of `view` while
dependent actions remain. Missing readiness or permission retains the full
legacy Roles page and its commands.

`npm run qa:roles-react-island` proves the production shell with eight
canonical roles, thirteen module definitions, explicit employee assignments,
default legacy, metadata/grant/default-scope revision conflicts without
mutation, successful retries, React and legacy read-back, grant cleanup to the
original effective deny, scope cleanup to `workCenter`, unchanged unrelated grants/assignments/protected/hidden fields,
an unchanged compatibility snapshot, clean console, production styling and a
compact `487 px` contract. The System Domains migration also has a regression
guard proving that an existing role `readOnly` flag is preserved. The production
artifact is `209,296 B` raw / `65,475 B` gzip / `56,485 B` Brotli.

Assignment command parity is intentionally not claimed. The current owner
removes every assignment row for an employee on replace/clear, while the
PostgreSQL repository projection does not persist the advertised
`validFrom`/`validTo` window. That authority/persistence contract must be fixed
and proven separately before React may expose assignment writes.

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
