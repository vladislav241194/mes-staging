import { buildShiftWorkOrdersProductionModel } from "./production_model.ts";
import { formatPersonDisplayName } from "../../ui/formatters.js";

const EMPTY_JOURNAL = Object.freeze({
  rows: [],
  documentTree: [],
  selectedRow: null,
  sourceWindow: {},
  byStatus: {},
  totals: { planned: 0, assigned: 0, fact: 0, remaining: 0 },
  readModelCoverage: null,
});

export function formatShiftWorkOrderPersonName(value = "") {
  return formatPersonDisplayName(value, { fallback: "Исполнитель" });
}

export function createShiftWorkOrderJournalOwner({
  getProductionInput = () => ({}),
  getCapabilities = () => ({}),
  onSelectedRow = () => {},
} = {}) {
  return Object.freeze({
    getViewModel() {
      const model = buildShiftWorkOrdersProductionModel(getProductionInput(), getCapabilities());
      if (!model || !Array.isArray(model.rows)) return EMPTY_JOURNAL;
      if (model.selectedRow?.id) onSelectedRow(model.selectedRow);
      return model;
    },
  });
}
