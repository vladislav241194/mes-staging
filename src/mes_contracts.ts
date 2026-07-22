import { MES_MODULE_BLUEPRINT_REGISTRY } from "./module_registry.js";

export interface MesDocumentKindContract {
  id: string;
  label: string;
  shortLabel: string;
  group: string;
  signal: string;
  description: string;
}

export interface MesSignalContract {
  id: string;
  label: string;
  tone: string;
}

export interface MesStatusContract {
  scope: string;
  value: string;
  label: string;
  tone: string;
  signal: string;
  kind: string;
  modules: readonly string[];
  changes: string;
  blocks: string;
  deleteRule: string;
}

export interface MesStatusOption {
  value: string;
  label: string;
  tone: string;
  signal: string;
  kind: string;
  modules: readonly string[];
}

export interface MesFlowModuleContract {
  id: string;
  label: string;
  modules: readonly string[];
  owns: readonly string[];
}

export interface MesModuleFlowContract {
  id: string;
  label: string;
  group: string;
  role: string;
  reads: readonly string[];
  writes: readonly string[];
  ganttImpact: string;
  ganttVisualChange: string;
  editPolicy: string;
}

export interface MesFlowTransitionContract {
  id: string;
  from: string;
  to: string;
  sourceModule: string;
  targetModule: string;
  actionLabel: string;
  statusScope: string;
  nextStatus: string;
  dataPolicy: string;
  description: string;
  futureProofing: string;
}

export interface MesResolvedFlowTransitionView extends MesFlowTransitionContract {
  label: string;
  status: MesStatusContract;
  route: string;
}

export interface MesUnknownFlowTransitionView {
  id: string;
  label: string;
  sourceModule: string;
  targetModule: string;
  description: string;
}

export type MesFlowTransitionView = MesResolvedFlowTransitionView | MesUnknownFlowTransitionView;

export type MesOpenRecord = Readonly<Record<string, unknown>>;

export type MesDocumentReferenceInput = MesOpenRecord & {
  id?: unknown;
  routeId?: unknown;
  slotId?: unknown;
  sourceId?: unknown;
  specificationId?: unknown;
  projectId?: unknown;
  parentId?: unknown;
  parentRouteId?: unknown;
  planningOrderId?: unknown;
};

export interface MesDocumentContract extends MesDocumentKindContract {
  entityId: string;
  sourceId: string;
  parentId: string;
}

export interface MesGanttInfluenceRow {
  moduleId: string;
  module: string;
  group: string;
  role: string;
  reads: readonly string[];
  writes: readonly string[];
  ganttImpact: string;
  ganttVisualChange: string;
  editPolicy: string;
}

export interface MesFlowEvent {
  id: string;
  transitionId: string;
  from: string;
  to: string;
  sourceModule: string;
  targetModule: string;
  dataPolicy: string;
  statusScope: string;
  nextStatus: string;
  sourceDocument: MesOpenRecord;
  targetDocument: MesOpenRecord;
  payload: MesOpenRecord;
}

interface MesModuleBlueprintFlowSource {
  id: string;
  flow: {
    order: number;
    contract?: MesModuleFlowContract | null;
  };
}

function hasOwnKey<Value extends object>(value: Value, key: PropertyKey): key is keyof Value {
  return Object.prototype.hasOwnProperty.call(value, key);
}

const MES_MODULE_BLUEPRINT_FLOW_SOURCE = MES_MODULE_BLUEPRINT_REGISTRY as readonly MesModuleBlueprintFlowSource[];

export const MES_DOCUMENT_KINDS = {
  routeCard: {
    id: "routeCard",
    label: "Маршрутная карта",
    shortLabel: "МК",
    group: "Технологии",
    signal: "technology",
    description: "Технологический документ: как делать изделие, узел или плату.",
  },
  workOrder: {
    id: "workOrder",
    label: "Заказ-наряд",
    shortLabel: "ЗН",
    group: "Планирование нагрузки",
    signal: "planning",
    description: "Плановый документ: что, сколько и к какому сроку произвести.",
  },
  shiftWorkOrder: {
    id: "shiftWorkOrder",
    label: "Сменный заказ-наряд",
    shortLabel: "СЗН",
    group: "Оперативное управление",
    signal: "operation",
    description: "Сменный фрагмент заказ-наряда для мастера, ресурса и исполнителя.",
  },
  ganttSlot: {
    id: "ganttSlot",
    label: "Слот планирования",
    shortLabel: "Слот",
    group: "Планирование нагрузки",
    signal: "gantt",
    description: "Временное размещение операции на производственной диаграмме.",
  },
  dispatchFact: {
    id: "dispatchFact",
    label: "Архив факта",
    shortLabel: "Факт",
    group: "Оперативное управление",
    signal: "fact",
    description: "Принятый из Мастерской результат сменного заказ-наряда: выпуск, брак, трудозатраты и комментарий.",
  },
} as const satisfies Record<string, MesDocumentKindContract>;

