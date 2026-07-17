export function createAuthEventsModule(dependencies = {}) {
  const {
    app,
    AUTH_PIN_TEMPORARILY_DISABLED,
    bindGenericModalCloseEvents,
    button,
    cancelAuthPrototypePinFeedback = () => {},
    completeAuthPrototypeLogin = () => {},
    doesAuthSessionFactNeedDeviationComment = () => false,
    employeeId,
    formatShiftWorkOrderPersonName = (value = "") => String(value || ""),
    getAuthPrototypeAttemptsLeft = () => 0,
    getAuthPrototypePinDraft = () => "",
    getAuthPrototypePeople = () => ({ managers: [], executors: [], employees: [] }),
    getAuthPrototypePinPerson = () => null,
    getAuthSessionFactDeviationPercent = () => 0,
    getAuthSessionFactDraft = () => ({ actualQuantity: 0, defectQuantity: 0 }),
    getAuthSessionPrototypeModel = () => ({ allTasks: [], selectedTask: null }),
    getAuthSessionTaskGoodQuantity = () => 0,
    item,
    isAuthPrototypePinFeedbackLocked = () => false,
    lockAuthGate,
    normalizeAuthSessionFactField = (field = "") => (field === "defect" ? "defect" : "actual"),
    normalizePlainRecord,
    normalizePlanningLaborPositiveNumber,
    normalizeShiftMasterBoardQuantity = (value = 0) => {
      const quantity = Math.round(Number(value));
      return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
    },
    notifySaveSuccess,
    persistUiState,
    render,
    resetAuthPrototypeAttempts = () => {},
    resetAuthPrototypePinEntry = () => {},
    saveAuthSessionTaskReport = () => {},
    saveShiftMasterBoardFact = () => {},
    scheduleAuthPrototypePinValidation = () => {},
    setAuthSessionFactDraft = () => {},
    setAuthSessionReportDraft = () => {},
    setAuthPrototypePinDraft = () => {},
    status,
    type,
    updateModuleUrlParam,
    value,
  } = dependencies;

  const ui = new Proxy({}, {
    get(_target, property) { return dependencies.getUi?.()?.[property]; },
    set(_target, property, value) { const state = dependencies.getUi?.(); if (state) state[property] = value; return true; },
  });

function bindAuthPrototypeEvents() {
  app.querySelectorAll("[data-auth-department]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelAuthPrototypePinFeedback();
      ui.authPrototypeDepartment = button.dataset.authDepartment || "";
      ui.authPrototypeUnit = "";
      ui.authPrototypePersonId = "";
      ui.authPrototypeResult = "";
      resetAuthPrototypePinEntry();
      resetAuthPrototypeAttempts();
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-auth-back-departments]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelAuthPrototypePinFeedback();
      ui.authPrototypeDepartment = "";
      ui.authPrototypeUnit = "";
      ui.authPrototypePersonId = "";
      ui.authPrototypeResult = "";
      resetAuthPrototypePinEntry();
      resetAuthPrototypeAttempts();
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-auth-unit]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelAuthPrototypePinFeedback();
      ui.authPrototypeUnit = button.dataset.authUnit || "";
      ui.authPrototypePersonId = "";
      ui.authPrototypeResult = "";
      resetAuthPrototypePinEntry();
      resetAuthPrototypeAttempts();
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-auth-back-units]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelAuthPrototypePinFeedback();
      ui.authPrototypeUnit = "";
      ui.authPrototypePersonId = "";
      ui.authPrototypeResult = "";
      resetAuthPrototypePinEntry();
      resetAuthPrototypeAttempts();
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-auth-back-people]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelAuthPrototypePinFeedback();
      ui.authPrototypePersonId = "";
      ui.authPrototypeResult = "";
      resetAuthPrototypePinEntry();
      resetAuthPrototypeAttempts();
      persistUiState();
      render();
    });
  });

  app.querySelector("[data-auth-search]")?.addEventListener("change", (event) => {
    cancelAuthPrototypePinFeedback();
    ui.authPrototypeSearch = event.currentTarget.value || "";
    ui.authPrototypeResult = "";
    persistUiState();
    render();
  });

  app.querySelector("[data-auth-search]")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    cancelAuthPrototypePinFeedback();
    ui.authPrototypeSearch = event.currentTarget.value || "";
    ui.authPrototypeResult = "";
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-auth-search-token]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelAuthPrototypePinFeedback();
      ui.authPrototypeSearch = button.dataset.authSearchToken || "";
      ui.authPrototypeResult = "";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-auth-person]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelAuthPrototypePinFeedback();
      ui.authPrototypePersonId = button.dataset.authPerson || "";
      ui.authPrototypeResult = "";
      resetAuthPrototypePinEntry();
      resetAuthPrototypeAttempts();
      if (AUTH_PIN_TEMPORARILY_DISABLED && ui.authPrototypePersonId) {
        completeAuthPrototypeLogin("pin-ok", { personId: ui.authPrototypePersonId });
        return;
      }
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-auth-pin-digit]").forEach((button) => {
    button.addEventListener("click", () => {
      if (getAuthPrototypeAttemptsLeft() <= 0) return;
      if (isAuthPrototypePinFeedbackLocked()) return;
      if (String(ui.authPrototypeResult || "").startsWith("pin-error")) {
        setAuthPrototypePinDraft("");
        ui.authPrototypeResult = "";
      }
      const pinDraft = String(getAuthPrototypePinDraft() || "");
      if (pinDraft.length >= 5) return;
      const nextPinDraft = `${pinDraft}${button.dataset.authPinDigit || ""}`.slice(0, 5);
      setAuthPrototypePinDraft(nextPinDraft);
      const people = getAuthPrototypePeople();
      const selectedPerson = getAuthPrototypePinPerson(people);
      if (nextPinDraft.length === 5) {
        scheduleAuthPrototypePinValidation(nextPinDraft, selectedPerson?.id || "");
        return;
      }
      ui.authPrototypeResult = "";
      render();
    });
  });

  app.querySelector("[data-auth-pin-backspace]")?.addEventListener("click", () => {
    if (getAuthPrototypeAttemptsLeft() <= 0) return;
    if (isAuthPrototypePinFeedbackLocked()) return;
      setAuthPrototypePinDraft(String(getAuthPrototypePinDraft() || "").slice(0, -1));
    ui.authPrototypeResult = "";
    render();
  });

  app.querySelectorAll("[data-auth-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelAuthPrototypePinFeedback();
      lockAuthGate();
      ui.activeModule = "authPrototype";
      updateModuleUrlParam(ui.activeModule);
      persistUiState();
      render();
    });
  });
}

