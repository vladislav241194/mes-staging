export const boardsFixture = {
  bomLists: [
    {
      id: "board-control",
      name: "Плата управления",
      boardCode: "АБВГ.469659.001",
      resultItem: "Смонтированная плата управления",
      status: "Активен",
      sourceFileName: "АБВГ.469659.001 Клюшка.xlsx",
      importHeaders: ["№", "Описание", "Обозначение в схеме", "Аритикул производителя", "Производитель", "Корпус", "Кол-во", "Примечание", "Поле I"],
      importRows: [
        { values: [1, "Резистор 10 кОм", "R1-R10", "RC0603-10K", "Yageo", 603, 10, "1%", ""] },
        { values: [2, "Транзистор", "VT1, VT2", "MMBT3904", "onsemi", "SOT-23", 2, "", ""] },
        { values: [3, "Микроконтроллер", "DD1", "STM32G0", "ST", "QFN-32", 1, "Прошивка", ""] },
        { values: [4, "Разъем питания", "XP1-XP3", "HDR-2", "Amphenol", "Connector", 3, "", ""] },
      ],
    },
    {
      id: "board-power",
      name: "Плата питания",
      boardCode: "АБВГ.469659.002",
      resultItem: "Смонтированная плата питания",
      status: "Черновик",
      importRows: [],
    },
  ],
};

export const boardsUpdateFixture = {
  bomLists: [
    {
      ...boardsFixture.bomLists[1],
      status: "Активен",
      sourceFileName: "АБВГ.469659.002.xlsx",
      importRows: [
        { values: [1, "Конденсатор 1 мкФ", "C1-C4", "CC0603-1U", "Murata", "0603", 4, "", ""] },
        { values: [2, "Контроллер питания", "DA1", "TPS62130", "TI", "QFN-16", 1, "", ""] },
      ],
    },
  ],
};
