# Frontend React rebase preflight

Date: 2026-07-19
Frontend branch: `codex/frontend-react-migration`

## Compared commits

- merge base: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`;
- frontend HEAD: `6a701893ca3a2f29127c5a68d35cc8447c2a91b0`;
- current `origin/main`: `511e281de76df307a87379849075cd22e1a510bd`;
- accepted live PostgreSQL release contained in main: `c3b4059`.

## Dry-run evidence

The preflight compared every path changed from the shared merge base:

- frontend paths: 40;
- main/PostgreSQL paths: 50;
- paths changed by both sides: 0;
- merge-tree conflict markers: 0.

The earlier text match `ON CONFLICT (version) DO NOTHING` was a PostgreSQL SQL
clause, not a Git conflict. The final check only counted real
`<<<<<<<`/`=======`/`>>>>>>>` merge markers.

## Decision

The rebase is structurally ready but intentionally not executed yet. The
authoritative handoff still requires:

1. root activation of the two Specifications 2.0 command surfaces;
2. authenticated live validation and final PostgreSQL goal audit;
3. only then frontend rebase onto the latest `origin/main`.

The remaining root operation does not overlap this React branch, but executing
the rebase early would violate the published integration order. Once the final
acceptance is recorded, repeat this preflight against the then-current main,
perform the rebase, and rerun the complete isolated QA and performance budget.
