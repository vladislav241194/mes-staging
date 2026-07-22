const SPECIFICATIONS2_ASSEMBLY_TYPES = new Set(["се", "сборочная единица"]);
const SPECIFICATIONS2_ROOT_LABEL = "нет";

export function analyzeSpecifications2Workbook(workbook) {
  const sheet = workbook.sheets[0];
  const header = detectHeader(sheet.rows);
  if (!header) throw new Error("не найдена строка заголовков шаблона");

  const rows = sheet.rows
    .filter((row) => row.index > header.rowIndex)
    .map((row) => normalizeSpecifications2Row(row, header))
    .filter((row) => row.product || row.unit || row.name);
  if (!rows.length) throw new Error("после заголовка нет строк спецификации");

  return buildSpecifications2Analysis(rows, sheet, header);
}

function detectHeader(rows) {
  for (const row of rows) {
    const columns = {};
    Object.entries(row.cells).forEach(([column, cell]) => {
      const key = resolveSpecifications2HeaderKey(normalizeHeader(cell.value));
      if (key) columns[key] = column;
    });
    const requiredKeys = ["index", "specification", "applicability", "type", "name", "unitOfMeasure", "quantity"];
    if (requiredKeys.every((key) => columns[key])) return { rowIndex: row.index, columns };
  }
  return null;
}

function resolveSpecifications2HeaderKey(normalized) {
  if (["№", "no", "номер"].map(normalizeHeader).includes(normalized)) return "index";
  if (normalized === "спецификации (се)" || normalized === "спецификация (се)") return "specification";
  if (normalized === "применяемость") return "applicability";
  if (normalized === "тип компонента") return "type";
  if (normalized.includes("наименование") || normalized === "обозначение") return "name";
  if (normalized.includes("ед. изм") || normalized.includes("ед изм") || normalized.includes("единица")) return "unitOfMeasure";
  if (normalized.includes("кол-во") || normalized.includes("количество")) return "quantity";
  return "";
}

function normalizeSpecifications2Row(row, header) {
  const cell = (key) => {
    const column = header.columns[key];
    return column ? row.cells[column]?.value ?? "" : "";
  };
  return {
    row: row.index,
    index: cell("index"),
    product: cleanText(cell("applicability")),
    unit: cleanText(cell("specification")),
    type: cleanText(cell("type")),
    name: cleanText(cell("name")),
    unitOfMeasure: cleanText(cell("unitOfMeasure")),
    quantity: cell("quantity"),
    formulas: Object.values(row.cells).filter((item) => item.formula).map((item) => ({ ref: item.ref, formula: item.formula, value: item.value })),
  };
}

function buildSpecifications2Analysis(rows, sheet, header) {
  const sections = buildSectionIndex(rows);
  const graph = buildGraph(rows, sections);
  const continuity = inspectContinuity(rows, sections, graph);
  const treeRows = buildTreeRows(rows, graph, continuity);
  const diagramLevels = buildDiagramLevels(graph, continuity);
  const graphNodes = buildGraphNodes(graph, continuity);
  const typeCounts = countBy(rows.map((row) => row.type || "Без типа"));
  const title = detectRootTitle(rows) || rows[0]?.product || "Спецификация XLSX";

  return {
    title,
    rows,
    treeRows,
    diagramLevels,
    graphNodes,
    graphEdges: graph.edges.map((edge) => ({ ...edge })),
    errors: continuity.errors,
    stats: {
      rows: rows.length,
      sections: sections.length,
      nodes: graph.nodes.size,
      edges: graph.edges.length,
      types: typeCounts.size,
      typeList: [...typeCounts.keys()].slice(0, 4).join(", "),
      assemblyWarnings: continuity.errors.filter((item) => item.severity !== "error").length,
    },
    diagnostics: {
      sheetName: sheet.name,
      headerRow: header.rowIndex,
      formulas: sheet.formulas,
    },
  };
}

