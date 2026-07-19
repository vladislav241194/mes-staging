# Contour Admin React lab QA

Date: 2026-07-19
Status: production-integrated read-only proof; disabled by default; protected Ops commands remain legacy

## Vertical scenario

`Open Contours -> compare Pilot/Stage/Prod -> inspect rollout scenarios and
iteration measurements -> return an operation to protected legacy Ops API.`

The legacy module now exposes one completed `getContourAdminModel()` read
boundary containing contours, scenarios, speed rows and guardrails. React does
not receive `fetch`, confirmation callbacks, audit storage or command handlers.

## Evidence

`npm run qa:contour-admin-react-lab` passes:

- 105 typed sources and the frozen-backend guard;
- three contour cards, five operational scenarios and two speed rows;
- local contour selection and payload revision `1 -> 2`;
- every Ops action returns to legacy; disabled flag restores legacy;
- no viewport overflow and a clean browser console;
- independent entry `204,350 B` raw / `63,207 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full twenty-one-scenario lab `424,587 B / 101,918 B` under its development-
  only `430,000 B / 114,000 B` budget;
- shared lab CSS `12,466 B / 2,638 B` under its development-only
  `14,000 B / 4,000 B` budget.

## Production integration

The host activates only on `admin.mes-line.ru`, after the existing server route
authentication, two false-by-default runtime permissions and an explicit
read-only session request. Local production-shell QA maps that exact hostname
to an isolated local server and proves default legacy, three contours, five
scenarios, five speed rows, scoped production CSS, a first commit below `20 ms`,
action fallback, zero Ops API writes and a clean console. The production bundle
is `201,348 B` raw / `63,003 B` gzip / `54,161 B` Brotli. Admin and Pilot remain
unchanged.
