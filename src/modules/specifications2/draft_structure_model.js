import { buildTreeTableVisualRows } from "../../ui/tree_table_visual.js";

const SPECIFICATIONS2_ASSEMBLY_TYPES = new Set(["се", "сборочная единица"]);

function normalizeKey(value) {
  return cleanText(value).toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}
function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractDesignation(value) {
  const text = cleanText(value).toUpperCase();
  return text.match(/[А-ЯЁA-Z]{2,}\.\d{6}\.\d{3}/)?.[0] || "";
}

function getSpecifications2DisplayLabel(value, explicitDesignation = "") {
  const label = cleanText(value);
  const designation = cleanText(explicitDesignation) || extractDesignation(label);
  if (!label || !designation) return label;
  if (normalizeKey(label) === normalizeKey(designation)) return label;
  const escapedDesignation = designation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutLeadingDesignation = label
    .replace(new RegExp(`^${escapedDesignation}(?:\\s*[·:;—–-]\\s*|\\s+)`, "i"), "")
    .trim();
  return withoutLeadingDesignation || label;
}
function isAssemblyType(value) {
  return SPECIFICATIONS2_ASSEMBLY_TYPES.has(normalizeKey(value));
}

export function createSpecifications2EditorRows(treeRows = []) {
  const visualRows = buildTreeTableVisualRows(treeRows || []);
  return visualRows.map((row, index) => ({
    id: String(row.treeVisualState?.id || row.selectionKey || row.nodeKey || `editor-row-${index + 1}`),
    parentId: String(row.treeVisualState?.parentId || ""),
    order: index,
    label: cleanText(row.label),
    designation: cleanText(row.designation),
    type: cleanText(row.type || "Компонент"),
    quantity: row.quantity ?? "",
    unitOfMeasure: cleanText(row.unitOfMeasure),
    source: cleanText(row.source),
    status: cleanText(row.status || "ok"),
    message: cleanText(row.message),
  }));
}

export function normalizeSpecifications2EditorRows(rows = []) {
  const normalized = (Array.isArray(rows) ? rows : []).filter(Boolean).map((row, index) => ({
    id: cleanText(row.id) || `editor-row-${index + 1}`,
    parentId: cleanText(row.parentId),
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
    label: cleanText(row.label),
    designation: cleanText(row.designation),
    type: cleanText(row.type || "Компонент"),
    quantity: row.quantity ?? "",
    unitOfMeasure: cleanText(row.unitOfMeasure),
    source: cleanText(row.source),
    status: cleanText(row.status || "ok"),
    message: cleanText(row.message),
  }));
  const ids = new Set(normalized.map((row) => row.id));
  const seen = new Set();
  return normalized.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    if (row.parentId && !ids.has(row.parentId)) row.parentId = "";
    return true;
  });
}

