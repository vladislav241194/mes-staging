# Directory Statuses React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read-only vertical scenario:

`open Directories -> Statuses -> filter by application area -> select a status -> inspect its passport`.

The host supplies the existing `getDirectoryData("statuses").rows` projection.
Lifecycle modules, contract/transition labels, audit, registry category and the
five-part impact description remain owned by current MES logic.

## Evidence

- rows without stable ID/name fail closed and source order is preserved;
- all seven legacy table cells remain visible;
- the detail passport keeps the full fourteen-field reader contract;
- production-shell QA matched all `85` normalized runtime rows, every visible
  cell and order;
- application-area filtering, one selection, matching detail, current-section
  legacy return, unchanged state and clean console passed;
- first local React commit was `17.0 ms`;
- flags are false by default and editor/session fallback retains legacy.

The independent entry is `204,588 B` raw / `63,461 B` gzip. The production
artifact is `200,980 B` raw / `62,993 B` gzip / `54,248 B` Brotli. It has not
been released or activated on Pilot.
