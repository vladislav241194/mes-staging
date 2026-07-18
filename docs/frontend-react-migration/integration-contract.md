# React island integration contract

Date: 2026-07-19
Status: isolated lifecycle verified; not connected to MES

## Purpose

Define the smallest reversible boundary for mounting React scenarios
after the PostgreSQL slice is accepted and the frontend branch is rebased.

## Host responsibilities

The legacy host will remain responsible for:

- navigation and authorization;
- obtaining the accepted read-only payload for the selected scenario;
- deciding whether the disabled-by-default feature flag is enabled;
- creating one empty mount element;
- falling back to the existing renderer if mount fails;
- removing the React island before restoring the legacy renderer.

The host must not pass shared mutable state, DOM renderer functions, command
callbacks, or storage handles into the React island.

## React island responsibilities

`mountReactMigrationIsland(target, scenario, payload, { onError })` owns only
descendants of the explicit target, reports render failures to the host, and
returns the same lifecycle handle for every scenario:

- `update(payload)` to rerender from a new read-only snapshot;
- `unmount()` to release the target cleanly.

The island does not read global MES state, call an API, write data, persist
browser storage, or manipulate DOM outside its target.

`mountNomenclatureReactIsland(...)` remains a narrow convenience wrapper for
the first feature-flag integration. Component Types proves the generic boundary
in the lab but is not approved for production activation yet.

The isolated browser gate has verified initial mount, a payload update, clean
unmount, preservation of the host node/controls, rejection of updates after
unmount, and automatic legacy restoration after a render failure. All checks
passed without console errors.

`createReactIslandFeatureGate(...)` is the host-side state machine:

- disabled flag: never call the React mount and render legacy immediately;
- mount failure: render legacy with a normalized error;
- render/update failure: schedule exactly one fallback, unmount React, then
  render legacy outside the React render phase;
- legacy state: reject later React updates instead of silently remounting;
- dispose: release a mounted island without removing an already restored
  legacy view.

The island mount is atomic: if its initial synchronous render fails after root
creation, it unmounts that root before rethrowing to the feature gate.

## Feature flag rules

- Default: off.
- Scope: Nomenclature module only.
- Activation: explicit local/runtime configuration after PostgreSQL acceptance.
- Failure: `onError` schedules one host fallback; the feature gate unmounts the
  island and restores the legacy module.
- Rollback: disable flag and use the unchanged legacy renderer.
- No automatic promotion from Pilot to Stage.

## Integration gates

1. PostgreSQL slice merged to `main` and commit-derived Pilot release accepted.
2. Frontend branch rebased on that exact accepted commit.
3. Nomenclature read payload frozen and covered by adapter fixtures.
4. Shared build-file ownership released and `package-lock.json` reconciled once.
5. Feature flag and mount point added without changing business commands.
6. Legacy and React paths compared on identical data and viewport.
7. Performance and browser smoke pass before any default-on proposal.
