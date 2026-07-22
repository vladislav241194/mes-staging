import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-auth-picker-react-model-"));
try {
  const output = join(temporaryRoot, "adapter.mjs");
  await build({
    entryPoints: [new URL("../experiments/react-migration/src/modules/auth-picker/adapter.ts", import.meta.url).pathname],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { adaptAuthPickerPayload } = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);
  const registries = {
    employees: [
      { id: "employee-operator", displayName: "Иванов Иван Иванович", isActive: true },
      { id: "employee-master", displayName: "Петров Пётр Петрович", isActive: true },
      { id: "employee-director", displayName: "Сидоров Сидор Сидорович", isActive: true },
      { id: "employee-role-fallback", displayName: "Орлов Олег Олегович", department: "Офис", isActive: true },
      { id: "employee-inactive", displayName: "Архивный Сотрудник", isActive: false },
    ],
    employmentAssignments: [
      { id: "employment-operator-expired", employeeId: "employee-operator", positionId: "position-master", orgUnitId: "department-smt", workCenterId: "department-smt", isPrimary: true, validTo: "2025-12-31" },
      { id: "employment-operator", employeeId: "employee-operator", positionId: "position-operator", orgUnitId: "department-smt", workCenterId: "line-smt-1", isPrimary: false, validFrom: "2026-01-01" },
      { id: "employment-master", employeeId: "employee-master", positionId: "position-master", orgUnitId: "department-smt", workCenterId: "department-smt", isPrimary: true },
      { id: "employment-director", employeeId: "employee-director", positionId: "position-director", isPrimary: true },
    ],
    orgUnits: [
      { id: "department-smt", name: "SMT", kind: "department", isActive: true },
      { id: "line-smt-1", name: "Линия 1", kind: "section", parentOrgUnitId: "department-smt", isActive: true },
    ],
    workCenters: [
      { id: "department-smt", name: "SMT", description: "Поверхностный монтаж", parentWorkCenterId: "", isActive: true },
      { id: "line-smt-1", name: "Линия 1", description: "Первая линия", parentWorkCenterId: "department-smt", isActive: true },
    ],
    positions: [
      { id: "position-operator", name: "Оператор линии", kind: "worker", workCenterId: "line-smt-1", capabilities: { canExecute: true } },
      { id: "position-master", name: "Мастер участка", kind: "manager", workCenterId: "department-smt", capabilities: { canDistribute: true, canExecute: false } },
      { id: "position-director", name: "Директор производства", kind: "manager", capabilities: { canDistribute: true, canExecute: false } },
    ],
    accessRoles: [{ id: "office-user", label: "Офисный сотрудник", isActive: true }],
    roleAssignments: [{ id: "role-office", employeeId: "employee-role-fallback", roleId: "office-user", validFrom: "2026-01-01" }],
    grants: [{ id: "grant-office", roleId: "office-user", resourceId: "authSessionPrototype", actionId: "view", effect: "allow" }],
  };
  const production = adaptAuthPickerPayload({
    productionModel: {
      domains: { registries },
      businessDate: "2026-07-22",
      session: { attemptsLeft: 3, result: "ready" },
    },
    capabilities: { pinEntry: true },
  });
  assert.equal(production.canEnterPin, true);
  assert.equal(production.attemptsLeft, 3);
  assert.equal(production.result, "ready");
  assert.equal(production.employeeCount, 4, "inactive employees must not enter the production picker");
  const smt = production.departments.find((department) => department.id === "department-smt");
  assert.ok(smt, "canonical work-center root must become a department");
  assert.equal(smt.employeeCount, 2);
  assert.deepEqual(smt.directPeople.map((person) => person.id), ["employee-master"]);
  assert.equal(smt.directPeople[0].personKind, "master");
  assert.equal(smt.directPeople[0].canExecute, false);
  assert.deepEqual(smt.units.map((unit) => unit.id), ["line-smt-1"]);
  assert.deepEqual(smt.units[0].people.map((person) => person.id), ["employee-operator"]);
  assert.equal(smt.units[0].people[0].name, "Иванов Иван", "the existing compact Russian person-name contract must remain stable");
  assert.equal(smt.units[0].people[0].role, "Оператор линии", "an expired primary assignment must not shadow the current assignment");
  const administrative = production.departments.find((department) => department.name === "Административный отдел");
  assert.deepEqual(administrative?.directPeople.map((person) => person.id), ["employee-director"]);
  const office = production.departments.find((department) => department.name === "Офис");
  assert.equal(office?.directPeople[0].role, "Офисный сотрудник", "access role may supply a missing production-position label without becoming PIN authority");

  const elevation = adaptAuthPickerPayload({
    productionModel: {
      registries,
      businessDate: "2026-07-22",
    },
    elevation: { active: true, employeeId: "employee-operator", target: "planning" },
    authState: { attemptsLeft: 2, result: "pin-error" },
    capabilities: { pinEntry: true },
  });
  assert.equal(elevation.elevation, true);
  assert.equal(elevation.elevationTarget, "planning");
  assert.equal(elevation.forcedPersonId, "employee-operator");
  assert.equal(elevation.employeeCount, 1);
  assert.deepEqual(elevation.departments.flatMap((department) => [
    ...department.directPeople,
    ...department.units.flatMap((unit) => unit.people),
  ]).map((person) => person.id), ["employee-operator"]);

  const missingElevationActor = adaptAuthPickerPayload({
    productionModel: { registries, businessDate: "2026-07-22", elevation: { active: true, employeeId: "missing", target: "nomenclature" } },
    capabilities: { pinEntry: true },
  });
  assert.equal(missingElevationActor.employeeCount, 0, "elevation must fail closed when the signed employee is absent");

  const unitsAlias = adaptAuthPickerPayload({
    productionModel: {
      registries: {
        employees: [{ id: "unit-employee", displayName: "Тестов Тест Тестович", isActive: true }],
        employmentAssignments: [{ id: "unit-employment", employeeId: "unit-employee", positionId: "unit-position", orgUnitId: "unit-root", workCenterId: "unit-child", isPrimary: true }],
        orgUnits: [{ id: "unit-root", name: "Производство", isActive: true }],
        units: [
          { id: "unit-root", name: "Производство", parentUnitId: "", isActive: true },
          { id: "unit-child", name: "Участок", parentUnitId: "unit-root", isActive: true },
        ],
        positions: [{ id: "unit-position", name: "Сборщик", capabilities: { canExecute: true } }],
        accessRoles: [], roleAssignments: [], grants: [],
      },
      businessDate: "2026-07-22",
    },
  });
  assert.equal(unitsAlias.departments[0].units[0].people[0].id, "unit-employee", "the production read model must accept the units registry alias");

  const fixture = adaptAuthPickerPayload({
    model: {
      departments: [{
        id: "fixture-department",
        name: "Fixture",
        caption: "fixture contract",
        employeeCount: 1,
        directPeople: [{ id: "fixture-person", name: "Fixture Person", role: "Tester", canExecute: true }],
        units: [],
      }],
      forcedPersonId: "fixture-person",
      elevation: true,
      elevationTarget: "production-structure",
    },
    capabilities: { pinEntry: true },
    authState: { attemptsLeft: 4, result: "fixture" },
  });
  assert.deepEqual(
    [fixture.departments[0].id, fixture.employeeCount, fixture.canEnterPin, fixture.attemptsLeft, fixture.elevationTarget],
    ["fixture-department", 1, true, 4, "production-structure"],
    "the existing { model } fixture envelope must remain compatible",
  );

  const [adapterSource, productionSource] = await Promise.all([
    readFile(new URL("../experiments/react-migration/src/modules/auth-picker/adapter.ts", import.meta.url), "utf8"),
    readFile(new URL("../experiments/react-migration/src/modules/auth-picker/production-model.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${adapterSource}\n${productionSource}`, /getAuthPrototypeReactModel|auth_render/, "the typed read model must not import the legacy auth renderer");
  assert.doesNotMatch(`${adapterSource}\n${productionSource}`, /Record<string,\s*any>/, "the production adapter must not reopen an any-shaped boundary");

  console.log("Authorization picker React production model QA: OK");
  console.log("- raw System Domains employees, assignments, org/work-center hierarchy and access-role fallback: pass");
  console.log("- current { model } fixture envelope, units alias and fail-closed elevation: pass");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
