import { formatPersonDisplayName } from "../../ui/formatters.js";

export function createAuthRenderModule(dependencies = {}) {
  const {
    AUTH_PIN_TEMPORARILY_DISABLED,
    AUTH_DEPARTMENT_ICON_BY_ID,
    AUTH_UNIT_ICON_BY_ID,
    escapeAttribute,
    escapeHtml,
    formatReportNumber = (value = 0) => Number(value || 0).toLocaleString("ru-RU"),
    formatWeeklyProductionControlPercent = (value = 0) => `${Math.round(Number(value || 0))}%`,
    getActiveInterfaceRole,
    getAccessRoleById,
    getAccessRoleForEmployee = (person = null) => ({ role: getActiveInterfaceRole(), explicit: false, person }),
    getAuthPrototypeAttemptsLeft,
    getAuthenticatedAccessPerson = () => null,
    getAuthPrototypeDepartmentRows,
    getAuthPrototypeDirectDepartmentPeople,
    getAuthPrototypePeople,
    getAuthPrototypePeopleByUnit,
    getAuthPrototypePinDraft = () => "",
    getAuthPrototypeKeypadDigitsState = () => [],
    getAuthPrototypePinFeedbackTone,
    getAuthPrototypeSelectedDepartment,
    getAuthPrototypeSelectedPerson,
    getAuthPrototypeSelectedUnit,
    getAuthPrototypeUnitRows,
    getMesCustomIconNameForRuntimeId,
    getModuleDefinitions = () => [],
    getPlanningOrderObjectLabel = () => "",
    getPlanningState = () => ({}),
    getProductionStructureEmployees,
    getProductionStructureMatrixRuntimeOverrides,
    getShiftMasterBoardAssignment,
    getShiftMasterBoardLaborMinutesPerUnit,
    getShiftMasterBoardModel,
    getShiftMasterBoardRouteChain,
    getShiftMasterEmployee,
    getShiftMasterRowOrderLabel,
    getShiftMasterRowRoutePartLabel,
    getWorkCenter = () => null,
    getUi,
    icon,
    inferAccessRoleIdForPerson = () => getActiveInterfaceRole().id,
    isAuthPrototypePinFeedbackLocked,
    isAuthGateQaBypassEnabled = () => false,
    isAuthGateUnlocked = () => false,
    normalizeLookupText,
    normalizePlainRecord,
    normalizePlanningLaborPositiveNumber = (value = 0) => {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : 0;
    },
    normalizeShiftMasterBoardQuantity = (value = 0) => {
      const quantity = Math.round(Number(value));
      return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
    },
    normalizeShiftMasterExecutors = (source = []) => (Array.isArray(source) ? source : []),
    makeId = (prefix = "id") => `${prefix}-${Date.now()}`,
    notifySaveSuccess,
    persistUiState,
    render,
    renderUiActionButton,
    renderUiEmptyState,
    renderUiModalFrame,
    renderUiModalShell,
    renderUiModuleHeader,
    renderUiModulePage,
    renderUiPanel,
    renderUiPanelBody,
    renderUiPanelFooter = ({ body = "" } = {}) => `<footer>${body}</footer>`,
    renderUiStatusToken,
    setAuthPrototypePinDraft = () => {},
    setAuthPrototypeKeypadDigitsState = () => {},
  } = dependencies;
  const ui = new Proxy({}, {
    get(_target, property) {
      return getUi()?.[property];
    },
    set(_target, property, value) {
      const state = getUi();
      if (state) state[property] = value;
      return true;
    },
  });
  const formatAuthPersonName = (value = "", fallback = "Исполнитель") => formatPersonDisplayName(value, { fallback });

  function renderAuthPrototypePersonButton(person) {
    const personLookup = normalizeLookupText(`${person.name || ""} ${person.role || ""}`);
    const isMaster = person.personKind === "master"
      || person.canDistribute
      || /мастер|начальник|директор|руководител/.test(personLookup);
    return `
      <button class="${isMaster ? "is-auth-master" : ""}" data-auth-person="${escapeAttribute(person.id)}" data-auth-person-kind="${isMaster ? "master" : "employee"}" type="button">
        <strong>${escapeHtml(formatAuthPersonName(person.name))}</strong>
        <span>${escapeHtml(person.role || "Роль не задана")}</span>
        ${isMaster ? `<b class="auth-prototype-role-marker" aria-hidden="true">мастер</b>` : ""}
        <small>${escapeHtml([
          person.canExecute === false ? "без выполнения работ" : "исполнитель",
          person.personKind === "master" || person.canDistribute ? "может распределять" : "",
          person.canCloseFact ? "закрывает факт" : "",
        ].filter(Boolean).join(" · "))}</small>
      </button>
    `;
  }
  
  function getAuthPrototypeUnitIcon(unit) {
    const unitId = String(unit?.id || "");
    if (AUTH_UNIT_ICON_BY_ID[unitId]) return AUTH_UNIT_ICON_BY_ID[unitId];
    const lookup = normalizeLookupText(`${unit?.name || ""} ${unit?.caption || ""}`);
    if (/smt|поверхност|линия/.test(lookup)) return "gantt";
    if (/контрол|инспекц|аои|провер/.test(lookup)) return "check";
    if (/отмыв|склад|логист/.test(lookup)) return "package";
    if (/слесар|сбор/.test(lookup)) return "settings";
    if (/ручн|монтаж|пайк/.test(lookup)) return "worker";
    return "operation";
  }
  
  function renderAuthPrototypeDepartmentStep(people) {
    const departments = getAuthPrototypeDepartmentRows(people);
    return `
      <section class="auth-prototype-step auth-prototype-department-step" data-auth-step="department">
        ${renderUiPanel({
          title: "Выберите отдел",
          meta: "первый шаг показывает только верхний уровень оргструктуры",
          className: "auth-prototype-panel auth-prototype-step-panel auth-prototype-department-panel",
          body: renderUiPanelBody({ body: `
            <div class="auth-prototype-department-grid">
              ${departments.map((department) => {
                const departmentIcon = AUTH_DEPARTMENT_ICON_BY_ID[department.id]
                  || getMesCustomIconNameForRuntimeId(department.id)
                  || (department.isFallback ? "lock" : "directory");
                return `
                <button data-auth-department="${escapeAttribute(department.id)}" type="button">
                  <span class="auth-prototype-department-icon" data-icon="${escapeAttribute(departmentIcon)}" aria-hidden="true">${icon(departmentIcon)}</span>
                  <span class="auth-prototype-department-copy">
                    <strong>${escapeHtml(department.name)}</strong>
                    <span>${department.employees.toLocaleString("ru-RU")} чел.</span>
                  </span>
                </button>
              `;
              }).join("")}
            </div>
          ` }),
        })}
      </section>
    `;
  }
  
  function renderAuthPrototypeUnitStep(people, departmentRow) {
    const units = getAuthPrototypeUnitRows(people, departmentRow);
    const directEmployees = getAuthPrototypeDirectDepartmentPeople(people, departmentRow);
    const hasContent = units.length || directEmployees.length;
    return `
      <section class="auth-prototype-step auth-prototype-unit-step" data-auth-step="unit">
        ${renderUiPanel({
          title: "Выберите участок",
          meta: departmentRow?.name || "отдел не выбран",
          className: "auth-prototype-panel auth-prototype-step-panel auth-prototype-unit-panel",
          body: renderUiPanelBody({ body: `
            <div class="auth-prototype-step-toolbar">
              ${renderUiActionButton({ label: "Назад", iconName: "arrowLeft", attributes: "data-auth-back-departments type=\"button\"" })}
              ${renderUiStatusToken(`${units.length.toLocaleString("ru-RU")} участков`, "neutral")}
              ${directEmployees.length ? renderUiStatusToken(`${directEmployees.length.toLocaleString("ru-RU")} сотрудников отдела`, "neutral") : ""}
            </div>
            ${units.length ? `
              <div class="auth-prototype-unit-grid">
                ${units.map((unit) => {
                  const unitIcon = getAuthPrototypeUnitIcon(unit);
                  return `
                  <button data-auth-unit="${escapeAttribute(unit.id)}" type="button">
                    <span class="auth-prototype-unit-icon" data-icon="${escapeAttribute(unitIcon)}" aria-hidden="true">${icon(unitIcon)}</span>
                    <span class="auth-prototype-unit-copy">
                      <strong>${escapeHtml(unit.name)}</strong>
                      <span>${unit.employees.toLocaleString("ru-RU")} чел.</span>
                    </span>
                  </button>
                `;
                }).join("")}
              </div>
            ` : ""}
            ${directEmployees.length ? `
              <div class="auth-prototype-inline-people">
                <div class="auth-prototype-inline-people-head">
                  <strong>Сотрудники отдела</strong>
                  <span>без дополнительного синтетического шага</span>
                </div>
                <div class="auth-prototype-people-grid auth-prototype-step-people-grid">
                  ${directEmployees.map(renderAuthPrototypePersonButton).join("")}
                </div>
              </div>
            ` : ""}
            ${hasContent ? "" : renderUiEmptyState({ iconName: "departments", title: "Сотрудники не найдены", text: "Вернитесь к выбору отдела или проверьте матрицу структуры." })}
          ` }),
        })}
      </section>
    `;
  }
  
  function renderAuthPrototypePersonStep(people, departmentRow, unitRow) {
    const employees = getAuthPrototypePeopleByUnit(people, departmentRow, unitRow);
    const hasUnitStep = getAuthPrototypeUnitRows(people, departmentRow).length > 0;
    return `
      <section class="auth-prototype-step auth-prototype-person-step" data-auth-step="person">
        ${renderUiPanel({
          title: "Выберите сотрудника",
          meta: [departmentRow?.name, unitRow?.name].filter(Boolean).join(" · ") || "отдел не выбран",
          className: "auth-prototype-panel auth-prototype-step-panel auth-prototype-picker-panel auth-prototype-person-panel",
          body: renderUiPanelBody({ body: `
            <div class="auth-prototype-step-toolbar">
              ${renderUiActionButton({
                label: "Назад",
                iconName: "arrowLeft",
                attributes: `${hasUnitStep && unitRow?.id ? "data-auth-back-units" : "data-auth-back-departments"} type=\"button\"`,
              })}
              ${renderUiStatusToken(`${employees.length.toLocaleString("ru-RU")} сотрудников`, "neutral")}
            </div>
            <div class="auth-prototype-people-grid auth-prototype-step-people-grid">
              ${employees.map(renderAuthPrototypePersonButton).join("") || renderUiEmptyState({ iconName: "worker", title: "Сотрудники не найдены", text: "Вернитесь к выбору отдела." })}
            </div>
          ` }),
        })}
      </section>
    `;
  }
  
  function renderAuthPrototypeUnifiedPinStep(people, departmentRow, unitRow, selectedPerson) {
    const pinLength = Math.min(5, String(getAuthPrototypePinDraft() || "").length);
    const result = String(ui.authPrototypeResult || "");
    const attemptsLeft = getAuthPrototypeAttemptsLeft();
    const isLocked = attemptsLeft <= 0 || result === "pin-error-locked" || isAuthPrototypePinFeedbackLocked(result);
    const resultTone = result === "pin-ok" ? "ok" : result.startsWith("pin-error") ? "critical" : "neutral";
    const resultLabel = result === "pin-ok"
      ? "вход разрешен"
      : result === "pin-checking"
        ? "проверка PIN"
      : isLocked
        ? "вход заблокирован"
        : result === "pin-error"
          ? "ошибка PIN"
          : "готов к вводу";
    return `
      <section class="auth-prototype-step auth-prototype-pin-step" data-auth-step="pin">
        ${renderUiPanel({
          title: "Введите PIN",
          meta: "автопроверка после пятой цифры",
          className: "auth-prototype-panel auth-prototype-step-panel auth-prototype-pin-panel auth-prototype-unified-pin-panel",
          body: renderUiPanelBody({ body: `
            <div class="auth-prototype-step-toolbar">
              ${renderUiActionButton({ label: "Назад", iconName: "arrowLeft", attributes: "data-auth-back-people type=\"button\"" })}
            </div>
            <div class="auth-prototype-pin-entry">
              <div class="auth-prototype-selected-person">
                ${icon(selectedPerson?.personKind === "master" || selectedPerson?.canDistribute ? "lock" : "worker")}
                <span>
                  <strong>${escapeHtml(formatAuthPersonName(selectedPerson?.name, "Сотрудник не выбран"))}</strong>
                  <small>${escapeHtml(selectedPerson ? [selectedPerson.role, departmentRow?.name, unitRow?.name].filter(Boolean).join(" · ") : "вернитесь к выбору сотрудника")}</small>
                </span>
                ${result ? renderUiStatusToken(resultLabel, resultTone) : ""}
              </div>
              ${renderAuthPrototypePinDisplay(pinLength, getAuthPrototypePinFeedbackTone(result))}
              ${renderAuthPrototypeKeypad(isLocked)}
              <p class="auth-prototype-pin-note">После пятой цифры вход проверяется автоматически. Осталось попыток: ${attemptsLeft}.</p>
            </div>
          ` }),
        })}
      </section>
    `;
  }
  
  function getAuthPrototypeSelectedExecutor(people) {
    return people.executors.find((person) => person.id === ui.authPrototypePersonId) || people.executors[0] || null;
  }
  
  function renderAuthPrototypePinDisplay(pinLength = 0, tone = "") {
    const toneClass = tone ? ` is-${tone}` : "";
    return `
      <div class="auth-prototype-pin-display${toneClass}" aria-label="Введенный PIN">
        ${Array.from({ length: 5 }, (_, index) => `<span class="${index < pinLength ? "is-filled" : ""}"></span>`).join("")}
      </div>
    `;
  }
  
  function shuffleAuthPrototypeDigits(previousDigits = []) {
    const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    for (let index = digits.length - 1; index > 0; index -= 1) {
      const targetIndex = Math.floor(Math.random() * (index + 1));
      [digits[index], digits[targetIndex]] = [digits[targetIndex], digits[index]];
    }
    const defaultDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const sameAsPrevious = previousDigits.length === digits.length
      && digits.every((digit, index) => digit === previousDigits[index]);
    const sameAsDefault = digits.every((digit, index) => digit === defaultDigits[index]);
    if (sameAsPrevious || sameAsDefault) {
      digits.push(digits.shift());
    }
    return digits;
  }
  
  function resetAuthPrototypeKeypad() {
    setAuthPrototypeKeypadDigitsState(shuffleAuthPrototypeDigits(getAuthPrototypeKeypadDigitsState()));
  }
  
  function getAuthPrototypeKeypadDigits() {
    if (getAuthPrototypeKeypadDigitsState().length !== 10) resetAuthPrototypeKeypad();
    return getAuthPrototypeKeypadDigitsState();
  }
  
  function resetAuthPrototypePinEntry() {
    setAuthPrototypePinDraft("");
    resetAuthPrototypeKeypad();
  }
  
  function renderAuthPrototypeKeypad(disabled = false) {
    const disabledAttr = disabled ? "disabled" : "";
    const digits = getAuthPrototypeKeypadDigits();
    const mainDigits = digits.slice(0, 9);
    const bottomDigit = digits[9] || "0";
    return `
      <div class="auth-prototype-keypad" aria-label="Цифровая клавиатура PIN">
        ${mainDigits.map((digit) => `<button data-auth-pin-digit="${digit}" type="button" ${disabledAttr}>${digit}</button>`).join("")}
        <span class="auth-prototype-keypad-clear" aria-hidden="true"></span>
        <button data-auth-pin-digit="${bottomDigit}" type="button" ${disabledAttr}>${bottomDigit}</button>
        <button class="auth-prototype-keypad-delete" data-auth-pin-backspace type="button" ${disabledAttr}>${icon("backspaceApple")}</button>
      </div>
    `;
  }
  
  function getAuthPrototypeExecutorTasks(person = {}) {
    const department = normalizeLookupText(person.department || "");
    if (department.includes("контрол")) {
      return [
        ["СЗН-20260628-QC-1", "Технический контроль промежуточный", "изд. \"Хуета\" · 280 шт.", "к выполнению"],
        ["СЗН-20260628-QC-2", "Финальный контроль", "BOM_ELF · 160 плат", "ожидает передачи"],
        ["СЗН-20260628-QC-3", "Входной контроль возврата", "1 партия", "буфер"],
      ];
    }
    if (department.includes("склад")) {
      return [
        ["СЗН-20260628-WH-1", "Выдача в производство", "Печатные платы · 1000 шт.", "к выдаче"],
        ["СЗН-20260628-WH-2", "Приемка из производства", "Сборка в заготовку · 420 узлов", "ожидает"],
        ["СЗН-20260628-WH-3", "Передача в буфер", "2 партии", "к передаче"],
      ];
    }
    if (department.includes("отмыв")) {
      return [
        ["СЗН-20260628-UW-1", "Отмывка", "BOM_для расчетттттта · 320 плат", "к выполнению"],
        ["СЗН-20260628-UW-2", "Сушка после отмывки", "BOM_ELF · 180 плат", "в очереди"],
        ["СЗН-20260628-UW-3", "Передача в контроль", "1 партия", "к передаче"],
      ];
    }
    return [
      ["СЗН-20260628-01", "Выводной монтаж", "изд. \"Хуета\" · 180 узлов", "к выполнению"],
      ["СЗН-20260628-02", "Слесарная операция", "Сборка в заготовку · 120 узлов", "назначено"],
      ["СЗН-20260628-03", "Передача мастеру", "1 партия", "ожидает факта"],
    ];
  }
  
  function getAuthPrototypeRoleAccess(roleId = "master") {
    const access = {
      master: [
        ["Мастерская", "назначение смены", "primary"],
        ["Табель", "доступные исполнители", "neutral"],
        ["Матрица", "загрузка ресурсов", "neutral"],
        ["Печать листов", "сменные документы", "warning"],
      ],
      dispatcher: [
        ["Планирование", "план / факт / дефицит", "primary"],
        ["Матрица", "загрузка по дням", "neutral"],
        ["Табель", "явка и смены", "neutral"],
        ["Журнал факта", "выпуск смены", "warning"],
      ],
      technologist: [
        ["Маршрутная карта", "операции и переходы", "primary"],
        ["Спецификации", "структура изделия", "neutral"],
        ["Номенклатура", "объекты и BOM", "neutral"],
        ["Заказ-наряды", "трудозатраты", "warning"],
      ],
      productionHead: [
        ["Планирование", "производственный обзор", "primary"],
        ["Мастерская", "оперативная нагрузка", "neutral"],
        ["Табель", "доступность людей", "neutral"],
        ["Структура и сотрудники", "оргструктура и персонал", "warning"],
      ],
      admin: [
        ["Роли и доступ", "grants и назначения", "primary"],
        ["Структура и сотрудники", "иерархия и персонал", "neutral"],
        ["Справочники и нормативы", "классификаторы и нормы", "neutral"],
        ["Авторизация", "PIN и роли", "warning"],
      ],
    };
    return access[roleId] || access.master;
  }
  
  function renderAuthPrototypeExecutorSessionPanel(selectedPerson, options = {}) {
    const result = String(ui.authPrototypeResult || "");
    const isLoggedIn = Boolean(options.forceLoggedIn) || result === "pin-ok";
    const tasks = getAuthPrototypeExecutorTasks(selectedPerson);
    return renderUiPanel({
      title: isLoggedIn ? "Рабочий стол" : "Рабочий экран исполнителя",
      meta: isLoggedIn ? "сеанс открыт на планшете" : "появится после успешного PIN",
      className: "auth-prototype-panel auth-prototype-session-panel",
      cornerMarker: renderUiDemoCornerMarker("Рабочий стол: демо без смены текущего пользователя"),
      body: `
        ${renderUiPanelBody({ body: `
          <div class="auth-prototype-session-head is-${escapeAttribute(isLoggedIn ? "active" : "locked")}">
            ${icon(isLoggedIn ? "unlock" : "lock")}
            <span>
              <strong>${escapeHtml(isLoggedIn ? "Смена открыта" : "Сеанс закрыт")}</strong>
              <small>${escapeHtml(selectedPerson ? `${formatAuthPersonName(selectedPerson.name)} · ${selectedPerson.department || "отдел не задан"}` : "выберите сотрудника и введите PIN")}</small>
            </span>
            ${renderUiStatusToken(isLoggedIn ? "в работе" : "ожидание", isLoggedIn ? "ok" : "neutral")}
          </div>
          <div class="auth-prototype-shift-summary">
            <span><strong>Смена</strong><small>28.06 · 08:00-20:00</small></span>
            <span><strong>${isLoggedIn ? "3" : "-"}</strong><small>сменных листа</small></span>
            <span><strong>${isLoggedIn ? "560" : "-"}</strong><small>план, шт.</small></span>
          </div>
          <div class="auth-prototype-task-list">
            ${tasks.map(([id, title, meta, state]) => `
              <article class="${isLoggedIn ? "is-active" : "is-locked"}">
                <span>${escapeHtml(id)}</span>
                <strong>${escapeHtml(title)}</strong>
                <small>${escapeHtml(meta)}</small>
                ${renderUiStatusToken(isLoggedIn ? state : "закрыто", isLoggedIn ? "neutral" : "disabled")}
              </article>
            `).join("")}
          </div>
        ` })}
        ${renderUiPanelFooter({ body: `
          ${renderUiActionButton({ label: "Открыть лист", iconName: "document", tone: "primary", attributes: `type="button" ${isLoggedIn ? "" : "disabled"}`, cornerMarker: renderUiDemoInteractiveMarker("Демо: открытие сменного листа пока не меняет систему") })}
          ${renderUiActionButton({ label: "Внести факт", iconName: "check", attributes: `type="button" ${isLoggedIn ? "" : "disabled"}`, cornerMarker: renderUiDemoInteractiveMarker("Демо: факт пока не записывается из авторизации") })}
          ${renderUiActionButton({ label: "Выйти", iconName: "lock", attributes: "data-auth-logout type=\"button\"", cornerMarker: renderUiDemoInteractiveMarker("Сбрасывает только состояние UX-прототипа") })}
        ` })}
      `,
    });
  }
  
  function renderAuthSessionRoleWorkspacePanel(people, options = {}) {
    const activeRole = getActiveInterfaceRole();
    const selectedPerson = getAuthenticatedAccessPerson()
      || people.managers.find((person) => inferAccessRoleIdForPerson(person) === activeRole.id)
      || people.managers[0]
      || people.employees[0]
      || null;
    const isLoggedIn = Boolean(options.forceLoggedIn) || isAuthGateUnlocked();
    const access = getAuthPrototypeRoleAccess(activeRole.id);
    return renderUiPanel({
      title: isLoggedIn ? "Рабочее место открыто" : "Рабочее место роли",
      meta: activeRole.label,
      className: "auth-prototype-panel auth-prototype-access-panel",
      cornerMarker: renderUiDemoCornerMarker("Рабочий стол: демо без изменения текущих прав"),
      body: `
        ${renderUiPanelBody({ body: `
          <div class="auth-prototype-session-head is-${escapeAttribute(isLoggedIn ? "active" : "locked")}">
            ${icon(isLoggedIn ? "unlock" : "lock")}
            <span>
              <strong>${escapeHtml(isLoggedIn ? formatAuthPersonName(selectedPerson?.name, activeRole.label) : activeRole.label)}</strong>
              <small>${escapeHtml(isLoggedIn ? [selectedPerson?.role, selectedPerson?.department].filter(Boolean).join(" · ") || "сеанс активен" : "после успешного PIN")}</small>
            </span>
            ${renderUiStatusToken(isLoggedIn ? "доступ открыт" : "закрыто", isLoggedIn ? "ok" : "neutral")}
          </div>
          <div class="auth-prototype-access-grid">
            ${access.map(([title, meta, tone]) => `
              <article class="${isLoggedIn ? "is-active" : "is-locked"}">
                <strong>${escapeHtml(title)}</strong>
                <small>${escapeHtml(meta)}</small>
                ${renderUiStatusToken(isLoggedIn ? "доступ" : "после входа", isLoggedIn ? tone : "disabled")}
              </article>
            `).join("")}
          </div>
        ` })}
        ${renderUiPanelFooter({ body: `
          ${renderUiActionButton({ label: "Открыть модуль", iconName: "arrowRight", tone: "primary", attributes: `type="button" ${isLoggedIn ? "" : "disabled"}`, cornerMarker: renderUiDemoInteractiveMarker("Демо: переход по роли пока не меняет активный модуль") })}
          ${renderUiActionButton({ label: "Выйти", iconName: "lock", attributes: "data-auth-logout type=\"button\"", cornerMarker: renderUiDemoInteractiveMarker("Сбрасывает только состояние UX-прототипа") })}
        ` })}
      `,
    });
  }
  
  function getAuthSessionCanViewAll(role = getActiveInterfaceRole()) {
    const roleId = typeof role === "string" ? role : role?.id || "";
    return roleId === "admin" || roleId === "productionHead";
  }
  
  function getAuthSessionTaskId(rowId = "", employeeId = "") {
    return `${String(rowId || "row").trim()}::${String(employeeId || "employee").trim()}`;
  }
  
  function getAuthSessionTaskRowId(taskId = "") {
    const normalizedTaskId = String(taskId || "").trim();
    const separatorIndex = normalizedTaskId.lastIndexOf("::");
    return separatorIndex > 0 ? normalizedTaskId.slice(0, separatorIndex) : normalizedTaskId;
  }
  
  function normalizeAuthSessionFactField(field = "") {
    return field === "defect" ? "defect" : "actual";
  }
  
  function getAuthSessionFactDraft(taskId = "") {
    const store = normalizePlainRecord(ui.authSessionFactDrafts);
    const draft = normalizePlainRecord(store[taskId]);
    return {
      actualQuantity: normalizeShiftMasterBoardQuantity(draft.actualQuantity || 0),
      defectQuantity: normalizeShiftMasterBoardQuantity(draft.defectQuantity || 0),
      deviationComment: String(draft.deviationComment || "").trim(),
      status: String(draft.status || ""),
      updatedAt: String(draft.updatedAt || ""),
    };
  }
  
  function setAuthSessionFactDraft(taskId = "", patch = {}) {
    if (!taskId) return null;
    const store = normalizePlainRecord(ui.authSessionFactDrafts);
    const previous = normalizePlainRecord(store[taskId]);
    const next = {
      ...previous,
      ...patch,
    };
    ui.authSessionFactDrafts = {
      ...store,
      [taskId]: next,
    };
    return next;
  }
  
  function getAuthSessionTaskGoodQuantity(task = {}, draft = getAuthSessionFactDraft(task.id)) {
    const actualQuantity = normalizeShiftMasterBoardQuantity(draft.actualQuantity || task.actualQuantity || 0);
    const defectQuantity = Math.min(actualQuantity, normalizeShiftMasterBoardQuantity(draft.defectQuantity || task.defectQuantity || 0));
    return Math.max(0, actualQuantity - defectQuantity);
  }
  
  function getAuthSessionFactDeviationPercent(task = {}, draft = getAuthSessionFactDraft(task.id)) {
    const assignedQuantity = normalizeShiftMasterBoardQuantity(task.assignedQuantity || 0);
    if (assignedQuantity <= 0) return 0;
    return ((getAuthSessionTaskGoodQuantity(task, draft) - assignedQuantity) / assignedQuantity) * 100;
  }
  
  function doesAuthSessionFactNeedDeviationComment(task = {}, draft = getAuthSessionFactDraft(task.id)) {
    const assignedQuantity = normalizeShiftMasterBoardQuantity(task.assignedQuantity || 0);
    if (assignedQuantity <= 0) return false;
    return getAuthSessionTaskGoodQuantity(task, draft) < assignedQuantity * 0.95;
  }
  
  function normalizeShiftWorkOrderIssueReports(value = {}) {
    const source = normalizePlainRecord(value);
    return Object.fromEntries(Object.entries(source).map(([rowId, reports]) => {
      const normalizedReports = Array.isArray(reports)
        ? reports
          .map((report) => {
            const record = normalizePlainRecord(report);
            const photo = normalizePlainRecord(record.photo);
            return {
              id: String(record.id || makeId("issue")).trim(),
              rowId: String(record.rowId || rowId || "").trim(),
              taskId: String(record.taskId || "").trim(),
              documentNumber: String(record.documentNumber || "").trim(),
              employeeId: String(record.employeeId || "").trim(),
              employeeName: String(record.employeeName || "").trim(),
              operationName: String(record.operationName || "").trim(),
              workCenterLabel: String(record.workCenterLabel || "").trim(),
              text: String(record.text || "").slice(0, 1200),
              status: String(record.status || "new").trim() || "new",
              createdAt: String(record.createdAt || "").trim(),
              photo: photo.name || photo.dataUrl ? {
                id: String(photo.id || makeId("photo")).trim(),
                name: String(photo.name || "photo.jpg").trim(),
                type: String(photo.type || "image/jpeg").trim(),
                size: Math.max(0, Number(photo.size || 0) || 0),
                source: String(photo.source || "file").trim(),
                dataUrl: String(photo.dataUrl || "").startsWith("data:image/") ? String(photo.dataUrl || "") : "",
                storageNote: String(photo.storageNote || "").trim(),
              } : null,
            };
          })
          .filter((report) => report.rowId && report.id)
          .slice(0, 8)
        : [];
      return [String(rowId || "").trim(), normalizedReports];
    }).filter(([rowId]) => rowId));
  }
  
  function getShiftWorkOrderIssueLookupKeys(target = "") {
    const record = typeof target === "object" ? normalizePlainRecord(target) : {};
    const sheetContract = normalizePlainRecord(record.sheetContract);
    const transfer = normalizePlainRecord(record.transfer);
    const keys = typeof target === "string"
      ? [target]
      : [
        record.id,
        record.rowId,
        record.sourceRowId,
        record.slotId,
        sheetContract.rowId,
        sheetContract.sourceRowId,
        sheetContract.sourceSlotId,
        transfer.sourceRowId,
        transfer.sourceSlotId,
      ];
    return [...new Set(keys
      .map((key) => String(key || "").trim())
      .filter(Boolean))];
  }
  
  function getShiftWorkOrderIssueReports(target = "") {
    const lookupKeys = getShiftWorkOrderIssueLookupKeys(target);
    if (!lookupKeys.length) return [];
    const store = normalizeShiftWorkOrderIssueReports(ui.shiftWorkOrderIssueReports);
    const seen = new Set();
    return lookupKeys.flatMap((rowId) => store[rowId] || [])
      .filter((report) => {
        const reportKey = String(report.id || `${report.rowId || ""}:${report.taskId || ""}:${report.createdAt || ""}`).trim();
        if (!reportKey || seen.has(reportKey)) return false;
        seen.add(reportKey);
        return true;
      });
  }
  
  function getShiftWorkOrderReportPhotoItems(target = "") {
    return getShiftWorkOrderIssueReports(target)
      .map((report) => {
        const photo = normalizePlainRecord(report.photo);
        if (!photo.dataUrl) return null;
        return {
          rowId: String(report.rowId || "").trim(),
          reportId: String(report.id || "").trim(),
          photoId: String(photo.id || report.id || "").trim(),
          name: String(photo.name || "Фото проблемы").trim(),
          dataUrl: String(photo.dataUrl || ""),
          text: String(report.text || "").trim(),
          employeeName: String(report.employeeName || "").trim(),
          operationName: String(report.operationName || "").trim(),
          workCenterLabel: String(report.workCenterLabel || "").trim(),
          createdAt: String(report.createdAt || "").trim(),
        };
      })
      .filter(Boolean);
  }
  
  function getShiftWorkOrderIssueSummary(target = "") {
    const reports = getShiftWorkOrderIssueReports(target);
    const photoCount = reports.reduce((sum, report) => (
      sum + (normalizePlainRecord(report.photo).dataUrl ? 1 : 0)
    ), 0);
    return {
      reportCount: reports.length,
      photoCount,
    };
  }
  
  function getAuthSessionReportDraft(taskId = "") {
    const store = normalizePlainRecord(ui.authSessionReportDrafts);
    const draft = normalizePlainRecord(store[taskId]);
    const photo = normalizePlainRecord(draft.photo);
    return {
      text: String(draft.text || ""),
      photo: photo.name || photo.dataUrl ? {
        id: String(photo.id || "").trim(),
        name: String(photo.name || "").trim(),
        type: String(photo.type || "").trim(),
        size: Math.max(0, Number(photo.size || 0) || 0),
        source: String(photo.source || "file").trim(),
        dataUrl: String(photo.dataUrl || ""),
        storageNote: String(photo.storageNote || "").trim(),
      } : null,
    };
  }
  
  function setAuthSessionReportDraft(taskId = "", patch = {}) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return null;
    const store = normalizePlainRecord(ui.authSessionReportDrafts);
    const previous = normalizePlainRecord(store[normalizedTaskId]);
    const next = {
      ...previous,
      ...patch,
    };
    ui.authSessionReportDrafts = {
      ...store,
      [normalizedTaskId]: next,
    };
    return next;
  }
  
  function clearAuthSessionReportDraft(taskId = "") {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return;
    const store = normalizePlainRecord(ui.authSessionReportDrafts);
    delete store[normalizedTaskId];
    ui.authSessionReportDrafts = store;
  }
  
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(reader.error || new Error("File read failed")));
      reader.readAsDataURL(file);
    });
  }
  
  function resizeAuthSessionIssueImage(dataUrl = "", options = {}) {
    const maxSide = Number(options.maxSide || 720) || 720;
    const quality = Number(options.quality || 0.58) || 0.58;
    return new Promise((resolve) => {
      if (!String(dataUrl || "").startsWith("data:image/")) {
        resolve("");
        return;
      }
      const image = new Image();
      image.addEventListener("load", () => {
        const naturalWidth = image.naturalWidth || image.width || maxSide;
        const naturalHeight = image.naturalHeight || image.height || maxSide;
        const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(dataUrl);
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      }, { once: true });
      image.addEventListener("error", () => resolve(dataUrl), { once: true });
      image.src = dataUrl;
    });
  }
  
  async function prepareAuthSessionReportPhoto(file, source = "file") {
    if (!file) return null;
    const rawDataUrl = await readFileAsDataUrl(file);
    const compressedDataUrl = await resizeAuthSessionIssueImage(rawDataUrl);
    const finalDataUrl = compressedDataUrl && compressedDataUrl.length <= 320000
      ? compressedDataUrl
      : "";
    return {
      id: makeId("photo"),
      name: String(file.name || (source === "camera" ? "camera-photo.jpg" : "image.jpg")),
      type: String(file.type || "image/jpeg"),
      size: Math.max(0, Number(file.size || 0) || 0),
      source,
      dataUrl: finalDataUrl,
      storageNote: finalDataUrl ? "" : "Фото слишком большое для локального хранения, сохранены только реквизиты файла.",
    };
  }
  
  function saveAuthSessionTaskReport(taskId = "", options = {}) {
    const model = getAuthSessionPrototypeModel();
    const task = model.allTasks.find((item) => item.id === taskId)
      || model.selectedTask
      || null;
    if (!task?.rowId) return false;
    const hasProvidedText = Object.prototype.hasOwnProperty.call(options, "text");
    const hasProvidedPhoto = Object.prototype.hasOwnProperty.call(options, "photo");
    if (hasProvidedText || hasProvidedPhoto) {
      setAuthSessionReportDraft(task.id, {
        ...(hasProvidedText ? { text: String(options.text || "") } : {}),
        ...(hasProvidedPhoto ? { photo: options.photo || null } : {}),
      });
    }
    const textField = app.querySelector("[data-auth-session-report-text]");
    const draft = getAuthSessionReportDraft(task.id);
    const text = String(hasProvidedText ? draft.text : textField?.value || draft.text || "").trim();
    const photo = draft.photo || null;
    if (!text && !photo) {
      notifySaveSuccess("Добавьте фото или описание проблемы.");
      return false;
    }
    const rowId = String(task.rowId || "").trim();
    const store = normalizeShiftWorkOrderIssueReports(ui.shiftWorkOrderIssueReports);
    const previousReports = Array.isArray(store[rowId]) ? store[rowId] : [];
    const report = {
      id: makeId("issue"),
      rowId,
      taskId: task.id,
      documentNumber: task.documentNumber || "",
      employeeId: task.employeeId || "",
      employeeName: task.employeeName || "",
      operationName: task.operationName || "",
      workCenterLabel: task.workCenterLabel || "",
      text,
      photo,
      status: "new",
      createdAt: new Date().toISOString(),
    };
    ui.shiftWorkOrderIssueReports = {
      ...store,
      [rowId]: [report, ...previousReports].slice(0, 8),
    };
    clearAuthSessionReportDraft(task.id);
    ui.authSessionModal = null;
    persistUiState();
    notifySaveSuccess("Report сохранен в Журнале СЗН.");
    if (options.renderOnChange !== false) render();
    return report;
  }
  
  function buildAuthSessionStoredAssignmentRow(rowId = "", assignment = {}) {
    const state = getPlanningState?.() || {};
    const sheetContract = assignment.sheetContract || {};
    const transferContract = assignment.transferContract || sheetContract.transferContract || {};
    const slotId = assignment.slotId || sheetContract.sourceSlotId || transferContract.sourceSlotId || rowId;
    const slot = (state.slots || []).find((item) => item.id === slotId) || null;
    const routeId = assignment.routeId || sheetContract.routeId || transferContract.routeId || slot?.routeId || "";
    const route = (state.routes || []).find((item) => item.id === routeId) || null;
    const stepId = assignment.stepId || sheetContract.stepId || transferContract.stepId || slot?.routeStepId || "";
    const step = (state.routeSteps || []).find((item) => item.id === stepId) || null;
    const workCenterId = assignment.workCenterId
      || sheetContract.workCenterId
      || transferContract.fromWorkCenterId
      || step?.planningWorkCenterId
      || step?.workCenterId
      || slot?.workCenterId
      || "";
    const workCenter = getWorkCenter(workCenterId) || null;
    const sourceRowId = assignment.sourceRowId || sheetContract.rowId || transferContract.sourceRowId || rowId;
    const operationName = sheetContract.operationName || transferContract.fromOperationName || step?.operationName || slot?.operationName || "Операция";
    const orderLabel = sheetContract.orderLabel
      || getPlanningOrderObjectLabel(route)
      || route?.specificationName
      || route?.name
      || assignment.planningOrderId
      || "Заказ-наряд";
    const routePartLabel = sheetContract.routePartLabel || step?.specTaskName || operationName || "Часть маршрутной карты";
    return {
      id: sourceRowId,
      slotId,
      slot,
      route,
      routeId,
      step,
      stepId,
      startsAt: slot?.plannedStart || assignment.updatedAt || sheetContract.updatedAt || "",
      endsAt: slot?.plannedEnd || assignment.updatedAt || sheetContract.updatedAt || "",
      documentNumber: sheetContract.documentNumber || assignment.documentNumber || "",
      routeName: route?.name || "Маршрутная карта",
      orderLabel,
      sourceSpecifications2EntryId: sheetContract.sourceSpecifications2EntryId || transferContract.sourceSpecifications2EntryId || slot?.sourceSpecifications2EntryId || "",
      specificationRevision: Number(sheetContract.specificationRevision || transferContract.specificationRevision || slot?.specificationRevision || 0),
      routeRevision: Number(sheetContract.routeRevision || transferContract.routeRevision || slot?.routeRevision || 0),
      workOrderSnapshotId: sheetContract.workOrderSnapshotId || transferContract.workOrderSnapshotId || slot?.workOrderSnapshotId || "",
      taskLabel: routePartLabel,
      operationName,
      workCenterId,
      workCenter,
      workCenterLabel: sheetContract.workCenterLabel || transferContract.fromWorkCenterLabel || workCenter?.name || "Участок не задан",
      resourceId: sheetContract.resourceId || assignment.resourceId || slot?.resourceId || "",
      resourceLabel: sheetContract.resourceLabel || "",
      plannedQuantity: normalizeShiftMasterBoardQuantity(assignment.plannedQuantity || sheetContract.plannedQuantity || transferContract.plannedQuantity || slot?.quantity || 0),
      unit: assignment.unit || sheetContract.unit || transferContract.unit || "шт.",
      masterMinutesPerUnit: normalizePlanningLaborPositiveNumber(assignment.laborMinutesPerUnit || 0),
      boardAssignment: {
        ...assignment,
        executors: normalizeShiftMasterExecutors(assignment.executors || []),
      },
    };
  }
  
  function getAuthSessionTaskRows(boardModel = getShiftMasterBoardModel()) {
    const rowsById = new Map();
    const addRow = (row) => {
      if (!row?.id) return;
      rowsById.set(row.id, row);
    };
    (boardModel.allRows || boardModel.rows || []).forEach(addRow);
    Object.entries(normalizePlainRecord(ui.shiftMasterBoardAssignments)).forEach(([rowId, assignment]) => {
      if (!assignment || !Array.isArray(assignment.executors) || !assignment.executors.length) return;
      const existing = rowsById.get(rowId) || rowsById.get(assignment.sourceRowId || "");
      if (existing) {
        rowsById.set(existing.id, {
          ...existing,
          boardAssignment: {
            ...getShiftMasterBoardAssignment(existing),
            ...assignment,
            executors: normalizeShiftMasterExecutors(assignment.executors || []),
          },
        });
        return;
      }
      addRow(buildAuthSessionStoredAssignmentRow(rowId, assignment));
    });
    return [...rowsById.values()];
  }
  
  function getAuthSessionAllTasks(boardModel = getShiftMasterBoardModel()) {
    const rows = getAuthSessionTaskRows(boardModel);
    return rows.flatMap((row) => {
      const assignment = row.boardAssignment || getShiftMasterBoardAssignment(row);
      const executors = Array.isArray(assignment.executors) ? assignment.executors : [];
      return executors
        .filter((executor) => executor.employeeId && normalizeShiftMasterBoardQuantity(executor.quantity || 0) > 0)
        .map((executor) => {
          const employee = getShiftMasterEmployee(executor.employeeId)
            || getProductionStructureEmployees(getProductionStructureMatrixRuntimeOverrides()).find((person) => person.id === executor.employeeId)
            || null;
          const taskId = getAuthSessionTaskId(row.id, executor.employeeId);
          const draft = getAuthSessionFactDraft(taskId);
          const assignedQuantity = normalizeShiftMasterBoardQuantity(executor.quantity || 0);
          const defectQuantity = Math.min(assignedQuantity, draft.defectQuantity);
          const actualQuantity = draft.updatedAt ? draft.actualQuantity : normalizeShiftMasterBoardQuantity(draft.actualQuantity || 0);
          const goodQuantity = Math.max(0, actualQuantity - defectQuantity);
          const minutesPerUnit = getShiftMasterBoardLaborMinutesPerUnit(row);
          const status = draft.updatedAt
            ? "факт записан"
              : draft.status === "in_progress"
                ? "в работе"
              : assignment.issued
                ? "СЗН готов"
                : "назначено";
          return {
            id: taskId,
            rowId: row.id,
            row,
            employeeId: executor.employeeId,
            employeeName: employee?.name || "Исполнитель",
            employee,
            operationName: row.operationName || "Операция",
            workCenterLabel: row.workCenterLabel || employee?.department || "Участок не задан",
            orderLabel: getShiftMasterRowOrderLabel(row),
            routePartLabel: getShiftMasterRowRoutePartLabel(row),
            documentNumber: row.documentNumber || assignment.sheetContract?.documentNumber || "",
            plannedQuantity: normalizeShiftMasterBoardQuantity(row.plannedQuantity || assignedQuantity || 0),
            assignedQuantity,
            actualQuantity,
            defectQuantity,
            goodQuantity,
            deviationComment: draft.deviationComment || "",
            unit: row.unit || assignment.unit || "шт.",
            minutesPerUnit,
            laborLabel: minutesPerUnit > 0 ? `${formatReportNumber(minutesPerUnit)} мин/ед.` : "трудозатраты не заданы",
            status,
            isStarted: draft.status === "in_progress",
            isDone: Boolean(draft.updatedAt),
            chain: getShiftMasterBoardRouteChain(row, boardModel),
          };
        });
    }).sort((left, right) => (
      String(left.employeeName).localeCompare(String(right.employeeName), "ru")
      || String(left.operationName).localeCompare(String(right.operationName), "ru")
      || String(left.id).localeCompare(String(right.id), "ru")
    ));
  }
  
  function getAuthSessionTaskPeople(tasks = []) {
    const byId = new Map();
    tasks.forEach((task) => {
      if (!task.employeeId || byId.has(task.employeeId)) return;
      byId.set(task.employeeId, task.employee || {
        id: task.employeeId,
        name: task.employeeName,
        role: "",
        department: task.workCenterLabel,
      });
    });
    return [...byId.values()].sort((left, right) => (
      String(left.department || "").localeCompare(String(right.department || ""), "ru")
      || String(left.name || "").localeCompare(String(right.name || ""), "ru")
    ));
  }
  
  function getAuthSessionPrototypeModel() {
    const people = getAuthPrototypePeople();
    const authenticatedPerson = getAuthenticatedAccessPerson();
    const selectedAuthPerson = getAuthPrototypeSelectedPerson(people);
    const selectedPerson = authenticatedPerson
      || selectedAuthPerson
      || people.managers.find((person) => inferAccessRoleIdForPerson(person) === getActiveInterfaceRole().id)
      || people.executors[0]
      || people.employees[0]
      || null;
    const personRole = selectedPerson?.id ? getAccessRoleForEmployee(selectedPerson).role : getActiveInterfaceRole();
    const activeRole = authenticatedPerson?.id ? personRole : getActiveInterfaceRole();
    const canViewAll = getAuthSessionCanViewAll(activeRole);
    const boardModel = getShiftMasterBoardModel();
    const allTasks = getAuthSessionAllTasks(boardModel);
    const taskPeople = getAuthSessionTaskPeople(allTasks);
    const fallbackPerson = selectedPerson || taskPeople[0] || people.executors[0] || people.employees[0] || null;
    let viewedPersonId = canViewAll ? String(ui.authSessionViewedPersonId || "__all") : fallbackPerson?.id || "";
    if (canViewAll && viewedPersonId !== "__all" && !taskPeople.some((person) => person.id === viewedPersonId)) {
      viewedPersonId = taskPeople[0]?.id || "__all";
    }
    if (!canViewAll && fallbackPerson?.id) viewedPersonId = fallbackPerson.id;
    const viewedPerson = viewedPersonId === "__all"
      ? null
      : taskPeople.find((person) => person.id === viewedPersonId)
        || people.employees.find((person) => person.id === viewedPersonId)
        || fallbackPerson
        || null;
    if (ui.authSessionViewedPersonId !== viewedPersonId) ui.authSessionViewedPersonId = viewedPersonId;
    const visibleTasks = canViewAll && viewedPersonId === "__all"
      ? allTasks
      : allTasks.filter((task) => task.employeeId === viewedPersonId);
    const selectedTask = visibleTasks.find((task) => task.id === ui.authSessionSelectedTaskId)
      || visibleTasks[0]
      || null;
    if (selectedTask && ui.authSessionSelectedTaskId !== selectedTask.id) ui.authSessionSelectedTaskId = selectedTask.id;
    const modules = getModuleDefinitions()
      .filter((moduleItem) => moduleItem.id !== "authPrototype")
      .filter((moduleItem) => Boolean(activeRole.modulePermissions?.[moduleItem.id]?.view));
    const canEditSelectedTask = Boolean(selectedTask && (!authenticatedPerson?.id || selectedTask.employeeId === authenticatedPerson.id));
    const activeTasks = visibleTasks.filter((task) => !task.isDone);
    const doneTasks = visibleTasks.filter((task) => task.isDone);
    const assignedQuantity = visibleTasks.reduce((sum, task) => sum + normalizeShiftMasterBoardQuantity(task.assignedQuantity || 0), 0);
    const goodQuantity = visibleTasks.reduce((sum, task) => sum + normalizeShiftMasterBoardQuantity(task.goodQuantity || 0), 0);
    return {
      people,
      person: viewedPerson || selectedPerson,
      authPerson: authenticatedPerson,
      role: activeRole,
      modules,
      boardModel,
      allTasks,
      taskPeople,
      tasks: visibleTasks,
      selectedTask,
      canViewAll,
      canEditSelectedTask,
      viewedPersonId,
      activeTasks,
      doneTasks,
      assignedQuantity,
      goodQuantity,
      isLoggedIn: isAuthGateUnlocked() || isAuthGateQaBypassEnabled() || Boolean(selectedPerson?.id),
    };
  }
  
  function renderAuthSessionKpiSummary(model) {
    return `
      <div class="auth-session-kpis" data-visual-qa-target="auth-session-kpis" aria-label="Сводка рабочего стола">
        ${renderAuthSessionKpi("Задания", model.tasks.length.toLocaleString("ru-RU"), `${model.activeTasks.length.toLocaleString("ru-RU")} открыто`, "auth-session-kpi-tasks")}
        ${renderAuthSessionKpi("Распределено", `${formatReportNumber(model.assignedQuantity)} шт.`, "по видимым заданиям", "auth-session-kpi-assigned")}
        ${renderAuthSessionKpi("Факт", `${formatReportNumber(model.goodQuantity)} шт.`, `${model.doneTasks.length.toLocaleString("ru-RU")} закрыто`, "auth-session-kpi-fact")}
      </div>
    `;
  }
  
  function renderAuthSessionViewerSelect(model) {
    return `
      <label class="auth-session-viewer-select" data-visual-qa-target="auth-session-viewer-select">
        <span>Рабочий стол</span>
        <select data-auth-session-view-person data-visual-qa-target="auth-session-viewer-control">
          <option value="__all" ${model.viewedPersonId === "__all" ? "selected" : ""}>Все сотрудники</option>
          ${model.taskPeople.map((person) => `
            <option value="${escapeAttribute(person.id)}" ${model.viewedPersonId === person.id ? "selected" : ""}>${escapeHtml(formatAuthPersonName(person.name))}</option>
          `).join("")}
        </select>
      </label>
    `;
  }
  
  function renderAuthSessionKpi(label, value, meta = "", qaTarget = "auth-session-kpi") {
    return `
      <article data-visual-qa-target="${escapeAttribute(qaTarget)}">
        <span data-visual-qa-target="${escapeAttribute(`${qaTarget}-label`)}">${escapeHtml(label)}</span>
        <strong data-visual-qa-target="${escapeAttribute(`${qaTarget}-value`)}">${escapeHtml(String(value || "—"))}</strong>
        <small data-visual-qa-target="${escapeAttribute(`${qaTarget}-meta`)}">${escapeHtml(meta || "—")}</small>
      </article>
    `;
  }
  
  function renderAuthSessionDetail(model) {
    const task = model.selectedTask;
    return renderUiPanel({
      title: "Рабочая карточка",
      meta: task ? task.documentNumber || task.status : "назначений нет",
      className: "auth-session-panel auth-session-detail-panel",
      attributes: "data-visual-qa-target=\"auth-session-detail-panel\"",
      body: renderUiPanelBody({
        body: task ? `
          ${renderAuthSessionTaskContext(task)}
          ${renderAuthSessionTaskActions(model)}
          ${renderAuthSessionFactPanel(model)}
        ` : renderUiEmptyState({
          iconName: "document",
          title: "Нет назначенных заданий",
          text: "Рабочий стол заполнится после распределения сменных задач в Мастерской.",
        }),
      }),
    });
  }
  
  function renderAuthSessionTaskContext(task) {
    return `
      <section class="auth-session-task-context" data-visual-qa-target="auth-session-task-context" aria-label="Контекст задания">
        <section class="auth-session-inline-summary" data-visual-qa-target="auth-session-inline-summary">
          ${renderAuthSessionSummaryCell("Изделие", task.orderLabel, { qaTarget: "auth-session-summary-product" })}
          ${renderAuthSessionSummaryCell("Операция", task.operationName, { className: "is-operation", qaTarget: "auth-session-summary-operation" })}
          ${renderAuthSessionSummaryCell("Маршрут", task.routePartLabel, { qaTarget: "auth-session-summary-route" })}
        </section>
      </section>
    `;
  }
  
  function renderAuthSessionSummaryCell(label, value, options = {}) {
    const qaTarget = options.qaTarget || "auth-session-summary-cell";
    return `
      <article
        class="auth-session-summary-cell ${options.className ? escapeAttribute(options.className) : ""}"
        data-visual-qa-target="${escapeAttribute(qaTarget)}"
        aria-label="${escapeAttribute(`${label}: ${value || "нет значения"}`)}"
      >
        <span data-visual-qa-target="${escapeAttribute(`${qaTarget}-label`)}">${escapeHtml(label)}</span>
        <strong data-visual-qa-target="${escapeAttribute(`${qaTarget}-value`)}" title="${escapeAttribute(value || "")}">${escapeHtml(value || "—")}</strong>
        ${options.valueMeta ? `<small data-visual-qa-target="${escapeAttribute(`${qaTarget}-meta`)}">${escapeHtml(options.valueMeta)}</small>` : ""}
      </article>
    `;
  }
  
  function renderAuthSessionRouteCard(label, row, fallback, isCurrent = false) {
    const title = row?.operationName || fallback || "—";
    const meta = row ? `${row.workCenterLabel || "участок не задан"} · ${getShiftMasterRowRoutePartLabel(row)}` : "вне текущего окна";
    const qaTarget = isCurrent ? "auth-session-route-chain-current" : label === "До" ? "auth-session-route-chain-before" : "auth-session-route-chain-after";
    return `
      <article class="${isCurrent ? "is-current" : ""}" data-visual-qa-target="${escapeAttribute(qaTarget)}">
        <span data-visual-qa-target="${escapeAttribute(`${qaTarget}-label`)}">${escapeHtml(label)}</span>
        <strong data-visual-qa-target="${escapeAttribute(`${qaTarget}-title`)}">${escapeHtml(title)}</strong>
        <small data-visual-qa-target="${escapeAttribute(`${qaTarget}-meta`)}">${escapeHtml(meta)}</small>
      </article>
    `;
  }
  
  function renderAuthSessionRouteChain(task) {
    const chain = task.chain || {};
    return `
      <section class="auth-session-route-chain" data-visual-qa-target="auth-session-route-chain" aria-label="Маршрут задания">
        <div>
          ${renderAuthSessionRouteCard("До", chain.previous, "предыдущая операция")}
          ${renderAuthSessionRouteCard("Сейчас", chain.current || task.row, "текущая операция", true)}
          ${renderAuthSessionRouteCard("После", chain.next, "следующая операция")}
        </div>
      </section>
    `;
  }
  
  function getAuthSessionCompactRouteText(task = {}) {
    const chain = task.chain || {};
    const trimPart = (value = "", limit = 38) => {
      const chars = Array.from(String(value || "").trim());
      return chars.length > limit ? `${chars.slice(0, limit - 3).join("")}...` : chars.join("");
    };
    const previous = trimPart(chain.previous?.operationName || "старт");
    const next = trimPart(chain.next?.operationName || "финиш");
    return {
      previous,
      next,
      title: `До: ${previous}; После: ${next}`,
    };
  }
  
  function renderAuthSessionTaskActions(model) {
    const task = model.selectedTask;
    const editDisabled = model.canEditSelectedTask ? "" : "disabled";
    return `
      <section class="auth-session-section auth-session-task-actions" data-visual-qa-target="auth-session-task-actions">
        <header data-visual-qa-target="auth-session-task-actions-header">
          <div data-visual-qa-target="auth-session-task-actions-copy">
            <strong data-visual-qa-target="auth-session-task-actions-title">Действия с заданием</strong>
            <span data-visual-qa-target="auth-session-task-actions-meta">${escapeHtml(model.canEditSelectedTask ? "планшетный сценарий исполнителя" : "режим просмотра без записи")}</span>
          </div>
        </header>
        <div data-visual-qa-target="auth-session-task-actions-buttons">
          ${renderUiActionButton({
            label: task.isStarted ? "В работе" : "Взять",
            iconName: "play",
            tone: "primary",
            attributes: `data-auth-session-start-task="${escapeAttribute(task.id)}" data-visual-qa-target="auth-session-task-action-start" type="button" ${editDisabled}`,
          })}
          ${renderUiActionButton({
            label: "Структура",
            iconName: "tree",
            attributes: `data-auth-session-modal="structure" data-auth-session-task-id="${escapeAttribute(task.id)}" data-visual-qa-target="auth-session-task-action-structure" type="button"`,
          })}
          ${renderUiActionButton({
            label: "Маршрут",
            iconName: "route",
            attributes: `data-auth-session-modal="route" data-auth-session-task-id="${escapeAttribute(task.id)}" data-visual-qa-target="auth-session-task-action-route" type="button"`,
          })}
          ${renderUiActionButton({
            label: "PDF",
            iconName: "document",
            attributes: `data-auth-session-modal="pdf" data-auth-session-task-id="${escapeAttribute(task.id)}" data-visual-qa-target="auth-session-task-action-pdf" type="button"`,
          })}
          ${renderUiActionButton({
            label: "Report",
            iconName: "alert",
            attributes: `data-auth-session-modal="issue" data-auth-session-task-id="${escapeAttribute(task.id)}" data-visual-qa-target="auth-session-task-action-report" type="button" ${editDisabled}`,
          })}
        </div>
      </section>
    `;
  }
  
  function renderAuthSessionFactPanel(model) {
    const task = model.selectedTask;
    const activeField = normalizeAuthSessionFactField(ui.authSessionActiveFactField);
    const editDisabled = model.canEditSelectedTask ? "" : "disabled";
    const siblingTasks = model.allTasks.filter((item) => item.rowId === task.rowId);
    const doneSiblings = siblingTasks.filter((item) => item.isDone).length;
    const draft = getAuthSessionFactDraft(task.id);
    const needsDeviationComment = doesAuthSessionFactNeedDeviationComment(task, draft);
    const deviationPercent = getAuthSessionFactDeviationPercent(task, draft);
    return `
      <section class="auth-session-section auth-session-fact-panel" data-visual-qa-target="auth-session-fact-panel">
        <header data-visual-qa-target="auth-session-fact-header">
          <div data-visual-qa-target="auth-session-fact-copy">
            <strong data-visual-qa-target="auth-session-fact-title">Завершение задания</strong>
            <span data-visual-qa-target="auth-session-fact-meta">ввод факта и брака без экранной клавиатуры</span>
          </div>
          <span data-visual-qa-target="auth-session-fact-status">${renderUiStatusToken(`${doneSiblings}/${siblingTasks.length} фактов`, doneSiblings >= siblingTasks.length && siblingTasks.length ? "ok" : "neutral")}</span>
        </header>
        <div class="auth-session-fact-grid" data-visual-qa-target="auth-session-fact-grid">
          <div class="auth-session-fact-values" data-visual-qa-target="auth-session-fact-values">
            ${renderAuthSessionFactValueButton("actual", "Выполнено", `${formatReportNumber(task.actualQuantity)} ${task.unit}`, activeField === "actual", editDisabled)}
            ${renderAuthSessionFactValueButton("defect", "Брак", `${formatReportNumber(task.defectQuantity)} ${task.unit}`, activeField === "defect", editDisabled)}
            <article class="auth-session-fact-hint" data-visual-qa-target="auth-session-fact-assigned">
              <span data-visual-qa-target="auth-session-fact-assigned-label">Назначено</span>
              <strong data-visual-qa-target="auth-session-fact-assigned-value">${escapeHtml(`${formatReportNumber(task.assignedQuantity)} ${task.unit}`)}</strong>
              <small data-visual-qa-target="auth-session-fact-assigned-meta">${escapeHtml(task.laborLabel)}</small>
            </article>
          </div>
          ${renderAuthSessionKeypad(editDisabled)}
        </div>
        ${needsDeviationComment || task.deviationComment ? `
          <label class="auth-session-deviation-comment" data-visual-qa-target="auth-session-deviation-comment">
            <span data-visual-qa-target="auth-session-deviation-comment-label">Причина отклонения</span>
            <textarea
              data-auth-session-deviation-comment="${escapeAttribute(task.id)}"
              data-visual-qa-target="auth-session-deviation-comment-field"
              rows="3"
              maxlength="500"
              placeholder="Почему факт ниже плана больше чем на 5%"
              ${editDisabled}
            >${escapeHtml(task.deviationComment || "")}</textarea>
            <small data-visual-qa-target="auth-session-deviation-comment-meta">Отклонение ${escapeHtml(formatWeeklyProductionControlPercent(deviationPercent))} · заметка попадет в контроль недели</small>
          </label>
        ` : ""}
        ${renderUiPanelFooter({ body: `
          ${renderUiActionButton({
            label: "Записать факт",
            iconName: "check",
            tone: "primary",
            attributes: `data-auth-session-save-fact="${escapeAttribute(task.id)}" data-visual-qa-target="auth-session-save-fact" type="button" ${editDisabled}`,
          })}
          <span class="auth-session-fact-note" data-visual-qa-target="auth-session-fact-note">Операция закроется после фактов всех назначенных исполнителей.</span>
        ` })}
      </section>
    `;
  }
  
  function renderAuthSessionFactValueButton(field, label, value, active = false, disabledAttr = "") {
    const qaTarget = `auth-session-fact-${field}`;
    return `
      <button
        class="auth-session-fact-value ${active ? "is-active" : ""}"
        data-auth-session-field="${escapeAttribute(field)}"
        data-visual-qa-target="${escapeAttribute(qaTarget)}"
        type="button"
        ${disabledAttr}
      >
        <span data-visual-qa-target="${escapeAttribute(`${qaTarget}-label`)}">${escapeHtml(label)}</span>
        <strong data-visual-qa-target="${escapeAttribute(`${qaTarget}-value`)}">${escapeHtml(value)}</strong>
      </button>
    `;
  }
  
  function renderAuthSessionKeypad(disabledAttr = "") {
    const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    return `
      <div class="auth-session-keypad" data-visual-qa-target="auth-session-keypad" aria-label="Цифровой ввод количества">
        ${digits.map((digit) => `<button data-auth-session-digit="${digit}" data-visual-qa-target="auth-session-keypad-digit-${digit}" type="button" ${disabledAttr}>${digit}</button>`).join("")}
        <span aria-hidden="true"></span>
        <button data-auth-session-digit="0" data-visual-qa-target="auth-session-keypad-digit-0" type="button" ${disabledAttr}>0</button>
        <button class="auth-session-keypad-delete" data-auth-session-backspace data-visual-qa-target="auth-session-keypad-backspace" type="button" ${disabledAttr}>${icon("backspaceApple")}</button>
      </div>
    `;
  }
  
  function renderAuthSessionTaskBoard(model) {
    const showTaskPerson = Boolean(model.canViewAll && model.viewedPersonId === "__all");
    return renderUiPanel({
      title: "Назначенные задания",
      meta: model.canViewAll && model.viewedPersonId === "__all" ? "все рабочие столы" : formatAuthPersonName(model.person?.name, "исполнитель"),
      className: "auth-session-panel auth-session-workspace-panel",
      attributes: "data-visual-qa-target=\"auth-session-workspace-panel\"",
      body: renderUiPanelBody({
        body: `
          <div class="auth-session-board-controls" data-visual-qa-target="auth-session-board-controls">
            ${renderAuthSessionKpiSummary(model)}
            ${model.canViewAll ? renderAuthSessionViewerSelect(model) : ""}
          </div>
          ${model.tasks.length ? `
          <div class="auth-session-task-board" data-visual-qa-target="auth-session-task-board">
            ${model.tasks.map((task) => {
              const routeText = getAuthSessionCompactRouteText(task);
              return `
              <button
                class="auth-session-task-card ${task.id === model.selectedTask?.id ? "is-current" : ""}"
                data-auth-session-task="${escapeAttribute(task.id)}"
                data-visual-qa-target="auth-session-task-card"
                type="button"
              >
                <div class="auth-session-task-card-main" data-visual-qa-target="auth-session-task-card-main">
                  <strong data-visual-qa-target="auth-session-task-card-operation">${escapeHtml(task.operationName)}</strong>
                  ${showTaskPerson ? `<small data-visual-qa-target="auth-session-task-card-person">${escapeHtml(`${formatAuthPersonName(task.employeeName)} · ${task.workCenterLabel}`)}</small>` : ""}
                  <span class="auth-session-task-card-route" data-visual-qa-target="auth-session-task-card-route" title="${escapeAttribute(routeText.title)}">
                    <span data-visual-qa-target="auth-session-task-card-route-before"><b>До</b><em>${escapeHtml(routeText.previous)}</em></span>
                    <span data-visual-qa-target="auth-session-task-card-route-after"><b>После</b><em>${escapeHtml(routeText.next)}</em></span>
                  </span>
                </div>
                <em data-visual-qa-target="auth-session-task-card-quantity">${escapeHtml(`${formatReportNumber(task.assignedQuantity)} ${task.unit}`)}</em>
                <span data-visual-qa-target="auth-session-task-card-status">${renderUiStatusToken(task.status, task.isDone ? "ok" : task.isStarted ? "primary" : "neutral")}</span>
              </button>
            `;
            }).join("")}
          </div>
        ` : renderUiEmptyState({
          iconName: "document",
          title: "Заданий нет",
          text: "После распределения в Мастерской здесь появятся сменные задания исполнителей.",
        })}
        `,
      }),
    });
  }
  
  function renderAuthSessionModal() {
    if (!ui?.authSessionModal) return "";
    const modal = normalizePlainRecord(ui.authSessionModal);
    const model = getAuthSessionPrototypeModel();
    const task = model.allTasks.find((item) => item.id === modal.taskId)
      || model.selectedTask
      || null;
    if (!task) return "";
    const modalType = String(modal.type || "structure");
    const title = modalType === "pdf"
      ? "PDF-инструкция"
      : modalType === "route"
        ? "Маршрут задания"
        : modalType === "issue"
          ? "Report"
          : "Структура изделия";
    const body = modalType === "pdf"
      ? renderAuthSessionPdfModalBody(task)
      : modalType === "route"
        ? renderAuthSessionRouteModalBody(task)
        : modalType === "issue"
          ? renderAuthSessionIssueModalBody(task)
          : renderAuthSessionStructureModalBody(task);
    const actions = modalType === "issue"
      ? `
        ${renderUiActionButton({ label: "Закрыть", iconName: "close", attributes: "data-close-modal type=\"button\"" })}
        ${renderUiActionButton({
          label: "Сохранить report",
          iconName: "check",
          tone: "primary",
          attributes: `data-auth-session-save-report="${escapeAttribute(task.id)}" data-visual-qa-target="auth-session-report-save" type="button"`,
        })}
      `
      : renderUiActionButton({ label: "Закрыть", iconName: "close", attributes: "data-close-modal type=\"button\"" });
    return `
      <div class="modal-backdrop auth-session-modal-backdrop" data-modal-backdrop>
        ${renderUiModalFrame({
          title,
          meta: task.operationName,
          className: "auth-session-modal",
          attributes: "data-visual-qa-target=\"auth-session-modal\"",
          body,
          actions,
        })}
      </div>
    `;
  }
  
  function renderAuthSessionStructureModalBody(task) {
    const rows = [
      ["Заказ-наряд", task.orderLabel],
      ["Маршрут", task.routePartLabel],
      ["Операция", task.operationName],
      ["Участок", task.workCenterLabel],
      ["Результат операции", task.chain?.next ? `передать в ${task.chain.next.operationName}` : "закрыть маршрут"],
    ];
    return `
      <div class="auth-session-modal-structure" data-visual-qa-target="auth-session-structure-preview">
        <section data-visual-qa-target="auth-session-structure-rows">
          ${rows.map(([label, value], index) => {
            const qaTarget = `auth-session-structure-row-${index + 1}`;
            return `
            <article data-visual-qa-target="auth-session-structure-row-${index + 1}">
              <span data-visual-qa-target="${escapeAttribute(`${qaTarget}-label`)}">${escapeHtml(label)}</span>
              <strong data-visual-qa-target="${escapeAttribute(`${qaTarget}-value`)}">${escapeHtml(value || "—")}</strong>
            </article>
          `;
          }).join("")}
        </section>
        <p data-visual-qa-target="auth-session-structure-note">Здесь сотрудник видит понятную структуру изделия и свою часть маршрута без перехода в технологические модули.</p>
      </div>
    `;
  }
  
  function renderAuthSessionRouteModalBody(task) {
    return `
      <div class="auth-session-modal-route" data-visual-qa-target="auth-session-route-preview">
        ${renderAuthSessionRouteChain(task)}
      </div>
    `;
  }
  
  function renderAuthSessionPdfModalBody(task) {
    const fileName = `Инструкция_${task.operationName || "операция"}.pdf`;
    return `
      <div class="auth-session-pdf-preview" data-visual-qa-target="auth-session-pdf-preview">
        <div class="auth-session-pdf-toolbar" data-visual-qa-target="auth-session-pdf-toolbar">
          <span data-visual-qa-target="auth-session-pdf-icon">${icon("document")}</span>
          <span data-visual-qa-target="auth-session-pdf-copy">
            <strong data-visual-qa-target="auth-session-pdf-file-name">${escapeHtml(fileName)}</strong>
            <small data-visual-qa-target="auth-session-pdf-meta">предпросмотр инструкции, прикрепленной в предшествующем технологическом модуле</small>
          </span>
        </div>
        <div class="auth-session-pdf-page" data-visual-qa-target="auth-session-pdf-page" aria-label="Предпросмотр PDF">
          <strong data-visual-qa-target="auth-session-pdf-operation">${escapeHtml(task.operationName)}</strong>
          <span data-visual-qa-target="auth-session-pdf-order">${escapeHtml(task.orderLabel)}</span>
          <p data-visual-qa-target="auth-session-pdf-step-1">1. Проверить соответствие изделия сменному листу.</p>
          <p data-visual-qa-target="auth-session-pdf-step-2">2. Выполнить операцию по технологической инструкции.</p>
          <p data-visual-qa-target="auth-session-pdf-step-3">3. Зафиксировать выпуск и брак на рабочем столе.</p>
        </div>
      </div>
    `;
  }
  
  function renderAuthSessionIssueModalBody(task) {
    const draft = getAuthSessionReportDraft(task.id);
    const photo = draft.photo || null;
    const sourceLabel = photo?.source === "camera" ? "камера" : "файл";
    return `
      <div class="auth-session-issue-modal" data-visual-qa-target="auth-session-report-modal-body">
        <section class="auth-session-issue-context" data-visual-qa-target="auth-session-report-context">
          <article data-visual-qa-target="auth-session-report-context-document">
            <span>СЗН</span>
            <strong>${escapeHtml(task.documentNumber || "без номера")}</strong>
          </article>
          <article data-visual-qa-target="auth-session-report-context-operation">
            <span>Операция</span>
            <strong>${escapeHtml(task.operationName || "операция")}</strong>
          </article>
          <article data-visual-qa-target="auth-session-report-context-person">
            <span>Исполнитель</span>
            <strong>${escapeHtml(formatAuthPersonName(task.employeeName, "исполнитель"))}</strong>
          </article>
        </section>
        <section class="auth-session-issue-pickers" data-visual-qa-target="auth-session-report-pickers">
          ${renderUiActionButton({
            label: "Фото с планшета",
            iconName: "camera",
            tone: "primary",
            attributes: `data-auth-session-report-trigger="camera" data-auth-session-report-task-id="${escapeAttribute(task.id)}" data-visual-qa-target="auth-session-report-camera-trigger" type="button"`,
          })}
          ${renderUiActionButton({
            label: "Прикрепить фото",
            iconName: "upload",
            attributes: `data-auth-session-report-trigger="file" data-auth-session-report-task-id="${escapeAttribute(task.id)}" data-visual-qa-target="auth-session-report-file-trigger" type="button"`,
          })}
          <input class="auth-session-issue-file-input" data-auth-session-report-camera data-auth-session-report-task-id="${escapeAttribute(task.id)}" type="file" accept="image/*" capture="environment" aria-hidden="true" tabindex="-1">
          <input class="auth-session-issue-file-input" data-auth-session-report-file data-auth-session-report-task-id="${escapeAttribute(task.id)}" type="file" accept="image/*" aria-hidden="true" tabindex="-1">
        </section>
        <section class="auth-session-issue-preview ${photo ? "has-photo" : ""}" data-visual-qa-target="auth-session-report-photo-preview">
          ${photo?.dataUrl ? `<img src="${escapeAttribute(photo.dataUrl)}" alt="${escapeAttribute(photo.name || "Фото проблемы")}" data-visual-qa-target="auth-session-report-photo-image">` : `<div data-visual-qa-target="auth-session-report-photo-empty">${icon("camera")}<span>Фото пока не прикреплено</span></div>`}
          ${photo ? `
            <article data-visual-qa-target="auth-session-report-photo-meta">
              <strong>${escapeHtml(photo.name || "photo.jpg")}</strong>
              <small>${escapeHtml(`${sourceLabel}${photo.size ? ` · ${Math.round(photo.size / 1024).toLocaleString("ru-RU")} КБ` : ""}`)}</small>
              ${photo.storageNote ? `<small>${escapeHtml(photo.storageNote)}</small>` : ""}
            </article>
          ` : ""}
        </section>
        <label class="auth-session-issue-text" data-visual-qa-target="auth-session-report-text-field">
          <span>Описание проблемы</span>
          <textarea data-auth-session-report-text data-auth-session-report-task-id="${escapeAttribute(task.id)}" rows="5" placeholder="Что произошло, где видно проблему, что мешает выполнить операцию">${escapeHtml(draft.text || "")}</textarea>
        </label>
      </div>
    `;
  }
  
  function renderAuthPrototypePage() {
    const people = getAuthPrototypePeople();
    const selectedDepartment = getAuthPrototypeSelectedDepartment(people);
    const selectedUnit = getAuthPrototypeSelectedUnit(people, selectedDepartment);
    const selectedPerson = getAuthPrototypeSelectedPerson(people);
    const departmentUnits = selectedDepartment ? getAuthPrototypeUnitRows(people, selectedDepartment) : [];
    const currentStep = selectedPerson
      ? "pin"
      : selectedUnit || (selectedDepartment && !departmentUnits.length)
        ? "person"
        : selectedDepartment
          ? "unit"
          : "department";
    return renderUiModulePage({
      ariaLabel: "Прототип авторизации",
      className: "auth-prototype-page",
      contractMode: "none",
      workspaceClassName: "auth-prototype-workspace",
      contentClassName: "auth-prototype-content",
      content: `
        ${renderUiModuleHeader({
          eyebrow: "Вход в систему",
          title: "Авторизация",
          className: "directory-header auth-prototype-header",
          attributes: "data-visual-qa-target=\"auth-prototype-header\" aria-label=\"Шапка авторизации\"",
        })}
        ${currentStep === "department" ? renderAuthPrototypeDepartmentStep(people) : ""}
        ${currentStep === "unit" ? renderAuthPrototypeUnitStep(people, selectedDepartment) : ""}
        ${currentStep === "person" ? renderAuthPrototypePersonStep(people, selectedDepartment, selectedUnit) : ""}
        ${currentStep === "pin" ? renderAuthPrototypeUnifiedPinStep(people, selectedDepartment, selectedUnit, selectedPerson) : ""}
      `,
    });
  }

  function getAuthPrototypeReactModel() {
    const people = getAuthPrototypePeople();
    const adaptPerson = (person = {}) => ({
      id: String(person.id || ""),
      name: formatAuthPersonName(person.name),
      role: String(person.role || "Роль не задана"),
      department: String(person.department || ""),
      personKind: String(person.personKind || "employee"),
      canDistribute: Boolean(person.canDistribute),
      canExecute: person.canExecute !== false,
    });
    return {
      departments: getAuthPrototypeDepartmentRows(people).map((department) => {
        const units = getAuthPrototypeUnitRows(people, department);
        return {
          id: String(department.id || ""),
          name: String(department.name || "Отдел"),
          caption: String(department.caption || ""),
          employeeCount: Number(department.employees || 0),
          directPeople: getAuthPrototypeDirectDepartmentPeople(people, department).map(adaptPerson),
          units: units.map((unit) => ({
            id: String(unit.id || ""),
            name: String(unit.name || "Участок"),
            caption: String(unit.caption || ""),
            employeeCount: Number(unit.employees || 0),
            people: getAuthPrototypePeopleByUnit(people, department, unit).map(adaptPerson),
          })),
        };
      }),
    };
  }
  
  function renderAuthSessionPrototypePage() {
    const model = getAuthSessionPrototypeModel();
    return renderUiModulePage({
      ariaLabel: "Рабочий стол",
      className: "auth-session-page",
      workspaceClassName: "auth-session-workspace",
      contentClassName: "auth-session-content",
      visualContract: "base-glass-reference-v1",
      header: renderUiModuleHeader({
          eyebrow: "Оперативное управление",
          title: "Рабочий стол",
        description: "Назначенные сменные задания, маршрут, инструкции и ввод факта с сенсорного планшета.",
        className: "directory-header auth-session-header",
        attributes: "data-visual-qa-target=\"auth-session-header\"",
      }),
      content: `
        <div class="auth-session-main-grid">
          ${renderAuthSessionDetail(model)}
          ${renderAuthSessionTaskBoard(model)}
        </div>
      `,
    });
  }

  return {
    doesAuthSessionFactNeedDeviationComment,
    getAuthPrototypeSelectedExecutor,
    getAuthPrototypeReactModel,
    getAuthSessionFactDeviationPercent,
    getAuthSessionFactDraft,
    getAuthSessionPrototypeModel,
    getAuthSessionTaskRowId,
    getAuthSessionTaskGoodQuantity,
    getShiftWorkOrderIssueLookupKeys,
    getShiftWorkOrderIssueReports,
    getShiftWorkOrderIssueSummary,
    getShiftWorkOrderReportPhotoItems,
    normalizeShiftWorkOrderIssueReports,
    normalizeAuthSessionFactField,
    renderAuthPrototypePage,
    renderAuthSessionModal,
    renderAuthSessionPrototypePage,
    prepareAuthSessionReportPhoto,
    saveAuthSessionTaskReport,
    setAuthSessionFactDraft,
    setAuthSessionReportDraft,
  };
}
