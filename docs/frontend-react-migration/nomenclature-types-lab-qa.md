# Directory Nomenclature Types React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Locally complete create/edit vertical scenario:

`open Directories -> Nomenclature Types -> filter/select -> create or edit -> save -> verify Nomenclature and Specifications references -> read the result through legacy`.

The typed adapter consumes the existing normalized
`directoryState.nomenclatureTypes` projection. React owns only the editor and a
typed `save` command. The existing directory command owner remains responsible
for validation, persistence, reference synchronization, notifications and
rerendering. Delete remains legacy-only.

## Contract and evidence

- invalid containers and rows without stable ID/name fail closed;
- the four legacy cells remain `Тип номенклатуры`, `Код`, `Описание`, `Статус`;
- status filtering keeps one valid selection and matching detail;
- write capability crosses the adapter only as the exact boolean `true` and is
  also protected by the existing `directories:edit` RBAC owner;
- create/edit uses the existing `saveDirectoryRow("nomenclatureTypes", ...)`
  command path rather than duplicating persistence in React;
- rename propagation updates Nomenclature item types and Specifications 2.0
  structure-item type references while unrelated Planning rows stay unchanged;
- “Все справочники” restores the same section in the full legacy renderer.

`npm run qa:directory-nomenclature-types-react-island` compares the same
runtime payload in two production shells, then enables the local-only write
gate against a disposable owner-only `0600` snapshot. It creates a type, edits
its name, proves both reference projections, reads the result through legacy
and removes the temporary snapshot without touching Pilot or real data.

Legacy startup normalized the fixture to five rows. All five rows, four cells
and source order matched React. Default mode stayed legacy; status filtering,
selection/detail, legacy return, unchanged read-only state and a clean console
passed. The first React commit was `22.40 ms`, below the `2000 ms` local gate.

The independent entry is `207,259 B` raw / `63,928 B` gzip. The production
artifact is `203,085 B` raw / `63,699 B` gzip / `54,776 B` Brotli.

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

Both boundaries are covered by source-contract and production-shell
regressions.

## Production boundary

The production host is false by default. Read-only activation still requires
explicit runtime permissions plus a per-session request. Create/edit is
available only through the local query
`react-directory-nomenclature-types-write=1` and existing RBAC; there is no
server or Pilot write flag. No release or Pilot activation was performed.
Disabling the local evaluation immediately retains the unchanged legacy
renderer and all legacy commands.
