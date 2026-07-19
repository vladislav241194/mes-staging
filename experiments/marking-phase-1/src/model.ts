import type { AuditEvent, MarkingKit, MarkingTask, PrintBatch, PrintStatus } from "./types";

export const ACTOR = "Анна Соколова · участок маркировки";

export const opaqueCode = (taskId: string, kitIndex: number, itemIndex: number) => {
  const input = `${taskId}:${kitIndex}:${itemIndex}:phase1`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const a = (hash >>> 0).toString(36).toUpperCase().padStart(7, "0");
  const b = Math.abs(Math.imul(hash ^ 0x9e3779b9, 2654435761)).toString(36).toUpperCase().slice(0, 5).padStart(5, "0");
  return `${a}${b}`;
};

export const event = (action: string, detail: string, tone: AuditEvent["tone"] = "info"): AuditEvent => ({
  id: crypto.randomUUID(),
  at: new Date().toISOString(),
  actor: ACTOR,
  action,
  detail,
  tone,
});

export const createKits = (
  task: MarkingTask,
  count: number,
  boardsPerMultiplication: number,
  createdAfterStart: boolean,
): MarkingKit[] => {
  const start = task.kits.length;
  return Array.from({ length: count }, (_, offset) => {
    const sequence = start + offset + 1;
    return {
      id: `kit-${task.id}-${sequence}`,
      sequence,
      masterCode: opaqueCode(task.id, sequence, 0),
      individualCodes: Array.from(
        { length: boardsPerMultiplication },
        (_, item) => opaqueCode(task.id, sequence, item + 1),
      ),
      createdAfterStart,
      printStatus: "not-sent" as PrintStatus,
      printCount: 0,
      batchIds: [],
    };
  });
};

export const taskStats = (task: MarkingTask) => {
  const totalBoards = task.kits.reduce((sum, kit) => sum + kit.individualCodes.length, 0);
  const printedKits = task.kits.filter((kit) => kit.printStatus === "confirmed" || kit.printStatus === "reprinted").length;
  const printedBoards = task.kits
    .filter((kit) => kit.printStatus === "confirmed" || kit.printStatus === "reprinted")
    .reduce((sum, kit) => sum + kit.individualCodes.length, 0);
  return {
    totalBoards,
    masterCodes: task.kits.length,
    individualCodes: totalBoards,
    totalLabels: task.kits.length + totalBoards,
    printedKits,
    printedBoards,
    remainingKits: task.kits.length - printedKits,
    overPlan: totalBoards > task.planBoards,
    afterStartKits: task.kits.filter((kit) => kit.createdAfterStart).length,
  };
};

export const makeBatch = (
  kitIds: string[],
  scope: PrintBatch["scope"],
  sourceBatchId?: string,
  targetCode?: string,
): PrintBatch => ({
  id: `PB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
  kitIds,
  status: "awaiting",
  createdAt: new Date().toISOString(),
  attempt: sourceBatchId ? 2 : 1,
  sourceBatchId,
  scope,
  targetCode,
});

export const findCode = (tasks: MarkingTask[], code: string) => {
  const normalized = code.trim().toUpperCase();
  for (const task of tasks) {
    for (const kit of task.kits) {
      if (kit.masterCode === normalized) return { task, kit, type: "master" as const, code: normalized };
      if (kit.individualCodes.includes(normalized)) return { task, kit, type: "individual" as const, code: normalized };
    }
  }
  return null;
};
