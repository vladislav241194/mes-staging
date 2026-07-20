# Structure Responsibility Policies React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read vertical scenario: `open Structure and Employees -> Responsibility Policies -> select a policy -> inspect its passport`.

The minimal functional-QA migration fixture has an empty registry. Empty-state behavior is covered directly;
the non-empty production-shell parity check uses one valid policy only inside a
  temporary `0600` QA snapshot and never writes Pilot or repository data. The
  full domain baseline independently reports one responsibility policy.

Local-only command scenario:

`create manual policy -> reject duplicate master -> switch to all -> conflict -> retry -> archive -> reactivate -> read through legacy`.

React edits only the canonical master/mode/manual-target contract. Existing
operational runtime remains responsible for calculating the assignable employee
set used by the Workshop.

Migration `026_system_responsibility_policy_lifecycle` supplies the missing
owner contract with additive `is_active BOOLEAN NOT NULL DEFAULT TRUE` and
nullable `archived_at TIMESTAMPTZ` columns. Existing policies remain active.
The PostgreSQL repository now persists and hydrates both lifecycle fields; the existing System Domains archive and
upsert owners remain authoritative. React exposes stable-ID-bound two-step
archive/reactivation and never changes lifecycle through an ordinary save.

## Evidence

- invalid containers and policies without stable ID/subject fail closed;
- five legacy cells, employee-name formatting and order match React literally;
- selection/passport, seven links, six metrics, Employees fallback, unchanged
  temporary state and clean console pass;
- all five prior Structure registry regressions remain exact;
- a second policy preserves two deterministic manual employee IDs;
- a duplicate master is rejected before any PUT;
- switching to `all` retains manual targets for a later mode change;
- conflict does not mutate the revision and retry advances it exactly once;
- hidden server fields survive edit and legacy reads back both policies;
- archive persists `isActive=false` and a valid audit timestamp;
- reactivation clears the persisted archive marker without losing targets or hidden fields;
- latest non-empty local first commit was `18.50 ms`.

The production artifact is `209,489 B` raw / `65,490 B` gzip / `56,527 B`
Brotli, below the `225,000 B / 68,000 B` gate. Separate read adapters keep the
aggregate lab within its development-only budget. Read and write remain false
by default; migration 026 and the command slice have not been released or
activated on Pilot.

## Pilot rollout preparation

The read-only evaluation now has an isolated root-controlled rollout contour:

- `ops/frontend/mes-pilot-react-structure-responsibility-policies-evaluation.conf`;
- `ops/frontend/activate-react-structure-responsibility-policies-evaluation.sh`;
- `ops/frontend/deactivate-react-structure-responsibility-policies-evaluation.sh`;
- `scripts/structure-responsibility-policies-react-rollout-ops-qa.mjs`.

It owns only systemd drop-in
`90-react-structure-responsibility-policies-evaluation.conf`, refuses activation
unless the service reports `MES_DOMAIN_STORAGE=postgres`, verifies health and
both public read flags after restart, and restores the prior configuration on
failure. The rollout QA is part of
`npm run qa:structure-responsibility-policies-react-island`.

The contour is prepared but not activated. Pilot currently reports zero
responsibility policies, so a non-empty live parity checkpoint remains pending
and legacy stays the default.