export type MesDocumentKindId = keyof typeof MES_DOCUMENT_KINDS;

export const MES_SIGNAL_CONTRACTS = {
  neutral: { id: "neutral", label: "Нейтрально", tone: "neutral" },
  ready: { id: "ready", label: "Готово", tone: "ok" },
  active: { id: "active", label: "В работе", tone: "active" },
  warning: { id: "warning", label: "Внимание", tone: "warning" },
  blocked: { id: "blocked", label: "Блокировка", tone: "critical" },
  problem: { id: "problem", label: "Проблема", tone: "critical" },
  manual: { id: "manual", label: "Ручное действие", tone: "manual" },
  calculated: { id: "calculated", label: "Расчетное", tone: "calc" },
  demo: { id: "demo", label: "Демо-функция", tone: "demo-function" },
} as const satisfies Record<string, MesSignalContract>;

export type MesSignalId = keyof typeof MES_SIGNAL_CONTRACTS;

export const MES_STATUS_CONTRACTS: readonly MesStatusContract[] = [
  {
    scope: "ganttSlot",
    value: "planned",
    label: "Запланировано",
    tone: "neutral",
    signal: "neutral",
    kind: "executionStatus",
    modules: ["Планирование", "Заказ-наряды", "Мастерская", "Диспетчерская"],
    changes: "Слот виден на диаграмме и может стать сменным заказ-нарядом.",
    blocks: "Не блокирует, пока операция не завершена или не заблокирована.",
    deleteRule: "Нельзя удалить без замены базового состояния слота.",
  },
  {
    scope: "ganttSlot",
    value: "in_progress",
    label: "В работе",
    tone: "active",
    signal: "active",
    kind: "executionStatus",
    modules: ["Планирование", "Мастерская", "Диспетчерская"],
    changes: "Показывает активное выполнение операции и влияет на оперативный срез.",
    blocks: "Не блокирует, но меняет приоритет строки в сменном контроле.",
    deleteRule: "Нельзя удалить без новой модели выполнения.",
  },
  {
    scope: "ganttSlot",
    value: "paused",
    label: "Пауза",
    tone: "warning",
    signal: "warning",
    kind: "executionStatus",
    modules: ["Планирование", "Диспетчерская"],
    changes: "Сигнализирует остановку операции без закрытия плана.",
    blocks: "Не блокирует автоматически, но требует внимания диспетчера.",
    deleteRule: "Можно заменить только единым статусом ожидания/простоя.",
  },
  {
    scope: "ganttSlot",
    value: "completed",
    label: "Завершено",
    tone: "ok",
    signal: "ready",
    kind: "executionStatus",
    modules: ["Планирование", "Заказ-наряды", "Мастерская", "Диспетчерская"],
    changes: "Закрывает операцию, влияет на прогресс и ограничивает редактирование слота.",
    blocks: "Блокирует перетаскивание и часть пересчетов завершенной операции.",
    deleteRule: "Нельзя удалить без отдельного состояния приемки результата.",
  },
  {
    scope: "ganttSlot",
    value: "overdue",
    label: "Просрочено",
    tone: "critical",
    signal: "problem",
    kind: "executionStatus",
    modules: ["Планирование", "Диспетчерская"],
    changes: "Поднимает критический сигнал по сроку операции.",
    blocks: "Не блокирует действия, но требует корректировки плана.",
    deleteRule: "Можно заменить расчетным сигналом просрочки, но не потерять смысл.",
  },
  {
    scope: "ganttSlot",
    value: "problem",
    label: "Проблема",
    tone: "critical",
    signal: "problem",
    kind: "executionStatus",
    modules: ["Планирование", "Мастерская", "Диспетчерская"],
    changes: "Фиксирует проблему выполнения и повышает приоритет строки.",
    blocks: "Не блокирует автоматически, но требует ручной реакции.",
    deleteRule: "Нельзя удалить без отдельного механизма проблем/инцидентов.",
  },
  {
    scope: "workOrderPlanning",
    value: "queued",
    label: "В очереди",
    tone: "neutral",
    signal: "neutral",
    kind: "planningStatus",
    modules: ["Заказ-наряды"],
    changes: "Заказ-наряд подготовлен, но еще не размещен в диаграмме.",
    blocks: "Не создает сменные заказ-наряды.",
    deleteRule: "Оставить как расчетное состояние очереди.",
  },
  {
    scope: "workOrderPlanning",
    value: "partial",
    label: "Частично",
    tone: "warning",
    signal: "warning",
    kind: "planningStatus",
    modules: ["Заказ-наряды", "Планирование"],
    changes: "Часть операций уже размещена, часть еще вне плана.",
    blocks: "Блокирует ощущение готовности заказ-наряда к исполнению.",
    deleteRule: "Оставить как расчетное состояние полноты размещения.",
  },
  {
    scope: "workOrderPlanning",
    value: "scheduled",
    label: "В планировании",
    tone: "ok",
    signal: "ready",
    kind: "planningStatus",
    modules: ["Заказ-наряды", "Планирование", "Мастерская"],
    changes: "Операции размещены на диаграмме и доступны сменному контуру.",
    blocks: "Не блокирует, открывает следующий оперативный уровень.",
    deleteRule: "Нельзя удалить без замены признаком размещения.",
  },
  {
    scope: "workOrderPlanning",
    value: "canceled",
    label: "Отменен",
    tone: "critical",
    signal: "blocked",
    kind: "lifecycleStatus",
    modules: ["Заказ-наряды", "Планирование"],
    changes: "Исключает документ из активной очереди и снимает связанные слоты.",
    blocks: "Блокирует активное планирование отмененного документа.",
    deleteRule: "Нельзя удалить без отдельного жизненного цикла документа.",
  },
  {
    scope: "shiftAssignment",
    value: "draft",
    label: "План смены",
    tone: "neutral",
    signal: "neutral",
    kind: "shiftStatus",
    modules: ["Мастерская"],
    changes: "Строка доступна мастеру, но еще не выпущена в работу.",
    blocks: "Не закрывает сменное задание и не формирует факт.",
    deleteRule: "Оставить как начальное состояние сменного заказ-наряда.",
  },
  {
    scope: "shiftAssignment",
    value: "issued",
    label: "Выпущен",
    tone: "ok",
    signal: "ready",
    kind: "shiftStatus",
    modules: ["Мастерская"],
    changes: "Мастер выпустил сменный заказ-наряд для ресурса/исполнителя.",
    blocks: "Не блокирует, открывает нормальный ввод факта.",
    deleteRule: "Нельзя удалить без другого признака выпуска сменного листа.",
  },
  {
    scope: "dispatchFact",
    value: "not_reported",
    label: "Факт не внесен",
    tone: "neutral",
    signal: "neutral",
    kind: "factStatus",
    modules: ["Мастерская", "Архив факта"],
    changes: "Различает пустой факт и нулевой выпуск в сменном контуре.",
    blocks: "Не закрывает сменный заказ-наряд.",
    deleteRule: "Нельзя удалить без риска спутать отсутствие факта с нулем.",
  },
  {
    scope: "dispatchFact",
    value: "partial",
    label: "Частично",
    tone: "warning",
    signal: "warning",
    kind: "factStatus",
    modules: ["Мастерская", "Архив факта"],
    changes: "Факт ниже плана; используется для аналитики отклонений и будущих норм.",
    blocks: "Не блокирует и не меняет Гант автоматически.",
    deleteRule: "Оставить как состояние отклонения по выпуску.",
  },
  {
    scope: "dispatchFact",
    value: "accepted",
    label: "Принято",
    tone: "ok",
    signal: "ready",
    kind: "factStatus",
    modules: ["Мастерская", "Архив факта"],
    changes: "Сменный факт принят в архив, отклонение не требует вмешательства.",
    blocks: "Не блокирует.",
    deleteRule: "Нельзя удалить без состояния принятого факта.",
  },
  {
    scope: "dispatchFact",
    value: "problem",
    label: "Проблема",
    tone: "critical",
    signal: "problem",
    kind: "factStatus",
    modules: ["Мастерская", "Архив факта"],
    changes: "Создает оперативный проблемный сигнал в аналитике факта.",
    blocks: "Не пересчитывает план, но требует разбора перед использованием нормы.",
    deleteRule: "Нельзя удалить без механизма инцидентов.",
  },
];

