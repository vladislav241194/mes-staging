# React island integration contract

Date: 2026-07-19
Status: isolated lifecycle verified; not connected to MES

## Purpose

Define the smallest reversible boundary for mounting the first React scenario
after the PostgreSQL slice is accepted and the frontend branch is rebased.

## Host responsibilities

The legacy host will remain responsible for:

- navigation and authorization;
- obtaining the accepted read-only nomenclature payload;
- deciding whether the disabled-by-default feature flag is enabled;
- creating one empty mount element;
- falling back to the existing renderer if mount fails;
- removing the React island before restoring the legacy renderer.

The host must not pass shared mutable state, DOM renderer functions, command
callbacks, or storage handles into the React island.

## React island responsibilities

`mountNomenclatureReactIsland(target, payload)` owns only descendants of the
explicit target and returns:

- `update(payload)` to rerender from a new read-only snapshot;
- `unmount()` to release the target cleanly.

The island does not read global MES state, call an API, write data, persist
browser storage, or manipulate DOM outside its target.

The isolated browser gate has verified initial mount, a payload update, clean
unmount, preservation of the host node/controls, and rejection of updates after
unmount without console errors.

## Feature flag rules

- Default: off.
- Scope: Nomenclature module only.
- Activation: explicit local/runtime configuration after PostgreSQL acceptance.
- Failure: catch mount/update error, unmount if necessary, render legacy module.
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
