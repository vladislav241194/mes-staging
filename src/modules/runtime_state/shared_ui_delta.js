function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// Shared UI is a small JSON-only projection. Keep a separate server baseline
// so two tabs can send only the map entries each one actually changed instead
// of treating a stale complete UI object as authoritative.
export function cloneSharedUiSnapshot(value) {
  return isRecord(value) ? cloneJson(value) : {};
}

const MAP_VALUE_KEYS = new Set([
  "ganttDependencyRoutes",
  "productionStructureMatrixOverrides",
  "timesheetCellOverrides",
  "timesheetScheduleOverrides",
  "shiftMasterBoardLaneBySlot",
  "shiftMasterBoardAssignments",
  "shiftMasterBoardFacts",
  "shiftMasterBoardCarryovers",
  "shiftMasterAssignmentMatrix",
  "accessRoleAssignments",
]);

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function asMap(value) {
  return isRecord(value) ? value : {};
}

function profilesById(value) {
  if (!Array.isArray(value)) return null;
  const entries = value.map((profile) => [String(profile?.id || "").trim(), profile]);
  if (entries.some(([id, profile]) => !id || !isRecord(profile))) return null;
  const ids = entries.map(([id]) => id);
  if (new Set(ids).size !== ids.length) return null;
  return Object.fromEntries(entries);
}

// `replace` is deliberately reserved for the array-valued role profiles and
// explicit tombstones. The operational maps use entry-level set/remove
// changes, so a retry against a newer server state cannot restore an unrelated
// stale entry from the same top-level field.
export function getSharedUiPatch(base, next) {
  const previous = cloneSharedUiSnapshot(base);
  const current = cloneSharedUiSnapshot(next);
  const maps = {};
  const profiles = { set: {}, remove: [] };
  const replace = {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  for (const key of keys) {
    const hasPrevious = Object.prototype.hasOwnProperty.call(previous, key);
    const hasCurrent = Object.prototype.hasOwnProperty.call(current, key);
    if (!hasCurrent) {
      if (hasPrevious) replace[key] = null;
      continue;
    }
    if (key === "accessRoleProfiles") {
      const beforeProfiles = profilesById(previous[key]);
      const afterProfiles = profilesById(current[key]);
      if (!beforeProfiles || !afterProfiles) {
        if (!hasPrevious || !valuesEqual(previous[key], current[key])) replace[key] = cloneJson(current[key]);
        continue;
      }
      const profileIds = new Set([...Object.keys(beforeProfiles), ...Object.keys(afterProfiles)]);
      profileIds.forEach((profileId) => {
        if (!Object.prototype.hasOwnProperty.call(afterProfiles, profileId)) profiles.remove.push(profileId);
        else if (!Object.prototype.hasOwnProperty.call(beforeProfiles, profileId)
          || !valuesEqual(beforeProfiles[profileId], afterProfiles[profileId])) profiles.set[profileId] = cloneJson(afterProfiles[profileId]);
      });
      continue;
    }
    if (current[key] === null || !MAP_VALUE_KEYS.has(key) || !isRecord(current[key])) {
      if (!hasPrevious || !valuesEqual(previous[key], current[key])) replace[key] = cloneJson(current[key]);
      continue;
    }
    const before = asMap(previous[key]);
    const after = asMap(current[key]);
    const set = {};
    const remove = [];
    const entryKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    entryKeys.forEach((entryKey) => {
      const hadBefore = Object.prototype.hasOwnProperty.call(before, entryKey);
      const hasAfter = Object.prototype.hasOwnProperty.call(after, entryKey);
      if (!hasAfter) {
        if (hadBefore) remove.push(entryKey);
      } else if (!hadBefore || !valuesEqual(before[entryKey], after[entryKey])) {
        set[entryKey] = cloneJson(after[entryKey]);
      }
    });
    if (Object.keys(set).length || remove.length) maps[key] = { set, remove };
  }
  return {
    maps,
    profiles: Object.keys(profiles.set).length || profiles.remove.length ? profiles : undefined,
    replace,
  };
}

export function hasSharedUiPatchChanges(patch = {}) {
  if (Object.keys(isRecord(patch?.maps) ? patch.maps : {}).length) return true;
  if (Object.keys(isRecord(patch?.replace) ? patch.replace : {}).length) return true;
  const profileChanges = isRecord(patch?.profiles) ? patch.profiles : {};
  return Object.keys(isRecord(profileChanges.set) ? profileChanges.set : {}).length > 0
    || (Array.isArray(profileChanges.remove) && profileChanges.remove.length > 0);
}

export function applySharedUiPatch(base, patch) {
  const next = cloneSharedUiSnapshot(base);
  const changes = isRecord(patch?.replace) ? patch.replace : {};
  Object.entries(changes).forEach(([key, value]) => {
    if (value === null) delete next[key];
    else next[key] = cloneJson(value);
  });
  const mapChanges = isRecord(patch?.maps) ? patch.maps : {};
  Object.entries(mapChanges).forEach(([key, change]) => {
    if (!MAP_VALUE_KEYS.has(key) || !isRecord(change)) return;
    const map = { ...asMap(next[key]) };
    const remove = Array.isArray(change.remove) ? change.remove : [];
    remove.forEach((entryKey) => { delete map[String(entryKey)]; });
    const set = isRecord(change.set) ? change.set : {};
    Object.entries(set).forEach(([entryKey, value]) => { map[entryKey] = cloneJson(value); });
    next[key] = map;
  });
  const profileChanges = isRecord(patch?.profiles) ? patch.profiles : null;
  if (profileChanges) {
    const remove = Array.isArray(profileChanges.remove) ? new Set(profileChanges.remove.map((profileId) => String(profileId))) : new Set();
    const set = isRecord(profileChanges.set) ? profileChanges.set : {};
    const profiles = Array.isArray(next.accessRoleProfiles)
      ? next.accessRoleProfiles.filter((profile) => !remove.has(String(profile?.id || ""))).map((profile) => cloneJson(profile))
      : [];
    const indexes = new Map(profiles.map((profile, index) => [String(profile?.id || ""), index]).filter(([profileId]) => profileId));
    Object.entries(set).forEach(([profileId, profile]) => {
      const index = indexes.get(profileId);
      if (index === undefined) profiles.push(cloneJson(profile));
      else profiles[index] = cloneJson(profile);
    });
    next.accessRoleProfiles = profiles;
  }
  return next;
}

// A full domain write may be retried after a compact UI write from another
// browser. The server returns the merged UI projection; rebase only edits
// made locally after the full payload was captured, so remote map entries are
// not mistaken for local removals by the next UI-only save.
export function rebaseSharedUiAfterFullWrite(serverSharedUi, capturedSharedUi, currentSharedUi = capturedSharedUi) {
  return applySharedUiPatch(
    serverSharedUi,
    getSharedUiPatch(capturedSharedUi, currentSharedUi),
  );
}
