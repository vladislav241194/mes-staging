import { formatPersonDisplayName } from "../../ui/formatters.js";

const REGISTRY_DEFINITIONS = [
  {
    id: "orgUnits",
    label: "Подразделения",
    description: "Отделы и участки в единой иерархии",
    fields: [
      { key: "name", label: "Название", required: true },
      { key: "code", label: "Код" },
      { key: "kind", label: "Тип", type: "select", options: [["department", "Отдел"], ["section", "Участок"]] },
      { key: "parentOrgUnitId", label: "Родитель", type: "reference", registry: "orgUnits" },
      { key: "isActive", label: "Активность", type: "boolean" },
    ],
    columns: [
      { key: "name", label: "Подразделение", primary: true },
      { key: "kind", label: "Тип", type: "kind" },
      { key: "parentOrgUnitId", label: "Родитель", type: "reference", registry: "orgUnits" },
      { key: "code", label: "Код" },
      { key: "isActive", label: "Статус", type: "boolean" },
    ],
  },
  {
    id: "workCenters",
    label: "Рабочие центры",
    description: "Производственные центры и их связь с оргструктурой",
    fields: [
      { key: "name", label: "Название", required: true },
      { key: "code", label: "Код" },
      { key: "orgUnitId", label: "Подразделение", type: "reference", registry: "orgUnits" },
      { key: "parentWorkCenterId", label: "Родительский центр", type: "reference", registry: "workCenters" },
      { key: "participatesInPlanning", label: "Участвует в планировании", type: "boolean" },
      { key: "showInGantt", label: "Показывать в Ганте", type: "boolean" },
      { key: "isActive", label: "Активность", type: "boolean" },
    ],
    columns: [
      { key: "name", label: "Рабочий центр", primary: true },
      { key: "orgUnitId", label: "Подразделение", type: "reference", registry: "orgUnits" },
      { key: "parentWorkCenterId", label: "Родитель", type: "reference", registry: "workCenters" },
      { key: "participatesInPlanning", label: "Планирование", type: "boolean" },
      { key: "isActive", label: "Статус", type: "boolean" },
    ],
  },
  {
    id: "positions",
    label: "Должности",
    description: "Производственные должности отдельно от ролей доступа",
    fields: [
      { key: "name", label: "Название", required: true },
      { key: "code", label: "Код" },
      { key: "kind", label: "Категория", type: "select", options: [["manager", "Руководитель"], ["supervisor", "Мастер"], ["worker", "Исполнитель"]] },
      { key: "orgUnitId", label: "Подразделение", type: "reference", registry: "orgUnits" },
      { key: "workCenterId", label: "Рабочий центр", type: "reference", registry: "workCenters" },
      { key: "defaultScheduleTemplateId", label: "Базовый график", type: "reference", registry: "scheduleTemplates" },
      { key: "isActive", label: "Активность", type: "boolean" },
    ],
    columns: [
      { key: "name", label: "Должность", primary: true },
      { key: "kind", label: "Категория", type: "kind" },
      { key: "orgUnitId", label: "Подразделение", type: "reference", registry: "orgUnits" },
      { key: "workCenterId", label: "Рабочий центр", type: "reference", registry: "workCenters" },
      { key: "isActive", label: "Статус", type: "boolean" },
    ],
  },
  {
    id: "employees",
    label: "Сотрудники",
    description: "Личности сотрудников; должность и подразделение задаются назначением",
    fields: [
      { key: "displayName", label: "ФИО", required: true },
      { key: "personnelNumber", label: "Табельный номер" },
      { key: "positionId", label: "Должность", type: "reference", registry: "positions", required: true, assignment: true },
      { key: "orgUnitId", label: "Подразделение", type: "reference", registry: "orgUnits", required: true, assignment: true },
      { key: "workCenterId", label: "Рабочий центр", type: "reference", registry: "workCenters", assignment: true },
      { key: "validFrom", label: "Назначение действует с", type: "date", assignment: true },
      { key: "validTo", label: "Назначение действует до", type: "date", assignment: true },
      { key: "isActive", label: "Активность", type: "boolean" },
    ],
    columns: [
      { key: "displayName", label: "Сотрудник", primary: true },
      { key: "personnelNumber", label: "Табельный номер" },
      { key: "employment", label: "Назначение", type: "employment" },
      { key: "isActive", label: "Статус", type: "boolean" },
    ],
  },
  {
    id: "equipment",
    label: "Оборудование",
    description: "Оборудование и его производственная принадлежность",
    fields: [
      { key: "name", label: "Название", required: true },
      { key: "code", label: "Код" },
      { key: "orgUnitId", label: "Подразделение", type: "reference", registry: "orgUnits" },
      { key: "workCenterId", label: "Рабочий центр", type: "reference", registry: "workCenters" },
      { key: "quantity", label: "Количество", type: "number" },
      { key: "scheduleTemplateId", label: "График", type: "reference", registry: "scheduleTemplates" },
      { key: "isActive", label: "Активность", type: "boolean" },
    ],
    columns: [
      { key: "name", label: "Оборудование", primary: true },
      { key: "workCenterId", label: "Рабочий центр", type: "reference", registry: "workCenters" },
      { key: "quantity", label: "Количество", type: "number" },
      { key: "scheduleTemplateId", label: "График", type: "reference", registry: "scheduleTemplates" },
      { key: "isActive", label: "Статус", type: "boolean" },
    ],
  },
  {
    id: "responsibilityPolicies",
    label: "Зоны ответственности",
    description: "Кого мастер может распределять в Мастерской",
    fields: [
      { key: "subjectEmployeeId", label: "Мастер", type: "reference", registry: "employees", required: true },
      { key: "mode", label: "Режим", type: "select", options: [["department", "Подразделение"], ["workCenter", "Рабочий центр"], ["manual", "Ручной список"], ["all", "Все сотрудники"]] },
      { key: "targetEmployeeIds", label: "Разрешённые сотрудники", type: "reference-list", registry: "employees" },
      { key: "isActive", label: "Активность", type: "boolean" },
    ],
    columns: [
      { key: "subjectEmployeeId", label: "Мастер", type: "reference", registry: "employees", primary: true },
      { key: "mode", label: "Режим", type: "responsibility-mode" },
      { key: "targetEmployeeIds", label: "Разрешённые сотрудники", type: "reference-list", registry: "employees" },
      { key: "updatedAt", label: "Обновлено" },
      { key: "isActive", label: "Статус", type: "boolean" },
    ],
  },
];

