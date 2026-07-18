# React island feature-gate QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Contract evidence

The isolated QA covers the future host boundary without importing MES runtime:

- enabled activation mounts once and accepts payload updates;
- two render-error notifications schedule only one fallback;
- fallback unmounts React before rendering legacy;
- legacy state rejects later React updates;
- disabled activation never calls the mount function;
- synchronous mount failure renders legacy with the original error;
- an unsupported child scope can explicitly request legacy without pretending
  that the scope was migrated;
- an editor path can refuse a read-only island with
  `write-parity-incomplete` before mount;
- the PostgreSQL stop-list remains unchanged.

## Browser evidence

With `?react=0`, the host rendered one `disabled` legacy fallback, no React
`main`, and no console warnings/errors.

With `?lifecycle_qa=1`, an intentional render failure produced:

- fallback reason `render-error`;
- lifecycle status `legacy: Lifecycle QA render failure`;
- no React `main` and one host-owned legacy child;
- preserved host controls;
- rejection of a later update as `legacy` without remount;
- legacy view preserved after gate disposal;
- no console warnings/errors.

This proves the rollback mechanics in the isolated host only. It is not yet a
claim that the production legacy renderer, navigation, or Pilot feature flag is
wired; those remain gated by PostgreSQL acceptance and rebase.

The Nomenclature browser gate also verified `unsupported-scope`: choosing the
legacy Boards pane removed the React `main`, preserved host controls, rendered
one legacy fallback, and produced no console warnings/errors.
