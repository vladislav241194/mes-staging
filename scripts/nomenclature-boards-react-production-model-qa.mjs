import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-nomenclature-boards-model-"));
try {
  const nomenclatureOutput = join(temporaryRoot, "nomenclature-adapter.mjs");
  const boardsOutput = join(temporaryRoot, "boards-adapter.mjs");
  const nomenclatureAdapterPath = new URL("../experiments/react-migration/src/modules/nomenclature/adapter.ts", import.meta.url);
  const nomenclatureProductionPath = new URL("../experiments/react-migration/src/modules/nomenclature/production-model.ts", import.meta.url);
  const boardsAdapterPath = new URL("../experiments/react-migration/src/modules/boards/adapter.ts", import.meta.url);
  const boardsProductionPath = new URL("../experiments/react-migration/src/modules/boards/production-model.ts", import.meta.url);
  await Promise.all([
    build({ entryPoints: [nomenclatureAdapterPath.pathname], outfile: nomenclatureOutput, bundle: true, platform: "node", format: "esm", target: "node20", logLevel: "silent" }),
    build({ entryPoints: [boardsAdapterPath.pathname], outfile: boardsOutput, bundle: true, platform: "node", format: "esm", target: "node20", logLevel: "silent" }),
  ]);
  const [{ adaptNomenclatureReadModel }, { adaptBoardsModel }] = await Promise.all([
    import(`${pathToFileURL(nomenclatureOutput).href}?qa=${Date.now()}`),
    import(`${pathToFileURL(boardsOutput).href}?qa=${Date.now()}`),
  ]);

  const directory = {
    nomenclatureTypes: [
      { id: "type-rea", name: "РЭА компоненты", code: "REA", status: "Активен" },
      { id: "type-pcb", name: "Печатные платы", code: "PCB", status: "Активен" },
      { id: "type-old", name: "Архив", status: "Архив" },
    ],
    nomenclature: [
      { id: "rea-1", name: "Резистор 10 кОм", article: "R-10K", type: "РЭА", package: "0603", manufacturer: "Yageo", status: "Активен", ownerMarker: "keep" },
      { id: "pcb-1", name: "Плата управления", article: "PCB-1", type: "Печатные платы", package: "PCB", status: "Черновик" },
    ],
    bomLists: [
      {
        id: "board-1",
        name: "Плата управления",
        boardCode: "PCB-1",
        resultItem: "Смонтированная плата",
        status: "Активен",
        importHeaders: ["№", "Описание", "Обозначение", "Аритикул производителя", "Производитель", "Корпус", "Кол-во", "Примечание", "Поле I"],
        importRows: [{ nomenclatureId: "rea-1", values: [1, "Резистор", "R1-R4", "R-10K", "Yageo", 603, "4", "", ""] }],
      },
      { id: "board-2", name: "Плата питания", c0805: 3, status: "Черновик" },
    ],
    specifications: [{
      id: "spec-1",
      bomListA: "board-1",
      structureItems: [{ id: "structure-1", nomenclatureId: "rea-1", bomListId: "board-1" }],
    }],
  };

  const nomenclature = adaptNomenclatureReadModel({
    productionModel: { directory, systemDomains: { registries: {} }, ui: { activeNomenclatureId: "rea-1" } },
    capabilities: { create: true, edit: true, delete: true, employeeElevation: false },
  });
  assert.deepEqual(nomenclature.items.map((item) => item.id), ["rea-1", "pcb-1"]);
  assert.equal(nomenclature.items[0]?.type, "РЭА компоненты");
  assert.equal(nomenclature.items[0]?.baseline.ownerMarker, "keep", "owner baseline must survive typed projection");
  assert.deepEqual(nomenclature.types.map((type) => type.label), ["РЭА компоненты", "Печатные платы"]);
  assert.equal(nomenclature.boardCount, 2);
  assert.deepEqual(nomenclature.deleteUsageById["rea-1"], { specificationsCount: 1, bomRowsCount: 1 });
  assert.deepEqual([nomenclature.canCreate, nomenclature.canEdit, nomenclature.canDelete], [true, true, true]);

  const explicitUsage = adaptNomenclatureReadModel({
    productionModel: { directory },
    capabilities: { deleteUsageById: { "rea-1": { specificationsCount: 7, bomRowsCount: 8 } } },
  });
  assert.deepEqual(explicitUsage.deleteUsageById["rea-1"], { specificationsCount: 7, bomRowsCount: 8 }, "owner usage contract must override local derivation");

  const wrappedFixture = adaptNomenclatureReadModel({ model: directory, capabilities: { createEdit: true } });
  assert.equal(wrappedFixture.items.length, 2, "legacy {model} directory fixture must remain compatible");
  assert.equal(wrappedFixture.canCreate, true);
  assert.equal(adaptNomenclatureReadModel(directory).items.length, 2, "raw directory fixture must remain compatible");
  const finalNomenclatureFixture = adaptNomenclatureReadModel({ model: nomenclature, capabilities: { edit: true } });
  assert.equal(finalNomenclatureFixture.items[0]?.packageName, "0603", "final {model} Nomenclature fixture must preserve normalized fields");
  assert.equal(finalNomenclatureFixture.items[0]?.baseline.ownerMarker, "keep");

  const boards = adaptBoardsModel({
    productionModel: { directory, systemDomains: { registries: {} }, ui: { activeBomId: "board-2" } },
    capabilities: { createEdit: true, delete: true, bomImport: true, bomRowAdd: true, bomRowEdit: true, bomRowDelete: true },
  });
  assert.deepEqual(boards.boards.map((board) => board.id), ["board-1", "board-2"]);
  assert.equal(boards.selectedBoardId, "board-2");
  assert.equal(boards.boards[0]?.headers[3], "Артикул производителя");
  assert.deepEqual([boards.boards[0]?.rows[0]?.packageName, boards.boards[0]?.componentTotal], ["0603", 4]);
  assert.equal(boards.boards[1]?.componentTotal, 3, "legacy component counters must remain a read fallback");
  assert.deepEqual(boards.bomNomenclatureOptions, [{ id: "rea-1", label: "Резистор 10 кОм", meta: "R-10K · 0603" }]);
  assert.deepEqual(boards.deleteUsageById["board-1"], { specificationsCount: 1, bomRowsCount: 1 });
  assert.deepEqual([boards.canCreateEdit, boards.canDelete, boards.canImportBom, boards.canAddBomRows, boards.canEditBomRows, boards.canDeleteBomRows], [true, true, true, true, true, true]);

  const wrappedBoards = adaptBoardsModel({ model: directory, capabilities: { createEdit: true } });
  assert.equal(wrappedBoards.boards.length, 2, "legacy Boards {model} fixture must remain compatible");
  assert.equal(wrappedBoards.canCreateEdit, true);
  assert.equal(adaptBoardsModel(directory).boards.length, 2, "raw Boards directory fixture must remain compatible");
  const finalBoardsFixture = adaptBoardsModel({ model: boards, capabilities: { createEdit: true } });
  assert.equal(finalBoardsFixture.boards[0]?.rows[0]?.packageName, "0603", "final {model} Boards fixture must preserve normalized BOM rows");
  assert.equal(finalBoardsFixture.boards[1]?.componentTotal, 3);
  assert.equal(adaptBoardsModel({ productionModel: { directory }, capabilities: { createEdit: "true" } }).canCreateEdit, false, "production capabilities must fail closed unless strictly boolean");

  const sources = await Promise.all([
    readFile(nomenclatureAdapterPath, "utf8"),
    readFile(nomenclatureProductionPath, "utf8"),
    readFile(boardsAdapterPath, "utf8"),
    readFile(boardsProductionPath, "utf8"),
  ]);
  assert.doesNotMatch(
    sources.join("\n"),
    /src\/modules\/(nomenclature|products)\/render\.js|getNomenclatureReactModel|getBoardsReactModel/,
    "typed production adapters must not import or call legacy render-model builders",
  );

  console.log("Nomenclature + Boards React production model QA: OK");
  console.log("- productionModel.directory/ui, strict capabilities and derived usage: pass");
  console.log("- raw directory and legacy {model} fixture compatibility: pass");
  console.log("- no legacy Nomenclature/Boards renderer dependency: pass");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
