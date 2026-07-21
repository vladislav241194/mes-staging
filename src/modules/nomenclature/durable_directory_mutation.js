function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sameRow(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function fail(code, message) {
  return { ok: false, code, message };
}

export function parseCompleteDirectoryProjection(rawValue, requiredSectionIds = []) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return fail("invalid-directory-projection", "Сервер вернул пустую или нестроковую проекцию справочников.");
  }
  let directory;
  try {
    directory = JSON.parse(rawValue);
  } catch {
    return fail("invalid-directory-projection", "Сервер вернул повреждённую JSON-проекцию справочников.");
  }
  if (!isRecord(directory)) {
    return fail("invalid-directory-projection", "Сервер вернул неполную проекцию справочников.");
  }
  const required = [...new Set(requiredSectionIds.map((sectionId) => String(sectionId || "").trim()).filter(Boolean))];
  if (!required.length || required.some((sectionId) => !Object.prototype.hasOwnProperty.call(directory, sectionId))) {
    return fail("invalid-directory-projection", "В серверной проекции отсутствуют обязательные разделы справочников.");
  }
  const invalidSectionId = required.find((sectionId) => !Array.isArray(directory[sectionId]));
  if (invalidSectionId) {
    return fail("invalid-directory-projection", `Раздел ${invalidSectionId} не является полным массивом записей.`);
  }
  const nomenclatureIds = new Set();
  for (const row of directory.nomenclature) {
    const rowId = isRecord(row) ? String(row.id || "").trim() : "";
    if (!rowId || nomenclatureIds.has(rowId)) {
      return fail("invalid-directory-projection", "Серверная номенклатура содержит запись без уникального идентификатора.");
    }
    nomenclatureIds.add(rowId);
  }
  return { ok: true, directory };
}

function unlinkNomenclatureReferences(directory, itemId) {
  const bomLists = directory.bomLists.map((bom) => {
    if (!isRecord(bom)) return bom;
    if (Array.isArray(bom.importRows)) {
      return { ...bom, importRows: bom.importRows.map((row) => (
        isRecord(row) && String(row.nomenclatureId || "") === itemId ? { ...row, nomenclatureId: "" } : row
      )) };
    }
    if (Array.isArray(bom.items)) {
      return { ...bom, items: bom.items.map((row) => (
        isRecord(row) && String(row.nomenclatureId || "") === itemId ? { ...row, nomenclatureId: "" } : row
      )) };
    }
    return bom;
  });
  const specifications = directory.specifications.map((specification) => (
    isRecord(specification) && Array.isArray(specification.structureItems)
      ? {
        ...specification,
        structureItems: specification.structureItems.map((row) => (
          isRecord(row) && String(row.nomenclatureId || "") === itemId ? { ...row, nomenclatureId: "" } : row
        )),
      }
      : specification
  ));
  return { ...directory, bomLists, specifications };
}

export function applyNomenclatureDirectoryMutation(directory, intent = {}) {
  if (!isRecord(directory) || !Array.isArray(directory.nomenclature)) {
    return fail("invalid-directory-projection", "Серверная проекция номенклатуры недоступна.");
  }
  const kind = String(intent.kind || "");
  const itemId = String(intent.itemId || intent.row?.id || "").trim();
  if (!itemId) return fail("invalid-intent", "Команда номенклатуры не содержит идентификатор записи.");
  const rowIndex = directory.nomenclature.findIndex((row) => String(row?.id || "") === itemId);
  if (isRecord(intent.typeRow)) {
    return fail("type-owner-required", "Создание раздела номенклатуры требует отдельной команды владельца справочника.");
  }
  const typeName = String(intent.row?.type || "").trim().toLocaleLowerCase("ru-RU");
  if (["create", "update"].includes(kind) && (!typeName || !directory.nomenclatureTypes.some((row) => (
    String(row?.name || "").trim().toLocaleLowerCase("ru-RU") === typeName
  )))) {
    return fail("unknown-nomenclature-type", "Выбранный раздел номенклатуры отсутствует на сервере. Обновите данные или создайте раздел отдельной командой.");
  }

  if (kind === "create") {
    if (!isRecord(intent.row)) return fail("invalid-intent", "Команда создания не содержит запись номенклатуры.");
    if (rowIndex >= 0) return fail("same-row-conflict", "Эта позиция уже была создана другим пользователем. Обновите данные.");
    return { ok: true, directory: { ...directory, nomenclature: [...directory.nomenclature, intent.row] }, row: intent.row };
  }

  if (!["update", "delete"].includes(kind) || !isRecord(intent.expectedRow)) {
    return fail("invalid-intent", "Команда изменения не содержит исходную версию записи.");
  }
  if (rowIndex < 0 || !sameRow(directory.nomenclature[rowIndex], intent.expectedRow)) {
    return fail("same-row-conflict", "Эта позиция уже изменена другим пользователем. Обновите данные и повторите команду.");
  }
  if (kind === "update") {
    if (!isRecord(intent.row) || String(intent.row.id || "") !== itemId) {
      return fail("invalid-intent", "Команда изменения содержит некорректную запись номенклатуры.");
    }
    // The form owns only its explicit editable fields. Preserve any
    // server-only/forward-compatible fields from the freshly fetched row;
    // replacing it with the form DTO would silently erase unknown data.
    const nextRow = { ...directory.nomenclature[rowIndex], ...intent.row, id: itemId };
    return {
      ok: true,
      directory: {
        ...directory,
        nomenclature: directory.nomenclature.map((row, index) => index === rowIndex ? nextRow : row),
      },
      row: nextRow,
    };
  }
  const withoutRow = {
    ...directory,
    nomenclature: directory.nomenclature.filter((_, index) => index !== rowIndex),
  };
  return { ok: true, directory: unlinkNomenclatureReferences(withoutRow, itemId), row: directory.nomenclature[rowIndex] };
}
