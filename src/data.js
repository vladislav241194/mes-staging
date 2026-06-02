const nowStamp = "2026-05-30T10:30:00";

export const workCenters = [
  {
    id: "smt",
    name: "SMT-монтаж",
    code: "SMT",
    description: "Автоматический поверхностный монтаж компонентов",
    isActive: true,
  },
  {
    id: "aoi",
    name: "AOI-контроль",
    code: "AOI",
    description: "Автоматическая оптическая инспекция",
    isActive: true,
  },
  {
    id: "wash",
    name: "Отмывка",
    code: "WASH",
    description: "Отмывка печатных плат после пайки",
    isActive: true,
  },
  {
    id: "manual",
    name: "Ручной монтаж",
    code: "MAN",
    description: "Ручная установка компонентов и доработка",
    isActive: true,
  },
  {
    id: "test",
    name: "Тестирование",
    code: "TEST",
    description: "Функциональный и электрический контроль",
    isActive: true,
  },
  {
    id: "coating",
    name: "Лакировка",
    code: "COAT",
    description: "Нанесение защитного покрытия",
    isActive: true,
  },
  {
    id: "mechanic",
    name: "Слесарный участок",
    code: "MECH",
    description: "Механическая подготовка корпусов и крепежа",
    isActive: true,
  },
  {
    id: "assembly",
    name: "Сборка",
    code: "ASM",
    description: "Финальная сборка готового изделия",
    isActive: true,
  },
];

const routeTemplates = {
  full: [
    ["smt", "SMT-монтаж", true],
    ["aoi", "AOI-контроль", true],
    ["wash", "Отмывка", true],
    ["manual", "Ручной монтаж", true],
    ["test", "Тестирование", true],
    ["coating", "Лакировка", false],
    ["assembly", "Сборка", true],
  ],
  controller: [
    ["smt", "SMT-монтаж", true],
    ["aoi", "AOI-контроль", true],
    ["manual", "Ручной монтаж", true],
    ["test", "Тестирование", true],
    ["assembly", "Сборка", true],
  ],
  device: [
    ["smt", "SMT-монтаж", true],
    ["aoi", "AOI-контроль", true],
    ["wash", "Отмывка", true],
    ["manual", "Ручной монтаж", true],
    ["test", "Тестирование", true],
    ["coating", "Лакировка", true],
    ["mechanic", "Слесарный участок", true],
    ["assembly", "Сборка", true],
  ],
  service: [
    ["manual", "Ручной монтаж", true],
    ["test", "Тестирование", true],
    ["assembly", "Сборка", true],
  ],
};

export function createDefaultPlanningState() {
  return {
    version: 1,
    // Legacy compatibility only. Production planning is specification-centered;
    // historical project records are migrated into directoryState.specifications.
    projects: [],
    batches: [],
    workCenters: structuredClone(workCenters),
    routes: [],
    routeSteps: [],
    slots: [],
  };
}

export function createProductionBundle({ specificationId, name, orderNumber, customer, totalQuantity, dueDate, status, routeTemplate }) {
  const stamp = new Date().toISOString();
  const productionId = specificationId || `spec-${crypto.randomUUID().slice(0, 8)}`;
  const routeId = `r-${productionId}`;
  const template = routeTemplates[routeTemplate] || routeTemplates.full;

  return {
    batch: {
      id: `b-${routeId}-1`,
      routeId,
      specificationId: productionId,
      // projectId remains as a storage alias for older Gantt and validation code.
      projectId: productionId,
      batchNumber: "1",
      quantity: totalQuantity,
      status: "planned",
      createdAt: stamp,
      updatedAt: stamp,
    },
    route: {
      id: routeId,
      specificationId: productionId,
      specificationName: name || "",
      // projectId remains as a storage alias for older Gantt and validation code.
      projectId: productionId,
      name: "Основной маршрут",
      isDefault: true,
    },
    routeSteps: template.map(([workCenterId, operationName, isRequired], index) => ({
      id: `rs-${productionId}-${index + 1}`,
      routeId,
      workCenterId,
      operationName,
      stepOrder: index + 1,
      isRequired,
    })),
  };
}

export const routeTemplateOptions = [
  { value: "full", label: "Платы с отмывкой и лакировкой" },
  { value: "controller", label: "Контроллер без отмывки" },
  { value: "device", label: "Готовое изделие с механикой" },
  { value: "service", label: "Ручная сборка и тестирование" },
];
