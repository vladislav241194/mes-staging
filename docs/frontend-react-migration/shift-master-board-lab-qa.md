# Shift Master Board React lab QA

Date: 2026-07-19
Status: production-integrated date/master, assignment, fact, carryover, typed-transfer and SZN-print island; disabled by default; no Pilot activation

## Vertical scenario

`Open Workshop -> select a shift date and permitted master -> inspect shift lanes -> select a task -> switch board focus ->
distribute a bounded quantity between eligible executors -> read the assignment
back -> record a partial shift fact -> read the canonical fact and carryover back
-> open the canonical remainder on the next shift -> return to the source task
-> correct the fact -> cancel the canonical remainder -> inspect the physical
transfer -> preview and print the executor SZN.`

The typed adapter consumes the completed `getShiftMasterBoardModel()` result.
It does not read PostgreSQL, shared state, Shift Execution repositories or the
legacy DOM directly.

## Command boundary

- local card selection stays inside the React island;
- all four focus controls stay inside React, but the host owner normalizes the
  focus and rebuilds rows, lanes, selection and KPIs;
- the date input sends only an ISO date to the existing workbench owner; the
  production shell proves PostgreSQL scope rehydration `19 -> 20 -> 19`;
- the master selector is present only when the owner grants `admin` or
  `productionHead` selection and returns only a validated profile ID plus the
  owner-backed `mine` projection;
- a localhost-only write evaluation opens shared `ModalOverlay` forms for
  assignment and fact; both accept only bounded integer quantities;
- React sends typed `save-assignment` and `save-fact` commands; the host rechecks
  RBAC, access-matrix membership, Timesheet availability, duplicates, assignment
  bounds and `defect <= actual`;
- the existing Shift Execution owner performs the PostgreSQL command and refresh,
  then React reads the canonical assignment or fact back;
- a partial fact preserves the existing automatic carryover lifecycle without
  duplicate callbacks; a completed fact cancels an earlier canonical remainder;
- the owner supplies a typed transfer contract. React displays the remainder
  quantity/date and requests navigation, while the host validates the known
  carryover and changes the date through the existing workbench date owner;
- provisional-to-canonical reconciliation preserves selection by the durable
  `(sourceRowId, dateKey)` identity, so the next render selects the PostgreSQL ID;
- the carryover POST result is normalized immediately, including the real
  snake_case repository shape; correcting the fact can therefore PATCH the
  canonical ID without waiting for a future-date dispatch;
- returning from a carryover to its source task uses the same date owner. A
  cached scope now re-renders React even when its ETag is unchanged;
- React renders the owner's `Откуда -> Куда -> Результат` transfer projection
  without recalculating route semantics;
- SZN preview reuses the existing lazy shared React renderer. The host validates
  the selected row/executor, records the existing print status and owns
  `window.print()`;
- read-only evaluation still returns assignment and fact to legacy; date and
  permitted master navigation stay in React, while manual lane movement remains legacy;
- no storage handle or API client crosses the island boundary.

## Evidence

`npm run qa:shift-master-board-react-lab` passes:

- 130 typed sources and the frozen-backend guard;
- three canonical lanes and four task cards;
- seven plan/allocation/fact/detail metrics;
- local selection, payload revision and owner-backed focus `Все -> Незакрытые`;
- focus reduces the lab board from four to three cards and preserves all three
  lanes; a zero-row production focus keeps the toolbar available so the user
  can return to `Все`;
- two-executor assignment `80 + 40 = 120`, partial fact `100 - 4 = 96`,
  remainder preview `24`, next-shift/source navigation and corrected fact
  `120`, date and master switching, owner-backed revision `1 -> 12`, typed transfer and lazy SZN print,
  disabled flag, no page overflow and clean console;
- independent entry `225,000 B` raw / `67,937 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full aggregate lab `554,332 B / 125,925 B` under its development-only
  `555,000 B / 126,000 B` budget;
- shared lab CSS `29,860 B / 5,345 B` under its development-only
  `30,000 B / 5,350 B` budget.

Production-shell QA proves default legacy, explicit session-only read access,
three lanes and one PostgreSQL-backed task card on both renderers, read-only
assignment fallback, date rehydration `19 -> 20 -> 19`, `productionHead`
master switching, owner-backed focus `Все -> empty Незакрытые -> Все`, then
one write-evaluation assignment, one partial fact and one carryover with
canonical read-back. It then navigates to the next shift, selects the canonical
carryover alongside a normal next-shift production row, returns to the source,
corrects the fact and observes one canonical cancellation. The test intercepts
exactly one assignment, two fact writes, one carryover create and one carryover
cancel, renders the typed transfer, lazy-loads the shared SZN preview, records
the print through the host owner, leaves the 0600 fixture unchanged and keeps a
clean console. Current first commit is `25.90 ms`; the production base bundle is
`217,258 B` raw / `67,589 B` gzip / `58,223 B` Brotli. The already shared print
chunk is `13,774 B` raw / `3,351 B` gzip / `3,145 B` Brotli and is loaded only
when the user opens SZN.
Pilot remains unchanged.

The frozen backend still requires at least one durable source row in a dispatch
scope. A future date containing only a carryover therefore remains a legacy
fallback and needs a separate Domain API contract change outside this frontend
checkpoint. Likewise, the proven correction/cancellation path is one continuous
owner session: a fresh bootstrap opened only on the source date cannot discover
the target-date carryover ID through the current date-bounded API. Closing that
cross-date read requires a separate backend contract; no backend/API/repository
file was changed here.

## Legacy lifecycle baseline restored

`npm run qa:shift-master-board` now supplies a validated PostgreSQL-primary
System Domains projection generated from the production matrix. The fixture has
the canonical warehouse master, one manually authorized warehouse executor,
their role assignments and the standard schedule projection. The dispatch
window is seeded through the date-only UI contract before application startup.

The full legacy lifecycle passes without weakening access or Timesheet checks:
one isolated Specifications 2.0 task, one authorized and available executor,
`11 / 12` assigned, direct shift-sheet issue, transfer contract, print preview,
unauthorized-executor filtering, storage isolation and no horizontal overflow.
The React production shell, server command/bridge/outbox/carryover suites and
the 26-module smoke also pass against the restored baseline.
