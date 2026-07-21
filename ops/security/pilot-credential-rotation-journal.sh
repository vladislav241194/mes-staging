#!/usr/bin/env bash
# Durable root-only filesystem journal used by rotate-pilot-credentials.sh.
# The caller owns PostgreSQL rollback; this library makes the credential-env
# half recoverable across SIGKILL or host/process interruption.

pilot_journal_assert_directory() {
  local path="$1"
  [[ -d "$path" && ! -L "$path" && "$(readlink -f -- "$path")" == "$path" ]] \
    || { echo "Credential journal path must be a canonical directory: $path" >&2; return 1; }
  [[ "$(stat -c '%u:%g:%a' "$path")" == 0:0:700 ]] \
    || { echo "Credential journal directory must be root:root 0700: $path" >&2; return 1; }
}

pilot_journal_assert_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" && "$(readlink -f -- "$path")" == "$path" ]] \
    || { echo "Credential journal entry must be a canonical regular file: $path" >&2; return 1; }
  [[ "$(stat -c '%u:%g:%a' "$path")" == 0:0:600 ]] \
    || { echo "Credential journal entry must be root:root 0600: $path" >&2; return 1; }
}

pilot_journal_prepare() {
  local journal_dir="$1"
  local timer_was_active="$2"
  shift 2
  local parent temporary source destination basename_value
  parent="$(dirname "$journal_dir")"
  pilot_journal_assert_directory "$parent"
  [[ ! -e "$journal_dir" && ! -L "$journal_dir" ]] \
    || { echo "Credential rotation journal already exists: $journal_dir" >&2; return 1; }
  [[ "$timer_was_active" =~ ^[01]$ ]] || { echo "Invalid timer state for credential journal." >&2; return 1; }

  temporary="$(mktemp -d "${journal_dir}.prepare.XXXXXX")"
  chown root:root "$temporary"
  chmod 0700 "$temporary"
  install -d -o root -g root -m 0700 "$temporary/files"
  for source in "$@"; do
    pilot_journal_assert_file "$source"
    basename_value="$(basename "$source")"
    destination="$temporary/files/$basename_value"
    [[ ! -e "$destination" ]] || { echo "Credential journal basename collision: $basename_value" >&2; return 1; }
    cp --reflink=never --preserve=mode,ownership,timestamps -- "$source" "$destination"
    chown root:root "$destination"
    chmod 0600 "$destination"
    sync -f "$destination"
  done
  printf '%s\n' "$timer_was_active" > "$temporary/timer-was-active"
  printf '%s\n' prepared > "$temporary/phase"
  chown root:root "$temporary/timer-was-active" "$temporary/phase"
  chmod 0600 "$temporary/timer-was-active" "$temporary/phase"
  sync -f "$temporary/timer-was-active"
  sync -f "$temporary/phase"
  sync -f "$temporary/files"
  sync -f "$temporary"
  mv -T -- "$temporary" "$journal_dir"
  sync -f "$parent"
}

pilot_journal_phase() {
  local journal_dir="$1"
  pilot_journal_assert_directory "$journal_dir"
  pilot_journal_assert_file "$journal_dir/phase"
  tr -d '[:space:]' < "$journal_dir/phase"
}

pilot_journal_set_phase() {
  local journal_dir="$1"
  local phase="$2"
  local temporary
  [[ "$phase" =~ ^(prepared|roles-updated|env-updated|sessions-updated|verified|committed)$ ]] \
    || { echo "Invalid credential journal phase: $phase" >&2; return 1; }
  pilot_journal_assert_directory "$journal_dir"
  temporary="$(mktemp "$journal_dir/.phase.XXXXXX")"
  printf '%s\n' "$phase" > "$temporary"
  chown root:root "$temporary"
  chmod 0600 "$temporary"
  sync -f "$temporary"
  mv -fT -- "$temporary" "$journal_dir/phase"
  sync -f "$journal_dir"
}

pilot_journal_timer_was_active() {
  local journal_dir="$1"
  local value
  pilot_journal_assert_directory "$journal_dir"
  pilot_journal_assert_file "$journal_dir/timer-was-active"
  value="$(tr -d '[:space:]' < "$journal_dir/timer-was-active")"
  [[ "$value" =~ ^[01]$ ]] || { echo "Credential journal timer state is invalid." >&2; return 1; }
  printf '%s\n' "$value"
}

pilot_journal_restore_files() {
  local journal_dir="$1"
  shift
  local target backup temporary
  pilot_journal_assert_directory "$journal_dir"
  pilot_journal_assert_directory "$journal_dir/files"
  for target in "$@"; do
    pilot_journal_assert_file "$target"
    backup="$journal_dir/files/$(basename "$target")"
    pilot_journal_assert_file "$backup"
    temporary="$(mktemp "${target}.restore.XXXXXX")"
    cp --reflink=never -- "$backup" "$temporary"
    chown root:root "$temporary"
    chmod 0600 "$temporary"
    sync -f "$temporary"
    mv -fT -- "$temporary" "$target"
    sync -f "$(dirname "$target")"
  done
}

pilot_journal_clear() {
  local journal_dir="$1"
  local parent clearing
  pilot_journal_assert_directory "$journal_dir"
  parent="$(dirname "$journal_dir")"
  clearing="${journal_dir}.clearing.$$"
  [[ ! -e "$clearing" && ! -L "$clearing" ]] || return 1
  mv -T -- "$journal_dir" "$clearing"
  sync -f "$parent"
  find "$clearing" -xdev -type f -exec shred -u -- {} + 2>/dev/null || true
  rm -rf -- "$clearing"
  sync -f "$parent"
}
