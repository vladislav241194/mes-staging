const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const quantity = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 9_999_999 ? parsed : null;
};

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
    reader.addEventListener("error", () => reject(reader.error || new Error("Image read failed")), { once: true });
    reader.readAsDataURL(file);
  });
}

function resizeImage(dataUrl, { maxSide = 720, quality = 0.58 } = {}) {
  return new Promise((resolve) => {
    if (!String(dataUrl || "").startsWith("data:image/")) return resolve("");
    const image = new Image();
    image.addEventListener("load", () => {
      const naturalWidth = image.naturalWidth || image.width || maxSide;
      const naturalHeight = image.naturalHeight || image.height || maxSide;
      const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return resolve(dataUrl);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    }, { once: true });
    image.addEventListener("error", () => resolve(dataUrl), { once: true });
    image.src = dataUrl;
  });
}

export function createEmployeeDesktopCommandOwner({
  getFactDrafts = () => ({}),
  setFactDrafts = () => {},
  persist = () => {},
  makeId = (prefix) => `${prefix}-${Date.now()}`,
} = {}) {
  const readDraft = (taskId) => ({
    actualQuantity: 0,
    defectQuantity: 0,
    deviationComment: "",
    status: "",
    startedAt: "",
    updatedAt: "",
    ...asRecord(asRecord(getFactDrafts())[taskId]),
  });

  const writeDraft = (taskId, patch) => {
    const store = asRecord(getFactDrafts());
    const next = { ...store, [taskId]: { ...asRecord(store[taskId]), ...patch } };
    setFactDrafts(next);
    persist();
    return next[taskId];
  };

  return Object.freeze({
    startTask(task) {
      if (!task?.id || task.isDone || task.isStarted || readDraft(task.id).updatedAt) return { ok: false };
      const draft = writeDraft(task.id, { status: "in_progress", startedAt: new Date().toISOString() });
      return { ok: true, draft };
    },

    async saveFact({ task, siblingTasks = [], fact = {}, saveOperationFact } = {}) {
      if (!task?.id || !task?.rowId || task.isDone || !task.isStarted || typeof saveOperationFact !== "function") return { ok: false };
      const actualQuantity = quantity(fact.actualQuantity);
      const defectQuantity = quantity(fact.defectQuantity);
      if (actualQuantity === null || defectQuantity === null || defectQuantity > actualQuantity) return { ok: false };
      const deviationComment = String(fact.deviationComment || "").trim().slice(0, 500);
      if (Number(task.assignedQuantity || 0) > 0 && actualQuantity - defectQuantity < Number(task.assignedQuantity || 0) * 0.95 && !deviationComment) return { ok: false };

      const previousStore = asRecord(getFactDrafts());
      const now = new Date().toISOString();
      const nextStore = {
        ...previousStore,
        [task.id]: {
          ...asRecord(previousStore[task.id]),
          actualQuantity,
          defectQuantity,
          deviationComment,
          status: "done",
          updatedAt: now,
        },
      };
      const rowTasks = (Array.isArray(siblingTasks) ? siblingTasks : []).filter((item) => item?.rowId === task.rowId);
      const allTasks = rowTasks.length ? rowTasks : [task];
      const allClosed = allTasks.every((item) => Boolean(asRecord(nextStore[item.id]).updatedAt));
      if (!allClosed) {
        setFactDrafts(nextStore);
        persist();
        return { ok: true, operationClosed: false };
      }

      const aggregate = allTasks.reduce((result, item) => {
        const draft = asRecord(nextStore[item.id]);
        const actual = quantity(draft.actualQuantity) || 0;
        const defect = Math.min(actual, quantity(draft.defectQuantity) || 0);
        const note = String(draft.deviationComment || "").trim();
        result.actualQuantity += actual;
        result.defectQuantity += defect;
        result.laborMinutes += Math.round(actual * Math.max(0, Number(item.minutesPerUnit || 0)));
        if (note) result.notes.push(`${String(item.employeeName || "Исполнитель")}: ${note}`);
        return result;
      }, { actualQuantity: 0, defectQuantity: 0, laborMinutes: 0, notes: [] });
      let saved = null;
      try {
        saved = await saveOperationFact({
          rowId: task.rowId,
          actualQuantity: aggregate.actualQuantity,
          defectQuantity: aggregate.defectQuantity,
          laborMinutes: aggregate.laborMinutes,
          executorCount: allTasks.length,
          comment: aggregate.notes.join("; ") || `Факт внесен с рабочих столов исполнителей: ${allTasks.length}`,
          deviationComment: aggregate.notes.join("; "),
        });
      } catch (error) {
        saved = { ok: false, message: error instanceof Error ? error.message : "PostgreSQL не подтвердил факт операции." };
      }
      if (saved?.ok !== true) {
        setFactDrafts({
          ...nextStore,
          [task.id]: {
            ...asRecord(nextStore[task.id]),
            status: "in_progress",
            updatedAt: "",
          },
        });
        persist();
        return { ok: false, message: saved?.message || "PostgreSQL не подтвердил факт операции." };
      }
      setFactDrafts(nextStore);
      persist();
      return { ok: true, operationClosed: true };
    },

    async prepareReportPhoto(file, source = "file") {
      if (!(file instanceof File)) return null;
      const rawDataUrl = await readFileAsDataUrl(file);
      const compressedDataUrl = await resizeImage(rawDataUrl);
      const dataUrl = compressedDataUrl.length <= 320_000 ? compressedDataUrl : "";
      return {
        id: makeId("photo"),
        name: String(file.name || (source === "camera" ? "camera-photo.jpg" : "image.jpg")),
        type: String(file.type || "image/jpeg"),
        size: Math.max(0, Number(file.size || 0) || 0),
        source: source === "camera" ? "camera" : "file",
        dataUrl,
        storageNote: dataUrl ? "" : "Фото слишком большое, сохранены только реквизиты файла.",
      };
    },
  });
}