const STATUS_BY_SCOPE_VALUE = new Map(MES_STATUS_CONTRACTS.map((item) => [`${item.scope}:${item.value}`, item]));

export const MES_FLOW_MODULES: Readonly<Record<string, MesFlowModuleContract>> = {
  technologies: {
    id: "technologies",
    label: "Технологии",
    modules: ["Маршрутная карта", "Спецификации", "Номенклатура"],
    owns: ["routeCard"],
  },
	  loadPlanning: {
	    id: "loadPlanning",
	    label: "Планирование нагрузки",
	    modules: ["Заказ-наряды", "Планирование", "Контроль недели"],
	    owns: ["workOrder", "ganttSlot"],
	  },
  operations: {
    id: "operations",
    label: "Оперативное управление",
    modules: ["Диспетчерская", "Мастерская", "Рабочий стол", "Маркировка", "Журнал СЗН"],
    owns: ["shiftWorkOrder"],
  },
};

export const MES_MODULE_FLOW_SEQUENCE: readonly string[] = Object.freeze(MES_MODULE_BLUEPRINT_FLOW_SOURCE
  .slice()
  .sort((left, right) => left.flow.order - right.flow.order)
  .map((blueprint) => blueprint.id));

const CORE_MES_MODULE_FLOW_CONTRACTS = {
  nomenclature: {
    id: "nomenclature",
    label: "Номенклатура",
    group: "Технологии",
    role: "Источник производимых и покупных позиций.",
    reads: [],
    writes: ["Номенклатурная позиция", "Тип позиции", "Плата"],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Редактирует мастер-данные; не размещает операции и не меняет слоты.",
  },
  specifications2: {
    id: "specifications2",
    label: "Спецификации 2.0",
    group: "Технологии",
    role: "Единое рабочее место подготовки структуры изделия, маршрутных карт, технологических файлов и ревизий плановых норм.",
    reads: ["XLSX-файл пользователя", "Номенклатура", "Справочник операций", "Структура и сотрудники"],
    writes: ["Черновик Спецификации 2.0", "Опубликованная ревизия спецификации", "Опубликованные ревизии маршрутов и норм"],
    ganttImpact: "indirect",
    ganttVisualChange: "Опубликованная ревизия становится доступна заказ-наряду; существующие заказ-наряды и слоты не пересчитываются.",
    editPolicy: "Черновики изолированы. Только явная публикация добавляет новую производственную ревизию; опубликованные и исторические документы не изменяются на месте.",
  },
  planning: {
    id: "planning",
    label: "Заказ-наряды",
    group: "Планирование нагрузки",
    role: "Плановый документ: количество, срок, расчетные блоки и подготовка передачи в планирование.",
    reads: ["Маршрутная карта", "Спецификации", "Структура и сотрудники", "Табель"],
    writes: ["Заказ-наряд", "Параметры планирования"],
    ganttImpact: "writes-on-transfer",
    ganttVisualChange: "По действию передачи создает/обновляет слоты операций на диаграмме; рабочие трудозатраты заказ-наряда могут пересчитать будущие незакрытые слоты.",
    editPolicy: "Трудозатраты заказ-наряда являются рабочим расчетным слоем и должны синхронизироваться со слотами через workOrderToGanttSlot/slot helpers.",
  },
	  gantt: {
	    id: "gantt",
	    label: "Планирование",
    group: "Планирование нагрузки",
    role: "Диаграмма нагрузки: календарное размещение операций и зависимости.",
    reads: ["Заказ-наряды", "Структура и сотрудники", "Табель"],
    writes: ["Слот планирования", "Зависимости", "Статус слота"],
    ganttImpact: "direct",
    ganttVisualChange: "Меняет положение, длительность, связи, пунктирные колбаски, стрелки и статусные сигналы.",
	    editPolicy: "Прямое изменение диаграммы должно идти через slot/status helpers и flow contract.",
	  },
	  weeklyProductionControl: {
	    id: "weeklyProductionControl",
	    label: "Контроль недели",
	    group: "Планирование нагрузки",
		    role: "Недельный план-факт по участкам и оборудованию: читает заказ-наряды, факт рабочего места и report, но не меняет систему.",
	    reads: ["Заказ-наряды", "Слоты планирования", "Факт рабочего места", "Report рабочего места", "Журнал СЗН"],
	    writes: [],
	    ganttImpact: "none",
	    ganttVisualChange: "—",
	    editPolicy: "Не меняет заказ-наряды, слоты, распределение, факт и report; только агрегирует отклонения больше 5% для контроля.",
	  },
  shiftMasterBoard: {
    id: "shiftMasterBoard",
    label: "Мастерская",
    group: "Оперативное управление",
    role: "Рабочая доска мастера: распределение сменных задач по колонкам, исполнителям, рискам, сменным листам, факту и остаткам.",
    reads: ["Слоты планирования", "Заказ-наряды", "Маршрутная карта", "Структура и сотрудники", "Табель"],
    writes: ["Сменный заказ-наряд", "Назначение смены", "Риск мастера", "Сменный лист", "Факт мастера", "Остаток следующей смены"],
    ganttImpact: "visual-operational-layer",
    ganttVisualChange: "Добавляет на колбаски слой распределения, факта и остатка без изменения дат, длительности и зависимостей.",
    editPolicy: "Оперативный слой Мастерской фиксирует распределение и факт смены; геометрия Ганта не пересчитывается без отдельного правила перепланирования.",
  },
  shiftWorkOrders: {
    id: "shiftWorkOrders",
    label: "Журнал СЗН",
    group: "Оперативное управление",
    role: "Read-only реестр сменных заказ-нарядов, сменных листов, факта, передачи и остатков, сформированных Мастерской.",
    reads: ["Мастерская", "Слоты планирования", "Заказ-наряды", "Факт мастера"],
    writes: [],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Не меняет распределение, факт, остатки, даты и Гант; рабочие действия остаются в Мастерской.",
  },
  productionStructureMatrix: {
    id: "productionStructureMatrix",
    label: "Структура и сотрудники",
    group: "Система",
    role: "Организационная модель производства: подразделения, участки, рабочие центры, должности, сотрудники и оборудование. Не хранит роли доступа, grants, графики или факты табеля.",
    reads: [],
    writes: ["Подразделения", "Рабочие центры", "Должности", "Сотрудники", "Оборудование"],
    ganttImpact: "indirect-operational",
    ganttVisualChange: "Напрямую не двигает Гант; поставляет рабочие центры и состав сотрудников календарю персонала и Мастерской.",
    editPolicy: "Изменения оргструктуры, рабочих центров, должностей, сотрудников и оборудования выполняются здесь; доступ и табель принадлежат отдельным доменам.",
  },
  timesheet: {
    id: "timesheet",
    label: "Табель",
    group: "Система",
    role: "Календарь персонала и факты рабочего времени: плановые шаблоны и назначения графиков отделены от явки, отсутствий и сверхурочных.",
    reads: ["Структура и сотрудники"],
    writes: ["Назначение графика", "Факт явки или отсутствия", "Сверхурочные"],
    ganttImpact: "indirect-operational",
    ganttVisualChange: "Напрямую не меняет Гант; ограничивает список доступных исполнителей в Мастерской, а распределение Мастерской уже отражается на колбасках.",
    editPolicy: "Плановый календарь и факты дня сохраняются раздельно и формируют вычисляемую доступность; синтетические факты и прямое изменение слотов запрещены.",
  },
  roles: {
    id: "roles",
    label: "Роли и доступ",
    group: "Система",
    role: "Контур авторизации: роли доступа, grants шести действий, effective-dated назначения субъектам и области ответственности.",
    reads: ["Структура и сотрудники", "Авторизация", "Список модулей"],
    writes: ["Роли доступа", "Grants", "Назначения субъектам", "Области ответственности"],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Меняет видимость модулей и доступность действий; не меняет производственные данные, слоты, факты или календарь.",
  },
  contourAdmin: {
    id: "contourAdmin",
    label: "Контуры",
    group: "Система",
    role: "Админ-панель контуров: pilot для Codex-работы, stage для пользовательского тестирования, prod будет добавлен после стабилизации.",
    reads: ["Конфигурация сервера", "Git-релизы", "Shared-state backups", "Audit-журнал"],
    writes: ["Заявка на ops-операцию", "Локальный audit безопасности"],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "В браузере нельзя выполнять destructive-операции; копирование данных, промоут и rollback должны идти через защищенный Ops API с backup-before-action.",
  },
  directories: {
    id: "directories",
    label: "Справочники и нормативы",
    group: "Система",
    role: "Классификаторы и нормативы без оргструктуры: операции, типы компонентов, производственные коэффициенты, типы номенклатуры и системные статус-контракты.",
    reads: [],
    writes: ["Операции", "Нормативы компонентов", "Типы компонентов", "Типы номенклатуры"],
    ganttImpact: "indirect",
    ganttVisualChange: "Меняет будущие операции и подписи, но не перестраивает существующий Gantt без отдельного пересчета.",
    editPolicy: "Системные статусы доступны только для чтения и меняются через MES_STATUS_CONTRACTS; пользовательские нормативы редактируются в своих реестрах.",
  },
  authPrototype: {
    id: "authPrototype",
    label: "Авторизация",
    group: "Авторизация",
    role: "Внутренний системный экран входа: выбор отдела, сотрудника и автоматическая проверка PIN на пятой цифре.",
    reads: ["Структура и сотрудники", "Роли и доступ"],
    writes: ["Сессия авторизации", "Активный пользователь", "Роль интерфейса"],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Меняет только сеанс, пользователя и роль интерфейса; не меняет производственные данные, сменные задания или производственный план.",
  },
  authSessionPrototype: {
    id: "authSessionPrototype",
    label: "Рабочий стол",
    group: "Оперативное управление",
    role: "Рабочий стол исполнителя: назначенные сменные задания, инструкции, маршрут, ввод факта и брака с планшета.",
    reads: ["Структура и сотрудники", "Мастерская", "Сменные заказ-наряды", "Маршрутные карты"],
    writes: ["Факт исполнителя", "Агрегированный факт сменной задачи после закрытия всех исполнителей"],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Исполнитель редактирует только свой факт и брак; начальник производства просматривает чужие рабочие столы без записи.",
  },
  marking: {
    id: "marking",
    label: "Маркировка",
    group: "Оперативное управление",
    role: "Рабочее место участка маркировки фазы 1: подготовка тестовых комплектов, имитация печати, подтверждение и передача.",
    reads: ["Изолированные задания маркировки", "Тестовые комплекты и коды", "Журнал действий фазы 1"],
    writes: ["Изолированное состояние Marking Phase 1", "Комплекты и коды", "Попытки печати", "Журнал действий"],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Фаза 1 сохраняет только явно помеченное тестовое состояние в отдельных PostgreSQL-таблицах Marking; реальные статусы, СЗН и производственная история не изменяются.",
  },
} satisfies Record<string, MesModuleFlowContract>;

