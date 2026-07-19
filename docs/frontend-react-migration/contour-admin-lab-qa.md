# Contour Admin React lab QA

Date: 2026-07-19
Status: production-integrated read proof plus local-only protected Ops command evaluation; disabled by default

## Vertical scenario

`Open Contours -> compare Pilot/Stage/Prod -> inspect rollout scenarios and
iteration measurements -> confirm one protected operation -> delegate it to the
existing admin-only Ops owner -> render the safe result.`

The legacy module now exposes one completed `getContourAdminModel()` read
boundary containing contours, scenarios, allowlisted action IDs, speed rows and
guardrails. React receives no `fetch`, shell command, audit storage, cookie or
server output stream. Its typed command crosses the host only after explicit
confirmation; the host rechecks scenario/action ownership and calls the
existing module owner.

## Evidence

`npm run qa:contour-admin-react-lab` passes:

- 129 typed sources and the frozen-backend guard;
- three contour cards, five operational scenarios and five speed rows;
- local contour selection and payload revision `1 -> 2`;
- read-only actions return to legacy; disabled flag restores legacy;
- local write QA cancels the first confirmation without an API call, then sends
  exactly one mocked `sync-stage-to-pilot` request with the exact server
  confirmation token and renders its safe result;
- no viewport overflow and a clean browser console;
- independent entry `207,695 B` raw / `63,985 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full aggregate lab `536,188 B / 122,764 B` under its development-only
  `537,000 B / 126,000 B` budget;
- shared lab CSS `28,699 B / 5,207 B` under its development-only
  `28,900 B / 5,250 B` budget.

## Production integration

The host activates only on `admin.mes-line.ru`, after the existing server route
authentication, false-by-default runtime permissions and an explicit session
request. Local production-shell QA maps that exact hostname
to an isolated local server and proves default legacy, three contours, five
scenarios, five speed rows, scoped production CSS, a first commit below `20 ms`,
read-only fallback, cancelled confirmation with zero calls, one exact mocked
confirmed call, safe result rendering and a clean console. The production bundle
is `203,825 B` raw / `63,608 B` gzip / `54,810 B` Brotli. No real Ops command
was performed.

## Pilot rollout preparation

The read-only evaluation now has an isolated root-controlled rollout contour:

- `ops/frontend/mes-pilot-react-contour-admin-evaluation.conf`;
- `ops/frontend/activate-react-contour-admin-evaluation.sh`;
- `ops/frontend/deactivate-react-contour-admin-evaluation.sh`;
- `scripts/contour-admin-react-rollout-ops-qa.mjs`.

It owns only systemd drop-in `91-react-contour-admin-evaluation.conf`, verifies
health, both public read flags and the protected Admin login surface after
restart, and restores the prior configuration on failure. It never enables or
calls the protected Ops action endpoint. The rollout QA is part of
`npm run qa:contour-admin-react-island`.

Git-derived release `v.1.500.01-16e0e86` is active on Pilot with health `ok`.
Both Contour Admin flags remain `false`, so every Admin session still uses
legacy. The deploy account can restart/status the service but cannot install
the root-owned `91-*` drop-in; activation therefore remains pending an actual
root session. No Ops endpoint, shared data or PostgreSQL row was touched.
