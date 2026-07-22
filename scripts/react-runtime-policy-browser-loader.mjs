import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

export async function loadReactRuntimePolicyBrowserModule() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-react-runtime-policy-browser-"));
  try {
    const output = join(temporaryRoot, "react-runtime-policy.mjs");
    await build({
      entryPoints: [fileURLToPath(new URL("../src/modules/react_runtime_policy.ts", import.meta.url))],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      logLevel: "silent",
    });
    return await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