function updateAuthSessionFactField(taskId = "", field = "actual", value = "") {
  const normalizedField = normalizeAuthSessionFactField(field);
  const key = normalizedField === "defect" ? "defectQuantity" : "actualQuantity";
  setAuthSessionFactDraft(taskId, {
    [key]: String(value || "").replace(/[^\d]/g, "").slice(0, 7),
    status: getAuthSessionFactDraft(taskId).updatedAt ? "done" : "in_progress",
  });
}

function appendAuthSessionFactDigit(taskId = "", digit = "") {
  if (!taskId || !/^\d$/.test(String(digit || ""))) return;
  const field = normalizeAuthSessionFactField(ui.authSessionActiveFactField);
  const draft = normalizePlainRecord(normalizePlainRecord(ui.authSessionFactDrafts)[taskId]);
  const key = field === "defect" ? "defectQuantity" : "actualQuantity";
  const current = String(draft[key] || "");
  const next = `${current}${digit}`.replace(/^0+(?=\d)/, "").slice(0, 7);
  updateAuthSessionFactField(taskId, field, next);
}

function backspaceAuthSessionFactValue(taskId = "") {
  if (!taskId) return;
  const field = normalizeAuthSessionFactField(ui.authSessionActiveFactField);
  const draft = normalizePlainRecord(normalizePlainRecord(ui.authSessionFactDrafts)[taskId]);
  const key = field === "defect" ? "defectQuantity" : "actualQuantity";
  updateAuthSessionFactField(taskId, field, String(draft[key] || "").slice(0, -1));
}

function startAuthSessionTask(taskId = "") {
  if (!taskId) return;
  setAuthSessionFactDraft(taskId, {
    status: "in_progress",
    startedAt: new Date().toISOString(),
  });
  persistUiState();
  notifySaveSuccess("Задание взято в работу.");
  render();
}

