import type { NomenclatureItemDto } from "./adapter";

export const nomenclatureFixture: NomenclatureItemDto[] = [
  { id: "mat-001", article: "MAT-AL-01", name: "Алюминий листовой 1 мм", kind: "Материал", unit: "кг", status: "active" },
  { id: "rea-001", article: "RC0603-10K", name: "Резистор 10 кОм", kind: "РЭА", unit: "шт.", package: "0603", status: "active" },
  { id: "rea-002", article: "MCU-STM32", name: "Микроконтроллер STM32", kind: "РЭА", unit: "шт.", package: "LQFP-64", status: "draft" },
  { id: "pcb-001", article: "PCB-CONTROL-01", name: "Плата управления", kind: "Печатная плата", unit: "шт.", status: "active" },
];
