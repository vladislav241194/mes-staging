# Static Staging Deploy

## Local Development

Run the local development server:

```bash
npm start
```

Open:

```text
http://localhost:4173/?cache-reset=1
```

## Build Staging

Create a static staging build:

```bash
npm run build
```

The command creates `dist/` and copies `index.html`, `styles.css`, `src/`, and the prototype image. It also adds cache-busting query parameters for `styles.css` and `src/app.js` in `dist/index.html`.

## Preview Dist

Check the static build locally:

```bash
npm run preview
```

Open:

```text
http://localhost:4174
```

## Shared Staging State

The staging build can share production planning data between testers through
`/api/shared-state`. The client keeps personal UI state in the browser, but
publishes planning data, directories, and shared visual settings to the common
snapshot.

For Vercel staging, configure one of these KV/Redis env pairs:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

or:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Optional:

```text
MES_SHARED_STATE_KEY
```

Local development and `npm run preview` use `.mes-shared-state.json`, which is
ignored by git.

## Notes

- Do not commit `dist/` to git.
- Without KV/Redis env vars, staging keeps using browser `localStorage`.
- `server.js` is only for local development and is not used by Vercel static deploy.
