import { structureEmployeesFixture } from "../structure-employees/fixture";
export const structureOrgUnitsFixture = structureEmployeesFixture;
export const structureOrgUnitsUpdateFixture = { ...structureEmployeesFixture, registries: { ...structureEmployeesFixture.registries, orgUnits: [{ id: "D-QA", name: "Отдел качества", code: "QA", kind: "department", isActive: true }] } };
