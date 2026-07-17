import {
  createAccessRolesReadAdapter,
  describeResponsibilityScope,
  formatAccessEffectiveWindow,
  getAccessRoleActionDefinitions,
  getAccessRoleScopeDefinitions,
} from "./service.js";
import { formatPersonDisplayName } from "../../ui/formatters.js";

const READ_ONLY_ACTION_IDS = new Set(["view", "print"]);
const WRITABLE_ROLE_FIELDS = new Set(["label", "description", "caption", "scope", "defaultModule"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export function createAccessRolesModule(dependencies = {}) {
  const domainRequested = typeof dependencies.getAccessControlService === "function";
  const {
    ACCESS_ROLE_ACTIONS = [],
    ACCESS_ROLE_SCOPES = [],
    escapeAttribute = (value) => String(value ?? ""),
    escapeHtml = (value) => String(value ?? ""),
    getAccessControlNow = () => new Date(),
    getAccessControlResourceContext = () => ({}),
    getAccessControlService = () => null,
    getAccessControlSubject = () => null,
    getAccessRoleForEmployee = () => ({ role: null, explicit: false }),
    getAccessRoleProfiles = () => [],
    getApp = () => null,
    getMesModuleFlowContract = () => null,
    getModuleAnnotation = () => "",
    getModuleDefinitions = () => [],
    getProductionStructureEmployees = () => [],
    getProductionStructureMatrixRuntimeOverrides = () => ({}),
    getUi = () => ({}),
    normalizeAccessRoleAssignments = (value = {}) => value,
    notifyAccessControlFailure = () => {},
    notifySaveSuccess = () => {},
    persistUiState = () => {},
    render = () => {},
    renderMesModulePatternPage = () => "",
    renderUiActionButton = () => "",
    renderUiFormField = ({ control = "" } = {}) => control,
    renderUiFormGrid = ({ body = "" } = {}) => body,
    renderUiPanel = ({ body = "" } = {}) => body,
    renderUiPanelBody = ({ body = "" } = {}) => body,
    renderUiSidebarItem = () => "",
    renderUiStatusToken = () => "",
    renderUiTableControlAttributes = () => 'data-ui-component="TableControl" data-ui-density="default"',
    renderUiTableWrap = ({ body = "" } = {}) => body,
    resetAccessControlConfiguration = null,
    resetAccessRoleConfiguration = null,
    setAccessGrant = null,
    setAccessRoleAssignment = null,
    setAccessRoleModulePermission = null,
    setAccessRoleProfileField = null,
    setResponsibilityScope = null,
    setSubjectRoleAssignment = null,
    updateAccessRole = null,
  } = dependencies;

  const actionDefinitions = getAccessRoleActionDefinitions(ACCESS_ROLE_ACTIONS);
  const scopeDefinitions = getAccessRoleScopeDefinitions(ACCESS_ROLE_SCOPES);
  const actionIds = new Set(actionDefinitions.map((action) => action.id));
  const scopeIds = new Set(scopeDefinitions.map((scope) => scope.id));
  const legacyAssignmentsWritable = typeof setAccessRoleAssignment === "function";
  const legacyGrantsWritable = typeof setAccessRoleModulePermission === "function";
  const legacyProfilesWritable = typeof setAccessRoleProfileField === "function";
  const legacyResetWritable = typeof resetAccessRoleConfiguration === "function";

  function getModuleContext() {
    const ui = getUi() || {};
    const employees = getProductionStructureEmployees(getProductionStructureMatrixRuntimeOverrides()) || [];
    const currentPerson = employees.find((person) => person.id === ui.authCurrentUserId) || null;
    let domainService = null;
    if (domainRequested) {
      try {
        domainService = getAccessControlService();
      } catch {
        domainService = null;
      }
    }
    let at;
    try {
      at = getAccessControlNow();
    } catch {
      at = new Date();
    }
    let legacyAssignments = {};
    try {
      legacyAssignments = normalizeAccessRoleAssignments(ui.accessRoleAssignments);
    } catch {
      legacyAssignments = {};
    }
    const adapter = createAccessRolesReadAdapter({
      domainRequested,
      domainService,
      legacyProfiles: getAccessRoleProfiles(),
      legacyAssignments,
      getLegacyAccessRoleForEmployee: getAccessRoleForEmployee,
      legacyWritable: legacyAssignmentsWritable || legacyGrantsWritable || legacyProfilesWritable || legacyResetWritable,
      at,
    });
    const requestedRoleId = String(ui.accessRolesSelectedRoleId || ui.activeRole || "");
    const selectedRole = adapter.getRole(requestedRoleId) || adapter.accessRoles[0] || null;
    let accessSubject = currentPerson;
    try {
      accessSubject = getAccessControlSubject() || currentPerson;
    } catch {
      accessSubject = currentPerson;
    }
    let accessResourceContext = {};
    try {
      const candidate = getAccessControlResourceContext();
      accessResourceContext = isRecord(candidate) ? candidate : {};
    } catch {
      accessResourceContext = {};
    }
    const canConfigure = adapter.canConfigure(accessSubject, accessResourceContext);
    const domainMode = adapter.mode === "domain";
    return {
      ui,
      employees,
      currentPerson,
      accessSubject,
      accessResourceContext,
      at,
      adapter,
      selectedRole,
      canConfigure,
      capabilities: {
        reset: canConfigure && (domainMode ? typeof resetAccessControlConfiguration === "function" : legacyResetWritable),
        role: canConfigure && (domainMode ? typeof updateAccessRole === "function" : legacyProfilesWritable),
        grant: canConfigure && (domainMode ? typeof setAccessGrant === "function" : legacyGrantsWritable),
        assignment: canConfigure && (domainMode ? typeof setSubjectRoleAssignment === "function" : legacyAssignmentsWritable),
        scope: canConfigure && domainMode && typeof setResponsibilityScope === "function",
      },
    };
  }

  function getScopeLabel(scope = "") {
    return scopeDefinitions.find((item) => item.id === scope)?.label || "Неизвестная область";
  }

  function getVisibleModuleCount(context, role) {
    return getModuleDefinitions().filter((moduleItem) => context.adapter.grants(role, moduleItem.id, "view")).length;
  }

  function disabledAttribute(enabled, reason = "") {
    return enabled ? "" : `disabled aria-disabled="true"${reason ? ` title="${escapeAttribute(reason)}"` : ""}`;
  }

  function renderProfilePanel(context, role) {
    const visibleModules = getModuleDefinitions().filter((moduleItem) => context.adapter.grants(role, moduleItem.id, "view"));
    const defaultModuleAllowed = Boolean(role.defaultModule && visibleModules.some((moduleItem) => moduleItem.id === role.defaultModule));
    const moduleOptions = [
      '<option value="">Не выбран</option>',
      ...visibleModules.map((moduleItem) => `<option value="${escapeAttribute(moduleItem.id)}" ${moduleItem.id === role.defaultModule ? "selected" : ""}>${escapeHtml(moduleItem.label)}</option>`),
    ].join("");
    const disabled = disabledAttribute(context.capabilities.role, "Нет подтверждённого configure или callback записи роли.");
    const descriptionFieldName = context.adapter.mode === "domain" ? "description" : "caption";
    return renderUiPanel({
      title: "Паспорт роли",
      meta: "Роль, область ответственности и стартовый модуль хранятся отдельно от должности сотрудника",
      className: "access-role-profile-panel",
      body: renderUiPanelBody({ body: `
        <div class="ui-inline-statuses">
          ${renderUiStatusToken(role.readOnly ? "роль только для чтения" : "операционная роль", role.readOnly ? "warning" : "neutral")}
          ${renderUiStatusToken(defaultModuleAllowed || !role.defaultModule ? "стартовый модуль разрешён" : "стартовый модуль без view", defaultModuleAllowed || !role.defaultModule ? "ok" : "critical")}
          ${renderUiStatusToken(context.adapter.mode === "domain" ? "domain enforcement" : "legacy compatibility", context.adapter.mode === "domain" ? "ok" : "warning")}
        </div>
        ${renderUiFormGrid({
          columns: "4",
          className: "access-role-profile-grid",
          body: `
          ${renderUiFormField({
            label: "Название роли доступа",
            control: `<input data-access-role-field="${escapeAttribute(role.id)}" data-access-role-field-name="label" type="text" value="${escapeAttribute(role.label)}" ${disabled} />`,
          })}
          ${renderUiFormField({
            label: "Описание полномочий",
            control: `<input data-access-role-field="${escapeAttribute(role.id)}" data-access-role-field-name="${descriptionFieldName}" type="text" value="${escapeAttribute(role.description)}" ${disabled} />`,
          })}
          ${renderUiFormField({
            label: "Область по умолчанию",
            control: `<select data-access-role-field="${escapeAttribute(role.id)}" data-access-role-field-name="scope" ${disabled}>${scopeDefinitions.map((scope) => `<option value="${escapeAttribute(scope.id)}" ${scope.id === role.scope ? "selected" : ""}>${escapeHtml(scope.label)}</option>`).join("")}</select>`,
          })}
          ${renderUiFormField({
            label: "Стартовый модуль",
            control: `<select data-access-role-field="${escapeAttribute(role.id)}" data-access-role-field-name="defaultModule" ${disabled}>${moduleOptions}</select>`,
          })}
          `,
        })}
      ` }),
    });
  }

  function renderPermissionPanel(context, role) {
    const modules = getModuleDefinitions().filter((moduleItem) => moduleItem.id !== "authPrototype");
    return renderUiPanel({
      title: "Grants роли",
      meta: "Шесть исполняемых действий; изменение grants не заменяет проверку can(subject, module, action, resourceContext)",
      className: "access-role-permission-panel",
      body: renderUiPanelBody({ body: renderUiTableWrap({
        className: "access-role-permission-table-wrap",
        body: `
          <table class="directory-table access-role-permission-table" data-access-grants-contract="six-actions">
            <thead>
              <tr>
                <th>Модуль</th>
                <th>Группа</th>
                ${actionDefinitions.map((action) => `<th title="${escapeAttribute(action.label)}">${escapeHtml(action.shortLabel)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${modules.map((moduleItem) => {
                const contract = getMesModuleFlowContract(moduleItem.id);
                const viewRequired = actionDefinitions
                  .filter((action) => action.id !== "view")
                  .some((action) => context.adapter.grants(role, moduleItem.id, action.id));
                return `
                  <tr>
                    <td class="primary-cell">
                      <strong>${escapeHtml(moduleItem.label)}</strong>
                      <span>${escapeHtml(getModuleAnnotation(moduleItem.id))}</span>
                    </td>
                    <td>${escapeHtml(contract?.group || "Система")}</td>
                    ${actionDefinitions.map((action) => {
                      const checked = context.adapter.grants(role, moduleItem.id, action.id);
                      const readOnlyBlocked = role.readOnly && !READ_ONLY_ACTION_IDS.has(action.id);
                      const dependencyBlocked = action.id === "view" && viewRequired;
                      const enabled = context.capabilities.grant && !readOnlyBlocked && !dependencyBlocked;
                      const reason = readOnlyBlocked
                        ? "Read-only роль не может получить изменяющее действие."
                        : dependencyBlocked
                          ? "Сначала отключите зависящие от view действия."
                          : "Нет подтверждённого configure или callback записи grant.";
                      return `
                        <td class="access-role-check-cell">
                          <label title="${escapeAttribute(`${role.label}: ${moduleItem.label} · ${action.label}`)}">
                            <input
                              data-access-role-permission
                              data-access-role-id="${escapeAttribute(role.id)}"
                              data-access-module-id="${escapeAttribute(moduleItem.id)}"
                              data-access-action-id="${escapeAttribute(action.id)}"
                              data-access-control-enforced="true"
                              type="checkbox"
                              ${checked ? "checked" : ""}
                              ${disabledAttribute(enabled, reason)}
                            />
                          </label>
                        </td>
                      `;
                    }).join("")}
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        `,
      }) }),
    });
  }

  function renderAssignmentsPanel(context) {
    const roleOptions = (selectedRoleId = "", multiple = false) => `
      <option value="" ${!selectedRoleId && !multiple ? "selected" : ""}>По точному правилу должности</option>
      ${multiple ? '<option value="__multiple__" selected disabled>Несколько действующих ролей</option>' : ""}
      ${context.adapter.accessRoles.filter((role) => role.active).map((role) => `<option value="${escapeAttribute(role.id)}" ${role.id === selectedRoleId ? "selected" : ""}>${escapeHtml(role.label)}</option>`).join("")}
    `;
    const disabled = disabledAttribute(context.capabilities.assignment, "Нет подтверждённого configure или callback записи назначения.");
    return renderUiPanel({
      title: "Назначения субъектам",
      meta: context.adapter.mode === "domain"
        ? "Явные effective-dated назначения имеют приоритет; fallback использует только точный positionId"
        : "Compatibility: старое назначение и определение по тексту должности будут удалены после миграции",
      className: "access-role-assignments-panel",
      body: renderUiPanelBody({ body: renderUiTableWrap({
        className: "access-role-assignment-table-wrap",
        body: `
          <table class="directory-table access-role-assignment-table">
            <thead>
              <tr>
                <th>Сотрудник / должность</th>
                <th>Подразделение</th>
                <th>Источник и период</th>
                <th>Действующие роли</th>
                <th>Явное назначение</th>
              </tr>
            </thead>
            <tbody>
              ${context.employees.map((person) => {
                const effective = context.adapter.getEffectiveAssignments(person);
                const explicit = effective.filter((assignment) => !["position-default", "legacy-position-inference"].includes(assignment.source));
                const selectedRoleId = explicit.length === 1 ? explicit[0].roleId : "";
                const multiple = explicit.length > 1;
                const sourceLabel = explicit.length
                  ? "явное назначение"
                  : effective.some((assignment) => assignment.source === "position-default")
                    ? "правило positionId"
                    : effective.some((assignment) => assignment.source === "legacy-position-inference")
                      ? "legacy auto"
                      : "роль отсутствует";
                const sourceTone = explicit.length ? "primary" : effective.length ? context.adapter.mode === "domain" ? "ok" : "warning" : "critical";
                const assignmentSummary = effective.map((assignment) => {
                  const role = context.adapter.getRole(assignment.roleId);
                  return `${role?.label || assignment.roleId} · ${formatAccessEffectiveWindow(assignment)}`;
                }).join("; ");
                return `
                  <tr>
                    <td class="primary-cell">
                      <strong>${escapeHtml(formatPersonDisplayName(person.name, { fallback: "Сотрудник" }))}</strong>
                      <span>${escapeHtml(person.role || person.position || "должность не задана")}${person.positionId ? ` · ${escapeHtml(person.positionId)}` : ""}</span>
                    </td>
                    <td>${escapeHtml(person.department || "отдел не задан")}</td>
                    <td>
                      ${renderUiStatusToken(sourceLabel, sourceTone)}
                      <small>${escapeHtml(assignmentSummary || "fail-closed: доступ не предоставлен")}</small>
                    </td>
                    <td>${effective.map((assignment) => renderUiStatusToken(context.adapter.getRole(assignment.roleId)?.label || assignment.roleId, context.adapter.getRole(assignment.roleId)?.active === false ? "warning" : "neutral")).join(" ") || renderUiStatusToken("нет роли", "critical")}</td>
                    <td>
                      <select
                        ${renderUiTableControlAttributes({ variant: "role-assignment", density: "default" })}
                        data-access-role-assignment="${escapeAttribute(person.id)}"
                        data-access-subject-type="${escapeAttribute(person.subjectType || "employee")}"
                        ${disabled}
                      >
                        ${roleOptions(selectedRoleId, multiple)}
                      </select>
                      <small>${escapeHtml(multiple ? "Выбор заменит все действующие явные назначения" : explicit.length ? "явное назначение" : "используется правило должности")}</small>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        `,
      }) }),
    });
  }

  function renderScopesPanel(context, role) {
    const scopes = context.adapter.getResponsibilityScopesForRole(role.id, context.employees);
    const employeeById = new Map(context.employees.map((person) => [person.id, person]));
    const disabled = disabledAttribute(context.capabilities.scope, "Нет подтверждённого configure или callback записи scope.");
    const scopeControl = (scope) => context.adapter.mode === "domain"
      ? `<select data-access-responsibility-scope="${escapeAttribute(scope.id)}" ${disabled}>${scopeDefinitions.map((definition) => `<option value="${escapeAttribute(definition.id)}" ${definition.id === scope.type ? "selected" : ""}>${escapeHtml(definition.label)}</option>`).join("")}</select>`
      : escapeHtml(getScopeLabel(scope.type));
    const defaultScope = {
      id: `role-default-scope:${role.id}`,
      type: role.scope,
      factoryIds: role.factoryIds || [],
      departmentIds: role.departmentIds || [],
      workCenterIds: role.workCenterIds || [],
      moduleIds: [],
      actions: [],
      effectiveFrom: null,
      effectiveTo: null,
    };
    const rows = [{ scope: defaultScope, defaultRoleScope: true }, ...scopes.map((scope) => ({ scope, defaultRoleScope: false }))];
    return renderUiPanel({
      title: "Области ответственности",
      meta: "Персональный или assignment-scope перекрывает более широкий scope роли; отсутствие совпадения закрывает доступ",
      className: "access-role-scopes-panel",
      body: renderUiPanelBody({ body: renderUiTableWrap({
        className: "access-role-assignment-table-wrap access-role-scope-table-wrap",
        body: `
          <table class="directory-table access-role-assignment-table access-role-scope-table">
            <thead>
              <tr>
                <th>Владелец</th>
                <th>Тип scope</th>
                <th>Объекты</th>
                <th>Фильтр grants</th>
                <th>Период / enforcement</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(({ scope, defaultRoleScope }) => {
                const description = describeResponsibilityScope(scope);
                const owner = defaultRoleScope
                  ? `роль ${role.label}`
                  : scope.subjectId
                    ? employeeById.get(scope.subjectId)?.name || scope.subjectId
                    : scope.assignmentId
                      ? `назначение ${scope.assignmentId}`
                      : `роль ${scope.roleId || role.id}`;
                return `
                  <tr>
                    <td class="primary-cell"><strong>${escapeHtml(owner)}</strong><span>${escapeHtml(defaultRoleScope ? "scope по умолчанию" : scope.id)}</span></td>
                    <td>${defaultRoleScope ? escapeHtml(getScopeLabel(scope.type)) : scopeControl(scope)}</td>
                    <td>${escapeHtml(description.targets)}</td>
                    <td>${escapeHtml(description.filters)}</td>
                    <td>
                      ${renderUiStatusToken(context.adapter.mode === "domain" ? "enforced" : "compatibility", context.adapter.mode === "domain" ? "ok" : "warning")}
                      <small>${escapeHtml(formatAccessEffectiveWindow(scope))}</small>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        `,
      }) }),
    });
  }

  function renderUnavailablePage(context) {
    const sidebar = {
      eyebrow: "Система доступа",
      title: "Роли и доступ",
      variant: "list",
      className: "access-roles-sidebar",
      actions: renderUiActionButton({ label: "Сбросить настройки", iconName: "reset", attributes: 'disabled aria-disabled="true" type="button"' }),
      body: `<div class="ui-sidebar-list access-roles-list">${renderUiStatusToken("контур недоступен", "critical")}</div>`,
    };
    return renderMesModulePatternPage({
      moduleId: "roles",
      sidebar,
      header: {
        eyebrow: "Access control",
        title: "Контур доступа не инициализирован",
        description: "Fail-closed: пока роли, grants, назначения и scopes не прошли нормализацию, доступ и редактирование не предоставляются.",
        actions: renderUiStatusToken(context.adapter.mode, "critical"),
      },
      content: `<div data-access-control-enforcement="${escapeAttribute(context.adapter.mode)}" data-access-control-write="denied">${renderUiPanel({
        title: "Диагностика",
        meta: "Запись заблокирована",
        body: renderUiPanelBody({ body: `<p>${escapeHtml(context.adapter.error || "Нет нормализованных ролей доступа.")}</p>` }),
      })}</div>`,
    });
  }

  function renderAccessRolesPage() {
    const context = getModuleContext();
    const { adapter, selectedRole } = context;
    if (!selectedRole || ["domain-invalid", "legacy-invalid"].includes(adapter.mode)) return renderUnavailablePage(context);
    const explicitAssignments = adapter.mode === "domain"
      ? adapter.subjectRoleAssignments.length
      : Object.keys(normalizeAccessRoleAssignments(context.ui.accessRoleAssignments)).length;
    const resetDisabled = disabledAttribute(context.capabilities.reset, "Нет подтверждённого configure или callback сброса.");
    const sidebar = {
      eyebrow: "Система доступа",
      title: "Роли и доступ",
      variant: "list",
      className: "access-roles-sidebar",
      actions: renderUiActionButton({ label: "Сбросить настройки", iconName: "reset", attributes: `data-access-roles-reset type="button" ${resetDisabled}` }),
      body: `
        <div class="ui-sidebar-list access-roles-list">
          <div class="ui-sidebar-label">Роли доступа</div>
          ${adapter.accessRoles.map((role) => renderUiSidebarItem({
            title: role.label,
            meta: `${getScopeLabel(role.scope)} · ${role.readOnly ? "read-only" : "операционная"} · старт: ${getModuleDefinitions().find((moduleItem) => moduleItem.id === role.defaultModule)?.label || role.defaultModule || "не выбран"}`,
            badge: getVisibleModuleCount(context, role).toLocaleString("ru-RU"),
            badgeTone: role.id === selectedRole.id ? "primary" : role.active ? "neutral" : "warning",
            active: role.id === selectedRole.id,
            attributes: `data-access-role-select="${escapeAttribute(role.id)}" type="button"`,
          })).join("")}
        </div>
      `,
    };

    return renderMesModulePatternPage({
      moduleId: "roles",
      sidebar,
      header: {
        eyebrow: "Access control",
        title: selectedRole.label,
        description: "Роль хранит grants, назначение связывает роль с субъектом на период, а scope ограничивает конкретные данные. Должность не является ролью доступа.",
        actions: `
          ${renderUiStatusToken(`${adapter.accessRoles.length} ролей`, "neutral")}
          ${renderUiStatusToken(`${explicitAssignments} назначений`, explicitAssignments ? "primary" : "neutral")}
          ${renderUiStatusToken(adapter.mode === "domain" ? "enforcement: domain" : "enforcement: legacy", adapter.mode === "domain" ? "ok" : "warning")}
          ${renderUiStatusToken(context.canConfigure ? "configure разрешён" : "configure запрещён", context.canConfigure ? "ok" : "critical")}
          ${selectedRole.readOnly ? renderUiStatusToken("read-only", "warning") : ""}
        `,
      },
      content: `
        <div data-access-control-enforcement="${escapeAttribute(adapter.mode)}" data-access-control-write="${context.canConfigure ? "allowed" : "denied"}">
          ${renderProfilePanel(context, selectedRole)}
          ${renderPermissionPanel(context, selectedRole)}
          ${renderAssignmentsPanel(context)}
          ${renderScopesPanel(context, selectedRole)}
        </div>
      `,
    });
  }

  function reportWriteFailure(message, details = {}) {
    notifyAccessControlFailure(message, details);
    render();
  }

  async function commitWrite(context, options = {}) {
    if (context.adapter.mode === "domain") {
      if (!context.adapter.domainValid || !context.canConfigure || typeof options.domainWriter !== "function") {
        reportWriteFailure("Изменение access control заблокировано.", { reason: "domain-write-not-authorized", ...options.details });
        return false;
      }
      try {
        const result = await options.domainWriter(options.payload);
        if (!(result === true || result?.ok === true)) {
          reportWriteFailure("Доменный callback не подтвердил запись.", { reason: "domain-write-not-confirmed", ...options.details });
          return false;
        }
      } catch (error) {
        reportWriteFailure("Ошибка доменной записи access control.", { reason: "domain-write-failed", error: String(error?.message || error), ...options.details });
        return false;
      }
    } else if (context.adapter.mode === "legacy") {
      if (typeof options.legacyWriter !== "function") {
        reportWriteFailure("Legacy callback записи отсутствует.", { reason: "legacy-write-callback-missing", ...options.details });
        return false;
      }
      try {
        options.legacyWriter();
        persistUiState();
      } catch (error) {
        reportWriteFailure("Ошибка compatibility-записи access control.", { reason: "legacy-write-failed", error: String(error?.message || error), ...options.details });
        return false;
      }
    } else {
      reportWriteFailure("Контур access control находится в fail-closed состоянии.", { reason: context.adapter.mode, ...options.details });
      return false;
    }
    notifySaveSuccess(options.successMessage || "Настройки доступа обновлены.");
    render();
    return true;
  }

  function bindAccessRolesEvents() {
    const page = getApp()?.querySelector(".access-roles-page");
    if (!page) return;

    page.querySelector("[data-access-roles-reset]")?.addEventListener("click", async (event) => {
      event.preventDefault();
      const context = getModuleContext();
      if (!context.capabilities.reset) {
        reportWriteFailure("Сброс ролей запрещён.", { reason: "reset-not-authorized" });
        return;
      }
      await commitWrite(context, {
        domainWriter: resetAccessControlConfiguration,
        payload: { requestedAt: asIso(context.at) },
        legacyWriter: () => resetAccessRoleConfiguration(),
        successMessage: "Роли и доступ сброшены к базовому контуру.",
        details: { operation: "reset" },
      });
    });

    page.querySelectorAll("[data-access-role-select]").forEach((button) => {
      button.addEventListener("click", () => {
        const context = getModuleContext();
        const role = context.adapter.getRole(button.dataset.accessRoleSelect || "");
        if (!role) return;
        context.ui.accessRolesSelectedRoleId = role.id;
        persistUiState();
        render();
      });
    });

    page.querySelectorAll("[data-access-role-field]").forEach((field) => {
      field.addEventListener("change", async () => {
        const context = getModuleContext();
        const roleId = field.dataset.accessRoleField || "";
        const fieldName = field.dataset.accessRoleFieldName || "";
        if (!context.capabilities.role || !context.adapter.getRole(roleId) || !WRITABLE_ROLE_FIELDS.has(fieldName)) {
          reportWriteFailure("Изменение паспорта роли запрещено.", { roleId, fieldName });
          return;
        }
        const value = field.value;
        if (fieldName === "scope" && !scopeIds.has(value)) {
          reportWriteFailure("Неизвестный тип scope.", { roleId, value });
          return;
        }
        const domainFieldName = fieldName === "caption" ? "description" : fieldName;
        await commitWrite(context, {
          domainWriter: updateAccessRole,
          payload: { roleId, patch: { [domainFieldName]: value } },
          legacyWriter: () => setAccessRoleProfileField(roleId, domainFieldName === "description" ? "caption" : domainFieldName, value),
          successMessage: "Паспорт роли обновлён.",
          details: { operation: "update-role", roleId, fieldName },
        });
      });
      field.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.currentTarget.blur();
      });
    });

    page.querySelectorAll("[data-access-role-permission]").forEach((field) => {
      field.addEventListener("change", async () => {
        const context = getModuleContext();
        const roleId = field.dataset.accessRoleId || "";
        const moduleId = field.dataset.accessModuleId || "";
        const action = field.dataset.accessActionId || "";
        const role = context.adapter.getRole(roleId);
        const dependentGrant = action === "view" && actionDefinitions
          .filter((definition) => definition.id !== "view")
          .some((definition) => context.adapter.grants(role, moduleId, definition.id));
        if (!context.capabilities.grant || !role || !actionIds.has(action) || (role.readOnly && !READ_ONLY_ACTION_IDS.has(action)) || (!field.checked && dependentGrant)) {
          reportWriteFailure("Изменение grant запрещено контрактом.", { roleId, moduleId, action });
          return;
        }
        await commitWrite(context, {
          domainWriter: setAccessGrant,
          payload: { roleId, moduleId, action, allowed: Boolean(field.checked) },
          legacyWriter: () => setAccessRoleModulePermission(roleId, moduleId, action, Boolean(field.checked)),
          successMessage: "Grant роли обновлён.",
          details: { operation: "set-grant", roleId, moduleId, action },
        });
      });
    });

    page.querySelectorAll("[data-access-role-assignment]").forEach((field) => {
      field.addEventListener("change", async () => {
        const context = getModuleContext();
        const subjectId = field.dataset.accessRoleAssignment || "";
        const subjectType = field.dataset.accessSubjectType || "employee";
        const roleId = field.value === "__multiple__" ? "" : field.value || "";
        if (!context.capabilities.assignment || !subjectId || (roleId && !context.adapter.getRole(roleId))) {
          reportWriteFailure("Изменение назначения роли запрещено.", { subjectId, roleId });
          return;
        }
        await commitWrite(context, {
          domainWriter: setSubjectRoleAssignment,
          payload: {
            subjectId,
            subjectType,
            roleId,
            operation: roleId ? "replace-effective" : "clear-effective",
            effectiveAt: asIso(context.at),
          },
          legacyWriter: () => setAccessRoleAssignment(subjectId, roleId),
          successMessage: "Назначение роли обновлено.",
          details: { operation: "set-subject-role", subjectId, roleId },
        });
      });
    });

    page.querySelectorAll("[data-access-responsibility-scope]").forEach((field) => {
      field.addEventListener("change", async () => {
        const context = getModuleContext();
        const scopeId = field.dataset.accessResponsibilityScope || "";
        const type = field.value || "";
        if (!context.capabilities.scope || !scopeId || !scopeIds.has(type)) {
          reportWriteFailure("Изменение responsibility scope запрещено.", { scopeId, type });
          return;
        }
        await commitWrite(context, {
          domainWriter: setResponsibilityScope,
          payload: { scopeId, patch: { type } },
          legacyWriter: null,
          successMessage: "Область ответственности обновлена.",
          details: { operation: "set-responsibility-scope", scopeId, type },
        });
      });
    });
  }

  return {
    bindAccessRolesEvents,
    renderAccessRolesPage,
  };
}
