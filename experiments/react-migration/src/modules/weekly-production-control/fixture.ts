const days = [
  ["2026-07-13", "13.07", "пн", false], ["2026-07-14", "14.07", "вт", false],
  ["2026-07-15", "15.07", "ср", false], ["2026-07-16", "16.07", "чт", false],
  ["2026-07-17", "17.07", "пт", false], ["2026-07-18", "18.07", "сб", true],
  ["2026-07-19", "19.07", "вс", true],
].map(([id, label, weekday, isWeekend]) => ({ id, label, weekday, isWeekend }));

const makeDays = (plan: number[], fact: number[]) => days.map((day, index) => {
  const planQuantity = plan[index] || 0;
  const factQuantity = fact[index] || 0;
  const deviationPercent = planQuantity ? ((factQuantity - planQuantity) / planQuantity) * 100 : factQuantity ? 100 : 0;
  const isDeviation = (planQuantity > 0 || factQuantity > 0) && Math.abs(deviationPercent) > 5;
  return { ...day, planQuantity, factQuantity, deviationPercent, isDeviation, tone: isDeviation ? "risk" : factQuantity >= planQuantity && planQuantity > 0 ? "ok" : "neutral", deviationNotes: isDeviation ? [{ text: "Причина проверяется" }] : [], reports: [] };
});

const groups = [
  { id: "assembly::line-1", workCenterLabel: "Сборочный участок", resourceLabel: "Линия 1", unit: "шт.", days: makeDays([20, 20, 20, 20, 20, 0, 0], [20, 18, 22, 20, 20, 0, 0]), totalPlan: 100, totalFact: 100, deviationPercent: 0, deviationCount: 2, reports: [{ id: "r-1" }] },
  { id: "smt::dek", workCenterLabel: "SMT", resourceLabel: "DEK Horizon", unit: "плат", days: makeDays([100, 100, 100, 100, 100, 0, 0], [100, 100, 94, 100, 100, 0, 0]), totalPlan: 500, totalFact: 494, deviationPercent: -1.2, deviationCount: 1, reports: [] },
];

export const weeklyProductionControlFixture = { model: { weekLabel: "13.07.2026-19.07.2026", days, groups, rows: [{ id: "op-1" }, { id: "op-2" }], totals: { plan: 600, fact: 594, deviationPercent: -1, deviationCount: 3, reportCount: 1 } } };
export const weeklyProductionControlUpdateFixture = { model: { ...weeklyProductionControlFixture.model, totals: { plan: 600, fact: 600, deviationPercent: 0, deviationCount: 2, reportCount: 1 } } };
