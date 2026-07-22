import { buildDispatchProductionModel, type DispatchProductionModel } from "./production-model";

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};

export function adaptDispatchPayload(value: unknown): DispatchProductionModel {
  const payload = record(value);
  const productionModel = record(payload.productionModel);
  return buildDispatchProductionModel(Object.keys(productionModel).length ? productionModel : payload);
}

export type { DispatchProductionModel, DispatchRow } from "./production-model";
