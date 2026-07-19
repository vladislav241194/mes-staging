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
    id: "MKG-240719-01",
    title: "Маркировка партии контроллеров",
    product: "Плата контроллера НУ70-2+2 F",
    workOrder: "СЗН-240719-018",
    planBoards: 2000,
    multiplicationCount: 100,
    boardsPerMultiplication: 20,
    status: "prepared",
  });
  active.kits = createKits(active, 100, 20, false);
  active.history.unshift(event("Тестовые комплекты созданы", "100 мультипликаций · 2 000 плат", "success"));

  const large = baseTask({
    id: "MKG-240719-02",
    title: "Крупная партия модулей питания",
    product: "Модуль питания МП-24 rev.6",
    workOrder: "СЗН-240719-021",
    planBoards: 24000,
    multiplicationCount: 1200,
    boardsPerMultiplication: 20,
    status: "new",
  });

  const done = baseTask({
    id: "MKG-240718-07",
    title: "Маркировка платы интерфейса",
    product: "Плата интерфейса ПИ-08",
    workOrder: "СЗН-240718-044",
    planBoards: 480,
    multiplicationCount: 24,
    boardsPerMultiplication: 20,
    status: "transferred",
  });
  done.kits = createKits(done, 24, 20, false).map((kit) => ({ ...kit, printStatus: "confirmed", printCount: 1 }));
  done.history.unshift(event("Передача подтверждена", `Передано: ${done.nextArea}`, "success"));

  return { tasks: [active, large, done], selectedTaskId: active.id };
};
