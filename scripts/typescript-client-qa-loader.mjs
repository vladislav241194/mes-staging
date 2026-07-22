import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

export async function withBundledTypeScriptClient(entryUrl, run, { prefix = "mes-typescript-client-qa-" } = {}) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), prefix));
  try {
    const output = join(temporaryRoot, "client.mjs");
    await build({
      entryPoints: [fileURLToPath(entryUrl)],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      logLevel: "silent",
    });
    const clientModule = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);
    return await run(clientModule);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
