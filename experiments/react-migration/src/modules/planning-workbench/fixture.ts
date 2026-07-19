const queue = [
  { id: "wo-1042", title: "СЗН-1042 · Контроллер КТ-7", meta: "Основной · 120 шт.", operationCount: 4, status: { label: "Подготовка", tone: "warning" }, active: true },
  { id: "wo-1041", title: "СЗН-1041 · Модуль питания", meta: "Основной · 80 шт.", operationCount: 3, status: { label: "В плане", tone: "ok" }, active: false },
  { id: "wo-1039", title: "СЗН-1039 · Панель индикации", meta: "Основной · 40 шт.", operationCount: 2, status: { label: "Черновик", tone: "neutral" }, active: false },
];
const metrics = [
  { id: "supply", label: "Состав", value: "готово", meta: "2 произв. · 1 склад", tone: "ok" },
  { id: "chain", label: "Передача", value: "готово", meta: "4 операции", tone: "ok" },
  { id: "duration", label: "Ревизия", value: "7", meta: "Спецификация 2.0", tone: "ok" },
  { id: "schedule", label: "Гант", value: "нет", meta: "после передачи", tone: "neutral" },
  { id: "shifts", label: "Смены", value: "нет", meta: "после Ганта", tone: "neutral" },
];
const rows = [
  { id: "task:main", kind: "task", level: 0, title: "Контроллер КТ-7", meta: "главное изделие", labor: "5 ч 20 мин", laborMeta: "4 операции", context: "объект", contextMeta: "основной", quantity: 120, unit: "шт.", status: { label: "готово", tone: "ok" }, selected: true, expanded: true },
  { id: "step:assembly", kind: "step", level: 1, title: "Монтаж компонентов", meta: "Участок ручного монтажа", labor: "2 ч", laborMeta: "ревизия 7", context: "ручной", contextMeta: "монтаж", quantity: 120, unit: "шт.", status: { label: "готово", tone: "ok" }, selected: false },
  { id: "step:inspection", kind: "step", level: 1, title: "Оптический контроль", meta: "ОТК", labor: "1 ч 20 мин", laborMeta: "ревизия 7", context: "станок", contextMeta: "ресурс", quantity: 120, unit: "шт.", status: { label: "готово", tone: "ok" }, selected: false },
  { id: "task:case", kind: "task", level: 1, title: "Корпус КТ-7", meta: "комплектующая", labor: "2 операции", laborMeta: "откройте объект", context: "объект", contextMeta: "дочерний", quantity: 120, unit: "шт.", status: { label: "проверьте", tone: "warning" }, selected: false, expanded: false },
];
export const planningWorkbenchFixture = { model: { activeRouteId: "wo-1042", activeQuantity: 120, headerDescription: "Основной · 120 шт. · 2 объекта · 4 операции", projectionSource: "server", detailLoading: false, queue, overview: { planningQuantity: 120, decision: { title: "Готов к передаче в план", subtitle: "Старт первой операции: 20.07.2026", tone: "ok", isReady: true, isPlanned: false, blockers: [] }, metrics, rows } } };
export const planningWorkbenchUpdateFixture = { model: { ...planningWorkbenchFixture.model, overview: { ...planningWorkbenchFixture.model.overview, decision: { title: "Заказ-наряд размещен в Ганте", subtitle: "Старт первой операции: 20.07.2026", tone: "ok", isReady: true, isPlanned: true, blockers: [] }, metrics: metrics.map((item) => item.id === "schedule" ? { ...item, value: "4/4", meta: "размещено", tone: "ok" } : item) } } };
