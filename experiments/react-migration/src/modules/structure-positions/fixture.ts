import { structureEmployeesFixture } from "../structure-employees/fixture";
export const structurePositionsFixture = structureEmployeesFixture;
export const structurePositionsUpdateFixture = { ...structureEmployeesFixture, registries: { ...structureEmployeesFixture.registries, positions: [{ id: "POS-QA", name: "Инженер по качеству", code: "QA", kind: "worker", orgUnitId: "D-MANUAL", workCenterId: "D-MANUAL", isActive: true }] } };