function saveAuthSessionTaskFact(taskId = "") {
  if (!taskId) return;
  const model = getAuthSessionPrototypeModel();
  const task = model.allTasks.find((item) => item.id === taskId) || model.selectedTask || null;
  if (!task) return;
  const current = getAuthSessionFactDraft(task.id);
  const deviationComment = String(current.deviationComment || "").trim();
  if (doesAuthSessionFactNeedDeviationComment(task, current) && !deviationComment) {
    notifySaveSuccess("Нужно указать причину отклонения: факт ниже плана больше чем на 5%.");
    return;
  }
  const now = new Date().toISOString();
  setAuthSessionFactDraft(task.id, {
    actualQuantity: current.actualQuantity,
    defectQuantity: current.defectQuantity,
    deviationComment,
    status: "done",
    updatedAt: now,
  });

  const nextStore = normalizePlainRecord(ui.authSessionFactDrafts);
  const rowTasks = model.allTasks.filter((item) => item.rowId === task.rowId);
  const rowTasksWithCurrent = rowTasks.length ? rowTasks : [task];
  const allFactsClosed = rowTasksWithCurrent.every((item) => normalizePlainRecord(nextStore[item.id]).updatedAt);
  if (allFactsClosed) {
    const actualQuantity = rowTasksWithCurrent.reduce((sum, item) => (
      sum + normalizeShiftMasterBoardQuantity(normalizePlainRecord(nextStore[item.id]).actualQuantity || 0)
    ), 0);
    const defectQuantity = rowTasksWithCurrent.reduce((sum, item) => (
      sum + normalizeShiftMasterBoardQuantity(normalizePlainRecord(nextStore[item.id]).defectQuantity || 0)
    ), 0);
    const laborMinutes = rowTasksWithCurrent.reduce((sum, item) => {
      const draft = normalizePlainRecord(nextStore[item.id]);
      return sum + normalizeShiftMasterBoardQuantity(draft.actualQuantity || 0) * normalizePlanningLaborPositiveNumber(item.minutesPerUnit || 0);
    }, 0);
    const deviationNotes = rowTasksWithCurrent
      .map((item) => {
        const draft = getAuthSessionFactDraft(item.id);
        const note = String(draft.deviationComment || "").trim();
        if (!note) return null;
        return {
          taskId: item.id,
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          assignedQuantity: normalizeShiftMasterBoardQuantity(item.assignedQuantity || 0),
          actualQuantity: normalizeShiftMasterBoardQuantity(draft.actualQuantity || 0),
          defectQuantity: normalizeShiftMasterBoardQuantity(draft.defectQuantity || 0),
          goodQuantity: getAuthSessionTaskGoodQuantity(item, draft),
          deviationPercent: getAuthSessionFactDeviationPercent(item, draft),
          text: note,
          createdAt: String(draft.updatedAt || now),
        };
      })
      .filter(Boolean);
    const deviationCommentText = deviationNotes.map((note) => (
      `${formatShiftWorkOrderPersonName(note.employeeName)}: ${note.text}`
    )).join("; ");
    saveShiftMasterBoardFact(task.rowId, {
      actualQuantity,
      defectQuantity,
      laborMinutes,
      executorCount: rowTasksWithCurrent.length,
      comment: deviationCommentText || `Факт внесен с рабочих столов исполнителей: ${rowTasksWithCurrent.length}`,
      deviationComment: deviationCommentText,
      deviationNotes,
      updatedAt: now,
    });
    notifySaveSuccess("Факт операции закрыт по всем исполнителям и отражен в Ганте.");
  } else {
    persistUiState();
    notifySaveSuccess("Факт сотрудника сохранен и отражен в Ганте. Операция закроется после фактов остальных исполнителей.");
  }
  render();
}

