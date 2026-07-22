export interface TreeTableSourceRow {
  id?: unknown;
  selectionKey?: unknown;
  nodeKey?: unknown;
  depth?: unknown;
  level?: unknown;
  [key: string]: unknown;
}

interface TreeTableNode<Row extends TreeTableSourceRow> {
  id: string;
  parentId: string | null;
  depth: number;
  row: Row;
  sourceIndex: number;
  children: TreeTableNode<Row>[];
}

export interface TreeTableVisualOptions<Row extends TreeTableSourceRow> {
  collapsedIds?: readonly unknown[];
  filter?: ((row: Row, node: TreeTableNode<Row>) => boolean) | null;
  siblingComparator?: ((left: Row, right: Row) => number) | null;
}

export interface TreeTableVisualState {
  id: string;
  parentId: string | null;
  depth: number;
  hasChildren: boolean;
  hasVisibleChildren: boolean;
  isExpanded: boolean;
  isFirstVisibleSibling: boolean;
  isLastVisibleSibling: boolean;
  visibleSiblingIndex: number;
  visibleSiblingCount: number;
  ancestorContinuationMask: boolean[];
  isContextRow: boolean;
}

export type TreeTableVisualRow<Row extends TreeTableSourceRow> = Row & {
  treeVisualState: TreeTableVisualState;
};

function normalizeTreeDepth(value: unknown): number {
  const depth = Number.parseInt(String(value), 10);
  return Number.isFinite(depth) ? Math.max(0, depth) : 0;
}

function normalizeTreeId(value: unknown, fallback: string): string {
  const id = String(value || "").trim();
  return id || fallback;
}

export function buildTreeTableVisualRows<Row extends TreeTableSourceRow = TreeTableSourceRow>(
  rows: readonly Row[] | unknown = [],
  options: TreeTableVisualOptions<Row> = {},
): TreeTableVisualRow<Row>[] {
  const sourceRows: Row[] = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const collapsedIds = new Set((options.collapsedIds || []).map(String));
  const filter = typeof options.filter === "function" ? options.filter : null;
  const siblingComparator = typeof options.siblingComparator === "function" ? options.siblingComparator : null;
  const nodes: TreeTableNode<Row>[] = [];
  const nodeById = new Map<string, TreeTableNode<Row>>();
  const childrenByParentId = new Map<string | null, TreeTableNode<Row>[]>();
  const stack: TreeTableNode<Row>[] = [];
  const idOccurrences = new Map<string, number>();

  sourceRows.forEach((row, sourceIndex) => {
    const requestedDepth = normalizeTreeDepth(row.depth ?? row.level);
    const depth = Math.min(requestedDepth, stack.length);
    stack.length = depth;
    const baseId = normalizeTreeId(row.id || row.selectionKey || row.nodeKey, `tree-row-${sourceIndex}`);
    const occurrence = (idOccurrences.get(baseId) || 0) + 1;
    idOccurrences.set(baseId, occurrence);
    const id = occurrence === 1 ? baseId : `${baseId}::${occurrence}`;
    const parentId = depth > 0 ? stack[depth - 1]?.id || null : null;
    const node = {
      id,
      parentId,
      depth,
      row,
      sourceIndex,
      children: [],
    };
    nodes.push(node);
    nodeById.set(id, node);
    const siblings = childrenByParentId.get(parentId) || [];
    siblings.push(node);
    childrenByParentId.set(parentId, siblings);
    if (parentId && nodeById.has(parentId)) nodeById.get(parentId)!.children.push(node);
    stack[depth] = node;
  });

  const matchedIds = new Set<string>();
  const includedIds = new Set<string>();
  if (filter) {
    nodes.forEach((node) => {
      if (!filter(node.row, node)) return;
      matchedIds.add(node.id);
      let cursor: TreeTableNode<Row> | null | undefined = node;
      while (cursor) {
        includedIds.add(cursor.id);
        cursor = cursor.parentId ? nodeById.get(cursor.parentId) : null;
      }
    });
  } else {
    nodes.forEach((node) => includedIds.add(node.id));
  }

  const getIncludedChildren = (parentId: string | null): TreeTableNode<Row>[] => {
    const children = (childrenByParentId.get(parentId) || []).filter((node) => includedIds.has(node.id));
    return siblingComparator ? children.slice().sort((left, right) => siblingComparator(left.row, right.row)) : children;
  };

  const visibleNodes: TreeTableNode<Row>[] = [];
  const visibleChildrenByParentId = new Map<string | null, TreeTableNode<Row>[]>();
  const flatten = (parentId: string | null): void => {
    const children = getIncludedChildren(parentId);
    visibleChildrenByParentId.set(parentId, children);
    children.forEach((node) => {
      visibleNodes.push(node);
      if (!collapsedIds.has(node.id)) flatten(node.id);
    });
  };
  flatten(null);

  const siblingPositionById = new Map<string, { index: number; size: number }>();
  visibleChildrenByParentId.forEach((siblings) => {
    siblings.forEach((node, index) => {
      siblingPositionById.set(node.id, { index, size: siblings.length });
    });
  });

  return visibleNodes.map((node) => {
    const position = siblingPositionById.get(node.id) || { index: 0, size: 1 };
    const includedChildren = getIncludedChildren(node.id);
    const isExpanded = !collapsedIds.has(node.id);
    const ancestorContinuationMask = Array.from({ length: node.depth }, () => false);
    let ancestor: TreeTableNode<Row> | null | undefined = node.parentId ? nodeById.get(node.parentId) : null;
    while (ancestor) {
      const ancestorPosition = siblingPositionById.get(ancestor.id) || { index: 0, size: 1 };
      if (ancestor.depth > 0 && ancestorPosition.index < ancestorPosition.size - 1) {
        ancestorContinuationMask[ancestor.depth] = true;
      }
      ancestor = ancestor.parentId ? nodeById.get(ancestor.parentId) : null;
    }
    return {
      ...node.row,
      treeVisualState: {
        id: node.id,
        parentId: node.parentId,
        depth: node.depth,
        hasChildren: node.children.length > 0,
        hasVisibleChildren: includedChildren.length > 0,
        isExpanded,
        isFirstVisibleSibling: position.index === 0,
        isLastVisibleSibling: position.index === position.size - 1,
        visibleSiblingIndex: position.index,
        visibleSiblingCount: position.size,
        ancestorContinuationMask,
        isContextRow: Boolean(filter && !matchedIds.has(node.id)),
      },
    };
  });
}
