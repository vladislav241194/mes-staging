#!/usr/bin/env node
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sshControlPath = join(process.env.HOME || "/tmp", ".ssh", "mes-codex-%C");
const sshOptions = [
  "-o", "ControlMaster=auto",
  "-o", "ControlPersist=60",
  "-o", `ControlPath=${sshControlPath}`,
];

const CONTOURS = {
  pilot: {
    appPath: "/srv/mes/pilot/app",
    releasesPath: "/srv/mes/pilot/releases",
    service: "mes-pilot.service",
    url: "https://pilot.mes-line.ru",
    port: "4175",
  },
  staging: {
    appPath: "/srv/mes/dev/app",
    releasesPath: "/srv/mes/dev/releases",
    service: "mes-dev.service",
    url: "https://staging.mes-line.ru",
    port: "4174",
  },
};

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function parseArgs(argv) {
  const args = { contour: "pilot", remote: "mes-line", releaseId: "", dryRun: false };
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);
    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;
    if (key === "contour") args.contour = String(value);
    else if (key === "remote") args.remote = String(value);
    else if (key === "release-id") args.releaseId = String(value);
    else if (key === "dry-run") args.dryRun = true;
    else throw new Error(`Unknown option: --${key}`);
  }
  return args;
}

function safeReleaseId(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  if (!normalized) throw new Error("--release-id is required");
  return normalized;
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function run(command, args, { cwd = projectRoot, allowFailure = false, input = "" } = {}) {
  const startedAt = performance.now();
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { command: [command, ...args].join(" "), code, stdout, stderr, durationMs: performance.now() - startedAt };
      if (code !== 0 && !allowFailure) {
        const error = new Error(`${result.command} failed with code ${code}`);
        error.result = result;
        reject(error);
        return;
      }
      resolvePromise(result);
    });
    child.stdin.end(input);
  });
}

function remoteBashArgs(remote, scriptArguments) {
  const command = `bash -s -- ${scriptArguments.map(shellQuote).join(" ")}`;
  return [...sshOptions, remote, command];
}