export const MES_MODULE_FLOW_CONTRACTS: Readonly<Record<string, MesModuleFlowContract>> = Object.freeze({
  ...CORE_MES_MODULE_FLOW_CONTRACTS,
  ...Object.fromEntries(MES_MODULE_BLUEPRINT_FLOW_SOURCE
    .flatMap((blueprint) => blueprint.flow.contract
      ? [[blueprint.id, blueprint.flow.contract] as const]
      : [])),
});

export const MES_FLOW_TRANSITIONS: readonly MesFlowTransitionContract[] = [
  {
    id: "routeCardToWorkOrder",
    from: "routeCard",
    to: "workOrder",
    sourceModule: "Маршрутная карта",
    targetModule: "Заказ-наряды",
    actionLabel: "Создать заказ-наряд",
    statusScope: "workOrderPlanning",
    nextStatus: "queued",
    dataPolicy: "copy-reference",
    description: "Заказ-наряд наследует структуру и операции маршрутной карты, но получает собственные плановые параметры: количество, срок и очередь.",
    futureProofing: "Если позже появятся версии или утверждение маршрутной карты, переход останется тем же, а поменяется только правило допуска.",
  },
  {
    id: "workOrderToGanttSlot",
    from: "workOrder",
    to: "ganttSlot",
    sourceModule: "Заказ-наряды",
    targetModule: "Планирование",
    actionLabel: "Передать в планирование",
    statusScope: "workOrderPlanning",
    nextStatus: "scheduled",
    dataPolicy: "derive-plan",
    description: "Операции заказ-наряда превращаются в слоты диаграммы. Слот хранит размещение во времени, а заказ-наряд остается исходным плановым документом.",
    futureProofing: "При изменении алгоритма планирования меняется построитель слотов, но не контракт между заказ-нарядом и планированием.",
  },
  {
    id: "ganttSlotToShiftWorkOrder",
    from: "ganttSlot",
    to: "shiftWorkOrder",
    sourceModule: "Планирование",
    targetModule: "Мастерская",
    actionLabel: "Сформировать сменное задание",
    statusScope: "shiftAssignment",
    nextStatus: "draft",
    dataPolicy: "derive-shift-slice",
    description: "Слот или его дневная часть становится строкой сменного заказ-наряда для мастера.",
    futureProofing: "Если слот будет дробиться на несколько смен, контракт сохранит ссылку на исходный слот и объем сменного фрагмента.",
  },
  {
    id: "shiftWorkOrderIssue",
    from: "shiftWorkOrder",
    to: "shiftWorkOrder",
    sourceModule: "Мастерская",
    targetModule: "Мастерская",
    actionLabel: "Выпустить сменный лист",
    statusScope: "shiftAssignment",
    nextStatus: "issued",
    dataPolicy: "assign-resource",
    description: "Мастер назначает ресурс и исполнителя, после чего сменный заказ-наряд считается выпущенным.",
    futureProofing: "При появлении ролей, прав или подтверждений меняется правило выпуска, а не форма диспетчерского факта.",
  },
  {
    id: "shiftWorkOrderToDispatchFact",
    from: "shiftWorkOrder",
    to: "dispatchFact",
    sourceModule: "Мастерская",
    targetModule: "Архив факта",
    actionLabel: "Передать факт",
    statusScope: "dispatchFact",
    nextStatus: "accepted",
    dataPolicy: "write-fact-layer",
    description: "Мастерская вводит выпуск, брак и трудозатраты; данные попадают в аналитический архив факта без включения Диспетчерской в рабочий контур.",
    futureProofing: "Позже архив можно использовать для рекомендаций по трудозатратам, но текущий переход не меняет производственный план.",
  },
  {
    id: "dispatchFactToPlanningCorrection",
    from: "dispatchFact",
    to: "ganttSlot",
    sourceModule: "Архив факта",
    targetModule: "Планирование",
    actionLabel: "Коррекция отключена",
    statusScope: "dispatchFact",
    nextStatus: "partial",
    dataPolicy: "request-replan",
    description: "Текущий прототип не создает корректировки из архива факта.",
    futureProofing: "Если позже появится управление перепланированием по факту, оно должно идти через отдельный подтверждаемый переход, а не через архив трудозатрат.",
  },
];

