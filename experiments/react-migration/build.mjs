import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const labRoot = dirname(fileURLToPath(import.meta.url));
const distDir = join(labRoot, "dist");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await build({
  entryPoints: [join(labRoot, "src/main.tsx")],
  outfile: join(distDir, "app.js"),
  bundle: true,
  format: "esm",
  minify: false,
  sourcemap: true,
  target: "es2020",
  jsx: "automatic",
});

await Promise.all([
  cp(join(labRoot, "index.html"), join(distDir, "index.html")),
  cp(join(labRoot, "src/styles.css"), join(distDir, "styles.css")),
]);

console.log(`React migration lab built at ${distDir}`);
