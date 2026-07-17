import { createAccessControlService } from "../src/modules/access_control/service.js";
import { createAccessRolesModule } from "../src/modules/access_roles/render.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const actionDefinitions = [
  { id: "view", label: "Просмотр", shortLabel: "Видит" },
  { id: "edit", label: "Редактирование", shortLabel: "Правит" },
  { id: "print", label: "Печать", shortLabel: "Печать" },
  { id: "assign", label: "Назначение", shortLabel: "Назн." },
  { id: "approve", label: "Утверждение", shortLabel: "Утв." },
  { id: "configure", label: "Настройка", shortLabel: "Настр." },
];

const scopeDefinitions = [
  { id: "factory", label: "Вся фабрика" },
  { id: "department", label: "Свой отдел" },
  { id: "workCenter", label: "Свои участки" },
  { id: "self", label: "Только свои записи" },
];

const moduleDefinitions = [
  { id: "roles", label: "Роли и доступ" },
  { id: "gantt", label: "Планирование" },
];

const employees = [
  { id: "admin-user", name: "Администратор", role: "Системный администратор", positionId: "position-admin", factoryId: "factory-1", department: "Управление" },
  { id: "audit-user", name: "Аудитор", role: "Внутренний аудитор", positionId: "position-auditor", factoryId: "factory-1", department: "Контроль" },
];

const accessControlService = createAccessControlService({
  accessRoles: [
    {
      id: "admin",
      label: "Администратор",
      scope: "factory",
      defaultModule: "roles",
      grants: { "*": ["view", "edit", "print", "assign", "approve", "configure"] },
    },
    {
      id: "auditor",
      label: "Аудитор",
      description: "Контроль без изменения данных",
      scope: "factory",
      defaultModule: "roles",
      readOnly: true,
      grants: { roles: ["view", "print"], gantt: ["view", "print"] },
    },
  ],
  subjectRoleAssignments: [
    { id: "admin-assignment", subjectId: "admin-user", roleId: "admin" },
  ],
  positionDefaultRoleRules: [
    { id: "auditor-position", positionId: "position-auditor", roleId: "auditor" },
  ],
  responsibilityScopes: [
    { id: "auditor-factory-scope", roleId: "auditor", scope: "factory", factoryIds: ["factory-1"] },
  ],
  now: () => new Date("2026-07-10T12:00:00.000Z"),
});

function renderUiPanel({ title = "", meta = "", body = "", className = "" } = {}) {
  return `<section class="${className}"><h2>${title}</h2><p>${meta}</p>${body}</section>`;
}

function renderDependencies(overrides = {}) {
  return {
    ACCESS_ROLE_ACTIONS: actionDefinitions,
    ACCESS_ROLE_SCOPES: scopeDefinitions,
    escapeAttribute: (value) => String(value ?? "").replaceAll('"', "&quot;"),
    escapeHtml: (value) => String(value ?? ""),
    getAccessControlNow: () => new Date("2026-07-10T12:00:00.000Z"),
    getAccessControlResourceContext: () => ({ factoryId: "factory-1" }),
    getAccessControlService: () => accessControlService,
    getAccessControlSubject: () => employees[0],
    getAccessRoleProfiles: () => [],
    getApp: () => null,
    getMesModuleFlowContract: () => ({ group: "Система" }),
    getModuleAnnotation: (moduleId) => `Описание ${moduleId}`,
    getModuleDefinitions: () => moduleDefinitions,
    getProductionStructureEmployees: () => employees,
    getProductionStructureMatrixRuntimeOverrides: () => ({}),
    getUi: () => ({ accessRolesSelectedRoleId: "auditor", authCurrentUserId: "admin-user" }),
    normalizeAccessRoleAssignments: (value) => value || {},
    notifyAccessControlFailure: () => {},
    notifySaveSuccess: () => {},
    persistUiState: () => {},
    render: () => {},
    renderMesModulePatternPage: ({ sidebar, header, content }) => `<main class="access-roles-page"><aside>${sidebar.body}</aside><header><h1>${header.title}</h1>${header.description}${header.actions}</header>${content}</main>`,
    renderUiActionButton: ({ label, attributes = "" }) => `<button ${attributes}>${label}</button>`,
    renderUiFormField: ({ label, control }) => `<label>${label}${control}</label>`,
    renderUiFormGrid: ({ body }) => `<div>${body}</div>`,
    renderUiPanel,
    renderUiPanelBody: ({ body }) => body,
    renderUiSidebarItem: ({ title, meta, attributes = "" }) => `<button ${attributes}><strong>${title}</strong><small>${meta}</small></button>`,
    renderUiStatusToken: (label, tone) => `<span data-tone="${tone}">${label}</span>`,
    renderUiTableControlAttributes: () => 'data-ui-component="TableControl"',
    renderUiTableWrap: ({ body }) => `<div>${body}</div>`,
    resetAccessControlConfiguration: () => true,
    setAccessGrant: () => true,
    setResponsibilityScope: () => true,
    setSubjectRoleAssignment: () => true,
    updateAccessRole: () => true,
    ...overrides,
  };
}

function getInput(html, action) {
  return html.match(new RegExp(`<input[^>]*data-access-action-id="${action}"[^>]*>`, "i"))?.[0] || "";
}