const DIAGNOSTICS_REGISTRY = {
  id: "migrationDiagnostics",
  label: "Диагностика миграции",
  description: "Read-only контроль переноса legacy Excel-матрицы",
};

const KIND_LABELS = {
  department: "Отдел",
  section: "Участок",
  manager: "Руководитель",
  supervisor: "Мастер",
  worker: "Исполнитель",
};

const RESPONSIBILITY_MODE_LABELS = {
  department: "Подразделение",
  workCenter: "Рабочий центр",
  manual: "Ручной список",
  all: "Все сотрудники",
};

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function registryLabel(entity = {}) {
  const label = normalizeText(entity.displayName || entity.name || entity.label || entity.code || entity.id);
  return formatPersonDisplayName(label, { fallback: label || "Без названия" });
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function fallbackFormField({ label = "", control = "", hint = "" } = {}) {
  return `<label class="ui-form-field" data-ui-component="FormField"><span>${label}</span>${control}${hint ? `<small>${hint}</small>` : ""}</label>`;
}

function fallbackFormGrid({ body = "" } = {}) {
  return `<div class="ui-form-grid" data-ui-component="FormGrid">${body}</div>`;
}

export function createProductionStructureMatrixModule(dependencies = {}) {
  const {
    PRODUCTION_STRUCTURE_MATRIX_COLUMNS = [],
    PRODUCTION_STRUCTURE_MATRIX_ROWS = [],
    archiveSystemDomainEntity = null,
    canEditSystemDomainRegistry = () => false,
    escapeAttribute = (value) => String(value ?? ""),
    escapeHtml = (value) => String(value ?? ""),
    getSystemDomainsMigrationReport = () => null,
    getSystemDomainsState = () => ({}),
    notifySaveSuccess = () => {},
    render = () => {},
    renderUiActionButton = () => "",
    renderUiEmptyState = ({ title = "", text = "" } = {}) => `<div><strong>${title}</strong><span>${text}</span></div>`,
    renderUiFormField = fallbackFormField,
    renderUiFormGrid = fallbackFormGrid,
    renderUiModuleHeader = ({ title = "", description = "", actions = "" } = {}) => `<header><h2>${title}</h2><p>${description}</p>${actions}</header>`,
    renderUiModulePage = ({ sidebar = "", header = "", content = "" } = {}) => `<section>${sidebar}${header}${content}</section>`,
    renderUiModuleSidebar = ({ title = "", body = "" } = {}) => `<aside><h1>${title}</h1>${body}</aside>`,
    renderUiPanel = ({ title = "", meta = "", body = "", actions = "" } = {}) => `<section><header><strong>${title}</strong><span>${meta}</span>${actions}</header>${body}</section>`,
    renderUiPanelBody = ({ body = "" } = {}) => body,
    renderUiSidebarItem = ({ title = "", meta = "", badge = "", attributes = "", active = false } = {}) => `<button class="ui-sidebar-item${active ? " is-active" : ""}" ${attributes}><strong>${title}</strong><small>${meta}</small><em>${badge}</em></button>`,
    renderUiStatusToken = (label = "") => `<span>${label}</span>`,
    renderUiTableControlAttributes = () => 'data-ui-component="TableControl" data-ui-density="default"',
    renderUiTableWrap = ({ body = "" } = {}) => body,
    upsertSystemDomainEntity = null,
  } = dependencies;
  const getApp = dependencies.getApp || (() => null);

  let activeRegistryId = REGISTRY_DEFINITIONS[0].id;
  let selectedEntityId = "";
  let lastMutationError = "";

  function getDomainState() {
    try {
      return asRecord(getSystemDomainsState());
    } catch {
      return {};
    }
  }

  function getRegistries() {
    const state = getDomainState();
    return asRecord(state.registries || state);
  }

  function getRegistryDefinition(registryId = activeRegistryId) {
    return REGISTRY_DEFINITIONS.find((item) => item.id === registryId) || null;
  }

  function getRegistryEntities(registryId = activeRegistryId) {
    return [...asArray(getRegistries()[registryId])].sort((left, right) => (
      registryLabel(left).localeCompare(registryLabel(right), "ru")
      || normalizeText(left?.id).localeCompare(normalizeText(right?.id), "en")
    ));
  }

  function getEntity(registryId, entityId) {
    return getRegistryEntities(registryId).find((entity) => entity.id === entityId) || null;
  }

  function getReferenceLabel(registryId, entityId) {
    if (!entityId) return "—";
    const entity = getEntity(registryId, entityId);
    return entity ? registryLabel(entity) : `${entityId} · связь не найдена`;
  }

  function getEmploymentLabel(employeeId) {
    const assignment = getRegistryEntities("employmentAssignments").find((item) => item.employeeId === employeeId && item.isPrimary !== false)
      || getRegistryEntities("employmentAssignments").find((item) => item.employeeId === employeeId);
    if (!assignment) return "Назначение не задано";
    return [
      getReferenceLabel("positions", assignment.positionId),
      getReferenceLabel("orgUnits", assignment.orgUnitId),
    ].filter((value) => value && value !== "—").join(" · ") || "Назначение без связей";
  }

  function canEditRegistry(registryId = activeRegistryId) {
    if (!getRegistryDefinition(registryId)) return false;
    if (typeof upsertSystemDomainEntity !== "function") return false;
    try {
      return canEditSystemDomainRegistry(registryId) === true;
    } catch {
      return false;
    }
  }

  function canArchiveRegistry(registryId = activeRegistryId) {
    return canEditRegistry(registryId) && typeof archiveSystemDomainEntity === "function";
  }

  function getProductionStructureMatrixRuntimeOverrides() {
    return {};
  }

  function setProductionStructureMatrixActiveRegistry(registryId = "employees") {
    const normalizedRegistryId = normalizeText(registryId);
    const supportedRegistryIds = [...REGISTRY_DEFINITIONS.map((item) => item.id), DIAGNOSTICS_REGISTRY.id];
    activeRegistryId = supportedRegistryIds.includes(normalizedRegistryId) ? normalizedRegistryId : "employees";
    selectedEntityId = "";
    lastMutationError = "";
    return activeRegistryId;
  }

  function renderRegistrySidebar() {
    const registries = getRegistries();
    const items = [...REGISTRY_DEFINITIONS, DIAGNOSTICS_REGISTRY];
    return renderUiModuleSidebar({
      eyebrow: "Система",
      title: "Структура и сотрудники",
      variant: "registry",
      className: "production-structure-sidebar",
      body: `
        <div class="ui-sidebar-list production-structure-registry-list" data-system-domain-registry-navigation>
          <div class="ui-sidebar-label">Реестры</div>
          ${items.map((item) => {
            const count = item.id === DIAGNOSTICS_REGISTRY.id
              ? asArray(PRODUCTION_STRUCTURE_MATRIX_ROWS).length
              : asArray(registries[item.id]).length;
            return renderUiSidebarItem({
              title: item.label,
              meta: item.description,
              badge: formatCount(count),
              badgeTone: item.id === DIAGNOSTICS_REGISTRY.id ? "warning" : "neutral",
              active: activeRegistryId === item.id,
              attributes: `type="button" data-system-domain-registry="${escapeAttribute(item.id)}"`,
            });
          }).join("")}
        </div>
      `,
    });
  }

  function renderSummary() {
    const registries = getRegistries();
    const items = [
      ["Подразделений", asArray(registries.orgUnits).length],
      ["Рабочих центров", asArray(registries.workCenters).length],
      ["Должностей", asArray(registries.positions).length],
      ["Сотрудников", asArray(registries.employees).length],
      ["Оборудования", asArray(registries.equipment).length],
      ["Зон ответственности", asArray(registries.responsibilityPolicies).length],
    ];
    return `
      <div class="production-structure-kpis" data-ui-component="MetricGrid" aria-label="Сводка структуры и сотрудников">
        ${items.map(([label, count]) => `<article data-ui-component="MetricCard"><span>${escapeHtml(label)}</span><strong>${formatCount(count)}</strong></article>`).join("")}
      </div>
    `;
  }

  function renderColumnValue(entity, column) {
    const value = entity?.[column.key];
    if (column.type === "boolean") {
      return renderUiStatusToken(value === false ? "архив" : "активно", value === false ? "warning" : "ok");
    }
    if (column.type === "reference") {
      return `<span data-system-domain-reference="${escapeAttribute(value || "")}">${escapeHtml(getReferenceLabel(column.registry, value))}</span>`;
    }
    if (column.type === "reference-list") {
      const ids = asArray(value);
      const labels = ids.slice(0, 3).map((id) => getReferenceLabel(column.registry, id));
      const tail = ids.length > 3 ? ` +${ids.length - 3}` : "";
      return `<span data-system-domain-reference-list="${escapeAttribute(ids.join(","))}">${escapeHtml(labels.length ? `${labels.join(", ")}${tail}` : "—")}</span>`;
    }
    if (column.type === "employment") return escapeHtml(getEmploymentLabel(entity.id));
    if (column.type === "kind") return escapeHtml(KIND_LABELS[value] || value || "—");
    if (column.type === "responsibility-mode") return renderUiStatusToken(RESPONSIBILITY_MODE_LABELS[value] || value || "Не задан", value === "manual" ? "warning" : "neutral");
    if (column.type === "number") return escapeHtml(formatCount(value));
    if (column.key === "displayName") return escapeHtml(formatPersonDisplayName(value, { fallback: "—" }));
    return escapeHtml(normalizeText(value) || "—");
  }

  function renderRegistryTable(definition, entities) {
    if (!entities.length) {
      return renderUiEmptyState({
        iconName: "directory",
        title: `${definition.label}: реестр пуст`,
        text: canEditRegistry(definition.id)
          ? "Создайте первую запись через канонический доменный editor."
          : "Записи появятся после миграции или при наличии права редактирования.",
      });
    }
    return renderUiTableWrap({
      className: "production-structure-table-wrap",
      attributes: `data-system-domain-table="${escapeAttribute(definition.id)}"`,
      body: `
        <table class="directory-table ui-table production-structure-registry-table">
          <thead>
            <tr>
              ${definition.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            ${entities.map((entity) => `
              <tr data-system-domain-row="${escapeAttribute(entity.id)}" class="${entity.isActive === false ? "is-archived" : ""}">
                ${definition.columns.map((column) => `
                  <td class="${column.primary ? "primary-cell" : ""}">
                    ${column.primary ? `<strong>${renderColumnValue(entity, column)}</strong><span>${escapeHtml(entity.id)}</span>` : renderColumnValue(entity, column)}
                  </td>
                `).join("")}
                <td>
                  ${renderUiActionButton({
                    label: canEditRegistry(definition.id) ? "Открыть" : "Просмотр",
                    iconName: "open",
                    tone: "compact",
                    attributes: `type="button" data-system-domain-open="${escapeAttribute(entity.id)}" data-system-domain-open-registry="${escapeAttribute(definition.id)}"`,
                  })}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `,
    });
  }

  function renderReferenceOptions(field, currentValue) {
    const currentEntityId = selectedEntityId === "__new__" ? "" : selectedEntityId;
    const options = getRegistryEntities(field.registry).filter((entity) => !(field.registry === activeRegistryId && entity.id === currentEntityId));
    return [
      '<option value="">Не выбрано</option>',
      ...options.map((entity) => `<option value="${escapeAttribute(entity.id)}" ${entity.id === currentValue ? "selected" : ""}>${escapeHtml(registryLabel(entity))}</option>`),
    ].join("");
  }

  function renderFieldControl(field, entity, editable) {
    const value = entity?.[field.key];
    const disabled = editable ? "" : "disabled aria-disabled=\"true\"";
    const attributes = `${renderUiTableControlAttributes({ variant: "system-domain-field", density: "default" })} name="${escapeAttribute(field.key)}" ${field.required ? "required" : ""} ${disabled}`;
    if (field.type === "boolean") {
      const normalized = value !== false;
      return `<select ${attributes}><option value="true" ${normalized ? "selected" : ""}>Активно</option><option value="false" ${!normalized ? "selected" : ""}>В архиве</option></select>`;
    }
    if (field.type === "select") {
      return `<select ${attributes}><option value="">Не выбрано</option>${asArray(field.options).map(([id, label]) => `<option value="${escapeAttribute(id)}" ${id === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
    }
    if (field.type === "reference") {
      return `<select ${attributes}>${renderReferenceOptions(field, value)}</select>`;
    }
    if (field.type === "reference-list") {
      return `<textarea ${attributes} rows="4" placeholder="ID через запятую или с новой строки">${escapeHtml(asArray(value).join("\n"))}</textarea>`;
    }
    return `<input ${attributes} type="${field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}" value="${escapeAttribute(value ?? "")}" />`;
  }

  function getEditorEntity(definition, entity) {
    if (definition.id !== "employees" || !entity?.id) return entity;
    const assignment = getRegistryEntities("employmentAssignments").find((item) => item.employeeId === entity.id && item.isPrimary !== false)
      || getRegistryEntities("employmentAssignments").find((item) => item.employeeId === entity.id)
      || {};
    return { ...entity, ...assignment, id: entity.id };
  }

  function renderEntityEditor(definition) {
    if (!selectedEntityId) return "";
    const isNew = selectedEntityId === "__new__";
    const baseEntity = isNew ? { isActive: true } : getEntity(definition.id, selectedEntityId);
    const entity = getEditorEntity(definition, baseEntity);
    if (!entity && !isNew) return "";
    const editable = canEditRegistry(definition.id);
    const archiveEnabled = !isNew && canArchiveRegistry(definition.id) && entity?.isActive !== false;
    const formActions = `
      ${editable ? renderUiActionButton({ label: "Сохранить", iconName: "save", tone: "primary", attributes: "type=\"submit\"" }) : ""}
      ${archiveEnabled ? renderUiActionButton({ label: "Архивировать", iconName: "archive", tone: "danger", attributes: `type="button" data-system-domain-archive="${escapeAttribute(entity.id)}" data-system-domain-archive-registry="${escapeAttribute(definition.id)}"` }) : ""}
      ${renderUiActionButton({ label: "Закрыть", iconName: "close", tone: "secondary", attributes: "type=\"button\" data-system-domain-editor-close" })}
    `;
    return renderUiPanel({
      title: isNew ? `Новая запись: ${definition.label}` : registryLabel(entity),
      meta: editable ? "Запись в каноническом System Domains store" : "Только просмотр: нет права записи в реестр",
      className: "production-structure-panel production-structure-entity-editor",
      body: renderUiPanelBody({
        body: `
          <form data-system-domain-form data-system-domain-form-registry="${escapeAttribute(definition.id)}" data-system-domain-form-entity="${escapeAttribute(isNew ? "" : entity.id)}">
            ${renderUiFormGrid({
              columns: "3",
              body: `
                ${renderUiFormField({
                  label: "Стабильный ID",
                  required: true,
                  readOnly: !isNew,
                  control: `<input ${renderUiTableControlAttributes({ variant: "system-domain-id", density: "default" })} name="id" type="text" value="${escapeAttribute(entity.id || "")}" required ${isNew && editable ? "" : "readonly"} />`,
                  hint: isNew ? "После создания ID не меняется" : "ID используется во всех межмодульных связях",
                })}
                ${definition.fields.map((field) => renderUiFormField({
                  label: field.label,
                  required: field.required === true,
                  disabled: !editable,
                  control: renderFieldControl(field, entity, editable),
                })).join("")}
              `,
            })}
            <div class="ui-form-actions ui-action-bar" data-ui-component="FormActions">${formActions}</div>
          </form>
        `,
      }),
    });
  }

  function renderResponsibilitySummary(entities) {
    const employeeCount = getRegistryEntities("employees").length;
    const manualCount = entities.filter((policy) => policy.mode === "manual").length;
    const assignedCount = new Set(entities.flatMap((policy) => asArray(policy.targetEmployeeIds))).size;
    return renderUiPanel({
      title: "Представление распределения мастеров",
      meta: "Источник Мастерской: responsibilityPolicies, без записи в sharedUi",
      className: "production-structure-panel responsibility-policy-overview",
      body: renderUiPanelBody({
        body: `
          <div class="production-structure-kpis" aria-label="Сводка зон ответственности">
            <article><span>Политик</span><strong>${formatCount(entities.length)}</strong></article>
            <article><span>Ручных зон</span><strong>${formatCount(manualCount)}</strong></article>
            <article><span>Явно назначено</span><strong>${formatCount(assignedCount)}</strong></article>
            <article><span>Сотрудников</span><strong>${formatCount(employeeCount)}</strong></article>
          </div>
        `,
      }),
    });
  }

  function renderRegistryContent(definition) {
    const entities = getRegistryEntities(definition.id);
    return `
      ${definition.id === "responsibilityPolicies" ? renderResponsibilitySummary(entities) : ""}
      ${renderEntityEditor(definition)}
      ${renderUiPanel({
        title: definition.label,
        meta: `${formatCount(entities.length)} записей · stable ID · архивирование без hard delete`,
        className: "production-structure-panel production-structure-registry-panel",
        body: renderUiPanelBody({ body: renderRegistryTable(definition, entities) }),
      })}
    `;
  }

  function getMigrationReport() {
    try {
      return asRecord(getSystemDomainsMigrationReport());
    } catch {
      return {};
    }
  }

  function renderIssueList(title, items, emptyText) {
    const normalizedItems = asArray(items);
    return renderUiPanel({
      title,
      meta: `${formatCount(normalizedItems.length)} записей`,
      className: "production-structure-panel migration-diagnostic-panel",
      body: renderUiPanelBody({
        body: normalizedItems.length
          ? `<ol class="migration-diagnostic-list">${normalizedItems.map((item) => `<li><code>${escapeHtml(JSON.stringify(item))}</code></li>`).join("")}</ol>`
          : renderUiEmptyState({ iconName: "check", title: emptyText, text: "Проверка не обнаружила проблем этого типа." }),
      }),
    });
  }

  function renderLegacyMatrixDiagnostics() {
    const rows = asArray(PRODUCTION_STRUCTURE_MATRIX_ROWS);
    return renderUiPanel({
      title: "Legacy Excel-матрица",
      meta: `${formatCount(rows.length)} строк · ${formatCount(asArray(PRODUCTION_STRUCTURE_MATRIX_COLUMNS).length)} исходных полей · только чтение`,
      className: "production-structure-panel migration-legacy-matrix-panel",
      attributes: 'data-system-domain-legacy-diagnostics="read-only"',
      body: renderUiPanelBody({
        body: renderUiTableWrap({
          className: "production-structure-table-wrap migration-legacy-table-wrap",
          body: `
            <table class="directory-table ui-table migration-legacy-table">
              <thead><tr><th>ID / код</th><th>Тип строки</th><th>Структура</th><th>Родитель</th><th>Активность</th></tr></thead>
              <tbody>
                ${rows.map((row) => {
                  const cells = asRecord(row.cells);
                  return `
                    <tr data-migration-source-row="${escapeAttribute(row.id || cells["ID / код"] || "")}">
                      <td><code>${escapeHtml(cells["ID / код"] || row.id || "—")}</code></td>
                      <td>${escapeHtml(cells["Тип строки"] || "—")}</td>
                      <td class="primary-cell"><strong>${escapeHtml(formatPersonDisplayName(cells["Структура"], { fallback: cells["Структура"] || "—" }))}</strong></td>
                      <td>${escapeHtml(cells["Родитель"] || "—")}</td>
                      <td>${renderUiStatusToken(cells["Активность строки"] || cells["Статус активности"] || "не задано", cells["Активность строки"] === "архив" ? "warning" : "neutral")}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          `,
        }),
      }),
    });
  }

  function renderMigrationDiagnostics() {
    const report = getMigrationReport();
    const sourceCounts = asRecord(report.sourceCounts);
    const targetCounts = asRecord(report.targetCounts);
    const canActivate = report.canActivate === true;
    return `
      ${renderUiPanel({
        title: "Результат миграции System Domains",
        meta: "Диагностика не изменяет legacy matrix и канонические реестры",
        className: "production-structure-panel migration-report-summary",
        actions: renderUiStatusToken(canActivate ? "готово к активации" : "требует проверки", canActivate ? "ok" : "warning"),
        body: renderUiPanelBody({
          body: `
            <div class="production-structure-kpis" aria-label="Метрики миграции">
              <article><span>Исходных строк</span><strong>${formatCount(sourceCounts.matrixRows ?? PRODUCTION_STRUCTURE_MATRIX_ROWS.length)}</strong></article>
              <article><span>Сотрудников</span><strong>${formatCount(targetCounts.employees)}</strong></article>
              <article><span>Подразделений</span><strong>${formatCount(targetCounts.orgUnits)}</strong></article>
              <article><span>Должностей</span><strong>${formatCount(targetCounts.positions)}</strong></article>
              <article><span>Потерянных связей</span><strong>${formatCount(asArray(report.orphans).length)}</strong></article>
              <article><span>Дубликатов</span><strong>${formatCount(asArray(report.duplicates).length)}</strong></article>
            </div>
          `,
        }),
      })}
      ${renderIssueList("Потерянные связи", report.orphans, "Потерянных связей нет")}
      ${renderIssueList("Дубликаты", report.duplicates, "Дубликатов нет")}
      ${renderIssueList("Неприменённые overrides", report.unmatchedMatrixOverrideKeys, "Все overrides сопоставлены")}
      ${renderIssueList("Игнорированные legacy-строки", report.ignoredRows, "Игнорированных строк нет")}
      ${renderLegacyMatrixDiagnostics()}
    `;
  }

  function renderProductionStructureMatrixPage() {
    const definition = getRegistryDefinition();
    const isDiagnostics = activeRegistryId === DIAGNOSTICS_REGISTRY.id;
    const activeLabel = isDiagnostics ? DIAGNOSTICS_REGISTRY.label : definition?.label || "Реестр";
    const activeDescription = isDiagnostics ? DIAGNOSTICS_REGISTRY.description : definition?.description || "";
    const createAction = !isDiagnostics && definition && canEditRegistry(definition.id)
      ? renderUiActionButton({
        label: "Новая запись",
        iconName: "plus",
        tone: "primary",
        attributes: `type="button" data-system-domain-create="${escapeAttribute(definition.id)}"`,
      })
      : "";
    return renderUiModulePage({
      ariaLabel: "Структура и сотрудники",
      className: "production-structure-page system-domains-structure-page",
      workspaceClassName: "production-structure-workspace",
      contentClassName: "production-structure-content",
      sidebar: renderRegistrySidebar(),
      header: renderUiModuleHeader({
        eyebrow: "Система · System Domains",
        title: activeLabel,
        description: activeDescription,
        actions: createAction,
        className: "directory-header production-structure-header",
      }),
      content: `
        ${lastMutationError ? renderUiPanel({
          title: "Изменение не сохранено",
          meta: lastMutationError,
          className: "production-structure-panel is-error",
        }) : ""}
        ${isDiagnostics ? renderMigrationDiagnostics() : `${renderSummary()}${definition ? renderRegistryContent(definition) : ""}`}
      `,
      visualContract: "system-domains-structure-v1",
    });
  }

  function parseFieldValue(field, formData) {
    const rawValue = formData.get(field.key);
    if (field.type === "boolean") return rawValue === "true";
    if (field.type === "number") {
      const number = Number(rawValue);
      return Number.isFinite(number) ? number : 0;
    }
    if (field.type === "reference-list") {
      return [...new Set(normalizeText(rawValue).split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean))].sort();
    }
    return normalizeText(rawValue);
  }

  function completeMutation(result, successMessage, nextSelectedEntityId = selectedEntityId) {
    const onSuccess = () => {
      selectedEntityId = nextSelectedEntityId;
      lastMutationError = "";
      notifySaveSuccess(successMessage);
      render();
    };
    const onError = (error) => {
      lastMutationError = normalizeText(error?.message) || "Неизвестная ошибка доменного store";
      console.error("[MES] System Domains mutation failed", error);
      render();
    };
    if (result && typeof result.then === "function") {
      result.then((value) => {
        if (value === false || value?.ok === false) throw new Error(value?.reason || "Доменный store отклонил изменение");
        onSuccess();
      }).catch(onError);
      return;
    }
    if (result === false || result?.ok === false) {
      onError(new Error(result?.reason || "Доменный store отклонил изменение"));
      return;
    }
    onSuccess();
  }

  function bindProductionStructureMatrixEvents() {
    const page = getApp()?.querySelector?.(".production-structure-page");
    if (!page) return;

    page.querySelectorAll("[data-system-domain-registry]").forEach((button) => {
      button.addEventListener("click", () => {
        const registryId = normalizeText(button.dataset.systemDomainRegistry);
        if (![...REGISTRY_DEFINITIONS.map((item) => item.id), DIAGNOSTICS_REGISTRY.id].includes(registryId)) return;
        activeRegistryId = registryId;
        selectedEntityId = "";
        lastMutationError = "";
        render();
      });
    });

    page.querySelector("[data-system-domain-create]")?.addEventListener("click", (event) => {
      event.preventDefault();
      const registryId = normalizeText(event.currentTarget.dataset.systemDomainCreate);
      if (!canEditRegistry(registryId)) return;
      activeRegistryId = registryId;
      selectedEntityId = "__new__";
      lastMutationError = "";
      render();
    });

    page.querySelectorAll("[data-system-domain-open]").forEach((button) => {
      button.addEventListener("click", () => {
        activeRegistryId = normalizeText(button.dataset.systemDomainOpenRegistry);
        selectedEntityId = normalizeText(button.dataset.systemDomainOpen);
        lastMutationError = "";
        render();
      });
    });

    page.querySelector("[data-system-domain-editor-close]")?.addEventListener("click", () => {
      selectedEntityId = "";
      lastMutationError = "";
      render();
    });

    page.querySelector("[data-system-domain-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const registryId = normalizeText(form.dataset.systemDomainFormRegistry);
      const definition = getRegistryDefinition(registryId);
      if (!definition || !canEditRegistry(registryId)) return;
      const formData = new FormData(form);
      const entityId = normalizeText(formData.get("id"));
      if (!entityId) return;
      const currentEntity = getEntity(registryId, normalizeText(form.dataset.systemDomainFormEntity)) || {};
      const fieldValues = Object.fromEntries(definition.fields.map((field) => [field.key, parseFieldValue(field, formData)]));
      const entity = definition.id === "employees"
        ? {
          ...currentEntity,
          id: entityId,
          ...Object.fromEntries(definition.fields.filter((field) => !field.assignment).map((field) => [field.key, fieldValues[field.key]])),
          employmentAssignment: {
            id: `employment:${entityId}`,
            employeeId: entityId,
            isPrimary: true,
            ...Object.fromEntries(definition.fields.filter((field) => field.assignment).map((field) => [field.key, fieldValues[field.key]])),
          },
        }
        : {
          ...currentEntity,
          id: entityId,
          ...fieldValues,
        };
      try {
        const result = upsertSystemDomainEntity(registryId, entity, {
          source: "structure-and-employees-module",
          operation: currentEntity.id ? "update" : "create",
        });
        completeMutation(result, "Запись System Domains сохранена.", entityId);
      } catch (error) {
        completeMutation(Promise.reject(error), "", selectedEntityId);
      }
    });

    page.querySelector("[data-system-domain-archive]")?.addEventListener("click", (event) => {
      event.preventDefault();
      const entityId = normalizeText(event.currentTarget.dataset.systemDomainArchive);
      const registryId = normalizeText(event.currentTarget.dataset.systemDomainArchiveRegistry);
      if (!entityId || !canArchiveRegistry(registryId)) return;
      try {
        const result = archiveSystemDomainEntity(registryId, entityId, {
          source: "structure-and-employees-module",
          reason: "operator-archive",
        });
        completeMutation(result, "Запись перемещена в архив.", "");
      } catch (error) {
        completeMutation(Promise.reject(error), "", selectedEntityId);
      }
    });
  }

  return {
    bindProductionStructureMatrixEvents,
    getProductionStructureMatrixRuntimeOverrides,
    renderProductionStructureMatrixPage,
    setProductionStructureMatrixActiveRegistry,
  };
}
