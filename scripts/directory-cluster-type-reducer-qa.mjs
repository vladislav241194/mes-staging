import assert from "node:assert/strict";

import {
  DIRECTORY_CLUSTER_TYPE_REDUCER_CONTRACT,
  applyNomenclatureTypeCommand,
  inspectNomenclatureTypeImpact,
  normalizeNomenclatureTypeName,
} from "./directory-cluster-type-reducer.mjs";

const clone = (value) => structuredClone(value);

function deepMarker(depth = 36) {
  const root = { marker: "deep-unrelated-data" };
  let cursor = root;
  for (let index = 0; index < depth; index += 1) {
    cursor.child = { index, preserved: true };
    cursor = cursor.child;
  }
  return root;
}

function fixture() {
  return {
    topLevelHidden: { source: "legacy", nested: deepMarker() },
    operationMap: [{ id: "op-a", hidden: { preserve: true } }],
    nomenclatureTypes: [
      { id: "type-mech", name: "Механика", code: "MECH", description: "Детали", status: "Активен", hidden: { owner: "legacy", rank: 1 } },
      { id: "type-rea", name: "РЭА компоненты", code: "REA", description: "Компоненты", status: "Активен", hidden: { owner: "legacy", rank: 2 } },
      { id: "type-archive", name: "Архивный тип", code: "OLD", status: "Отключен", hidden: "preserve" },
    ],
    nomenclature: [
      { id: "nom-a", name: "Корпус", type: " Механика ", hidden: { revision: 11 } },
      { id: "nom-b", name: "Крышка", type: "механика", hidden: { revision: 12 } },
      { id: "nom-c", name: "Резистор", type: "РЭА компоненты", hidden: { revision: 13 } },
      { id: "nom-untyped", name: "Черновик", type: "", hidden: { revision: 14 } },
    ],
    bomLists: [{ id: "bom-a", importRows: [], hidden: { byteStable: true } }],
    specifications: [
      {
        id: "spec-a",
        hidden: { preserve: "spec" },
        structureItems: [
          { id: "line-a", nomenclatureId: "nom-a", nomenclatureType: "МЕХАНИКА", hidden: { preserve: "line-a" } },
          { id: "line-b", nomenclatureId: "nom-c", nomenclatureType: "РЭА компоненты", hidden: { preserve: "line-b" } },
          { id: "line-empty", nomenclatureId: "", nomenclatureType: "", hidden: { preserve: "line-empty" } },
        ],
      },
      { id: "spec-no-structure", hidden: { preserve: true } },
    ],
    componentTypes: [{ id: "component-a", hidden: "untouched" }],
    statuses: [{ id: "status-a", name: "Активен" }],
  };
}

function assertInputByteStable(input, before, message) {
  assert.equal(JSON.stringify(input), before, message);
}

function applyFailureByteStable(directory, command, expectedCode) {
  const before = JSON.stringify(directory);
  const result = applyNomenclatureTypeCommand(directory, command);
  assert.equal(result.ok, false, `${expectedCode} must fail`);
  assert.equal(result.code, expectedCode);
  assert.equal(Object.hasOwn(result, "directory"), false, "Failure must not expose a candidate Directory");
  assertInputByteStable(directory, before, `${expectedCode} must leave the complete input byte-stable`);
  return result;
}

assert.deepEqual(DIRECTORY_CLUSTER_TYPE_REDUCER_CONTRACT.requiredDirectoryArrays, [
  "nomenclatureTypes",
  "nomenclature",
  "bomLists",
  "specifications",
]);
assert.equal(normalizeNomenclatureTypeName("  РЭА\t компоненты  "), "РЭА компоненты");