const domainModule = createAccessRolesModule(renderDependencies());
const domainHtml = domainModule.renderAccessRolesPage();
assert(domainHtml.includes('data-access-control-enforcement="domain"'), "Roles UI must declare domain enforcement mode.");
assert(domainHtml.includes('data-access-grants-contract="six-actions"'), "Roles UI must declare the six-action grant contract.");
actionDefinitions.forEach((action) => {
  assert(domainHtml.includes(`data-access-action-id="${action.id}"`), `Grant matrix is missing ${action.id}.`);
});
assert(domainHtml.includes("Области ответственности"), "Roles UI must render responsibility scopes.");
assert(domainHtml.includes("auditor-factory-scope"), "Explicit responsibility scope must be visible.");
assert(domainHtml.includes("правило positionId"), "Position fallback must be identified as an exact positionId rule.");
assert(!domainHtml.includes("legacy auto"), "Domain mode must not expose legacy text inference.");
assert(getInput(domainHtml, "edit").includes("disabled"), "Read-only role edit grant must be disabled.");
assert(getInput(domainHtml, "assign").includes("disabled"), "Read-only role assign grant must be disabled.");
assert(!getInput(domainHtml, "print").includes("disabled"), "Read-only role print grant may remain configurable by an authorized admin.");

const deniedModule = createAccessRolesModule(renderDependencies({ getAccessControlSubject: () => employees[1] }));
const deniedHtml = deniedModule.renderAccessRolesPage();
assert(deniedHtml.includes('data-access-control-write="denied"'), "A subject without configure must get a denied write contract.");
assert(getInput(deniedHtml, "print").includes("disabled"), "Denied configure must disable even read-only-safe grant controls.");

const invalidDomainModule = createAccessRolesModule(renderDependencies({ getAccessControlService: () => ({}) }));
const invalidHtml = invalidDomainModule.renderAccessRolesPage();
assert(invalidHtml.includes('data-access-control-enforcement="domain-invalid"'), "Invalid domain service must be visible as domain-invalid.");
assert(invalidHtml.includes("Fail-closed"), "Invalid domain service must render a fail-closed explanation.");
assert(!invalidHtml.includes("data-access-role-permission"), "Invalid domain mode must not fall back to legacy controls.");

const legacyProfiles = [
  {
    id: "master",
    label: "Мастер",
    caption: "Legacy role",
    scope: "workCenter",
    defaultModule: "roles",
    modulePermissions: { roles: { view: true, edit: true, print: true, assign: true, approve: false, configure: false } },
  },
];
const legacyDependencies = renderDependencies({
  getAccessControlService: undefined,
  getAccessControlSubject: undefined,
  getAccessRoleProfiles: () => legacyProfiles,
  getAccessRoleForEmployee: () => ({ role: legacyProfiles[0], explicit: false }),
  getUi: () => ({ accessRolesSelectedRoleId: "master", accessRoleAssignments: {}, authCurrentUserId: "admin-user" }),
  resetAccessControlConfiguration: undefined,
  setAccessGrant: undefined,
  setResponsibilityScope: undefined,
  setSubjectRoleAssignment: undefined,
  updateAccessRole: undefined,
  resetAccessRoleConfiguration: () => {},
  setAccessRoleAssignment: () => {},
  setAccessRoleModulePermission: () => {},
  setAccessRoleProfileField: () => {},
});
const legacyModule = createAccessRolesModule(legacyDependencies);
const legacyHtml = legacyModule.renderAccessRolesPage();
assert(legacyHtml.includes('data-access-control-enforcement="legacy"'), "Legacy mode must be explicit.");
assert(legacyHtml.includes('data-access-role-field-name="caption"'), "Legacy profile callback must retain the caption compatibility field.");
assert(legacyHtml.includes("Compatibility"), "Legacy inference debt must be visible in the UI.");

class MockField {
  constructor(dataset, checked = false) {
    this.dataset = dataset;
    this.checked = checked;
    this.listeners = {};
  }

  addEventListener(name, listener) {
    this.listeners[name] = listener;
  }
}

function createMockPage(grantField) {
  return {
    querySelector: () => null,
    querySelectorAll: (selector) => selector === "[data-access-role-permission]" ? [grantField] : [],
  };
}

const committed = [];
const failures = [];
const printField = new MockField({
  accessRoleId: "auditor",
  accessModuleId: "roles",
  accessActionId: "print",
}, false);
const eventModule = createAccessRolesModule(renderDependencies({
  getApp: () => ({ querySelector: () => createMockPage(printField) }),
  setAccessGrant: (payload) => {
    committed.push(payload);
    return { ok: true };
  },
  notifyAccessControlFailure: (message, details) => failures.push({ message, details }),
}));
eventModule.bindAccessRolesEvents();
await printField.listeners.change();
assert(committed.length === 1 && committed[0].action === "print", "Authorized domain grant write must use setAccessGrant.");
assert(failures.length === 0, "Confirmed domain write must not report a failure.");

let legacyFallbackCalls = 0;
const noCallbackField = new MockField({
  accessRoleId: "auditor",
  accessModuleId: "roles",
  accessActionId: "print",
}, false);
const noCallbackFailures = [];
const noCallbackModule = createAccessRolesModule(renderDependencies({
  getApp: () => ({ querySelector: () => createMockPage(noCallbackField) }),
  setAccessGrant: undefined,
  setAccessRoleModulePermission: () => { legacyFallbackCalls += 1; },
  notifyAccessControlFailure: (message, details) => noCallbackFailures.push({ message, details }),
}));
noCallbackModule.bindAccessRolesEvents();
await noCallbackField.listeners.change();
assert(legacyFallbackCalls === 0, "Domain mode must never fall back to a legacy writer.");
assert(noCallbackFailures.length === 1, "Missing domain callback must fail closed and report the denial.");

console.log(JSON.stringify({
  ok: true,
  actions: actionDefinitions.length,
  domainMode: true,
  readonlyEnforced: true,
  scopeVisible: true,
  domainWriteConfirmed: committed.length,
  legacyFallbackBlocked: legacyFallbackCalls === 0,
}, null, 2));
