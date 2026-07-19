# Directory Statuses React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Locally complete user-managed create/edit vertical scenario:

`open Directories -> Statuses -> inspect system lifecycle rows -> create one user-managed status -> edit it -> read it through legacy`.

The host supplies the existing `getDirectoryData("statuses").rows` projection.
Lifecycle modules, contract/transition labels, audit, registry category and the
five-part impact description remain owned by current MES logic. React may
dispatch only the typed `save-custom` command; system statuses remain hard
read-only and delete remains outside this slice.

## Authority boundary

A status is editable by this contour only when the persisted row, not the
incoming command, has both:

- an ID beginning with `custom-status-`;
- `statusAuthority: "user"`.

Create assigns both markers in the production command boundary. Edit verifies
the existing stored row and stable ID. The owner also requires the existing
`directories:edit` RBAC permission. A forged marker cannot convert a system
row, and denial of RBAC blocks an existing custom row. No general Statuses
editor was enabled in legacy.

## Evidence

- rows without stable ID/name fail closed and source order is preserved;
- all seven legacy cells and the fourteen-field passport remain visible;
- production-shell read QA matched all `85` normalized system rows, every
  visible cell and order;
- application-area filtering, selection/detail, current-section legacy return,
  unchanged read-only state and clean console passed;
- compact-shell QA at `487 px` proves a one-column module/workspace contract,
  two-column filter rail, document-level overflow protection and table-local
  horizontal scrolling;
- a disposable owner-only `0600` snapshot proves custom create/edit,
  persistence, stable authority, system-row immutability, legacy read-back and
  unchanged Planning routes/steps/slots;
- owner-level QA rejects a forged system edit, a markerless create and an RBAC
  denial while accepting exactly two valid custom writes;
- the first local React commit was `16.60 ms`.

The independent entry is `210,171 B` raw / `64,488 B` gzip. The production
artifact is `204,911 B` raw / `64,133 B` gzip / `55,175 B` Brotli.

## Production boundary

Read-only activation remains protected by explicit runtime permissions and a
session request. Custom create/edit has only the local
`react-directory-statuses-write=1` gate; there is no Pilot/server write flag.
Pilot read-only evaluation on `v.1.499.87-2415a84` proved 82 live rows,
selection/detail, group filtering and disabled commands in the authenticated
UI. The initial compact-shell check exposed the fixed-width registry rail.
The accepted `v.1.499.88-c507868` release keeps 82/82 live rows, reduced the
first commit to `43.4 ms`, and proved the bounded responsive contract in the
effective `487 x 1055` compact viewport: one-column module/workspace,
two-column filters, no document overflow and table-local horizontal scrolling.
The in-page return restored 82-row legacy Statuses with no React island. No
Pilot write or real-data mutation was performed.