const TRANSITIONS_BY_ID = new Map(MES_FLOW_TRANSITIONS.map((item) => [item.id, item]));

export function getMesDocumentKind(kind: string = ""): MesDocumentKindContract {
  return (hasOwnKey(MES_DOCUMENT_KINDS, kind) && MES_DOCUMENT_KINDS[kind]) || {
    id: kind || "unknown",
    label: "Документ",
    shortLabel: "Док.",
    group: "Система",
    signal: "neutral",
    description: "Документ без закрепленного контракта.",
  };
}

export function getMesStatusContract(scope: string = "", value: string = ""): MesStatusContract | null {
  const normalizedScope = String(scope || "").trim();
  const normalizedValue = String(value || "").trim();
  const key = `${normalizedScope}:${normalizedValue}`;
  if (STATUS_BY_SCOPE_VALUE.has(key)) return STATUS_BY_SCOPE_VALUE.get(key) ?? null;
  if (normalizedScope) return null;
  const crossScope = MES_STATUS_CONTRACTS.find((item) => item.value === normalizedValue);
  return crossScope || null;
}

export function getMesStatusOptions(scope: string = ""): MesStatusOption[] {
  const normalizedScope = String(scope || "").trim();
  return MES_STATUS_CONTRACTS
    .filter((item) => item.scope === normalizedScope)
    .map((item) => ({
      value: item.value,
      label: item.label,
      tone: item.tone,
      signal: item.signal,
      kind: item.kind,
      modules: item.modules,
    }));
}