export function applySpecifications2EditorAction(sourceRows = [], action = {}) {
  const rows = normalizeSpecifications2EditorRows(sourceRows).map((row) => ({ ...row }));
  const indexById = new Map(rows.map((row, index) => [row.id, index]));
  const row = rows[indexById.get(String(action.id || ""))];
  const rootId = rows.find((item) => !item.parentId)?.id || "";
  const childrenOf = (parentId) => rows
    .filter((item) => item.parentId === parentId)
    .sort((left, right) => left.order - right.order || rows.indexOf(left) - rows.indexOf(right));
  const descendantsOf = (id) => {
    const found = [];
    const visit = (parentId) => childrenOf(parentId).forEach((child) => {
      if (found.includes(child.id)) return;
      found.push(child.id);
      visit(child.id);
    });
    visit(id);
    return found;
  };
  const resequence = (parentId) => childrenOf(parentId).forEach((item, index) => { item.order = index; });

  if (action.type === "update" && row) {
    Object.assign(row, sanitizeSpecifications2EditorValue(action.value, row));
  }

  if (action.type === "add" && row) {
    const parentId = action.mode === "sibling" ? row.parentId : row.id;
    const siblings = childrenOf(parentId);
    const value = sanitizeSpecifications2EditorValue(action.value, {});
    const id = cleanText(action.newId) || `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    rows.push({
      id,
      parentId,
      order: action.mode === "sibling" ? row.order + 1 : siblings.length,
      ...value,
      source: parentId ? rows.find((item) => item.id === parentId)?.label || "Добавлено вручную" : "Добавлено вручную",
      status: "ok",
      message: "",
    });
    if (action.mode === "sibling") {
      siblings.filter((item) => item.id !== row.id && item.order > row.order).forEach((item) => { item.order += 1; });
    }
    resequence(parentId);
  }

  if ((action.type === "up" || action.type === "down") && row) {
    const siblings = childrenOf(row.parentId);
    const index = siblings.findIndex((item) => item.id === row.id);
    const target = siblings[index + (action.type === "up" ? -1 : 1)];
    if (target) [row.order, target.order] = [target.order, row.order];
    resequence(row.parentId);
  }

  if (action.type === "indent" && row && row.id !== rootId) {
    const siblings = childrenOf(row.parentId);
    const index = siblings.findIndex((item) => item.id === row.id);
    const previous = siblings[index - 1];
    if (previous) {
      const oldParentId = row.parentId;
      row.parentId = previous.id;
      row.order = childrenOf(previous.id).length;
      resequence(oldParentId);
      resequence(previous.id);
    }
  }

  if (action.type === "outdent" && row && row.id !== rootId && row.parentId) {
    const parent = rows.find((item) => item.id === row.parentId);
    if (parent) {
      const oldParentId = row.parentId;
      const nextParentId = parent.parentId;
      row.parentId = nextParentId;
      row.order = parent.order + 1;
      childrenOf(nextParentId).filter((item) => item.id !== row.id && item.order > parent.order).forEach((item) => { item.order += 1; });
      resequence(oldParentId);
      resequence(nextParentId);
    }
  }

  if (action.type === "reparent" && row && row.id !== rootId) {
    const parentId = cleanText(action.parentId);
    const forbidden = new Set([row.id, ...descendantsOf(row.id)]);
    if (indexById.has(parentId) && !forbidden.has(parentId)) {
      const oldParentId = row.parentId;
      row.parentId = parentId;
      row.order = childrenOf(parentId).length;
      resequence(oldParentId);
      resequence(parentId);
    }
  }

  if (action.type === "remove" && row && row.id !== rootId) {
    const removeIds = new Set([row.id, ...descendantsOf(row.id)]);
    const parentId = row.parentId;
    const kept = rows.filter((item) => !removeIds.has(item.id));
    const normalizedKept = normalizeSpecifications2EditorRows(kept);
    normalizedKept.filter((item) => item.parentId === parentId)
      .sort((left, right) => left.order - right.order)
      .forEach((item, index) => { item.order = index; });
    return normalizedKept;
  }

  return normalizeSpecifications2EditorRows(rows);
}

export function removeSpecifications2EditorBranch(sourceRows = [], rowId = "") {
  const rows = normalizeSpecifications2EditorRows(sourceRows).map((row) => ({ ...row }));
  const id = cleanText(rowId).replace(/::\d+$/, "");
  const row = rows.find((item) => item.id === id);
  const rootId = rows.find((item) => !item.parentId)?.id || "";
  if (!row || row.id === rootId) return rows;

  const removeIds = new Set([row.id]);
  let changed = true;
  while (changed) {
    changed = false;
    rows.forEach((item) => {
      if (!removeIds.has(item.id) && removeIds.has(item.parentId)) {
        removeIds.add(item.id);
        changed = true;
      }
    });
  }

  const kept = rows.filter((item) => !removeIds.has(item.id));
  const siblings = kept
    .filter((item) => item.parentId === row.parentId)
    .sort((left, right) => left.order - right.order);
  siblings.forEach((item, index) => { item.order = index; });
  return normalizeSpecifications2EditorRows(kept);
}

function sanitizeSpecifications2EditorValue(value = {}, fallback = {}) {
  return {
    label: cleanText(value.label ?? fallback.label),
    designation: cleanText(value.designation ?? fallback.designation),
    type: cleanText(value.type ?? fallback.type ?? "Компонент"),
    quantity: value.quantity ?? fallback.quantity ?? "",
    unitOfMeasure: cleanText(value.unitOfMeasure ?? fallback.unitOfMeasure),
  };
}

export function buildSpecifications2EditorAnalysis(sourceRows = []) {
  const rows = normalizeSpecifications2EditorRows(sourceRows);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map();
  rows.forEach((row) => {
    const list = children.get(row.parentId) || [];
    list.push(row);
    children.set(row.parentId, list);
  });
  children.forEach((list) => list.sort((left, right) => left.order - right.order));
  const flat = [];
  const visited = new Set();
  const append = (row, level, path = new Set()) => {
    if (!row || visited.has(row.id) || path.has(row.id)) return;
    visited.add(row.id);
    const nextPath = new Set(path);
    nextPath.add(row.id);
    const parent = byId.get(row.parentId);
    flat.push({
      id: row.id,
      selectionKey: `edit:${row.id}`,
      nodeKey: row.id,
      parentKey: row.parentId,
      level,
      levelLabel: level === 0 ? "изделие" : "позиция",
      label: row.label,
      designation: row.designation,
      type: row.type,
      quantity: row.quantity,
      unitOfMeasure: row.unitOfMeasure,
      source: parent?.label || row.source || (level === 0 ? "верхний уровень" : "Редактор"),
      status: row.label && row.type ? "ok" : "error",
      message: row.label && row.type ? "" : "Заполните наименование и тип",
    });
    (children.get(row.id) || []).forEach((child) => append(child, level + 1, nextPath));
  };
  (children.get("") || []).forEach((root) => append(root, 0));
  rows.filter((row) => !visited.has(row.id)).forEach((row) => append(row, 0));

  const graphNodes = flat.map((row) => ({
    selectionKey: row.selectionKey,
    nodeKey: row.nodeKey,
    parentKey: row.parentKey,
    parentLabel: byId.get(row.parentKey)?.label || "",
    diagramRow: 1,
    label: row.label,
    type: row.type,
    meta: row.designation || row.source,
    quantity: row.quantity,
    unitOfMeasure: row.unitOfMeasure,
    source: row.source,
    status: row.status,
  }));
  const graphEdges = flat.filter((row) => row.parentKey).map((row) => ({
    edgeKey: `${row.parentKey}->${row.nodeKey}`,
    from: row.parentKey,
    to: row.nodeKey,
    row: "",
    type: row.type,
  }));
  const maxLevel = Math.max(0, ...flat.map((row) => Number(row.level || 0)));
  const diagramLevels = Array.from({ length: maxLevel + 1 }, (_, level) => ({
    label: level === 0 ? "Корень" : `Уровень ${level}`,
    nodes: graphNodes.filter((node) => flat.find((row) => row.nodeKey === node.nodeKey)?.level === level),
  }));
  const errors = flat.filter((row) => row.status === "error").map((row) => ({
    severity: "error",
    title: "Неполные данные редактора",
    message: `Проверьте элемент «${row.label || "Без названия"}».`,
    row: "",
  }));
  return {
    title: flat[0]?.label || "Спецификация",
    treeRows: flat,
    graphNodes,
    graphEdges,
    diagramLevels,
    errors,
    stats: {
      rows: flat.length,
      sections: Math.max(1, flat.filter((row) => isAssemblyType(row.type)).length),
      nodes: graphNodes.length,
      edges: graphEdges.length,
      types: new Set(flat.map((row) => row.type)).size,
      typeList: [...new Set(flat.map((row) => row.type))].slice(0, 4).join(", "),
      assemblyWarnings: errors.length,
    },
  };
}

export function getSpecifications2ManufacturedItems(treeRows = []) {
  const seen = new Set();
  return (Array.isArray(treeRows) ? treeRows : []).flatMap((row) => {
    const designation = cleanText(row.designation) || extractDesignation(row.label);
    if (!designation) return [];
    const key = cleanText(row.nodeKey || row.id || row.selectionKey || designation);
    const uniqueKey = normalizeKey(designation);
    if (seen.has(uniqueKey)) return [];
    seen.add(uniqueKey);
    return [{
      key,
      label: getSpecifications2DisplayLabel(row.label, designation) || designation,
      designation,
      type: cleanText(row.type || "Изделие"),
    }];
  });
}
