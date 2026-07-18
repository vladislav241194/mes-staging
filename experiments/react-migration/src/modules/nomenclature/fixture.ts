export const nomenclatureFixture = {
  nomenclatureTypes: [
    { id: "nom-type-rea", name: "РЭА компоненты", code: "REA", description: "Резисторы, конденсаторы, микросхемы", status: "Активен" },
    { id: "nom-type-pcb", name: "Печатные платы", code: "PCB", description: "Голые платы и заготовки", status: "Активен" },
    { id: "nom-type-mech", name: "Механика", code: "MECH", description: "Корпуса, крепеж, радиаторы", status: "Активен" },
    { id: "nom-type-cable", name: "Кабели и жгуты", code: "CABLE", description: "Проводники, шлейфы, сборки", status: "Активен" },
    { id: "nom-type-archive", name: "Архивный раздел", code: "OLD", description: "Не должен быть виден", status: "Архив" },
  ],
  nomenclature: [
    { id: "rea-001", article: "RC0603-10K", name: "Резистор 10 кОм", type: "РЭА компоненты", unit: "шт.", package: "0603", manufacturer: "Yageo", status: "Активен" },
    { id: "rea-002", article: "MCU-STM32", name: "Микроконтроллер STM32", type: "РЭА компоненты", unit: "шт.", package: "LQFP-64", manufacturer: "ST", status: "Черновик" },
    { id: "pcb-001", article: "PCB-CONTROL-01", name: "Плата управления", type: "Печатные платы", unit: "шт.", package: "PCB", manufacturer: "—", status: "Активен" },
    { id: "mech-001", article: "CASE-AL-01", name: "Корпус алюминиевый", type: "Механика", unit: "шт.", package: "120×80", manufacturer: "MES Line", status: "Активен" },
  ],
};
