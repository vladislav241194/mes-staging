export const componentTypesFixture = {
  componentTypes: [
    { id: "ct-0402", name: "Чип 0402", package: "0402", family: "R/C/L", coefficient: 0.70, placementsPerHour: 64400, setupSeconds: 12, defaultCount: 42, status: "Активен" },
    { id: "ct-sot23", name: "SOT-23 / SOD", package: "SOT-23", family: "Дискреты", coefficient: 0.22, placementsPerHour: 20200, setupSeconds: 18, defaultCount: 6, status: "Активен" },
    { id: "ct-soic", name: "SOIC / TSSOP", package: "SOIC/TSSOP", family: "Микросхемы", coefficient: 0.22, placementsPerHour: 20200, setupSeconds: 26, defaultCount: 2, status: "Активен" },
    { id: "ct-qfn", name: "QFN / DFN", package: "QFN", family: "Микросхемы", coefficient: 0.06, placementsPerHour: 5500, setupSeconds: 34, defaultCount: 1, status: "Отключен" },
  ],
};

export const componentTypesUpdateFixture = {
  componentTypes: [
    { id: "ct-connector", name: "Разъем / крупный корпус", package: "Connector", family: "Крупные", coefficient: 0.06, placementsPerHour: 5520, setupSeconds: 40, defaultCount: 3, status: "Активен" },
  ],
};