export function getMesStatusView(
  scope: string = "",
  value: string = "",
  fallback: Partial<MesStatusContract> = {},
): MesStatusContract {
  const contract = getMesStatusContract(scope, value);
  return {
    scope,
    value: String(value || fallback.value || "").trim(),
    label: contract?.label || fallback.label || String(value || "Статус").trim(),
    tone: contract?.tone || fallback.tone || "neutral",
    signal: contract?.signal || fallback.signal || "neutral",
    kind: contract?.kind || fallback.kind || "status",
    modules: contract?.modules || fallback.modules || [],
    changes: contract?.changes || fallback.changes || "",
    blocks: contract?.blocks || fallback.blocks || "не блокирует напрямую",
    deleteRule: contract?.deleteRule || fallback.deleteRule || "проверить связи перед удалением",
  };
}

export function getMesModuleFlowContract(moduleId: string = ""): MesModuleFlowContract | null {
  const id = String(moduleId || "").trim();
  return MES_MODULE_FLOW_CONTRACTS[id] || null;
}

export function getMesModuleFlowSequence(): MesModuleFlowContract[] {
  return MES_MODULE_FLOW_SEQUENCE
    .map((moduleId) => getMesModuleFlowContract(moduleId))
    .filter((contract): contract is MesModuleFlowContract => contract !== null);
}

