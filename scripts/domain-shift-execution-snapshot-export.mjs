import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportShiftExecutionSnapshot } from "./domain-shift-execution-export.mjs";

function parseArgs(argv) {
  const parsed = { source: "", out: "", stdout: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stdout") parsed.stdout = true;
    else if (arg === "--source" || arg === "--out") {
      const value = String(argv[index + 1] || "").trim();
      if (!value) throw new Error(`${arg} requires a file path`);
      parsed[arg.slice(2)] = value;
      index += 1;
    } else throw new Error(`Unsupported argument: ${arg}`);
  }
  if (!parsed.source) throw new Error("Usage: npm run domain:shift:export -- --source <shared-state.json> (--out <shift-export.json> | --stdout)");
  if (!parsed.out && !parsed.stdout) throw new Error("Specify --out or --stdout");
  if (parsed.out && parsed.stdout) throw new Error("Use either --out or --stdout, not both");
  return parsed;
}

export async function exportShiftExecutionFile(sourcePath) {
  const raw = await readFile(resolve(sourcePath), "utf-8");
  return exportShiftExecutionSnapshot(JSON.parse(raw));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = await exportShiftExecutionFile(args.source);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (args.stdout) {
    process.stdout.write(serialized);
    return;
  }
  const outputPath = resolve(args.out);
  await writeFile(outputPath, serialized, { encoding: "utf-8", flag: "wx" });
  console.log(`Shift execution export: ${outputPath}`);
  console.log(`- assignments: ${payload.shiftAssignments.length}`);
  console.log(`- executors: ${payload.shiftAssignmentExecutors.length}`);
  console.log(`- facts: ${payload.shiftFacts.length}`);
  console.log(`- carryovers: ${payload.shiftCarryovers.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();
