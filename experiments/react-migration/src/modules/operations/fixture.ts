export const operationsFixture = {
  operations: [
    { id: "op-aoi", name: "Оптическая инспекция", code: "AOI-010", workCenterId: "D3_AOI", workCenterLabel: "Автоматическая оптическая инспекция", unitsPerHour: 110, status: "Активен" },
    { id: "op-smt", name: "SMT-монтаж", code: "SMT-010", workCenterId: "D3", workCenterLabel: "SMT-монтаж", unitsPerHour: 55, status: "Активен" },
    { id: "op-smt-old", name: "SMT-монтаж (архив)", code: "SMT2-010", workCenterId: "D3_L2", workCenterLabel: "SMT-монтаж", unitsPerHour: 50, status: "Отключен" },
    { id: "op-wash", name: "Отмывка", code: "UW-010", workCenterId: "D3_UW", workCenterLabel: "Отмывка", unitsPerHour: 150, status: "Активен" },
  ],
};

export const operationsUpdateFixture = {
  operations: [
    { id: "op-smt", name: "SMT-монтаж", code: "SMT-010", workCenterId: "D3", workCenterLabel: "SMT-монтаж", unitsPerHour: 60, status: "Активен" },
  ],
};