export function getMesGanttInfluenceMatrix(): MesGanttInfluenceRow[] {
  return getMesModuleFlowSequence().map((moduleContract) => ({
    moduleId: moduleContract.id,
    module: moduleContract.label,
    group: moduleContract.group,
    role: moduleContract.role,
    reads: moduleContract.reads,
    writes: moduleContract.writes,
    ganttImpact: moduleContract.ganttImpact,
    ganttVisualChange: moduleContract.ganttVisualChange,
    editPolicy: moduleContract.editPolicy,
  }));
}

export function buildMesDocumentContract(
  kind: string = "",
  source: MesDocumentReferenceInput = {},
): MesDocumentContract {
  const meta = getMesDocumentKind(kind);
  return {
    ...meta,
    entityId: String(source.id || source.routeId || source.slotId || "").trim(),
    sourceId: String(source.sourceId || source.routeId || source.specificationId || source.projectId || "").trim(),
    parentId: String(source.parentId || source.parentRouteId || source.planningOrderId || "").trim(),
  };
}

export function getMesFlowTransition(transitionId: string = ""): MesFlowTransitionContract | null {
  return TRANSITIONS_BY_ID.get(String(transitionId || "").trim()) || null;
}

export function getMesFlowTransitionsForDocument(kind: string = ""): MesFlowTransitionContract[] {
  const id = String(kind || "").trim();
  return MES_FLOW_TRANSITIONS.filter((transition) => transition.from === id || transition.to === id);
}

