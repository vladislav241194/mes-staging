# Structure Work Centers React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read-only vertical scenario:

`open Structure and Employees -> Work Centers -> select a center -> inspect its passport`.

The typed adapter consumes the authenticated PostgreSQL System Domains snapshot,
preserves all stable IDs and resolves organization and parent-center references.

## Evidence

- invalid containers and rows without stable ID/name fail closed;
- all `19` canonical work centers survive the typed boundary;
- the five legacy cells (`Рабочий центр + stable ID`, `Подразделение`, `Родитель`,
  `Планирование`, `Статус`) and order match React literally;
- selection/passport, seven registry links, six metrics, exact Equipment fallback,
  unchanged state and clean console pass in the production shell;
- Employees 76/76, Positions 49/49 and Org Units 19/19 regressions pass;
- latest local first commit was `23.8 ms`.

The independent entry is `209,390 B` raw / `64,349 B` gzip. The production
artifact is `203,739 B` raw / `64,039 B` gzip / `55,095 B` Brotli. It remains
false by default and has not been released or activated on Pilot.
