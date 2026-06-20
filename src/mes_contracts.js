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
    label: "Факт диспетчерской",
    shortLabel: "Факт",
    group: "Оперативное управление",
    signal: "fact",
    description: "Фактический результат сменного заказ-наряда: выпуск, брак, отклонение.",
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
    modules: ["Мастерская", "Диспетчерская"],
    changes: "Строка доступна мастеру, но еще не выпущена в работу.",
    blocks: "Диспетчерская видит план без подтвержденного сменного листа.",
    deleteRule: "Оставить как начальное состояние сменного заказ-наряда.",
  },
  {
    scope: "shiftAssignment",
    value: "issued",
    label: "Выпущен",
    tone: "ok",
    signal: "ready",
    kind: "shiftStatus",
    modules: ["Мастерская", "Диспетчерская"],
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
    modules: ["Диспетчерская"],
    changes: "Различает пустой факт и нулевой выпуск.",
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
    modules: ["Диспетчерская", "Планирование"],
    changes: "Факт ниже плана и может создать корректировку.",
    blocks: "Не блокирует, но требует контроля остатка.",
    deleteRule: "Оставить как состояние отклонения по выпуску.",
  },
  {
    scope: "dispatchFact",
    value: "accepted",
    label: "Принято",
    tone: "ok",
    signal: "ready",
    kind: "factStatus",
    modules: ["Диспетчерская"],
    changes: "Сменный факт принят, отклонение не требует вмешательства.",
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
    modules: ["Диспетчерская", "Планирование"],
    changes: "Создает оперативный проблемный сигнал и открытую корректировку.",
    blocks: "Блокирует спокойное закрытие смены до разбора.",
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
    modules: ["Заказ-наряды", "Планирование"],
    owns: ["workOrder", "ganttSlot"],
  },
  operations: {
    id: "operations",
    label: "Оперативное управление",
    modules: ["Мастерская", "Диспетчерская"],
    owns: ["shiftWorkOrder", "dispatchFact"],
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
    targetModule: "Диспетчерская",
    actionLabel: "Внести факт",
    statusScope: "dispatchFact",
    nextStatus: "accepted",
    dataPolicy: "write-fact-layer",
    description: "Диспетчерская фиксирует план/факт, брак и комментарий отдельным слоем, не перезаписывая исходный план.",
    futureProofing: "Позже этот факт сможет запускать корректировку Ганта, складское движение или закрытие смены через отдельный обработчик.",
  },
  {
    id: "dispatchFactToPlanningCorrection",
    from: "dispatchFact",
    to: "ganttSlot",
    sourceModule: "Диспетчерская",
    targetModule: "Планирование",
    actionLabel: "Создать корректировку",
    statusScope: "dispatchFact",
    nextStatus: "partial",
    dataPolicy: "request-replan",
    description: "Отклонение факта от плана создает запрос на корректировку будущей нагрузки, но не меняет прошлый план автоматически.",
    futureProofing: "Когда появится автоматическое перепланирование, оно будет читать корректировки, а не сырые поля диспетчерской.",
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
  const key = `${String(scope || "").trim()}:${String(value || "").trim()}`;
  if (STATUS_BY_SCOPE_VALUE.has(key)) return STATUS_BY_SCOPE_VALUE.get(key);
  const crossScope = MES_STATUS_CONTRACTS.find((item) => item.value === value);
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
