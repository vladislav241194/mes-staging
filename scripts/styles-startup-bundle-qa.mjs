import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const stylesheet = await readFile(join(root, "dist", "styles.css"), "utf8");

if (/^\s*@import\s/m.test(stylesheet)) {
  throw new Error("Published styles.css must flatten the source CSS import manifest.");
}
if (!stylesheet.includes("--mes-ui-accent") || !stylesheet.includes(".specifications2-page") || !stylesheet.includes(".shift-master-board")) {
  throw new Error("Published styles.css is missing one or more required layer families.");
}

console.log("Startup stylesheet bundle QA: OK");