function bindAuthSessionEvents() {
  bindGenericModalCloseEvents();

  app.querySelector("[data-auth-session-view-person]")?.addEventListener("change", (event) => {
    ui.authSessionViewedPersonId = event.currentTarget.value || "__all";
    ui.authSessionSelectedTaskId = "";
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-auth-session-task]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.authSessionSelectedTaskId = button.dataset.authSessionTask || "";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-auth-session-modal]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      ui.authSessionModal = {
        type: button.dataset.authSessionModal || "structure",
        taskId: button.dataset.authSessionTaskId || ui.authSessionSelectedTaskId || "",
      };
      ui.authSessionSelectedTaskId = button.dataset.authSessionTaskId || ui.authSessionSelectedTaskId || "";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-auth-session-start-task]").forEach((button) => {
    button.addEventListener("click", () => {
      startAuthSessionTask(button.dataset.authSessionStartTask || ui.authSessionSelectedTaskId || "");
    });
  });

  app.querySelectorAll("[data-auth-session-field]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.authSessionActiveFactField = normalizeAuthSessionFactField(button.dataset.authSessionField || "");
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-auth-session-digit]").forEach((button) => {
    button.addEventListener("click", () => {
      appendAuthSessionFactDigit(ui.authSessionSelectedTaskId, button.dataset.authSessionDigit || "");
      persistUiState();
      render();
    });
  });

  app.querySelector("[data-auth-session-backspace]")?.addEventListener("click", () => {
    backspaceAuthSessionFactValue(ui.authSessionSelectedTaskId);
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-auth-session-save-fact]").forEach((button) => {
    button.addEventListener("click", () => {
      saveAuthSessionTaskFact(button.dataset.authSessionSaveFact || ui.authSessionSelectedTaskId || "");
    });
  });

  app.querySelector("[data-auth-session-deviation-comment]")?.addEventListener("input", (event) => {
    const taskId = event.currentTarget.dataset.authSessionDeviationComment || ui.authSessionSelectedTaskId || "";
    if (!taskId) return;
    setAuthSessionFactDraft(taskId, {
      deviationComment: String(event.currentTarget.value || "").slice(0, 500),
      status: getAuthSessionFactDraft(taskId).updatedAt ? "done" : "in_progress",
    });
    persistUiState();
  });

  app.querySelectorAll("[data-auth-session-report-trigger]").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = button.dataset.authSessionReportTaskId || ui.authSessionSelectedTaskId || "";
      const text = app.querySelector("[data-auth-session-report-text]")?.value || "";
      if (taskId) setAuthSessionReportDraft(taskId, { text });
      const source = button.dataset.authSessionReportTrigger === "camera" ? "camera" : "file";
      const input = app.querySelector(source === "camera" ? "[data-auth-session-report-camera]" : "[data-auth-session-report-file]");
      input?.click();
    });
  });

  app.querySelectorAll("[data-auth-session-report-camera], [data-auth-session-report-file]").forEach((input) => {
    input.addEventListener("change", async () => {
      const taskId = input.dataset.authSessionReportTaskId || ui.authSessionSelectedTaskId || "";
      const file = input.files?.[0] || null;
      const source = input.matches("[data-auth-session-report-camera]") ? "camera" : "file";
      const text = app.querySelector("[data-auth-session-report-text]")?.value || "";
      if (taskId) setAuthSessionReportDraft(taskId, { text });
      if (!taskId || !file) return;
      try {
        const photo = await prepareAuthSessionReportPhoto(file, source);
        setAuthSessionReportDraft(taskId, { photo, text });
        render();
      } catch {
        notifySaveSuccess("Не удалось прикрепить фото.");
      } finally {
        input.value = "";
      }
    });
  });

  app.querySelector("[data-auth-session-report-text]")?.addEventListener("input", (event) => {
    const taskId = event.currentTarget.dataset.authSessionReportTaskId || ui.authSessionSelectedTaskId || "";
    if (!taskId) return;
    setAuthSessionReportDraft(taskId, { text: event.currentTarget.value || "" });
  });

  app.querySelectorAll("[data-auth-session-save-report]").forEach((button) => {
    button.addEventListener("click", () => {
      saveAuthSessionTaskReport(button.dataset.authSessionSaveReport || ui.authSessionSelectedTaskId || "");
    });
  });
}


  return {
    bindAuthPrototypeEvents,
    updateAuthSessionFactField,
    appendAuthSessionFactDigit,
    backspaceAuthSessionFactValue,
    startAuthSessionTask,
    saveAuthSessionTaskFact,
    bindAuthSessionEvents,
  };
}
