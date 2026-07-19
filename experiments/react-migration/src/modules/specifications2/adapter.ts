const record = (value: unknown): Record<string, any> => value && typeof value === "object" ? value as Record<string, any> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;

export interface Specifications2RegistryItem {
  id: string;
  title: string;
  importedAt: string;
  rowCount: number;
  errorCount: number;
  publicationRevision: number;
  publicationState: string;
  publicationLabel: string;
  selected: boolean;
}

export interface Specifications2TreeItem {
  id: string;
  parentId: string;
  depth: number;
  designation: string;
  name: string;
  kind: string;
  quantity: number;
  unit: string;
  hasChildren: boolean;
}

export interface Specifications2Route {
  id: string;
  designation: string;
  productLabel: string;
  status: string;
  operationCount: number;
}

export interface Specifications2DraftRow {
  id: string;
  parentId: string;
  order: number;
  label: string;
  designation: string;
  type: string;
  quantity: string;
  unitOfMeasure: string;
}

function adaptTreeItems(value: unknown): Specifications2TreeItem[] {
  const source = list(value).map((raw, index) => {
    const item = record(raw);
    return {
      id: text(item.sourceRowId, `row-${index + 1}`),
      parentId: text(item.parentSourceRowId),
      designation: text(item.designation),
      name: text(item.name, "Без названия"),
      kind: text(item.kind, "Компонент"),
      quantity: number(item.quantity),
      unit: text(item.unit, "шт."),
      sourceIndex: index,
    };
  }).filter((item, index, items) => item.id && items.findIndex((candidate) => candidate.id === item.id) === index);
  const byId = new Map(source.map((item) => [item.id, item]));
  const children = new Map<string, typeof source>();
  source.forEach((item) => {
    const parentId = item.parentId && byId.has(item.parentId) && item.parentId !== item.id ? item.parentId : "";
    const group = children.get(parentId) || [];
    group.push(item);
    children.set(parentId, group);
  });
  children.forEach((group) => group.sort((left, right) => left.sourceIndex - right.sourceIndex));
  const result: Specifications2TreeItem[] = [];
  const visited = new Set<string>();
  const visit = (item: typeof source[number], depth: number) => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    const directChildren = children.get(item.id) || [];
    result.push({ ...item, depth, hasChildren: directChildren.length > 0 });
    directChildren.forEach((child) => visit(child, depth + 1));
  };
  (children.get("") || []).forEach((item) => visit(item, 0));
  source.forEach((item) => visit(item, 0));
  return result;
}

export function adaptSpecifications2Payload(payload: unknown) {
  const root = record(payload);
  const model = record(root.model || payload);
  const capabilities = record(root.capabilities);
  const selected = record(model.selectedEntry);
  const serverRevision = record(selected.serverRevision);
  const registry = list(model.registry).map((raw, index): Specifications2RegistryItem => {
    const item = record(raw);
    return {
      id: text(item.id, `specification-${index + 1}`),
      title: text(item.title, "Спецификация XLSX"),
      importedAt: text(item.importedAt),
      rowCount: number(item.rowCount),
      errorCount: number(item.errorCount),
      publicationRevision: number(item.publicationRevision),
      publicationState: text(item.publicationState, "draft"),
      publicationLabel: text(item.publicationLabel, "Черновик"),
      selected: Boolean(item.selected),
    };
  }).filter((item) => item.id);
  const routes = list(serverRevision.routes).map((raw, index): Specifications2Route => {
    const item = record(raw);
    return {
      id: text(item.sourceDraftId, `route-${index + 1}`),
      designation: text(item.designation),
      productLabel: text(item.productLabel, "Маршрут"),
      status: text(item.status, "опубликован"),
      operationCount: list(item.operations).length,
    };
  });
  const treeItems = adaptTreeItems(serverRevision.treeItems);
  const draftRows = list(selected.draftRows).map((raw, index): Specifications2DraftRow => {
    const item = record(raw);
    return {
      id: text(item.id, `draft-row-${index + 1}`),
      parentId: text(item.parentId),
      order: number(item.order),
      label: text(item.label, "Без названия"),
      designation: text(item.designation),
      type: text(item.type, "Компонент"),
      quantity: text(item.quantity),
      unitOfMeasure: text(item.unitOfMeasure),
    };
  }).filter((item, index, items) => item.id && items.findIndex((candidate) => candidate.id === item.id) === index);
  return {
    registry,
    canEditDraft: Boolean(capabilities.draftEdit),
    canPublish: Boolean(capabilities.publication),
    serverStatus: text(model.serverStatus, "empty"),
    serverError: text(model.serverError),
    selectedEntry: selected.id ? {
      id: text(selected.id),
      title: text(selected.title, "Спецификация XLSX"),
      fileName: text(selected.fileName),
      importedAt: text(selected.importedAt),
      publicationState: text(selected.publicationState, "draft"),
      publicationLabel: text(selected.publicationLabel, "Черновик"),
      publicationRevision: number(selected.publicationRevision),
      publishedAt: text(selected.publishedAt),
      draftRows,
      serverRevision: serverRevision.id ? {
        id: text(serverRevision.id),
        sourceEntryId: text(serverRevision.sourceEntryId),
        specificationId: text(serverRevision.specificationId),
        title: text(serverRevision.title, text(selected.title, "Спецификация")),
        designation: text(serverRevision.designation),
        revisionNo: number(serverRevision.revisionNo),
        releasedAt: text(serverRevision.releasedAt),
        sourceUpdatedAt: text(serverRevision.sourceUpdatedAt),
        treeItems,
        routes,
        operationCount: routes.reduce((total, route) => total + route.operationCount, 0),
      } : null,
    } : null,
  };
}
