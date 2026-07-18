# React migration lab

Standalone React + TypeScript lab for the first MES migration scenario. It does
not import or mutate the legacy runtime, server API, shared state, or PostgreSQL
contracts.

Build from the repository root:

```sh
node experiments/react-migration/build.mjs
```

Run the isolated contract and stop-list checks:

```sh
node experiments/react-migration/qa.mjs
```

Then serve `experiments/react-migration/dist` with any static server.

The fixture boundary intentionally mirrors a future API adapter. Replacing the
fixture with live data is blocked until the PostgreSQL authority slice is
accepted and this branch is rebased onto that commit.
