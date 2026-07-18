# Nomenclature React activation-policy QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Why this gate exists

The legacy Nomenclature module supports create, edit and delete. The first
React slice is a read-only evaluation scenario. Activating it for an editor
would be a functional regression even if all visible rows matched.

## Decisions

`resolveNomenclatureActivation(...)` has four explicit outcomes:

| Feature flag | Pane | Access mode | Decision |
| --- | --- | --- | --- |
| off | items | read-only evaluation | `disabled` -> legacy |
| on | boards | read-only evaluation | `unsupported-scope` -> legacy |
| on | items | editor | `write-parity-incomplete` -> legacy |
| on | items | read-only evaluation | `eligible` -> React |

All four decisions are covered by the isolated QA. The feature gate also proves
that a `write-parity-incomplete` decision never calls the mount function.

## Browser evidence

With `?access=editor&lifecycle_qa=1`:

- fallback reason and lifecycle status were `write-parity-incomplete`;
- the message kept editing in the previous interface;
- no React `main` or commit revision existed;
- browser console warnings/errors: none.

With the default read-only evaluation path:

- React rendered Nomenclature with four rows and commit revision `1`;
- no legacy fallback was present;
- the only write action was disabled;
- browser console warnings/errors: none.

This allows a controlled Pilot comparison later without taking create/edit/
delete behavior away from working users.