{
  const directory = fixture();
  const before = JSON.stringify(directory);
  const result = applyNomenclatureTypeCommand(directory, {
    kind: "create",
    itemId: " type-cable ",
    row: {
      id: "type-cable",
      name: "  Кабельные\n сборки  ",
      code: "CABLE",
      status: "Активен",
      hidden: { importedBy: "qa", nested: deepMarker(12) },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.row.id, "type-cable");
  assert.equal(result.row.name, "Кабельные сборки");
  assert.deepEqual(result.counts, {
    typeRowsCreated: 1,
    typeRowsUpdated: 0,
    typeRowsDeleted: 0,
    nomenclatureRowsRetyped: 0,
    specificationRowsRetyped: 0,
    totalReferencesRetyped: 0,
  });
  assert.deepEqual(result.directory.nomenclatureTypes.map((row) => row.id), ["type-mech", "type-rea", "type-archive", "type-cable"]);
  assert.equal(result.directory.nomenclatureTypes.at(-1).hidden.importedBy, "qa");
  assert.equal(JSON.stringify(result.directory.topLevelHidden), JSON.stringify(directory.topLevelHidden));
  assert.equal(JSON.stringify(result.directory.bomLists), JSON.stringify(directory.bomLists));
  assertInputByteStable(directory, before, "Create must not mutate its complete Directory input");
}

{
  const directory = fixture();
  const expectedRow = clone(directory.nomenclatureTypes[0]);
  const before = JSON.stringify(directory);
  const result = applyNomenclatureTypeCommand(directory, {
    kind: "update",
    itemId: "type-mech",
    expectedRow,
    row: { id: "type-mech", name: "  Механические   изделия ", description: "Новая подпись" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.row.id, "type-mech", "Update must preserve the stable id");
  assert.equal(result.row.code, "MECH", "Omitted legacy fields must survive a partial update");
  assert.deepEqual(result.row.hidden, { owner: "legacy", rank: 1 }, "Hidden type fields must survive update");
  assert.deepEqual(result.directory.nomenclatureTypes.map((row) => row.id), ["type-mech", "type-rea", "type-archive"]);
  assert.deepEqual(result.directory.nomenclature.map((row) => row.type), [
    "Механические изделия",
    "Механические изделия",
    "РЭА компоненты",
    "",
  ]);
  assert.deepEqual(result.directory.specifications[0].structureItems.map((row) => row.nomenclatureType), [
    "Механические изделия",
    "РЭА компоненты",
    "",
  ]);
  assert.equal(result.directory.nomenclature[0].hidden.revision, 11);
  assert.equal(result.directory.specifications[0].structureItems[0].hidden.preserve, "line-a");
  assert.equal(result.directory.specifications[1].structureItems, undefined, "Missing unrelated structure arrays must remain missing");
  assert.equal(result.counts.nomenclatureRowsRetyped, 2);
  assert.equal(result.counts.specificationRowsRetyped, 1);
  assert.equal(result.impact.before.counts.totalReferences, 3);
  assert.equal(result.impact.after.typeName, "Механические изделия");
  assertInputByteStable(directory, before, "Atomic rename must not mutate input before a server owner commits it");
}

{
  const directory = fixture();
  const expectedRow = clone(directory.nomenclatureTypes[0]);
  const preview = inspectNomenclatureTypeImpact(directory, "type-mech");
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.counts, { nomenclatureRows: 2, specificationRows: 1, totalReferences: 3 });
  assert.deepEqual(preview.references.nomenclature.map((row) => row.itemId), ["nom-a", "nom-b"]);
  assert.deepEqual(preview.references.specifications.map((row) => row.structureItemId), ["line-a"]);
  assert.match(preview.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  const fallbackExpectedRow = clone(directory.nomenclatureTypes[1]);
  const before = JSON.stringify(directory);
  const result = applyNomenclatureTypeCommand(directory, {
    kind: "delete",
    itemId: "type-mech",
    expectedRow,
    fallbackTypeId: "type-rea",
    fallbackExpectedRow,
    impactFingerprint: preview.fingerprint,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.directory.nomenclatureTypes.map((row) => row.id), ["type-rea", "type-archive"]);
  assert.deepEqual(result.directory.nomenclature.map((row) => row.type), [
    "РЭА компоненты",
    "РЭА компоненты",
    "РЭА компоненты",
    "",
  ]);
  assert.equal(result.directory.specifications[0].structureItems[0].nomenclatureType, "РЭА компоненты");
  assert.deepEqual(result.directory.nomenclatureTypes[0], fallbackExpectedRow, "Fallback row must remain byte-equivalent");
  assert.deepEqual(result.counts, {
    typeRowsCreated: 0,
    typeRowsUpdated: 0,
    typeRowsDeleted: 1,
    nomenclatureRowsRetyped: 2,
    specificationRowsRetyped: 1,
    totalReferencesRetyped: 3,
  });
  assert.deepEqual(result.fallback, { itemId: "type-rea", name: "РЭА компоненты" });
  assertInputByteStable(directory, before, "Delete cascade must not mutate its input");
}

{
  const directory = fixture();
  applyFailureByteStable(directory, {
    kind: "create",
    itemId: "type-rea-copy",
    row: { id: "type-rea-copy", name: " рэа   КОМПОНЕНТЫ " },
  }, "duplicate-type-name");
  applyFailureByteStable(directory, {
    kind: "create",
    itemId: "type-mech",
    row: { id: "type-mech", name: "Новый тип" },
  }, "duplicate-type-id");
  applyFailureByteStable(directory, {
    kind: "update",
    itemId: "type-mech",
    expectedRow: { ...clone(directory.nomenclatureTypes[0]), hidden: { owner: "changed", rank: 1 } },
    row: { id: "type-mech", name: "Механические изделия" },
  }, "type-row-conflict");
  applyFailureByteStable(directory, {
    kind: "update",
    itemId: "type-mech",
    expectedRow: clone(directory.nomenclatureTypes[0]),
    row: { id: "type-other", name: "Механические изделия" },
  }, "type-id-mismatch");
}

{
  const directory = fixture();
  const preview = inspectNomenclatureTypeImpact(directory, "type-mech");
  const baseDelete = {
    kind: "delete",
    itemId: "type-mech",
    expectedRow: clone(directory.nomenclatureTypes[0]),
    fallbackTypeId: "type-rea",
    fallbackExpectedRow: clone(directory.nomenclatureTypes[1]),
    impactFingerprint: preview.fingerprint,
  };
  applyFailureByteStable(directory, { ...baseDelete, fallbackTypeId: "type-mech", fallbackExpectedRow: clone(directory.nomenclatureTypes[0]) }, "fallback-type-is-target");
  applyFailureByteStable(directory, { ...baseDelete, fallbackTypeId: "missing", fallbackExpectedRow: { id: "missing", name: "Missing" } }, "fallback-type-invalid");
  applyFailureByteStable(directory, {
    ...baseDelete,
    fallbackTypeId: "type-archive",
    fallbackExpectedRow: clone(directory.nomenclatureTypes[2]),
  }, "fallback-type-inactive");
  applyFailureByteStable(directory, {
    ...baseDelete,
    fallbackExpectedRow: { ...clone(directory.nomenclatureTypes[1]), hidden: "stale" },
  }, "fallback-row-conflict");
  applyFailureByteStable(directory, { ...baseDelete, impactFingerprint: "sha256:stale" }, "type-impact-changed");

  const changedImpact = clone(directory);
  changedImpact.nomenclature.push({ id: "nom-late", name: "Concurrent row", type: "Механика", hidden: "preserve" });
  applyFailureByteStable(changedImpact, baseDelete, "type-impact-changed");
}

{
  const onlyType = fixture();
  onlyType.nomenclatureTypes = [clone(onlyType.nomenclatureTypes[0])];
  onlyType.nomenclature = onlyType.nomenclature.filter((row) => !row.type || /механика/iu.test(row.type));
  onlyType.specifications[0].structureItems = onlyType.specifications[0].structureItems.filter((row) => !row.nomenclatureType || /механика/iu.test(row.nomenclatureType));
  const preview = inspectNomenclatureTypeImpact(onlyType, "type-mech");
  applyFailureByteStable(onlyType, {
    kind: "delete",
    itemId: "type-mech",
    expectedRow: clone(onlyType.nomenclatureTypes[0]),
    fallbackTypeId: "anything",
    fallbackExpectedRow: { id: "anything", name: "Anything" },
    impactFingerprint: preview.fingerprint,
  }, "last-type-delete-forbidden");
}

{
  const dangling = fixture();
  dangling.nomenclature.push({ id: "nom-ghost", name: "Dangling", type: " Призрачный   тип ", hidden: { preserve: true } });
  dangling.specifications[0].structureItems.push({ id: "line-ghost", nomenclatureType: "ПРИЗРАЧНЫЙ ТИП", hidden: "preserve" });
  const before = JSON.stringify(dangling);
  const repair = applyNomenclatureTypeCommand(dangling, {
    kind: "create",
    itemId: "type-ghost",
    row: { id: "type-ghost", name: "Призрачный тип", status: "Активен", hidden: "new-row" },
  });
  assert.equal(repair.ok, true, "Creating the exact normalized missing type may repair dangling legacy references");
  assert.equal(repair.impact.after.counts.totalReferences, 2);
  assertInputByteStable(dangling, before, "Repairing dangling references must still be pure");

  const unrelatedUpdate = applyFailureByteStable(dangling, {
    kind: "update",
    itemId: "type-mech",
    expectedRow: clone(dangling.nomenclatureTypes[0]),
    row: { id: "type-mech", name: "Механика", description: "Unrelated update" },
  }, "dangling-type-reference");
  assert.equal(unrelatedUpdate.section, "nomenclature");
  assert.equal(unrelatedUpdate.itemId, "nom-ghost");
}

{
  const invalid = fixture();
  invalid.nomenclatureTypes.push({ id: "type-copy", name: "  МЕХАНИКА " });
  applyFailureByteStable(invalid, {
    kind: "create",
    itemId: "type-new",
    row: { id: "type-new", name: "Новый" },
  }, "duplicate-type-name");

  const incomplete = fixture();
  delete incomplete.bomLists;
  applyFailureByteStable(incomplete, {
    kind: "create",
    itemId: "type-new",
    row: { id: "type-new", name: "Новый" },
  }, "invalid-directory-projection");
}

console.log("Directory cluster Nomenclature type reducer QA passed.");
