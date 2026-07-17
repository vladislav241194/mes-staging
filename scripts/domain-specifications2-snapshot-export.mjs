import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportSpecifications2Snapshot } from "./domain-specifications2-export.mjs";

function parseArgs(argv) {
  const parsed = { source: "", out: "", stdout: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stdout") parsed.stdout = true;
    else if (arg === "--source" || arg === "--out") {
      const value = String(argv[index + 1] || "").trim();
      if (!value) throw new Error(`${arg} requires a file path`);
      parsed[arg.slice(2)] = value; index += 1;
    } else throw new Error(`Unsupported argument: ${arg}`);
  }
  if (!parsed.source || (!parsed.out && !parsed.stdout) || (parsed.out && parsed.stdout)) throw new Error("Usage: npm run domain:specifications2:export -- --source <shared-state.json> (--out <specifications2-export.json> | --stdout)");
  return parsed;
}

export async function exportSpecifications2File(sourcePath) {
  return exportSpecifications2Snapshot(JSON.parse(await readFile(resolve(sourcePath), "utf-8")));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = await exportSpecifications2File(args.source);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (args.stdout) process.stdout.write(serialized);
  else {
    const outputPath = resolve(args.out);
    await writeFile(outputPath, serialized, { encoding: "utf-8", flag: "wx" });
    console.log(`Specifications 2.0 revision export: ${outputPath}`);
    console.log(`- documents: ${payload.documents.length}`);
    console.log(`- revisions: ${payload.revisions.length}`);
    console.log(`- items: ${payload.revisionItems.length}`);
    console.log(`- route operations: ${payload.routeOperations.length}`);
    console.log(`- skipped drafts: ${payload.skippedDrafts}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();
