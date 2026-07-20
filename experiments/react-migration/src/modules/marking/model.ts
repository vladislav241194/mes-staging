export type MarkingStatus = "new" | "prepared" | "marked" | "transferred";
export type MarkingTab = "kits" | "batches" | "history";

export interface MarkingKit {
  id: string;
  sequence: number;
  masterCode: string;
  individualCodes: string[];
  printed: boolean;
  createdAfterStart: boolean;
}

export interface MarkingBatch {
  id: string;
  createdAt: string;
  kitCount: number;
  labelCount: number;
  status: "confirmed";
}

export interface MarkingHistoryItem {
  id: string;
  at: string;
  action: string;
  detail: string;
}

export interface MarkingTask {
  id: string;
  title: string;
  product: string;
  workOrder: string;
  nextArea: string;
  planBoards: number;
  boardsPerKit: number;
  plannedKits: number;
  status: MarkingStatus;
  kits: MarkingKit[];
  batches: MarkingBatch[];
  history: MarkingHistoryItem[];
}

export interface MarkingDemoState {
  tasks: MarkingTask[];
  selectedTaskId: string;
}

const code = (taskId: string, kitIndex: number, itemIndex: number) => {
  const source = `${taskId}:${kitIndex}:${itemIndex}:mes-marking-demo`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(8, "0");
};

export const historyItem = (action: string, detail: string): MarkingHistoryItem => ({
  id: crypto.randomUUID(),
  at: new Date().toISOString(),
  action,
  detail,
});

export const createKits = (task: MarkingTask, count: number, createdAfterStart: boolean): MarkingKit[] => {
  const start = task.kits.length;
  return Array.from({ length: count }, (_, offset) => {
    const sequence = start + offset + 1;
    return {
      id: `MOCK-KIT-${task.id}-${sequence}`,
      sequence,
      masterCode: code(task.id, sequence, 0),
      individualCodes: Array.from({ length: task.boardsPerKit }, (_, itemIndex) => code(task.id, sequence, itemIndex + 1)),
      printed: false,
      createdAfterStart,
    };
  });
};

const baseTask = (task: Omit<MarkingTask, "kits" | "batches" | "history">): MarkingTask => ({
  ...task,
  kits: [],
  batches: [],
  history: [historyItem("Задание назначено", "MOCK · Анна Соколова · участок маркировки")],
});

export const createMarkingDemoState = (): MarkingDemoState => {
  const active = baseTask({
    id: "MOCK-MKG-01",
    title: "Маркировка партии контроллеров",
    product: "Плата контроллера НУ70-2+2 F",
    workOrder: "MOCK-СЗН-018",
    nextArea: "Линия поверхностного монтажа",
    planBoards: 2000,
    boardsPerKit: 20,
    plannedKits: 100,
    status: "prepared",
  });
  active.kits = createKits(active, 12, false);
  active.history.unshift(historyItem("Тестовые комплекты созданы", "12 мультипликаций · 240 плат"));

  const queued = baseTask({
    id: "MOCK-MKG-02",
    title: "Маркировка модулей питания",
    product: "Модуль питания МП-24 rev.6",
    workOrder: "MOCK-СЗН-021",
    nextArea: "Участок упаковки",
    planBoards: 24000,
    boardsPerKit: 20,
    plannedKits: 1200,
    status: "new",
  });
  return { tasks: [active, queued], selectedTaskId: active.id };
};

export const taskMetrics = (task: MarkingTask) => {
  const boards = task.kits.reduce((total, kit) => total + kit.individualCodes.length, 0);
  const printedKits = task.kits.filter((kit) => kit.printed).length;
  const printedBoards = task.kits.filter((kit) => kit.printed).reduce((total, kit) => total + kit.individualCodes.length, 0);
  return { boards, printedKits, printedBoards, labels: task.kits.length + boards, remainingKits: task.kits.length - printedKits };
};
