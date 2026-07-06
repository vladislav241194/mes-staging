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
};

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
};

export const MES_STATUS_CONTRACTS = [
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

export const MES_FLOW_MODULES = {
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
    modules: ["Диспетчерская", "Мастерская", "Журнал СЗН"],
    owns: ["shiftWorkOrder"],
  },
};

export const MES_MODULE_FLOW_SEQUENCE = [
  "nomenclature",
  "products",
  "routes",
	  "planning",
	  "gantt",
	  "weeklyProductionControl",
  "shiftMasterBoard",
  "shiftWorkOrders",
  "dispatch",
  "productionStructureMatrix",
  "employees",
  "timesheet",
  "roles",
  "contourAdmin",
  "directories",
  "visualSystem",
  "authPrototype",
  "authSessionPrototype",
  "planningTable",
  "supply",
  "shopMap",
];

export const MES_MODULE_FLOW_CONTRACTS = {
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
  products: {
    id: "products",
    label: "Спецификации",
    group: "Технологии",
    role: "Структура изделия: узлы, платы, вложенность и количество.",
    reads: ["Номенклатура"],
    writes: ["Спецификация", "Состав изделия"],
    ganttImpact: "indirect",
    ganttVisualChange: "Меняет будущую структуру заказ-наряда только после пересоздания/обновления документа.",
    editPolicy: "Не должна напрямую создавать слоты Gantt.",
  },
  routes: {
    id: "routes",
    label: "Маршрутная карта",
    group: "Технологии",
    role: "Технологическое описание операций и связей с частями спецификации.",
    reads: ["Спецификации", "Номенклатура", "Справочник операций", "Права"],
    writes: ["Маршрутная карта", "Операции маршрута"],
    ganttImpact: "indirect",
    ganttVisualChange: "Ничего не меняет в Gantt напрямую; влияет только через заказ-наряд.",
    editPolicy: "Маршрутная карта не должна передавать операции в Gantt без заказ-наряда.",
  },
  planning: {
    id: "planning",
    label: "Заказ-наряды",
    group: "Планирование нагрузки",
    role: "Плановый документ: количество, срок, расчетные блоки и подготовка передачи в планирование.",
    reads: ["Маршрутная карта", "Спецификации", "Права", "Табель"],
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
    reads: ["Заказ-наряды", "Права", "Табель"],
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
    reads: ["Слоты планирования", "Заказ-наряды", "Маршрутная карта", "Права", "Табель"],
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
  dispatch: {
    id: "dispatch",
    label: "Диспетчерская",
    group: "Оперативное управление",
    role: "Модуль-заглушка: диспетчерская выведена из рабочего контура и сейчас не влияет на планирование, Гант, мастерскую и заказ-наряды.",
    reads: [],
    writes: [],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Не принимает факт, не хранит аналитику и не пересчитывает Гант до нового ТЗ.",
  },
  productionStructureMatrix: {
    id: "productionStructureMatrix",
    label: "Права",
    group: "Система",
    role: "Единый источник производственной структуры: отделы, участки, ресурсы, сотрудники, графики, передачи и правила доступности.",
    reads: [],
    writes: ["Производственная структура", "Графики", "Ресурсы", "Сотрудники", "Правила доступности"],
    ganttImpact: "indirect-operational",
    ganttVisualChange: "Напрямую не двигает Гант; через Табель и Мастерскую определяет доступных исполнителей и визуальный слой распределения.",
    editPolicy: "Все изменения отделов, участков, ресурсов и сотрудников делать здесь; старые справочники структуры не использовать.",
  },
  employees: {
    id: "employees",
    label: "Структура",
    group: "Система",
    role: "Визуальная организационная структура отделов, ресурсов и сотрудников.",
    reads: ["Права"],
    writes: [],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Пока read-only визуализация; не менять назначение ресурсов из диаграммы.",
  },
  timesheet: {
    id: "timesheet",
    label: "Табель",
    group: "Система",
    role: "Производственный календарь сотрудников: графики, отсутствия, отпуска, больничные, сверхурочные и доступность исполнителей.",
    reads: ["Права"],
    writes: ["График сотрудника", "Состояние дня", "Сверхурочные"],
    ganttImpact: "indirect-operational",
    ganttVisualChange: "Напрямую не меняет Гант; ограничивает список доступных исполнителей в Мастерской, а распределение Мастерской уже отражается на колбасках.",
    editPolicy: "Меняет доступность людей для сменного распределения; не двигает слоты и не пересчитывает длительности операций.",
  },
  roles: {
    id: "roles",
    label: "Роли",
    group: "Система",
    role: "Рабочий контур авторизации и доступа: роли, права на модули, действия и ручные назначения сотрудников после PIN-входа.",
    reads: ["Права", "Авторизация", "Список модулей"],
    writes: ["Роли", "Матрица прав", "Назначения сотрудников"],
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
    label: "Справочники",
    group: "Система",
    role: "Мастер-данные без производственной структуры: операции, статусы, типы компонентов и типы номенклатуры.",
    reads: [],
    writes: ["Операции", "Статусы", "Типы компонентов", "Типы номенклатуры"],
    ganttImpact: "indirect",
    ganttVisualChange: "Меняет будущие операции и подписи, но не перестраивает существующий Gantt без отдельного пересчета.",
    editPolicy: "Новые статусы добавлять через MES_STATUS_CONTRACTS, а не локально в модуле.",
  },
  visualSystem: {
    id: "visualSystem",
    label: "UI-состояния",
    group: "UX-макеты",
    role: "Витрина UI-kit, сигналов, Gantt-состояний и визуальных правил прототипа.",
    reads: ["UI contracts", "Gantt Design System", "Статусы", "Сигналы"],
    writes: [],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Не должна менять бизнес-данные; служит эталоном визуальных состояний и QA-ориентиром.",
  },
  authPrototype: {
    id: "authPrototype",
    label: "Авторизация",
    group: "Авторизация",
    role: "Внутренний системный экран входа: выбор отдела, сотрудника и автоматическая проверка PIN на пятой цифре.",
    reads: ["Права", "Структура", "Роли"],
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
    reads: ["Права", "Структура", "Мастерская", "Сменные заказ-наряды", "Маршрутные карты"],
    writes: ["Факт исполнителя", "Агрегированный факт сменной задачи после закрытия всех исполнителей"],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Исполнитель редактирует только свой факт и брак; начальник производства просматривает чужие рабочие столы без записи.",
  },
  planningTable: {
    id: "planningTable",
    label: "План-таблица",
    group: "UX-макеты",
    role: "Демо-представление Gantt в виде матрицы ресурсов и табличного реестра слотов.",
    reads: ["Слоты планирования", "Маршрутные карты", "Ресурсы", "Предупреждения Gantt"],
    writes: [],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Read-only UX-макет: не изменяет слоты, статусы, зависимости или фактические данные.",
  },
  supply: {
    id: "supply",
    label: "Снабжение",
    group: "UX-макеты",
    role: "Тестовый контур потребностей, закупок и поставок.",
    reads: ["Заказ-наряды", "BOM", "Номенклатура"],
    writes: ["Локальные данные снабжения"],
    ganttImpact: "none-current",
    ganttVisualChange: "—",
    editPolicy: "UX-макет не должен менять производственный план.",
  },
  shopMap: {
    id: "shopMap",
    label: "Цех производства",
    group: "UX-макеты",
    role: "Визуальная карта производственных зон, участков и потоков для обсуждения будущего интерактива.",
    reads: ["Отделы", "Ресурсы", "Слоты планирования"],
    writes: [],
    ganttImpact: "none",
    ganttVisualChange: "—",
    editPolicy: "Read-only UX-макет: не назначает ресурсы, не двигает слоты и не меняет фактические данные.",
  },
};

export const MES_FLOW_TRANSITIONS = [
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

export function getMesDocumentKind(kind = "") {
  return MES_DOCUMENT_KINDS[kind] || {
    id: kind || "unknown",
    label: "Документ",
    shortLabel: "Док.",
    group: "Система",
    signal: "neutral",
    description: "Документ без закрепленного контракта.",
  };
}

export function getMesStatusContract(scope = "", value = "") {
  const normalizedScope = String(scope || "").trim();
  const normalizedValue = String(value || "").trim();
  const key = `${normalizedScope}:${normalizedValue}`;
  if (STATUS_BY_SCOPE_VALUE.has(key)) return STATUS_BY_SCOPE_VALUE.get(key);
  if (normalizedScope) return null;
  const crossScope = MES_STATUS_CONTRACTS.find((item) => item.value === normalizedValue);
  return crossScope || null;
}

export function getMesStatusOptions(scope = "") {
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

export function getMesStatusView(scope = "", value = "", fallback = {}) {
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

export function getMesModuleFlowContract(moduleId = "") {
  const id = String(moduleId || "").trim();
  return MES_MODULE_FLOW_CONTRACTS[id] || null;
}

export function getMesModuleFlowSequence() {
  return MES_MODULE_FLOW_SEQUENCE
    .map((moduleId) => getMesModuleFlowContract(moduleId))
    .filter(Boolean);
}

export function getMesGanttInfluenceMatrix() {
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

export function buildMesDocumentContract(kind = "", source = {}) {
  const meta = getMesDocumentKind(kind);
  return {
    ...meta,
    entityId: String(source.id || source.routeId || source.slotId || "").trim(),
    sourceId: String(source.sourceId || source.routeId || source.specificationId || source.projectId || "").trim(),
    parentId: String(source.parentId || source.parentRouteId || source.planningOrderId || "").trim(),
  };
}

export function getMesFlowTransition(transitionId = "") {
  return TRANSITIONS_BY_ID.get(String(transitionId || "").trim()) || null;
}

export function getMesFlowTransitionsForDocument(kind = "") {
  const id = String(kind || "").trim();
  return MES_FLOW_TRANSITIONS.filter((transition) => transition.from === id || transition.to === id);
}

export function getMesFlowTransitionsForStatus(scope = "", value = "") {
  const normalizedScope = String(scope || "").trim();
  const normalizedValue = String(value || "").trim();
  return MES_FLOW_TRANSITIONS.filter((transition) => (
    transition.statusScope === normalizedScope
    && transition.nextStatus === normalizedValue
  ));
}

export function getMesFlowTransitionView(transitionId = "", fallback = {}) {
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

export function buildMesFlowEvent(transitionId = "", source = {}, target = {}, payload = {}) {
  const transition = getMesFlowTransitionView(transitionId);
  return {
    id: `${transition.id || transitionId || "transition"}:${String(source.entityId || source.id || "").trim()}:${String(target.entityId || target.id || "").trim()}`,
    transitionId: transition.id || transitionId || "",
    from: transition.from || "",
    to: transition.to || "",
    sourceModule: transition.sourceModule || "",
    targetModule: transition.targetModule || "",
    dataPolicy: transition.dataPolicy || "",
    statusScope: transition.statusScope || "",
    nextStatus: transition.nextStatus || transition.status?.value || "",
    sourceDocument: source,
    targetDocument: target,
    payload,
  };
}
