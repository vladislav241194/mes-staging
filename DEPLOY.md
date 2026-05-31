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

## Notes

- Do not commit `dist/` to git.
- Staging is static for now and uses browser `localStorage`.
- `server.js` is only for local development and is not used by Vercel static deploy.
