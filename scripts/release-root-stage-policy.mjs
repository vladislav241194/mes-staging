import { posix } from "node:path";

export const PILOT_ROOT_STAGE_REMOTE = "mes-line-root";
export const PILOT_RELEASES_ROOT = "/srv/mes/pilot/releases";
export const PILOT_ROOT_TRUST_CHAIN = Object.freeze([
  "/srv",
  "/srv/mes",
  "/srv/mes/pilot",
  PILOT_RELEASES_ROOT,
]);

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export function resolveReleaseStageRemote(contour, requestedRemote = "") {
  const normalizedContour = String(contour || "").trim();
  const normalizedRemote = String(requestedRemote || "").trim();
  if (normalizedContour === "pilot") {
    if (normalizedRemote && normalizedRemote !== PILOT_ROOT_STAGE_REMOTE) {
      throw new Error(
        `Pilot staging requires the root-authenticated ${PILOT_ROOT_STAGE_REMOTE} SSH alias; refusing ${normalizedRemote}`,
      );
    }
    return PILOT_ROOT_STAGE_REMOTE;
  }
  return normalizedRemote || "mes-line";
}

export function assertCanonicalPilotReleasePath(releasePath) {
  const normalized = String(releasePath || "").trim();
  const relative = posix.relative(PILOT_RELEASES_ROOT, normalized);
  if (
    !normalized
    || posix.normalize(normalized) !== normalized
    || !relative
    || relative.startsWith("../")
    || relative.includes("/")
    || posix.join(PILOT_RELEASES_ROOT, relative) !== normalized
  ) {
    throw new Error(`Pilot release path must be one direct child of ${PILOT_RELEASES_ROOT}`);
  }
  return normalized;
}

export function assertRootOwnedDirectoryMetadata(path, metadata) {
  if (!metadata?.isDirectory || metadata?.isSymbolicLink) {
    throw new Error(`Trusted path is not a real directory: ${path}`);
  }
  if (metadata.uid !== 0 || metadata.gid !== 0) {
    throw new Error(`Trusted path is not root:root: ${path}`);
  }
  if ((Number(metadata.mode) & 0o022) !== 0) {
    throw new Error(`Trusted path is group/other writable: ${path}`);
  }
  return true;
}

function rootIdentityCheckLines() {
  return [
    'if [ "$(id -u)" != "0" ]; then',
    "  echo 'Pilot release staging requires an authenticated root SSH session (uid 0)' >&2",
    "  exit 73",
    "fi",
  ];
}

function trustChainCheckLines() {
  return PILOT_ROOT_TRUST_CHAIN.flatMap((path) => {
    const quoted = shellQuote(path);
    return [
      `trusted_path=${quoted}`,
      'if [ ! -d "$trusted_path" ] || [ -L "$trusted_path" ]; then',
      '  echo "Untrusted Pilot release path component: $trusted_path is missing, not a directory, or a symlink" >&2',
      "  exit 74",
      "fi",
      'if [ "$(readlink -f -- "$trusted_path")" != "$trusted_path" ]; then',
      '  echo "Untrusted Pilot release path component: $trusted_path does not resolve canonically" >&2',
      "  exit 74",
      "fi",
      'if [ "$(stat -Lc \'%u:%g\' -- "$trusted_path")" != "0:0" ]; then',
      '  echo "Untrusted Pilot release path component: $trusted_path is not root:root" >&2',
      "  exit 74",
      "fi",
      'if find "$trusted_path" -maxdepth 0 -perm /022 -print -quit | grep -q .; then',
      '  echo "Untrusted Pilot release path component: $trusted_path is group/other writable" >&2',
      "  exit 74",
      "fi",
    ];
  });
}

export function buildPilotRootTrustPreflightCommand() {
  return [
    "set -euo pipefail",
    ...rootIdentityCheckLines(),
    ...trustChainCheckLines(),
    "printf 'PILOT_ROOT_TRUST_CHAIN_OK\\n'",
  ].join("\n");
}

function releaseTreeVerificationLines(releasePath) {
  const releaseAppPath = `${releasePath}/app`;
  return [
    `release_path=${shellQuote(releasePath)}`,
    `release_app_path=${shellQuote(releaseAppPath)}`,
    'if [ ! -d "$release_path" ] || [ -L "$release_path" ]; then',
    '  echo "Untrusted staged release: $release_path is missing, not a directory, or a symlink" >&2',
    "  exit 75",
    "fi",
    'if [ "$(readlink -f -- "$release_path")" != "$release_path" ]; then',
    '  echo "Untrusted staged release: $release_path does not resolve canonically" >&2',
    "  exit 75",
    "fi",
    'if [ ! -f "$release_path/release-manifest.json" ] || [ -L "$release_path/release-manifest.json" ]; then',
    "  echo 'The root-staged release manifest must be a regular non-symlink file' >&2",
    "  exit 75",
    "fi",
    'bad_owner="$(find "$release_path" -xdev \\( ! -user root -o ! -group root \\) -print -quit)"',
    'if [ -n "$bad_owner" ]; then',
    '  echo "Untrusted staged release owner: $bad_owner is not root:root" >&2',
    "  exit 75",
    "fi",
    'bad_mode="$(find "$release_path" -xdev ! -type l -perm /022 -print -quit)"',
    'if [ -n "$bad_mode" ]; then',
    '  echo "Untrusted staged release mode: $bad_mode is group/other writable" >&2',
    "  exit 75",
    "fi",
    'while IFS= read -r -d "" link_path; do',
    '  case "$link_path" in',
    '    "$release_app_path"/node_modules/*) ;;',
    '    *) echo "Untrusted staged release symlink outside node_modules: $link_path" >&2; exit 75 ;;',
    "  esac",
    '  link_target="$(readlink -f -- "$link_path")" || { echo "Broken staged release symlink: $link_path" >&2; exit 75; }',
    '  case "$link_target" in',
    '    "$release_app_path"/node_modules/*) ;;',
    '    *) echo "Staged release symlink escapes candidate node_modules: $link_path -> $link_target" >&2; exit 75 ;;',
    "  esac",
    'done < <(find "$release_path" -xdev -type l -print0)',
  ];
}

export function buildPilotReleaseTrustVerificationCommand(releasePath) {
  const canonicalReleasePath = assertCanonicalPilotReleasePath(releasePath);
  return [
    "set -euo pipefail",
    ...rootIdentityCheckLines(),
    ...trustChainCheckLines(),
    ...releaseTreeVerificationLines(canonicalReleasePath),
    "printf 'PILOT_ROOT_STAGED_RELEASE_TRUST_OK\\n'",
  ].join("\n");
}

export function buildPilotReleaseSealCommand(releasePath) {
  const canonicalReleasePath = assertCanonicalPilotReleasePath(releasePath);
  return [
    "set -euo pipefail",
    ...rootIdentityCheckLines(),
    ...trustChainCheckLines(),
    `release_path=${shellQuote(canonicalReleasePath)}`,
    'if [ ! -d "$release_path" ] || [ -L "$release_path" ]; then',
    '  echo "Refusing to seal a missing, non-directory, or symlink release: $release_path" >&2',
    "  exit 75",
    "fi",
    'chown -hR 0:0 -- "$release_path"',
    'find "$release_path" -xdev ! -type l -perm /022 -exec chmod go-w -- {} +',
    ...releaseTreeVerificationLines(canonicalReleasePath),
    "printf 'PILOT_ROOT_STAGED_RELEASE_SEALED\\n'",
  ].join("\n");
}