function buildSectionIndex(rows) {
  const sectionMap = new Map();
  rows.forEach((row) => {
    const product = row.product || SPECIFICATIONS2_ROOT_LABEL;
    const unit = row.unit || "";
    const key = `${normalizeKey(product)}::${normalizeKey(unit)}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, {
        key,
        product,
        unit,
        rows: [],
      });
    }
    sectionMap.get(key).rows.push(row);
  });
  return [...sectionMap.values()];
}

function buildGraph(rows, sections) {
  const nodes = new Map();
  const edges = [];
  const ensureNode = (label, type = "Объект", source = "") => {
    const key = normalizeNodeKey(label);
    if (!key) return null;
    if (!nodes.has(key)) {
      nodes.set(key, {
        key,
        label,
        designation: extractDesignation(label),
        type,
        source,
      });
    }
    return nodes.get(key);
  };
  const addEdge = (fromLabel, toLabel, type, row = null) => {
    const from = ensureNode(fromLabel, fromLabel === SPECIFICATIONS2_ROOT_LABEL ? "Корень" : "Изделие");
    const to = ensureNode(toLabel, type, row ? `строка ${row.row}` : "");
    if (!from || !to || from.key === to.key) return;
    const edgeKey = `${from.key}->${to.key}`;
    const existingEdge = edges.find((edge) => edge.edgeKey === edgeKey);
    if (existingEdge) {
      if (row && !existingEdge.row) {
        existingEdge.row = row.row || "";
      }
      return;
    }
    edges.push({ edgeKey, from: from.key, to: to.key, row: row?.row || "", type });
  };

  sections.forEach((section) => {
    if (isSyntheticRoot(section.product)) {
      ensureNode(section.unit, "Изделие", "верхний уровень");
      return;
    }
    addEdge(section.product, section.unit, "Узел");
  });
  sections.forEach((section) => {
    section.rows.forEach((row) => {
      addEdge(row.unit, row.name, row.type || "Позиция", row);
    });
  });

  return { nodes, edges };
}

function inspectContinuity(rows, sections, graph) {
  const errors = [];
  const designationToLabels = new Map();
  graph.nodes.forEach((node) => {
    if (!node.designation) return;
    const list = designationToLabels.get(node.designation) || [];
    list.push(node.label);
    designationToLabels.set(node.designation, list);
  });
  sections.forEach((section) => {
    if (isSyntheticRoot(section.product)) return;
    const productKey = normalizeNodeKey(section.product);
    const isReferenced = rows.some((row) => normalizeNodeKey(row.name) === productKey || normalizeNodeKey(row.unit) === productKey);
    if (!isReferenced) {
      errors.push({
        severity: "error",
        title: "Раздел не подключен к верхнему уровню",
        message: `Изделие "${section.product}" имеет строки, но не найдено как узел или позиция в другой части шаблона.`,
        row: section.rows[0]?.row || "",
      });
    }
  });

  rows.forEach((row) => {
    ["product", "unit", "type", "name", "unitOfMeasure"].forEach((field) => {
      if (!row[field] && field !== "product") {
        errors.push({
          severity: "error",
          title: "Пустое обязательное поле",
          message: `В строке не заполнено поле "${field}".`,
          row: row.row,
        });
      }
    });
    if (row.quantity === "" || row.quantity == null) {
      errors.push({
        severity: "error",
        title: "Не указано количество",
        message: "Колонка Кол-во на изделие пустая.",
        row: row.row,
      });
    }

    if (!isAssemblyType(row.type)) return;
    const itemKey = normalizeNodeKey(row.name);
    const designation = extractDesignation(row.name);
    const hasExactSection = sections.some((section) => normalizeNodeKey(section.product) === itemKey || normalizeNodeKey(section.unit) === itemKey);
    if (hasExactSection) return;
    const designationMatches = designation ? (designationToLabels.get(designation) || []).filter((label) => normalizeNodeKey(label) !== itemKey) : [];
    if (designationMatches.length) {
      errors.push({
        severity: "warning",
        title: "Сборочная позиция совпадает только по обозначению",
        message: `"${row.name}" не совпадает текстом с разделом, но найдено похожее обозначение: ${designationMatches[0]}. Возможна ошибка написания.`,
        row: row.row,
      });
      return;
    }
    errors.push({
      severity: "warning",
      title: "Сборочная позиция не раскрывается",
      message: `"${row.name}" не найдена как отдельный раздел или узел. Если это вложенная сборка, цепочка будет оборвана.`,
      row: row.row,
    });
  });

  const rowStatus = new Map();
  errors.forEach((error) => {
    if (!error.row) return;
    const current = rowStatus.get(Number(error.row));
    if (current === "error") return;
    rowStatus.set(Number(error.row), error.severity === "error" ? "error" : "warning");
  });

  return { errors, rowStatus };
}

function buildTreeRows(rows, graph, continuity) {
  const rowByNumber = new Map(rows.map((row) => [Number(row.row), row]));
  const incoming = new Set(graph.edges.map((edge) => edge.to));
  const outgoing = new Map();
  graph.edges.forEach((edge) => {
    const list = outgoing.get(edge.from) || [];
    list.push(edge);
    outgoing.set(edge.from, list);
  });
  const roots = [...graph.nodes.values()].filter((node) => !incoming.has(node.key));
  const fallbackRoots = roots.length ? roots : [...graph.nodes.values()].slice(0, 1);
  const result = [];

  const appendNode = (node, edge = null, level = 0, parentKey = "", path = new Set()) => {
    if (!node || path.has(node.key)) return;
    const nextPath = new Set(path);
    nextPath.add(node.key);
    const sourceRow = edge?.row ? rowByNumber.get(Number(edge.row)) : null;
    const error = sourceRow
      ? continuity.errors.find((item) => Number(item.row) === Number(sourceRow.row))
      : null;
    result.push({
      selectionKey: sourceRow ? `row:${sourceRow.row}` : `node:${node.key}`,
      nodeKey: node.key,
      parentKey,
      level,
      levelLabel: level === 0
        ? "изделие"
        : sourceRow?.index !== "" && sourceRow?.index != null
          ? `№ ${sourceRow.index}`
          : "узел",
      label: node.label,
      designation: node.designation || extractDesignation(node.label),
      type: sourceRow?.type || node.type || edge?.type || "Объект",
      quantity: sourceRow?.quantity ?? "",
      unitOfMeasure: sourceRow?.unitOfMeasure || "",
      source: sourceRow?.unit || (level === 0 ? "верхний уровень" : graph.nodes.get(parentKey)?.label || node.source || ""),
      status: sourceRow ? continuity.rowStatus.get(sourceRow.row) || "ok" : "ok",
      message: error?.title || "",
    });
    (outgoing.get(node.key) || []).forEach((childEdge) => {
      appendNode(graph.nodes.get(childEdge.to), childEdge, level + 1, node.key, nextPath);
    });
  };

  fallbackRoots.forEach((root) => appendNode(root));
  return result;
}

function buildDiagramLevels(graph, continuity) {
  const incoming = new Map();
  const parentByChild = new Map();
  const outgoing = new Map();
  graph.edges.forEach((edge) => {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    if (!parentByChild.has(edge.to)) parentByChild.set(edge.to, edge.from);
    const list = outgoing.get(edge.from) || [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  });
  const roots = [...graph.nodes.values()].filter((node) => !incoming.has(node.key) || isSyntheticRoot(node.label));
  const levels = [];
  const visited = new Set();
  let frontier = roots.length ? roots.map((node) => node.key) : [...graph.nodes.keys()].slice(0, 1);
  const rowByNode = assignDiagramRows(graph, outgoing, roots);

  for (let depth = 0; depth < 24 && frontier.length; depth += 1) {
    const nodes = frontier
      .filter((key) => !visited.has(key))
      .map((key) => graph.nodes.get(key))
      .filter(Boolean);
    nodes.forEach((node) => visited.add(node.key));
    if (nodes.length) {
      levels.push({
        label: depth === 0 ? "Корень" : depth === 1 ? "Узлы" : `Уровень ${depth}`,
        nodes: nodes.map((node) => ({
          selectionKey: `node:${node.key}`,
          nodeKey: node.key,
          parentKey: parentByChild.get(node.key) || "",
          parentLabel: graph.nodes.get(parentByChild.get(node.key))?.label || "",
          diagramRow: rowByNode.get(node.key) || 1,
          label: node.label,
          type: node.type,
          meta: node.designation || node.source,
          status: continuity.errors.some((error) => error.message?.includes(node.label)) ? "warning" : "ok",
        })),
      });
    }
    frontier = [...new Set(nodes.flatMap((node) => outgoing.get(node.key) || []))];
  }
  return levels;
}

function buildGraphNodes(graph, continuity) {
  const parentByChild = new Map();
  const incoming = new Map();
  const outgoing = new Map();
  graph.edges.forEach((edge) => {
    if (!parentByChild.has(edge.to)) parentByChild.set(edge.to, edge.from);
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    const list = outgoing.get(edge.from) || [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  });
  const roots = [...graph.nodes.values()].filter((node) => !incoming.has(node.key) || isSyntheticRoot(node.label));
  const rowByNode = assignDiagramRows(graph, outgoing, roots);
  return [...graph.nodes.values()].map((node) => ({
    selectionKey: `node:${node.key}`,
    nodeKey: node.key,
    parentKey: parentByChild.get(node.key) || "",
    parentLabel: graph.nodes.get(parentByChild.get(node.key))?.label || "",
    diagramRow: rowByNode.get(node.key) || 1,
    label: node.label,
    type: node.type,
    meta: node.designation || node.source,
    status: continuity.errors.some((error) => error.message?.includes(node.label)) ? "warning" : "ok",
  }));
}

function assignDiagramRows(graph, outgoing, roots) {
  const rowByNode = new Map();
  const heightByNode = new Map();
  const rootKeys = roots.length ? roots.map((node) => node.key) : [...graph.nodes.keys()].slice(0, 1);

  const measure = (nodeKey, path = new Set()) => {
    if (!nodeKey) return 1;
    if (heightByNode.has(nodeKey)) return heightByNode.get(nodeKey);
    if (path.has(nodeKey)) return 1;
    const nextPath = new Set(path);
    nextPath.add(nodeKey);
    const children = outgoing.get(nodeKey) || [];
    const height = Math.max(1, children.reduce((sum, childKey) => sum + measure(childKey, nextPath), 0));
    heightByNode.set(nodeKey, height);
    return height;
  };

  const visit = (nodeKey, row, path = new Set()) => {
    if (!nodeKey || rowByNode.has(nodeKey) || path.has(nodeKey)) return;
    const nextPath = new Set(path);
    nextPath.add(nodeKey);
    rowByNode.set(nodeKey, row);
    let childRow = row;
    (outgoing.get(nodeKey) || []).forEach((childKey) => {
      visit(childKey, childRow, nextPath);
      childRow += measure(childKey, nextPath);
    });
  };

  let rootRow = 1;
  rootKeys.forEach((key) => {
    visit(key, rootRow);
    rootRow += measure(key);
  });

  let nextRow = Math.max(1, ...rowByNode.values()) + 1;
  graph.nodes.forEach((node) => {
    if (rowByNode.has(node.key)) return;
    rowByNode.set(node.key, nextRow);
    nextRow += 1;
  });
  return rowByNode;
}

function detectRootTitle(rows) {
  const rootSection = rows.find((row) => isSyntheticRoot(row.product) && row.unit);
  return rootSection?.unit || rows.find((row) => row.product && !isSyntheticRoot(row.product))?.product || "";
}

function normalizeHeader(value) {
  return cleanText(value).toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return cleanText(value).toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

function normalizeNodeKey(value) {
  return normalizeKey(value);
}
function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractDesignation(value) {
  const text = cleanText(value).toUpperCase();
  return text.match(/[А-ЯЁA-Z]{2,}\.\d{6}\.\d{3}/)?.[0] || "";
}
function isSyntheticRoot(value) {
  return normalizeKey(value) === SPECIFICATIONS2_ROOT_LABEL;
}

function isAssemblyType(value) {
  return SPECIFICATIONS2_ASSEMBLY_TYPES.has(normalizeKey(value));
}

function countBy(values) {
  const map = new Map();
  values.forEach((value) => map.set(value, (map.get(value) || 0) + 1));
  return map;
}