const activationScript = String.raw`#!/usr/bin/env bash
set -euo pipefail

app_path="$1"
releases_path="$2"
release_path="$3"
release_app_path="$4"
release_id="$5"
service="$6"
port="$7"
public_health_url="$8"
dry_run="$9"

for command_name in node curl sha256sum sudo systemctl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done

test -d "$release_app_path"
test -f "$release_path/release-manifest.json"
test -f "$release_app_path/dist/index.html"
test -f "$release_app_path/package-lock.json"
test -f "$release_app_path/scripts/release-verify.mjs"

cd "$release_app_path"
node scripts/release-verify.mjs \
  --manifest="$release_path/release-manifest.json" \
  --expected-release-id="$release_id" \
  --json

if [ "$dry_run" = "true" ]; then
  if [ -L "$app_path" ]; then
    printf 'DRY_RUN current=release-pointer target=%s\n' "$(readlink -f "$app_path")"
  elif [ -d "$app_path" ]; then
    printf 'DRY_RUN current=legacy-directory target=%s\n' "$app_path"
  else
    echo "Active application path is neither a directory nor a release pointer: $app_path" >&2
    exit 1
  fi
  printf 'DRY_RUN next=%s\n' "$release_app_path"
  exit 0
fi

if [ -L "$app_path" ]; then
  previous_kind="release-pointer"
  previous_target="$(readlink -f "$app_path")"
  test -d "$previous_target"
elif [ -d "$app_path" ]; then
  previous_kind="legacy-directory"
  previous_target="$app_path"
else
  echo "Active application path is neither a directory nor a release pointer: $app_path" >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
legacy_path=""
failed_pointer_path="$release_path/failed-active-pointer-$timestamp"
health_body_path="$release_path/activation-health-$timestamp.json"

rollback() {
  set +e
  echo "Activation health check failed; restoring previous runtime." >&2
  if [ "$previous_kind" = "release-pointer" ]; then
    if [ -L "$app_path" ]; then
      mv -T "$app_path" "$failed_pointer_path"
    fi
    ln -s "$previous_target" "$app_path.rollback"
    mv -Tf "$app_path.rollback" "$app_path"
  else
    if [ -L "$app_path" ]; then
      mv -T "$app_path" "$failed_pointer_path"
    fi
    if [ -n "$legacy_path" ] && [ -d "$legacy_path/app" ]; then
      mv "$legacy_path/app" "$app_path"
    fi
  fi
  sudo -n /usr/bin/systemctl restart "$service" >/dev/null 2>&1 || true
}

if [ "$previous_kind" = "release-pointer" ]; then
  ln -s "$release_app_path" "$app_path.next"
  if ! mv -Tf "$app_path.next" "$app_path"; then
    echo "Unable to switch the active release pointer." >&2
    exit 1
  fi
else
  legacy_path="$releases_path/legacy-app-pre-$timestamp"
  mkdir -p "$legacy_path"
  ln -s "$release_app_path" "$app_path.next"
  if ! mv "$app_path" "$legacy_path/app"; then
    echo "Unable to preserve the current legacy runtime." >&2
    exit 1
  fi
  if ! mv -Tf "$app_path.next" "$app_path"; then
    mv "$legacy_path/app" "$app_path" || true
    echo "Unable to create the active release pointer; the legacy runtime was restored." >&2
    exit 1
  fi
fi

if ! sudo -n /usr/bin/systemctl restart "$service"; then
  rollback
  exit 1
fi

check_health() {
  local health_url="$1"
  local attempt health_code
  for attempt in $(seq 1 12); do
    if systemctl is-active --quiet "$service"; then
      health_code="$(curl -sS --max-time 10 -o "$health_body_path" -w '%{http_code}' "$health_url" || true)"
      if [ "$health_code" = "200" ] \
        && node --input-type=module -e '
          import { readFile } from "node:fs/promises";
          const health = JSON.parse(await readFile(process.argv[1], "utf8"));
          if (health?.status !== "ok" || health?.sharedState !== "ready") process.exit(1);
        ' "$health_body_path"; then
        return 0
      fi
    fi
    sleep "$attempt"
  done
  return 1
}

if ! check_health "http://localhost:$port/healthz"; then
  rollback
  exit 1
fi

if ! check_health "$public_health_url"; then
  rollback
  exit 1
fi

node --input-type=module - \
  "$releases_path/active-release.json.next" \
  "$release_path/activation.json.next" \
  "$release_path/release-manifest.json" \
  "$release_id" \
  "$previous_kind" \
  "$previous_target" \
  "$legacy_path" \
  "$timestamp" <<'NODE'
import { readFile, writeFile } from "node:fs/promises";
const [activePath, activationPath, manifestPath, releaseId, previousKind, previousTarget, legacyPath, activatedAt] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const record = {
  schemaVersion: 1,
  releaseId,
  activatedAt,
  previous: {
    kind: previousKind,
    target: previousTarget,
    legacyPath: legacyPath || null,
  },
  manifest: {
    gitCommit: manifest.gitCommit,
    appVersion: manifest.appVersion,
    sourceTreeSha256: manifest.sourceTreeSha256,
    distTreeSha256: manifest.distTreeSha256,
  },
  health: { local: "ok", public: "ok" },
};
await writeFile(activePath, JSON.stringify(record, null, 2) + "\\n");
await writeFile(activationPath, JSON.stringify(record, null, 2) + "\\n");
NODE
mv -f "$releases_path/active-release.json.next" "$releases_path/active-release.json"
mv -f "$release_path/activation.json.next" "$release_path/activation.json"

printf 'ACTIVATED release=%s previous_kind=%s previous_target=%s\n' "$release_id" "$previous_kind" "$previous_target"
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contour = CONTOURS[args.contour];
  if (!contour) throw new Error(`Unknown contour: ${args.contour}`);
  const releaseId = safeReleaseId(args.releaseId);
  const releasePath = `${contour.releasesPath}/${releaseId}`;
  const releaseAppPath = `${releasePath}/app`;
  const startedAt = performance.now();

  console.log(`MES release activation${args.dryRun ? " (dry run)" : ""}`);
  console.log(`- contour: ${args.contour}`);
  console.log(`- release: ${releaseId}`);
  console.log(`- candidate: ${releaseAppPath}`);

  const result = await run(
    "ssh",
    remoteBashArgs(args.remote, [
      contour.appPath,
      contour.releasesPath,
      releasePath,
      releaseAppPath,
      releaseId,
      contour.service,
      contour.port,
      `${contour.url}/healthz`,
      String(args.dryRun),
    ]),
    { input: activationScript },
  );
  if (result.stdout.trim()) console.log(result.stdout.trim());
  console.log(`- total: ${formatDuration(performance.now() - startedAt)}`);
}

main().catch((error) => {
  console.error(error.message);
  if (error.result?.stdout) console.error(error.result.stdout.trim());
  if (error.result?.stderr) console.error(error.result.stderr.trim());
  process.exit(1);
});
