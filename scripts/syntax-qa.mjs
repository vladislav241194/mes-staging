import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const roots = [join(projectRoot, "src"), join(projectRoot, "scripts")];

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJavaScriptFiles(path));
      continue;
    }
    if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const files = [
  join(projectRoot, "server.js"),
  ...(await Promise.all(roots.map(collectJavaScriptFiles))).flat(),
].sort();
const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status === 0) continue;
  failures.push({
    file: relative(projectRoot, file).split(sep).join("/"),
    message: (result.stderr || result.stdout || "syntax check failed").trim(),
  });
}

console.log(`Recursive syntax QA: ${files.length} JS/MJS files`);
if (failures.length) {
  failures.forEach(({ file, message }) => console.error(`- ${file}: ${message}`));
  process.exitCode = 1;
} else {
  console.log("OK: every runtime, module, generated index and QA script parses.");
}