export function getMesFlowTransitionsForStatus(scope: string = "", value: string = ""): MesFlowTransitionContract[] {
  const normalizedScope = String(scope || "").trim();
  const normalizedValue = String(value || "").trim();
  return MES_FLOW_TRANSITIONS.filter((transition) => (
    transition.statusScope === normalizedScope
    && transition.nextStatus === normalizedValue
  ));
}

export function getMesFlowTransitionView(
  transitionId: string = "",
  fallback: Partial<MesUnknownFlowTransitionView> = {},
): MesFlowTransitionView {
  const transition = getMesFlowTransition(transitionId);
  if (!transition) {
    return {
      id: transitionId || fallback.id || "unknown-transition",
      label: fallback.label || "Переход не задан",
      sourceModule: fallback.sourceModule || "",
      targetModule: fallback.targetModule || "",
      description: fallback.description || "",
    };
  }
  const status = getMesStatusView(transition.statusScope, transition.nextStatus);
  return {
    ...transition,
    label: transition.actionLabel,
    status,
    route: `${transition.sourceModule} → ${transition.targetModule}`,
  };
}

export function buildMesFlowEvent(
  transitionId: string = "",
  source: MesOpenRecord = {},
  target: MesOpenRecord = {},
  payload: MesOpenRecord = {},
): MesFlowEvent {
  const transition = getMesFlowTransitionView(transitionId);
  const resolvedTransition = "from" in transition ? transition : null;
  return {
    id: `${transition.id || transitionId || "transition"}:${String(source.entityId || source.id || "").trim()}:${String(target.entityId || target.id || "").trim()}`,
    transitionId: transition.id || transitionId || "",
    from: resolvedTransition?.from || "",
    to: resolvedTransition?.to || "",
    sourceModule: transition.sourceModule || "",
    targetModule: transition.targetModule || "",
    dataPolicy: resolvedTransition?.dataPolicy || "",
    statusScope: resolvedTransition?.statusScope || "",
    nextStatus: resolvedTransition?.nextStatus || resolvedTransition?.status.value || "",
    sourceDocument: source,
    targetDocument: target,
    payload,
  };
}
