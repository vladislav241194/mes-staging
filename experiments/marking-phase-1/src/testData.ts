import { createKits, event } from "./model";
import type { MarkingTask, PrototypeState } from "./types";

const baseTask = (partial: Partial<MarkingTask> & Pick<MarkingTask, "id" | "title" | "product" | "workOrder" | "planBoards">): MarkingTask => {
  const { id, title, product, workOrder, planBoards, ...overrides } = partial;
  return ({
  id,
  title,
  product,
  workOrder,
  planBoards,
  assignee: "Анна Соколова",
  nextArea: "Линия поверхностного монтажа",
  multiplicationCount: 0,
  boardsPerMultiplication: 20,
  masterLabel: "30 × 20 мм",
  individualLabel: "12 × 8 мм",
  status: "new",
  kits: [],
  batches: [],
  history: [event("Задание назначено", "Назначено сотруднику Анна Соколова")],
  ...overrides,
  });
};

export const createInitialState = (): PrototypeState => {
  const active = baseTask({
    id: "MOCK-MKG-01",
    title: "Маркировка партии контроллеров",
    product: "Плата контроллера НУ70-2+2 F",
    workOrder: "MOCK-СЗН-018",
    planBoards: 2000,
    multiplicationCount: 100,
    boardsPerMultiplication: 20,
    status: "prepared",
  });
  active.kits = createKits(active, 100, 20, false);
  active.history.unshift(event("Тестовые комплекты созданы", "100 мультипликаций · 2 000 плат", "success"));

  const large = baseTask({
    id: "MOCK-MKG-02",
    title: "Крупная партия модулей питания",
    product: "Модуль питания МП-24 rev.6",
    workOrder: "MOCK-СЗН-021",
    planBoards: 24000,
    multiplicationCount: 1200,
    boardsPerMultiplication: 20,
    status: "new",
  });

  return { tasks: [active, large], selectedTaskId: active.id };
};
