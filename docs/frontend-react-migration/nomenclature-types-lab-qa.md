# Directory Nomenclature Types React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read-only vertical scenario:

`open Directories -> Nomenclature Types -> filter by status -> select a type -> inspect its card`.

The typed adapter consumes `directoryState.nomenclatureTypes` after the
existing runtime normalization. React preserves stable ID, source order,
Russian status, code and description; it does not own synchronization with
Nomenclature items.

## Contract and evidence

- invalid containers and rows without stable ID/name fail closed;
- the four legacy cells remain `Тип номенклатуры`, `Код`, `Описание`, `Статус`;
- status filtering keeps one valid selection and matching detail;
- create/edit/delete and type synchronization remain legacy;
- the React action is disabled;
- “Все справочники” restores this same section in the full legacy renderer,
  even when other directory React islands are enabled.

`npm run qa:directory-nomenclature-types-react-island` compares the same
runtime payload in two production shells. Legacy startup normalized the fixture
to five rows, and all five rows, four cells and source order matched React.
Default editor mode stayed legacy; status filtering, selection/detail, legacy
return, unchanged state, clean console and an `18.6 ms` local first commit
passed.

The independent entry is `203,242 B` raw / `63,096 B` gzip. The production
artifact is `200,131 B` raw / `62,738 B` gzip / `53,938 B` Brotli.

## Production boundary

The production host is false by default and requires both explicit runtime
permissions plus a per-session evaluation request. No release or Pilot
activation was performed. Disabling either permission immediately retains the
unchanged legacy renderer and all write commands.
