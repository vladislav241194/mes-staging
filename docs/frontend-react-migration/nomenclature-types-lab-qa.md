# Directory Nomenclature Types React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Pilot status: authenticated read-only acceptance complete on `v.1.499.86-6b5cec6`; evaluation disabled

## Scope

Locally complete create/edit/delete vertical scenario:

`open Directories -> Nomenclature Types -> filter/select -> create or edit -> save -> inspect delete impact -> cancel without mutation -> confirm delete -> verify fallback references -> read the result through legacy`.

The typed adapter consumes the existing normalized
`directoryState.nomenclatureTypes` projection. React owns only the editor,
usage-aware confirmation and typed `save`/`delete` commands. The host computes
delete impact; the existing directory command owner remains responsible for
validation, fallback selection, persistence, reference synchronization,
notifications and rerendering.

## Contract and evidence

- invalid containers and rows without stable ID/name fail closed;
- the four legacy cells remain `Тип номенклатуры`, `Код`, `Описание`, `Статус`;
- status filtering keeps one valid selection and matching detail;
- create/edit and delete capabilities cross the adapter only as exact boolean
  `true` values and are
  also protected by the existing `directories:edit` RBAC owner;
- create/edit uses the existing `saveDirectoryRow("nomenclatureTypes", ...)`
  command path rather than duplicating persistence in React;
- delete discloses linked Nomenclature positions, Specifications rows and the
  owner-selected fallback type before calling the existing
  `deleteDirectoryStateRow("nomenclatureTypes", ...)` owner;
- cancelling delete is byte-stable and confirming it moves both reference
  families to the fallback without changing unrelated Planning state;
- rename propagation updates Nomenclature item types and Specifications 2.0
  structure-item type references while unrelated Planning rows stay unchanged;
- “Все справочники” restores the same section in the full legacy renderer.

`npm run qa:directory-nomenclature-types-react-island` compares the same
runtime payload in two production shells, then enables the local-only write
gate against a disposable owner-only `0600` snapshot. It creates a type, edits
an existing linked type, proves both rename projections, cancels one delete,
confirms the next delete, proves both fallback projections, reads the exact
result through legacy and removes the temporary snapshot without touching
Pilot or real data.

Legacy startup normalized the fixture to five rows. All five rows, four cells
and source order matched React. Default mode stayed legacy; status filtering,
selection/detail, legacy return, unchanged read-only state and a clean console
passed. The latest first React commit was `15.50 ms`, below the `2000 ms` local gate.

The independent entry is `210,301 B` raw / `64,630 B` gzip. The production
artifact is `205,408 B` raw / `64,243 B` gzip / `55,514 B` Brotli.

## Legacy defects repaired

The owner audit found two defects that affected the legacy path as well as the
React command path:

1. Nomenclature Type rename called a synchronization function that was not a
   service dependency and operated on a stale Products-module state copy.
   Synchronization now runs against the authoritative directory state.
2. The normalizer maps an empty type to the default `РЭА компоненты`. During
   create, an empty previous name could therefore recategorize existing REA
   items. Both synchronization paths now reject raw empty names before
   normalization.

3. The App Events service declared a fallback-type dependency but production
   did not inject the real owner, so delete could persist an empty
   Specifications type while later normalization masked the problem in
   Nomenclature.
4. Type removal could make normalized Specifications references disappear
   before reassignment. The owner now captures normalized linked row IDs before
   removing the source type and applies its fallback to that exact set.

All four boundaries are covered by source-contract and production-shell
regressions.

## Production boundary

The production host is false by default. Read-only activation still requires
explicit runtime permissions plus a per-session request. Create/edit/delete is
available only through the local query
`react-directory-nomenclature-types-write=1` and existing RBAC; there is no
server or Pilot write flag.

Pilot release `.86-6b5cec6` added isolated root-owned rollout controls and
joined the island host to the common MES React UI contract. Authenticated live
QA rendered all 10 real types with four columns, one selected row and matching
detail, revision `1`, first commit `42 ms`, disabled add/write actions, `18px`
panel/detail radii, no page overflow and no console warnings or errors. Selecting
`Упаковка и маркировка` updated its detail card locally. No create/edit command
was invoked. After evaluation removal, the retained URL mounted zero React
targets and restored the same 10-row legacy directory.
