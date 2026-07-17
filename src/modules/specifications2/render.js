import { buildTreeTableVisualRows } from "../../ui/tree_table_visual.js";
import {
  downloadSpecifications2RkdDraft,
  SPECIFICATIONS2_RKD_DRAFT_ENABLED,
} from "./rkd_docx_draft.js";
import {
  buildSpecifications2ReleaseFingerprint,
  inspectSpecifications2Publication,
} from "./publication.js";
import { createSpecifications2WorkOrderCommands } from "../domain_api/specifications2_work_order_commands.js";

const SPECIFICATIONS2_STORAGE_KEY = "mes-specifications-2-registry-v1";
const SPECIFICATIONS2_TAB_STORAGE_KEY = "mes-specifications-2-tab-v1";
const SPECIFICATIONS2_FILE_DB_NAME = "mes-specifications-2-files-v1";
const SPECIFICATIONS2_FILE_STORE_NAME = "route-files";
const SPECIFICATIONS2_SHARED_FILE_MAX_BYTES = 1024 * 1024;
const SPECIFICATIONS2_PRODUCTION_FILE_KINDS = ["pnp", "gerber", "instructionDoc", "instructionPdf"];
const SPECIFICATIONS2_ASSEMBLY_TYPES = new Set(["се", "сборочная единица"]);
const SPECIFICATIONS2_ROOT_LABEL = "нет";
function normalizeSpecifications2ChangesProperty(value) {
  return value !== false && value !== "unchanged";
}

function normalizeSpecifications2ProductionFile(value = {}) {
  if (!value || typeof value !== "object") return null;
  const storageKey = cleanText(value.storageKey);
  const name = cleanText(value.name);
  if (!storageKey || !name) return null;
  return {
    storageKey,
    name,
    size: Math.max(0, Number(value.size) || 0),
    type: cleanText(value.type),
    uploadedAt: cleanText(value.uploadedAt),
    serverAttachmentId: cleanText(value.serverAttachmentId),
    contentDigest: cleanText(value.contentDigest),
    inlineDataUrl: typeof value.inlineDataUrl === "string" && value.inlineDataUrl.startsWith("data:")
      ? value.inlineDataUrl
      : "",
  };
}

function readSpecifications2FileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Не удалось подготовить файл для общего хранения"));
    reader.readAsDataURL(file);
  });
}

async function readSpecifications2SharedProductionFile(metadata = {}) {
  try {
    const localFile = await readSpecifications2ProductionFile(metadata.storageKey);
    if (localFile) return localFile;
  } catch (_error) {
    // Another browser has no matching IndexedDB record; use the shared test copy below.
  }
  if (!metadata.inlineDataUrl) return null;
  const response = await fetch(metadata.inlineDataUrl);
  return response.blob();
}

function normalizeSpecifications2ProductionFiles(value = {}) {
  return {
    pnp: normalizeSpecifications2ProductionFile(value?.pnp),
    gerber: normalizeSpecifications2ProductionFile(value?.gerber),
    instructionDoc: normalizeSpecifications2ProductionFile(value?.instructionDoc),
    instructionPdf: normalizeSpecifications2ProductionFile(value?.instructionPdf),
  };
}

export function isSpecifications2ProductionFileAccepted(kind, fileName) {
  const extension = cleanText(fileName).toLowerCase().split(".").pop();
  return (kind === "pnp" && extension === "txt")
    || (kind === "gerber" && extension === "zip")
    || (kind === "instructionDoc" && ["doc", "docx"].includes(extension))
    || (kind === "instructionPdf" && extension === "pdf");
}

function getSpecifications2ProductionFileFormat(kind, fileName = "") {
  if (kind === "gerber" || String(fileName).toLowerCase().endsWith(".zip")) return "ZIP";
  if (kind === "instructionPdf" || String(fileName).toLowerCase().endsWith(".pdf")) return "PDF";
  if (kind === "instructionDoc" || /\.docx?$/i.test(String(fileName))) return "DOC";
  return "TXT";
}

export function getSpecifications2AoiProductionFiles(sourceDraft = {}) {
  return (Array.isArray(sourceDraft.operations) ? sourceDraft.operations : [])
    .filter((item) => item?.operationId === "D3_L1_OP" || item?.operationId === "D3_L2_OP" || /smt/i.test(item?.name || ""))
    .flatMap((item) => {
      const files = normalizeSpecifications2ProductionFiles(item.productionFiles);
      return [
        files.pnp ? { kind: "pnp", file: files.pnp, sourceOperationId: item.id } : null,
        files.gerber ? { kind: "gerber", file: files.gerber, sourceOperationId: item.id } : null,
      ].filter(Boolean);
    });
}

function openSpecifications2FileDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Файловое хранилище браузера недоступно"));
      return;
    }
    const request = indexedDB.open(SPECIFICATIONS2_FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SPECIFICATIONS2_FILE_STORE_NAME)) db.createObjectStore(SPECIFICATIONS2_FILE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Не удалось открыть файловое хранилище"));
  });
}

async function writeSpecifications2ProductionFile(storageKey, file) {
  const db = await openSpecifications2FileDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(SPECIFICATIONS2_FILE_STORE_NAME, "readwrite");
      transaction.objectStore(SPECIFICATIONS2_FILE_STORE_NAME).put(file, storageKey);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Не удалось сохранить файл"));
      transaction.onabort = () => reject(transaction.error || new Error("Сохранение файла отменено"));
    });
  } finally {
    db.close();
  }
}

async function readSpecifications2ProductionFile(storageKey) {
  const db = await openSpecifications2FileDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(SPECIFICATIONS2_FILE_STORE_NAME, "readonly")
        .objectStore(SPECIFICATIONS2_FILE_STORE_NAME).get(storageKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Не удалось прочитать файл"));
    });
  } finally {
    db.close();
  }
}

async function deleteSpecifications2ProductionFile(storageKey) {
  if (!storageKey) return;
  const db = await openSpecifications2FileDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(SPECIFICATIONS2_FILE_STORE_NAME, "readwrite");
      transaction.objectStore(SPECIFICATIONS2_FILE_STORE_NAME).delete(storageKey);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Не удалось удалить файл"));
    });
  } finally {
    db.close();
  }
}

function renderSpecifications2PropertyChangeFields(changesProperty, value = {}, escape = String) {
  if (!changesProperty) return "";
  return `
    <fieldset class="specifications2-route-state-row">
      <label class="specifications2-route-state-field"><span>Состояние «До» <i class="specifications2-required-mark">*</i></span><input name="inputState" required value="${escape(value.inputState || "")}" placeholder="Смонтированная"></label>
      <label class="specifications2-route-state-field"><span>Состояние «После» <i class="specifications2-required-mark">*</i></span><input name="outputState" required value="${escape(value.outputState || "")}" placeholder="Отмытая"></label>
    </fieldset>`;
}

function getSpecifications2ChangesPropertyFromForm(form) {
  return !form.has("propertyUnchanged");
}

function getSpecifications2DepartmentOperations(presetCatalog = {}, departmentId = "") {
  const departments = (Array.isArray(presetCatalog.departments) ? presetCatalog.departments : []).filter((item) => item?.id && item?.name);
  const operationCatalog = (Array.isArray(presetCatalog.operations) ? presetCatalog.operations : []).filter((item) => item?.id && item?.name);
  let department = departments.find((item) => item.id === departmentId);
  let operations = operationCatalog.filter((item) => item.workCenterId === departmentId);
  const visitedDepartmentIds = new Set([departmentId]);
  while (!operations.length && department?.parentWorkCenterId) {
    const parentDepartmentId = String(department.parentWorkCenterId);
    if (visitedDepartmentIds.has(parentDepartmentId)) break;
    visitedDepartmentIds.add(parentDepartmentId);
    department = departments.find((item) => item.id === parentDepartmentId);
    operations = operationCatalog.filter((item) => item.workCenterId === parentDepartmentId);
  }
  return operations;
}

function readSpecifications2PropertyChangeForm(form, forcedChangesProperty) {
  const changesProperty = typeof forcedChangesProperty === "boolean"
    ? forcedChangesProperty
    : getSpecifications2ChangesPropertyFromForm(form);
  const text = (key) => cleanText(form.get(key));
  return changesProperty
    ? { changesProperty: true, inputState: text("inputState"), outputState: text("outputState") }
    : { changesProperty: false, inputState: "", outputState: "" };
}

function getSpecifications2RouteOperationSummary(operation = {}) {
  if (operation.changesProperty === false) return "состояние изделия остаётся прежним";
  return `${operation.inputState || "Вход не указан"} → ${operation.outputState || "Результат не указан"}`;
}

export function createSpecifications2Module(dependencies = {}) {
  const {
    escapeAttribute,
    escapeHtml,
    icon = () => "",
    getRouteOperationPresets = () => ({ departments: [], operations: [] }),
    getPublishedRevision = () => ({ item: null, fetchedAt: 0, loading: null, error: "" }),
    hydratePublishedRevision = () => {},
    publishSpecifications2Entry = null,
    publishServerRevision = null,
    uploadServerAttachment = null,
    downloadServerAttachment = null,
    notifySaveSuccess = () => {},
    runLongTask = async (task) => task(),
    render = () => {},
    renderUiActionButton,
    renderUiEmptyState,
    renderUiModuleHeader,
    renderUiModulePage,
    renderUiModuleSidebar,
    renderUiPanel,
    renderUiPanelBody,
    renderUiSidebarItem,
    renderUiStatusToken,
    renderUiTableWrap,
  } = dependencies;
  const workOrderCommands = createSpecifications2WorkOrderCommands();
  const getWorkOrderCapability = () => workOrderCommands.getCapability();
  const hydrateWorkOrderCapability = () => {
    void workOrderCommands.refreshCapability().then((result) => {
      if (result.ok && result.changed) render({ skipRememberScroll: true });
    });
  };
  const createServerWorkOrder = (payload) => workOrderCommands.createWorkOrder(payload);
  let sharedFileMigrationStarted = false;
  let deprecatedNormalizationQuantityMigrationStarted = false;
  const editorUi = {
    confirmRemoveId: "",
    confirmOperationRemoveId: "",
    confirmRouteDraftDeleteId: "",
    confirmReset: false,
    draft: null,
    historyEntryId: "",
    historyRows: null,
    menuRowId: "",
    normalizationHistoryOperationId: "",
    normalizationRevisionOperationId: "",
    operationDraft: null,
  };
  let operationRemoveOutsideHandler = null;
  function clearOperationRemoveOutsideHandler() {
    if (!operationRemoveOutsideHandler) return;
    document.removeEventListener("click", operationRemoveOutsideHandler);
    operationRemoveOutsideHandler = null;
  }
  function armOperationRemoveOutsideCancel(operationId) {
    clearOperationRemoveOutsideHandler();
    queueMicrotask(() => {
      operationRemoveOutsideHandler = (event) => {
        const removeButton = event.target?.closest?.("[data-specifications2-route-operation-remove]");
        if (removeButton?.dataset.specifications2RouteOperationRemove === operationId) return;
        clearOperationRemoveOutsideHandler();
        if (editorUi.confirmOperationRemoveId !== operationId) return;
        editorUi.confirmOperationRemoveId = "";
        render({ skipRememberScroll: true });
      };
      document.addEventListener("click", operationRemoveOutsideHandler);
    });
  }
  let editorOutsideClickBound = false;

  function positionSpecifications2RowMenu() {
    const menu = document.querySelector(".specifications2-row-menu");
    const wrap = menu?.closest(".specifications2-table-wrap");
    if (!menu || !wrap) return;
    menu.classList.remove("opens-up");
    const menuRect = menu.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    if (menuRect.bottom > wrapRect.bottom - 6 && menuRect.top - menuRect.height > wrapRect.top + 6) {
      menu.classList.add("opens-up");
    }
  }

  function readStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SPECIFICATIONS2_STORAGE_KEY) || "{}");
      const normalized = normalizeStore(parsed);
      const hasDeprecatedQuantity = Array.isArray(parsed.registry)
        && parsed.registry.some((entry) => entry && Object.prototype.hasOwnProperty.call(entry, "normalizationQuantity"));
      if (hasDeprecatedQuantity && !deprecatedNormalizationQuantityMigrationStarted) {
        deprecatedNormalizationQuantityMigrationStarted = true;
        queueMicrotask(() => writeStore(normalized));
      }
      return normalized;
    } catch {
      return normalizeStore({});
    }
  }

  function writeStore(store) {
    localStorage.setItem(SPECIFICATIONS2_STORAGE_KEY, JSON.stringify(normalizeStore(store)));
    if (typeof window.__MES_SCHEDULE_SHARED_STATE_PUSH__ === "function") {
      window.__MES_SCHEDULE_SHARED_STATE_PUSH__("specifications2");
    } else {
      window.dispatchEvent(new CustomEvent("mes:shared-state-change", {
        detail: { reason: "specifications2" },
      }));
    }
  }

  function normalizeStore(store = {}) {
    const registry = Array.isArray(store.registry) ? store.registry.filter(Boolean).map(normalizeSpecifications2Entry) : [];
    const selectedId = String(store.selectedId || registry[0]?.id || "");
    return {
      selectedId: registry.some((item) => item.id === selectedId) ? selectedId : registry[0]?.id || "",
      registry,
    };
  }

  function normalizeSpecifications2Entry(entry = {}) {
    const routeDrafts = normalizeSpecifications2RouteDrafts(entry.routeDrafts);
    const requestedRouteDraftId = String(entry.selectedRouteDraftId || "");
    const normalized = {
      ...entry,
      routeDrafts,
      selectedRouteDraftId: routeDrafts.some((draft) => draft.id === requestedRouteDraftId)
        ? requestedRouteDraftId
        : routeDrafts[0]?.id || "",
      selectedComponentKey: String(entry.selectedComponentKey || ""),
      collapsedTreeKeys: Array.isArray(entry.collapsedTreeKeys) ? entry.collapsedTreeKeys.map(String) : [],
      publication: entry.publication && typeof entry.publication === "object" ? { ...entry.publication } : null,
    };
    delete normalized.normalizationQuantity;

    if (!Array.isArray(normalized.rows) || !normalized.rows.length) return normalized;

    try {
      const analysis = buildSpecifications2Analysis(
        normalized.rows,
        {
          name: normalized.diagnostics?.sheetName || normalized.workbookMeta?.sheets?.[0]?.name || "Лист",
          formulas: normalized.diagnostics?.formulas || [],
        },
        {
          rowIndex: normalized.diagnostics?.headerRow || "",
        },
      );
      const editorRows = Array.isArray(normalized.editorRows)
        ? normalizeSpecifications2EditorRows(normalized.editorRows)
        : [];
      const editorAnalysis = editorRows.length ? buildSpecifications2EditorAnalysis(editorRows) : {};
      return {
        ...normalized,
        ...analysis,
        ...editorAnalysis,
        editorRows,
        selectedComponentKey: normalized.selectedComponentKey,
      };
    } catch {
      return normalized;
    }
  }

  function getActiveTab() {
    const tab = localStorage.getItem(SPECIFICATIONS2_TAB_STORAGE_KEY);
    return getSpecifications2TabIds().includes(tab) ? tab : "tree";
  }

  function setActiveTab(tab) {
    localStorage.setItem(SPECIFICATIONS2_TAB_STORAGE_KEY, getSpecifications2TabIds().includes(tab) ? tab : "tree");
  }

  function getSelectedEntry(store = readStore()) {
    return store.registry.find((item) => item.id === store.selectedId) || store.registry[0] || null;
  }

  async function migrateLocalProductionFilesToSharedStore(store) {
    let changed = false;
    const registry = [];
    for (const entry of store.registry) {
      const routeDrafts = [];
      for (const draft of entry.routeDrafts || []) {
        const operations = [];
        for (const operation of draft.operations || []) {
          const productionFiles = normalizeSpecifications2ProductionFiles(operation.productionFiles);
          for (const kind of SPECIFICATIONS2_PRODUCTION_FILE_KINDS) {
            const metadata = productionFiles[kind];
            if (!metadata || metadata.inlineDataUrl || metadata.size > SPECIFICATIONS2_SHARED_FILE_MAX_BYTES) continue;
            try {
              const localFile = await readSpecifications2ProductionFile(metadata.storageKey);
              if (!localFile) continue;
              const inlineDataUrl = await readSpecifications2FileAsDataUrl(localFile);
              if (!inlineDataUrl) continue;
              productionFiles[kind] = { ...metadata, inlineDataUrl };
              changed = true;
            } catch (_error) {
              // A remote browser legitimately has metadata without the original IndexedDB file.
            }
          }
          operations.push({ ...operation, productionFiles });
        }
        routeDrafts.push({ ...draft, operations });
      }
      registry.push({ ...entry, routeDrafts });
    }
    if (!changed) return;
    writeStore({ ...store, registry });
    render({ skipRememberScroll: true });
  }

  function renderSpecifications2Page() {
    const store = readStore();
    if (!sharedFileMigrationStarted) {
      sharedFileMigrationStarted = true;
      void migrateLocalProductionFilesToSharedStore(store);
    }
    const selectedEntry = getSelectedEntry(store);
    const activeTab = getActiveTab();
    const sidebar = renderSpecifications2Sidebar(store);
    const header = renderUiModuleHeader({
      eyebrow: "Технологии",
      title: "Спецификации 2.0",
      description: "Подготовка структуры изделия, маршрутных карт, технологических файлов и ревизий плановых норм.",
      className: "directory-header specifications2-header",
      actions: "",
    });

    const content = selectedEntry
      ? `
        <div class="specifications2-view-shell">
          ${renderSpecifications2Tabs(activeTab, true, selectedEntry)}
          ${renderSpecifications2ActivePanel(selectedEntry, activeTab)}
        </div>
      `
      : `
        <div class="specifications2-view-shell">
          ${renderSpecifications2Tabs("tree", false)}
          ${renderSpecifications2EmptyTreePanel()}
        </div>
      `;

    return renderUiModulePage({
      ariaLabel: "Спецификации 2.0",
      className: "specifications2-page",
      workspaceClassName: "specifications2-workspace",
      contentClassName: "specifications2-content",
      sidebar,
      header,
      content,
      visualContract: "technology-specifications2",
    });
  }

  function renderSpecifications2Sidebar(store) {
    const registry = store.registry;
    const body = registry.length
      ? `
        <div class="ui-sidebar-list specifications2-registry-list">
          ${registry.map((entry) => {
            const errorCount = entry.errors?.length || 0;
            const publicationState = getSpecifications2PublicationState(entry);
            return renderUiSidebarItem({
              title: entry.title || entry.fileName || "Спецификация XLSX",
              meta: `${formatDateTime(entry.importedAt)} · ${entry.stats?.rows || 0} строк`,
              badge: errorCount ? `Ошибки: ${errorCount}` : publicationState.sidebarLabel,
              badgeTone: errorCount ? "warning" : publicationState.tone,
              badgeFit: "content",
              active: entry.id === store.selectedId,
              attributes: `type="button" data-specifications2-select="${escapeAttribute(entry.id)}"`,
            });
          }).join("")}
        </div>
      `
      : `<div class="specifications2-sidebar-note">Импортированные XLSX появятся здесь как отдельные версии предпросмотра.</div>`;
    return renderUiModuleSidebar({
      eyebrow: "Документы",
      title: "Реестр 2.0",
      variant: "registry",
      body,
      className: "specifications2-sidebar",
    });
  }

  function renderSpecifications2Tabs(activeTab, hasEntry = true, entry = null) {
    const instructionDebtCount = getSpecifications2InstructionDebtCount(entry?.routeDrafts || []);
    const tabs = [
      ["tree", "Дерево-таблица"],
      ["route-drafts", "Маршрутная карта 2.0"],
      ["normalization", "Нормирование"],
      ["diagram", "Блок-схема"],
      ["rkd", "Черновик РКД"],
    ];
    return `
      <div class="specifications2-tabs" data-ui-component="Toolbar">
        ${tabs.map(([tab, label]) => `
          <button class="specifications2-tab ${tab === activeTab ? "is-active" : ""}" type="button" data-specifications2-tab="${escapeAttribute(tab)}" ${!hasEntry && tab !== "tree" ? "disabled" : ""}>
            ${escapeHtml(label)}${tab === "route-drafts" && instructionDebtCount ? `<span class="specifications2-tab-debt">${instructionDebtCount}</span>` : ""}
          </button>
        `).join("")}
      </div>
    `;
  }

  function getSpecifications2TabIds() {
    return ["tree", "route-drafts", "normalization", "diagram", "rkd"];
  }

  function renderSpecifications2ActivePanel(entry, activeTab) {
    if (activeTab === "route-drafts") return renderSpecifications2RouteDraftsPanel(entry);
    if (activeTab === "normalization") return renderSpecifications2NormalizationPanel(entry);
    if (activeTab === "diagram") return renderSpecifications2DiagramPanel(entry);
    if (activeTab === "rkd") return renderSpecifications2RkdPanel(entry);
    return renderSpecifications2TreePanel(entry);
  }

  function renderSpecifications2RkdPanel(entry) {
    const rows = Array.isArray(entry.treeRows) ? entry.treeRows : [];
    const warningCount = rows.filter((row) => row.status && row.status !== "ok").length;
    const structuralCount = rows.filter((row) => rows.some((candidate) => candidate.parentKey === row.nodeKey)).length;
    return renderUiPanel({
      title: "Черновик РКД",
      meta: "пояснительная записка Word по правилам ЕСКД",
      className: "specifications2-panel specifications2-rkd-panel",
      body: renderUiPanelBody({
        body: `
          <div class="specifications2-rkd-workspace">
            <section class="specifications2-rkd-intro">
              <span class="specifications2-rkd-kicker">Экспериментальный генератор</span>
              <h3>${escapeHtml(entry.title || entry.fileName || "Спецификация")}</h3>
              <p>Генератор создаёт редактируемый каркас пояснительной записки: титульный лист, рамки и основные надписи, содержание, состав изделия, разделы описания конструкции и лист регистрации изменений.</p>
              <div class="specifications2-rkd-actions">
                ${SPECIFICATIONS2_RKD_DRAFT_ENABLED ? renderUiActionButton({
                  label: "Сформировать Word",
                  iconName: "download",
                  tone: "primary",
                  className: "specifications2-rkd-download-button",
                  attributes: `type="button" data-specifications2-rkd-draft="${escapeAttribute(entry.id)}"`,
                }) : ""}
                <small>Результат остаётся черновиком до проверки конструктора и нормоконтроля.</small>
              </div>
            </section>
            <aside class="specifications2-rkd-summary" aria-label="Состав черновика РКД">
              <strong>Что попадёт в документ</strong>
              <dl>
                <div><dt>Позиций структуры</dt><dd>${rows.length}</dd></div>
                <div><dt>Структурных разделов</dt><dd>${structuralCount}</dd></div>
                <div><dt>Требуют проверки</dt><dd>${warningCount}</dd></div>
                <div><dt>Формат</dt><dd>DOCX · A4</dd></div>
              </dl>
            </aside>
            <div class="specifications2-rkd-checklist">
              <strong>После генерации необходимо</strong>
              <ol>
                <li>Заполнить назначение, характеристики и обоснование конструкции.</li>
                <li>Добавить чертежи, схемы, расчёты и технические требования.</li>
                <li>Указать организацию, исполнение, литеру и ответственных лиц.</li>
                <li>Провести согласование, проверку и нормоконтроль.</li>
              </ol>
            </div>
          </div>
        `,
      }),
    });
  }

  function renderSpecifications2TreePanel(entry) {
    const rows = buildTreeTableVisualRows(entry.treeRows || [], {
      collapsedIds: entry.collapsedTreeKeys || [],
    });
    const selectedNodeKey = getSpecifications2SelectedNodeKey(entry);
    return renderUiPanel({
      title: "Предпросмотр дерева",
      meta: "выберите строку для редактирования · перетащите строку на будущего родителя",
      className: "specifications2-panel specifications2-tree-panel",
      body: renderUiPanelBody({
        body: `
          <div class="specifications2-tree-editor-shell">
            ${renderSpecifications2PublicationBar(entry)}
            ${renderSpecifications2EditorToolbar(entry)}
            ${renderUiTableWrap({
          className: "specifications2-table-wrap",
          body: `
            <table class="directory-table ui-table specifications2-table" role="treegrid" aria-label="Иерархия спецификации">
              <colgroup>
                <col class="specifications2-col-object">
                <col class="specifications2-col-type">
                <col class="specifications2-col-quantity">
                <col class="specifications2-col-measure">
                <col class="specifications2-col-chain">
                <col class="specifications2-col-actions">
              </colgroup>
              <thead>
                <tr class="ui-table-header">
                  <th>Объект</th>
                  <th>Тип</th>
                  <th>Кол-во</th>
                  <th>Ед.</th>
                  <th>Цепочка</th>
                  <th><span class="visually-hidden">Действия</span></th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row) => `${renderSpecifications2TreeRow(row, entry.selectedComponentKey || "", selectedNodeKey)}${renderSpecifications2EditorDraftRow(row)}`).join("")}
              </tbody>
            </table>
          `,
            })}
          </div>
        `,
      }),
    });
  }

  function getSpecifications2PublicationState(entry) {
    const publication = entry?.publication;
    if (!publication?.revision) return { id: "draft", label: "Черновик", sidebarLabel: "Черновик", tone: "neutral" };
    const changed = publication.fingerprint !== buildSpecifications2ReleaseFingerprint(entry);
    if (changed) return { id: "changed", label: `Есть изменения после ревизии ${publication.revision}`, sidebarLabel: `Изменена после рев. ${publication.revision}`, tone: "warning" };
    return { id: "released", label: `Опубликована ревизия ${publication.revision}`, sidebarLabel: `Ревизия ${publication.revision}`, tone: "ok" };
  }

  function renderSpecifications2PublicationBar(entry) {
    const state = getSpecifications2PublicationState(entry);
    const inspection = inspectSpecifications2Publication(entry);
    const publication = entry?.publication;
    const serverRevision = publication?.revision ? getPublishedRevision(entry.id) : null;
    if (publication?.revision) hydratePublishedRevision(entry);
    const serverItem = serverRevision?.item || null;
    const serverMatches = serverItem && Number(serverItem.revisionNo) === Number(publication?.revision);
    const workOrderCapability = getWorkOrderCapability();
    if (serverItem) hydrateWorkOrderCapability();
    const buttonLabel = state.id === "released"
      ? "Актуальная ревизия опубликована"
      : entry.publication?.revision ? "Опубликовать новую ревизию" : "Опубликовать в производство";
    const canPublish = inspection.ready && state.id !== "released";
    const issueText = inspection.ready
      ? "Структура, маршруты и нормы готовы к созданию производственной ревизии."
      : inspection.issues.slice(0, 2).join(" · ");
    const serverText = !publication?.revision
      ? "Серверная ревизия появится после публикации."
      : serverRevision?.loading
        ? "Проверяем опубликованную ревизию в серверной модели."
        : serverMatches
          ? `Серверная копия PostgreSQL: ревизия ${serverItem.revisionNo} · ${serverItem.treeItems?.length || 0} позиций · ${serverItem.routes?.length || 0} маршрутов · ${serverItem.routes?.reduce((total, route) => total + (route.operations?.length || 0), 0) || 0} операций.`
          : serverRevision?.error
            ? `Серверная копия временно недоступна: ${serverRevision.error}`
            : serverItem
              ? `Серверная копия PostgreSQL содержит ревизию ${serverItem.revisionNo}; ожидается ревизия ${publication.revision}.`
              : "Опубликованная ревизия ещё не перенесена в серверную модель.";
    const serverTone = serverMatches ? "ok" : serverRevision?.error || (serverItem && !serverMatches) ? "warning" : "neutral";
    const serverOrderControl = serverItem && workOrderCapability.enabled && typeof createServerWorkOrder === "function"
      ? `
        <form class="specifications2-server-work-order" data-specifications2-server-work-order data-command-form>
          <label><span>Маршрут</span><select name="routeSourceDraftId" required>${(serverItem.routes || []).map((route) => `<option value="${escapeAttribute(route.sourceDraftId || "")}">${escapeHtml(route.productLabel || route.designation || "Маршрут")}</option>`).join("")}</select></label>
          <label><span>Количество, шт.</span><input name="quantity" type="number" min="1" step="1" value="1" required></label>
          ${renderUiActionButton({ label: "Создать заказ-наряд", iconName: "plus", tone: "primary", className: "specifications2-server-work-order-button", attributes: "type=submit" })}
        </form>`
      : serverItem
        ? `<span class="specifications2-publication-server-state">${renderUiStatusToken("Создание заказ-наряда", "neutral")}Команда будет использовать серверную ревизию ${serverItem.revisionNo}; локальный черновик не изменится.</span>`
        : "";
    return `
      <section class="specifications2-publication-bar is-${escapeAttribute(state.id)}" aria-label="Публикация спецификации">
        <div class="specifications2-publication-copy">
          ${renderUiStatusToken(state.label, state.tone)}
          <span>${escapeHtml(issueText)}</span>
          <span class="specifications2-publication-server-state">${renderUiStatusToken(serverMatches ? "Серверная ревизия подтверждена" : "Серверная проекция", serverTone)}${escapeHtml(serverText)}</span>
          ${serverOrderControl}
        </div>
        ${typeof publishSpecifications2Entry === "function" && state.id !== "released" ? renderUiActionButton({
          label: buttonLabel,
          iconName: "upload",
          tone: "primary",
          className: "specifications2-publication-button",
          attributes: `type="button" data-specifications2-publish="${escapeAttribute(entry.id)}" ${canPublish ? "" : "disabled"}`,
        }) : ""}
      </section>
    `;
  }

  function renderSpecifications2EmptyTreePanel() {
    return renderUiPanel({
      title: "Предпросмотр дерева",
      meta: "загрузите XLSX нового формата",
      className: "specifications2-panel specifications2-tree-panel",
      body: renderUiPanelBody({
        body: `
          <div class="specifications2-empty-tree-import">
            ${renderSpecifications2UploadAction()}
            ${renderUiEmptyState({
              iconName: "tree",
              title: "Реестр Спецификации 2.0 пуст",
              text: "Загрузите файл XLSX. Модуль построит головную и вложенные спецификации по колонкам Спецификации (СЕ), Применяемость, Тип компонента, Наименование и обозначение, Ед. изм и Кол-во.",
            })}
          </div>
        `,
      }),
    });
  }

  function renderSpecifications2UploadAction() {
    return `
      <span class="specifications2-upload-action">
        <input class="specifications2-file-input" type="file" accept=".xlsx" data-specifications2-file>
        ${renderUiActionButton({
          label: "Загрузить XLSX",
          iconName: "upload",
          tone: "primary",
          attributes: "type=\"button\" data-specifications2-upload",
        })}
      </span>
    `;
  }

  function renderSpecifications2EditorToolbar(entry) {
    const hasEdits = Array.isArray(entry.editorRows) && entry.editorRows.length > 0;
    const canUndo = editorUi.historyEntryId === entry.id && Array.isArray(editorUi.historyRows);
    return `
      <div class="specifications2-editor-toolbar">
        <div>
          <strong>${hasEdits ? "Редактируемая версия" : "Структура из XLSX"}</strong>
          <span>${hasEdits ? `изменена ${escapeHtml(formatDateTime(entry.editedAt))}` : "правки создадут отдельный слой и не изменят исходный файл"}</span>
        </div>
        <div>
          ${renderSpecifications2UploadAction()}
          <button class="is-danger" type="button" data-specifications2-delete="${escapeAttribute(entry.id)}">Удалить импорт</button>
          <button type="button" data-specifications2-editor-undo ${canUndo ? "" : "disabled"}>Отменить последнее</button>
          <button class="${editorUi.confirmReset ? "is-confirm" : ""}" type="button" data-specifications2-editor-reset ${hasEdits ? "" : "disabled"}>${editorUi.confirmReset ? "Подтвердить сброс" : "Сбросить правки"}</button>
        </div>
      </div>
    `;
  }

  function renderSpecifications2TreeRow(row, selectedKey = "", selectedNodeKey = "") {
    const statusTone = row.status === "error" ? "critical" : row.status === "warning" ? "warning" : "ok";
    const statusLabel = row.status === "error" ? "ошибка" : row.status === "warning" ? "проверить" : "ок";
    const visual = row.treeVisualState || {
      id: row.selectionKey || row.nodeKey || "",
      parentId: null,
      depth: Number(row.level || 0),
      hasChildren: false,
      hasVisibleChildren: false,
      isExpanded: true,
      isFirstVisibleSibling: true,
      isLastVisibleSibling: true,
      visibleSiblingIndex: 0,
      visibleSiblingCount: 1,
      ancestorContinuationMask: [],
      isContextRow: false,
    };
    const isSelected = row.selectionKey === selectedKey || (selectedNodeKey && row.nodeKey === selectedNodeKey);
    const expandedAttribute = visual.hasChildren ? ` aria-expanded="${visual.isExpanded ? "true" : "false"}"` : "";
    return `
      <tr class="ui-table-row specifications2-tree-row is-level-${Number(visual.depth || 0)} ${visual.isContextRow ? "is-context" : ""} ${isSelected ? "is-selected" : ""} ${row.status ? `is-${escapeAttribute(row.status)}` : ""}" style="--specifications2-level: ${Number(visual.depth || 0)};" tabindex="0" draggable="true" data-specifications2-tree-row="${escapeAttribute(visual.id)}" data-specifications2-tree-parent="${escapeAttribute(visual.parentId || "")}" data-specifications2-component="${escapeAttribute(row.selectionKey || "")}" aria-selected="${isSelected ? "true" : "false"}" aria-level="${Number(visual.depth || 0) + 1}" aria-posinset="${Number(visual.visibleSiblingIndex || 0) + 1}" aria-setsize="${Number(visual.visibleSiblingCount || 1)}"${expandedAttribute}>
        <td>
          <div class="specifications2-tree-cell">
            ${renderSpecifications2TreeGutter(visual, row)}
            <div class="specifications2-tree-copy">
              <strong>${escapeHtml(getSpecifications2DisplayLabel(row.label, row.designation))}${Number(row.level || 0) === 0 ? `<span class="specifications2-root-label">Результирующее изделие</span>` : ""}</strong>
              ${row.designation ? `<small>${escapeHtml(row.designation)}</small>` : ""}
            </div>
          </div>
        </td>
        <td>${escapeHtml(row.type || "")}</td>
        <td>${escapeHtml(row.quantity ?? "")}</td>
        <td>${escapeHtml(row.unitOfMeasure || "")}</td>
        <td>${renderUiStatusToken(statusLabel, statusTone)}${row.message ? `<small class="specifications2-chain-note">${escapeHtml(row.message)}</small>` : ""}</td>
        <td class="specifications2-tree-actions-cell">
          <div class="specifications2-tree-actions">
            <button type="button" data-specifications2-add-child="${escapeAttribute(visual.id)}" title="Добавить вложенный элемент" aria-label="Добавить вложенный элемент"><span aria-hidden="true">+</span></button>
            <button type="button" data-specifications2-edit-row="${escapeAttribute(visual.id)}" title="Изменить элемент" aria-label="Изменить элемент"><span aria-hidden="true">✎</span></button>
            <button type="button" data-specifications2-row-menu="${escapeAttribute(visual.id)}" title="Структурные действия" aria-label="Структурные действия" aria-expanded="${editorUi.menuRowId === visual.id ? "true" : "false"}"><span aria-hidden="true">•••</span></button>
            ${editorUi.menuRowId === visual.id ? renderSpecifications2RowMenu(row) : ""}
          </div>
        </td>
      </tr>
    `;
  }

  function renderSpecifications2EditorDraftRow(row) {
    const draft = editorUi.draft;
    const visualId = row.treeVisualState?.id || row.selectionKey || row.nodeKey || "";
    if (!draft || draft.anchorId !== visualId) return "";
    const value = draft.value || {};
    return `
      <tr class="specifications2-editor-row" data-specifications2-editor-row>
        <td colspan="6">
          <form class="specifications2-inline-editor" data-specifications2-editor-form>
            <div class="specifications2-inline-editor-head">
              <strong>${escapeHtml(draft.mode === "edit" ? "Изменить элемент" : draft.mode === "sibling" ? "Добавить на этот уровень" : "Добавить вложенный элемент")}</strong>
              <span>${escapeHtml(draft.mode === "edit" ? "Изменения сохраняются в редактируемой версии импорта" : "Укажите основные данные новой позиции")}</span>
            </div>
            <label class="is-wide"><span>Наименование</span><input name="label" required maxlength="180" value="${escapeAttribute(value.label || "")}" placeholder="Наименование элемента"></label>
            <label><span>Обозначение</span><input name="designation" maxlength="80" value="${escapeAttribute(value.designation || "")}" placeholder="АБВГ.000000.000"></label>
            <label><span>Тип</span><input name="type" required maxlength="80" value="${escapeAttribute(value.type || "Компонент")}" placeholder="Компонент"></label>
            <label><span>Количество</span><input name="quantity" inputmode="decimal" value="${escapeAttribute(value.quantity ?? "1")}"></label>
            <label><span>Ед.</span><input name="unitOfMeasure" maxlength="20" value="${escapeAttribute(value.unitOfMeasure || "шт.")}"></label>
            <div class="specifications2-inline-editor-actions">
              <button type="button" data-specifications2-editor-cancel>Отмена</button>
              <button type="submit">Сохранить</button>
            </div>
          </form>
        </td>
      </tr>
    `;
  }

  function renderSpecifications2RowMenu(row) {
    const id = row.treeVisualState?.id || row.selectionKey || row.nodeKey || "";
    const isRoot = Number(row.treeVisualState?.depth || row.level || 0) === 0;
    return `
      <div class="specifications2-row-menu" role="menu">
        <button type="button" role="menuitem" data-specifications2-add-sibling="${escapeAttribute(id)}"><i aria-hidden="true">+</i><span>Добавить рядом</span></button>
        <button type="button" role="menuitem" data-specifications2-move="up" data-specifications2-row-id="${escapeAttribute(id)}"><i aria-hidden="true">↑</i><span>Выше в списке</span></button>
        <button type="button" role="menuitem" data-specifications2-move="down" data-specifications2-row-id="${escapeAttribute(id)}"><i aria-hidden="true">↓</i><span>Ниже в списке</span></button>
        <button type="button" role="menuitem" data-specifications2-move="indent" data-specifications2-row-id="${escapeAttribute(id)}" ${isRoot ? "disabled" : ""}><i aria-hidden="true">↳</i><span>Вложить в предыдущий</span></button>
        <button type="button" role="menuitem" data-specifications2-move="outdent" data-specifications2-row-id="${escapeAttribute(id)}" ${isRoot ? "disabled" : ""}><i aria-hidden="true">↰</i><span>Поднять на уровень</span></button>
        ${editorUi.confirmRemoveId === id
          ? `<button class="is-danger is-confirm" type="button" role="menuitem" data-specifications2-confirm-remove-row="${escapeAttribute(id)}" ${isRoot ? "disabled" : ""}><i aria-hidden="true">×</i><span>Подтвердить удаление</span></button>`
          : `<button class="is-danger" type="button" role="menuitem" data-specifications2-remove-row="${escapeAttribute(id)}" ${isRoot ? "disabled" : ""}><i aria-hidden="true">×</i><span>Удалить ветку</span></button>`}
      </div>
    `;
  }

  function renderSpecifications2TreeGutter(visual, row) {
    const ancestorLines = (visual.ancestorContinuationMask || []).map((continues, level) => (
      continues ? `<span class="specifications2-tree-line is-ancestor" style="--tree-line-level:${level};" aria-hidden="true"></span>` : ""
    )).join("");
    const incoming = visual.depth > 0
      ? `<span class="specifications2-tree-line is-incoming ${visual.isLastVisibleSibling ? "is-last" : ""}" aria-hidden="true"></span>`
      : "";
    const childStem = visual.hasVisibleChildren && visual.isExpanded
      ? `<span class="specifications2-tree-line is-child-stem" aria-hidden="true"></span>`
      : "";
    const anchor = visual.hasChildren
      ? `<button class="specifications2-tree-toggle" type="button" data-specifications2-tree-toggle="${escapeAttribute(visual.id)}" aria-label="${visual.isExpanded ? "Свернуть дочерние элементы" : "Развернуть дочерние элементы"}" aria-expanded="${visual.isExpanded ? "true" : "false"}"><span aria-hidden="true"></span></button>`
      : `<span class="specifications2-tree-leaf-slot" aria-hidden="true"><i></i></span>`;
    return `
      <div class="specifications2-tree-gutter" aria-hidden="${visual.hasChildren ? "false" : "true"}">
        <span class="specifications2-tree-lines" aria-hidden="true">${ancestorLines}${incoming}${childStem}</span>
        <span class="specifications2-tree-anchor" style="--tree-anchor-level:${Number(visual.depth || 0)};">${anchor}</span>
      </div>
    `;
  }

  function getSpecifications2SelectedNodeKey(entry) {
    const selectedKey = String(entry?.selectedComponentKey || "");
    if (!selectedKey) return "";
    const treeRow = (entry.treeRows || []).find((row) => row.selectionKey === selectedKey);
    if (treeRow?.nodeKey) return treeRow.nodeKey;
    for (const level of entry.diagramLevels || []) {
      const node = (level.nodes || []).find((item) => item.selectionKey === selectedKey);
      if (node?.nodeKey) return node.nodeKey;
    }
    return selectedKey.startsWith("node:") ? selectedKey.slice(5) : "";
  }

  function getSpecifications2NodeMap(entry) {
    const nodeByKey = new Map();
    (entry.graphNodes || []).forEach((node) => {
      if (node.nodeKey && !nodeByKey.has(node.nodeKey)) nodeByKey.set(node.nodeKey, node);
    });
    (entry.diagramLevels || []).forEach((level) => {
      (level.nodes || []).forEach((node) => {
        if (node.nodeKey && !nodeByKey.has(node.nodeKey)) nodeByKey.set(node.nodeKey, node);
      });
    });
    (entry.treeRows || []).forEach((row) => {
      if (!row.nodeKey) return;
      const existing = nodeByKey.get(row.nodeKey) || {};
      nodeByKey.set(row.nodeKey, {
        ...existing,
        selectionKey: existing.selectionKey || row.selectionKey,
        nodeKey: row.nodeKey,
        label: existing.label || row.label,
        type: existing.type || row.type,
        meta: existing.meta || row.designation || row.source,
        quantity: existing.quantity ?? row.quantity,
        unitOfMeasure: existing.unitOfMeasure || row.unitOfMeasure,
        source: existing.source || row.source,
        status: existing.status || row.status,
      });
    });
    return nodeByKey;
  }

  function renderSpecifications2RouteDraftsPanel(entry) {
    const items = getSpecifications2ManufacturedItems(entry.treeRows || []);
    const drafts = normalizeSpecifications2RouteDrafts(entry.routeDrafts);
    const selectedId = entry.selectedRouteDraftId && drafts.some((draft) => draft.id === entry.selectedRouteDraftId)
      ? entry.selectedRouteDraftId
      : drafts[0]?.id || "";
    const selectedDraft = drafts.find((draft) => draft.id === selectedId) || null;
    const instructionDebtCount = getSpecifications2InstructionDebtCount(drafts);
    return renderUiPanel({
      title: "Маршрутная карта 2.0",
      meta: `изолированные черновики для изделий с обозначением · техдолг по инструкциям: ${instructionDebtCount}`,
      className: "specifications2-panel specifications2-route-panel",
      body: renderUiPanelBody({
        body: items.length ? `
          <div class="specifications2-route-workspace">
            <aside class="specifications2-route-products">
              <header><div><strong>Изготавливаемые изделия</strong><span>${items.length} по признаку обозначения</span></div><button type="button" data-specifications2-route-generate-all>Сгенерировать для всех</button></header>
              <div>
                ${items.map((item) => {
                  const draft = drafts.find((candidate) => candidate.productKey === item.key);
                  const isActive = Boolean(draft && draft.id === selectedId);
                  const draftInstructionDebt = getSpecifications2InstructionDebtCount(draft || []);
                  return `
                    <article class="${isActive ? "is-active" : ""}">
                      <button type="button" class="specifications2-route-product-copy" ${draft ? `data-specifications2-route-select="${escapeAttribute(draft.id)}"` : ""}>
                        <strong>${escapeHtml(item.label)}</strong>
                        <span>${escapeHtml(item.designation)}</span>
                      </button>
                      ${draft
                        ? `<button type="button" class="specifications2-route-draft-status" data-specifications2-route-select="${escapeAttribute(draft.id)}">${escapeHtml(getSpecifications2RouteDraftStatusLabel(draft))}${draftInstructionDebt ? `<b>${draftInstructionDebt} инстр.</b>` : ""}</button>`
                        : `<button type="button" class="specifications2-route-create" data-specifications2-route-create="${escapeAttribute(item.key)}">Создать черновик</button>`}
                    </article>
                  `;
                }).join("")}
              </div>
            </aside>
            <section class="specifications2-route-editor">
              ${selectedDraft ? renderSpecifications2RouteDraftEditor(selectedDraft) : renderUiEmptyState({
                iconName: "route",
                title: "Выберите изделие",
                text: "Создайте отдельный черновик маршрутной карты. Затем добавьте операции в фактической производственной последовательности.",
              })}
            </section>
          </div>
        ` : renderUiEmptyState({
          iconName: "route",
          title: "Изготавливаемые изделия не найдены",
          text: "Для формирования черновика у элемента должно быть обозначение формата АБВГ.000000.000.",
        }),
      }),
    });
  }

  function renderSpecifications2RouteDraftEditor(draft) {
    const readiness = inspectSpecifications2RouteDraft(draft);
    const instructionDebtCount = getSpecifications2InstructionDebtCount(draft);
    return `
      <div class="specifications2-route-editor-head">
        <div>
          <span>Черновик маршрутной карты</span>
          <h3>${escapeHtml(draft.productLabel)}</h3>
          <strong>${escapeHtml(draft.designation)}</strong>
        </div>
        <div class="specifications2-route-readiness ${readiness.ready ? "is-ready" : ""}">
          ${instructionDebtCount ? `<span class="is-debt">техдолг: ${instructionDebtCount} инстр.</span>` : ""}
          <span>${escapeHtml(getSpecifications2RouteDraftStatusLabel(draft))}</span>
          <button type="button" data-specifications2-route-ready="${escapeAttribute(draft.id)}" ${readiness.ready ? "" : "disabled"}>${draft.status === "ready-for-norming" ? "Вернуть в черновик" : "Подготовить к нормированию"}</button>
          <button type="button" class="is-danger ${editorUi.confirmRouteDraftDeleteId === draft.id ? "is-confirm" : ""}" data-specifications2-route-delete="${escapeAttribute(draft.id)}">${editorUi.confirmRouteDraftDeleteId === draft.id ? "Подтвердить удаление" : "Удалить черновик"}</button>
        </div>
      </div>
      <div class="specifications2-route-purpose">
        <strong>Маршрут отвечает на вопрос: через какие этапы проходит изделие?</strong>
        <span>До нормирования зафиксируйте последовательность, отдел и результат каждой операции. Контроль оформляйте отдельной операцией. Время будет добавлено нормировщиком позже.</span>
      </div>
      <div class="specifications2-route-operations">
        ${draft.operations.length ? draft.operations.map((operation, index) => (
          editorUi.operationDraft?.mode === "edit"
            && editorUi.operationDraft.routeDraftId === draft.id
            && editorUi.operationDraft.operationId === operation.id
            ? renderSpecifications2OperationEditor(draft)
            : renderSpecifications2RouteOperation(draft, operation, index)
        )).join("") : `
          <div class="specifications2-route-empty">
            <strong>Операции ещё не заданы</strong>
            <span>Начните с первого технологического этапа, который изменяет состояние изделия или передаёт его на следующий участок.</span>
            <button type="button" data-specifications2-route-generate="${escapeAttribute(draft.id)}">Сгенерировать этапы производства</button>
          </div>
        `}
        ${editorUi.operationDraft?.mode === "edit" ? "" : renderSpecifications2OperationEditor(draft)}
        ${editorUi.operationDraft?.routeDraftId === draft.id ? "" : `<button type="button" class="specifications2-route-add-operation" data-specifications2-route-add-operation="${escapeAttribute(draft.id)}"><span>+</span> Добавить операцию</button>`}
      </div>
    `;
  }

  function renderSpecifications2NormalizationPanel(entry) {
    const drafts = normalizeSpecifications2RouteDrafts(entry.routeDrafts).filter((draft) => draft.operations.length);
    const selectedId = entry.selectedRouteDraftId && drafts.some((draft) => draft.id === entry.selectedRouteDraftId)
      ? entry.selectedRouteDraftId
      : drafts[0]?.id || "";
    const selectedDraft = drafts.find((draft) => draft.id === selectedId) || null;
    return renderUiPanel({
      title: "Нормирование",
      meta: "нормы труда по операциям для расчёта будущего заказ-наряда",
      className: "specifications2-panel specifications2-normalization-panel",
      body: renderUiPanelBody({
        body: drafts.length ? `
          <div class="specifications2-normalization-workspace">
            <aside class="specifications2-normalization-routes">
              <header><strong>Маршрутные карты</strong><span>${drafts.length} с операциями</span></header>
              <div>
                ${drafts.map((draft) => {
                  const complete = draft.operations.filter((operation) => isSpecifications2LaborNormComplete(operation.laborNorm)).length;
                  return `<button class="${draft.id === selectedId ? "is-active" : ""}" type="button" data-specifications2-normalization-select="${escapeAttribute(draft.id)}"><span><strong>${escapeHtml(draft.productLabel)}</strong><small>${escapeHtml(draft.designation)}</small></span><b>${complete}/${draft.operations.length}</b></button>`;
                }).join("")}
              </div>
            </aside>
            <section class="specifications2-normalization-editor">
              ${selectedDraft ? renderSpecifications2NormalizationEditor(selectedDraft) : ""}
            </section>
          </div>
        ` : renderUiEmptyState({
          iconName: "route",
          title: "Нет операций для нормирования",
          text: "Сначала создайте маршрутную карту 2.0 и добавьте хотя бы одну операцию.",
        }),
      }),
    });
  }

  function renderSpecifications2NormalizationEditor(draft) {
    const normalizedOperations = draft.operations.filter((operation) => isSpecifications2LaborNormComplete(operation.laborNorm)).length;
    return `
      <div class="specifications2-normalization-head">
        <div><span>Нормы маршрутной карты</span><h3>${escapeHtml(draft.productLabel)}</h3><strong>${escapeHtml(draft.designation)}</strong></div>
        <button type="button" data-specifications2-normalization-generate-all>Сгенерировать нормы для всех</button>
      </div>
      <div class="specifications2-normalization-summary">
        <article><span>Операций</span><strong>${draft.operations.length}</strong></article>
        <article><span>Нормировано</span><strong>${normalizedOperations}/${draft.operations.length}</strong></article>
      </div>
      <div class="specifications2-normalization-list">
        ${draft.operations.map((operation) => renderSpecifications2NormalizationOperation(draft, operation)).join("")}
      </div>
    `;
  }

  function getSpecifications2SuggestedLaborNorm(operation = {}) {
    const name = String(operation.name || "").toLowerCase();
    if (name.includes("выдача в производство")) {
      return normalizeSpecifications2LaborNorm({ calculationMode: "fixed", fixedMinutes: 15 });
    }
    if (name.includes("smt")) {
      return normalizeSpecifications2LaborNorm({ calculationMode: "rate", setupMinutes: 30, unitsPerHour: 30 });
    }
    if (name.includes("оптическ")) {
      return normalizeSpecifications2LaborNorm({ calculationMode: "rate", setupMinutes: 5, unitsPerHour: 20 });
    }
    if (name.includes("отмыв")) {
      return normalizeSpecifications2LaborNorm({ calculationMode: "rate", setupMinutes: 10, unitsPerHour: 30 });
    }
    if (name.includes("выводн") || name.includes("пайк")) {
      return normalizeSpecifications2LaborNorm({ calculationMode: "rate", setupMinutes: 10, unitsPerHour: 6 });
    }
    if (name.includes("прошив")) {
      return normalizeSpecifications2LaborNorm({ calculationMode: "rate", setupMinutes: 5, unitsPerHour: 20 });
    }
    if (name.includes("контрол")) {
      return normalizeSpecifications2LaborNorm({ calculationMode: "rate", setupMinutes: 5, unitsPerHour: 12 });
    }
    if (name.includes("слесар")) {
      return normalizeSpecifications2LaborNorm({ calculationMode: "rate", setupMinutes: 10, unitsPerHour: 4 });
    }
    return normalizeSpecifications2LaborNorm({ calculationMode: "rate", setupMinutes: 10, unitsPerHour: 6 });
  }

  function renderSpecifications2NormalizationOperation(draft, operation) {
    const norm = normalizeSpecifications2LaborNorm(operation.laborNorm);
    const complete = isSpecifications2LaborNormComplete(norm);
    const fixedMode = norm.calculationMode === "fixed";
    const revisions = norm.revisions || [];
    const isEditing = !revisions.length || editorUi.normalizationRevisionOperationId === operation.id;
    const historyOpen = editorUi.normalizationHistoryOperationId === operation.id;
    const currentRevision = revisions.find((revision) => revision.id === norm.activeRevisionId) || revisions.at(-1) || null;
    const methodLabel = fixedMode ? "Фиксированное время" : "По производительности";
    const normLabel = complete ? (fixedMode ? `${norm.fixedMinutes} мин.` : `${norm.unitsPerHour} шт./ч`) : "не задана";
    const today = new Date().toISOString().slice(0, 10);
    const defaultEffectiveFrom = revisions.length ? shiftSpecifications2IsoDate(today, 1) : today;
    const history = historyOpen && revisions.length ? `
      <div class="specifications2-normalization-revision-history">
        <header><strong>История ревизий</strong><span>${revisions.length}</span></header>
        ${[...revisions].reverse().map((revision) => `
          <article class="${revision.id === norm.activeRevisionId ? "is-current" : ""}">
            <b>Ревизия №${revision.number}</b>
            <span>${escapeHtml(revision.calculationMode === "fixed" ? `${revision.fixedMinutes} мин.` : `${revision.unitsPerHour} шт./ч`)}</span>
            <small>${escapeHtml(revision.effectiveFrom || "без даты")} — ${escapeHtml(revision.effectiveTo || "по настоящее время")}</small>
            <em>${escapeHtml(revision.reason || "Основание не указано")}</em>
          </article>
        `).join("")}
      </div>` : "";
    if (!isEditing) {
      return `
        <article class="specifications2-normalization-operation specifications2-normalization-operation-view ${complete ? "is-complete" : ""}">
          <div class="specifications2-normalization-operation-title"><span><strong>${escapeHtml(operation.name || "Операция")}</strong><small>${escapeHtml(operation.workCenter || "Отдел не указан")}</small></span></div>
          <div class="specifications2-normalization-revision-current"><span>Действующая норма</span><strong>Ревизия №${currentRevision?.number || 1}</strong><small>с ${escapeHtml(currentRevision?.effectiveFrom || "—")}</small></div>
          <div class="specifications2-normalization-revision-current"><span>Способ расчёта</span><strong>${escapeHtml(methodLabel)}</strong><small>${fixedMode ? "на всю операцию" : (norm.setupMinutes ? `подготовка ${norm.setupMinutes} мин.` : "без подготовки")}</small></div>
          <div class="specifications2-normalization-operation-result"><span>Норма</span><strong>${escapeHtml(normLabel)}</strong><small>${escapeHtml(currentRevision?.reason || "Первичная плановая норма")}</small></div>
          <div class="specifications2-normalization-revision-actions"><button type="button" data-specifications2-normalization-revision-new="${escapeAttribute(operation.id)}">Новая ревизия</button><button type="button" data-specifications2-normalization-history="${escapeAttribute(operation.id)}">${historyOpen ? "Скрыть историю" : "История"}</button></div>
          ${history}
        </article>
      `;
    }
    return `
      <form class="specifications2-normalization-operation is-revision-editor ${complete ? "is-complete" : ""}" data-calculation-mode="${fixedMode ? "fixed" : "rate"}" data-specifications2-normalization-operation="${escapeAttribute(operation.id)}" data-route-draft-id="${escapeAttribute(draft.id)}">
        <div class="specifications2-normalization-operation-title"><span><strong>${escapeHtml(operation.name || "Операция")}</strong><small>${revisions.length ? `Новая ревизия после №${revisions.length}` : "Первичная плановая норма"}</small></span></div>
        <label><span>Способ расчёта</span><select name="calculationMode"><option value="rate" ${fixedMode ? "" : "selected"}>По производительности</option><option value="fixed" ${fixedMode ? "selected" : ""}>Фиксированное время</option></select></label>
        <div class="specifications2-normalization-method-fields">
          <label class="is-rate"><span>Подготовка мин. перед запуском</span><input name="setupMinutes" type="number" min="0" step="0.01" value="${norm.setupMinutes || ""}" placeholder="0" ${fixedMode ? "disabled" : ""}></label>
          <label class="is-rate"><span>Плановое кол-во шт. в час</span><input name="unitsPerHour" type="number" min="0.01" step="0.01" value="${norm.unitsPerHour || ""}" placeholder="0,00" required ${fixedMode ? "disabled" : ""}></label>
          <label class="is-fixed"><span>Фиксированное время, мин.</span><input name="fixedMinutes" type="number" min="0.01" step="0.01" value="${norm.fixedMinutes || ""}" placeholder="0,00" required ${fixedMode ? "" : "disabled"}></label>
        </div>
        <div class="specifications2-normalization-revision-meta">
          <label><span>Действует с</span><input name="effectiveFrom" type="date" min="${defaultEffectiveFrom}" value="${defaultEffectiveFrom}" required></label>
          ${revisions.length ? `<button type="button" data-specifications2-normalization-revision-cancel>Отмена</button>` : ""}
        </div>
        <button type="submit">${revisions.length ? "Создать ревизию" : "Сохранить норму"}</button>
      </form>
    `;
  }

  function renderSpecifications2ProductionFileLink(file, options = {}) {
    if (!file) return "";
    const source = options.source ? `<small>${escapeHtml(options.source)}</small>` : "";
    return `<span class="specifications2-route-file-link">${source}<button type="button" data-specifications2-production-file-open="${escapeAttribute(file.storageKey)}" data-server-attachment-id="${escapeAttribute(file.serverAttachmentId)}" data-file-name="${escapeAttribute(file.name)}" title="Открыть ${escapeAttribute(file.name)}">${escapeHtml(file.name)}</button>${options.removable ? `<button type="button" class="is-remove" data-specifications2-production-file-remove="${escapeAttribute(options.kind)}" data-route-draft-id="${escapeAttribute(options.draftId)}" data-route-operation-id="${escapeAttribute(options.operationId)}" title="Удалить файл">×</button>` : ""}</span>`;
  }

  function renderSpecifications2SmtFileZones(draft, operation) {
    const files = normalizeSpecifications2ProductionFiles(operation.productionFiles);
    const zone = (kind, title, accept, hint) => `
      <div class="specifications2-route-file-zone ${files[kind] ? "has-file" : ""}">
        <label title="${files[kind] ? "Заменить файл" : "Добавить файл"}"><span><strong>${title}</strong><small>(${hint})</small></span>${files[kind] ? `<i class="specifications2-route-file-add-icon" aria-hidden="true">+</i>` : `<i class="specifications2-route-file-icon is-${kind === "gerber" ? "zip" : "txt"}" aria-hidden="true"><b>${kind === "gerber" ? "ZIP" : "TXT"}</b></i>`}<input type="file" accept="${accept}" data-specifications2-production-file="${kind}" data-route-draft-id="${escapeAttribute(draft.id)}" data-route-operation-id="${escapeAttribute(operation.id)}"></label>
        ${files[kind] ? renderSpecifications2ProductionFileLink(files[kind], { removable: true, kind, draftId: draft.id, operationId: operation.id }) : ""}
      </div>`;
    return `<section class="specifications2-route-production-files"><header><strong>Производственные файлы SMT</strong><span>файлы связаны с изделием и автоматически доступны в AOI</span></header><div>${zone("pnp", "PnP", ".txt,text/plain", "программа установки компонентов")}${zone("gerber", "Gerber", ".zip,application/zip", "комплект производственных слоёв")}</div></section>`;
  }

  function renderSpecifications2InstructionFileZones(draft, operation, options = {}) {
    const files = normalizeSpecifications2ProductionFiles(operation.productionFiles);
    const zone = (kind, title, accept, hint) => {
      const format = getSpecifications2ProductionFileFormat(kind, files[kind]?.name);
      return `<div class="specifications2-route-file-zone ${files[kind] ? "has-file" : ""}"><label title="${files[kind] ? "Заменить файл" : "Добавить файл"}"><span><strong>${title}</strong><small>(${hint})</small></span>${files[kind] ? `<i class="specifications2-route-file-add-icon" aria-hidden="true">+</i>` : `<i class="specifications2-route-file-icon is-${format.toLowerCase()}" aria-hidden="true"><b>${format}</b></i>`}<input type="file" accept="${accept}" data-specifications2-production-file="${kind}" data-route-draft-id="${escapeAttribute(draft.id)}" data-route-operation-id="${escapeAttribute(operation.id)}"></label>${files[kind] ? renderSpecifications2ProductionFileLink(files[kind], { removable: true, kind, draftId: draft.id, operationId: operation.id }) : ""}</div>`;
    };
    const title = options.title || "Инструкции выводного монтажа";
    const caption = options.caption || "документы доступны исполнителю на рабочем столе";
    return `<section class="specifications2-route-production-files specifications2-route-instruction-files"><header><strong>${escapeHtml(title)}</strong><span>${escapeHtml(caption)}</span></header><div>${zone("instructionDoc", "Инструкция DOC", ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document", "редактируемый документ")}${zone("instructionPdf", "Инструкция PDF", ".pdf,application/pdf", "утверждённая версия для просмотра")}</div></section>`;
  }

  function renderSpecifications2InheritedSmtFileLinks(draft) {
    const filesByKind = Object.fromEntries(getSpecifications2AoiProductionFiles(draft).map((item) => [item.kind, item.file]));
    const zone = (kind, title, hint) => {
      const file = filesByKind[kind] || null;
      return `<div class="specifications2-route-file-zone ${file ? "has-file" : "is-empty"} is-readonly"><div class="specifications2-route-file-readonly-head"><span><strong>${title}</strong><small>(${hint})</small></span><em>ТОЛЬКО ЧТЕНИЕ</em></div>${file ? renderSpecifications2ProductionFileLink(file, { kind }) : `<span class="specifications2-route-file-empty">Файл ещё не загружен в SMT-монтаже</span>`}</div>`;
    };
    const caption = "подключаются автоматически после загрузки в SMT-монтаже";
    return `<section class="specifications2-route-production-files is-inherited"><header><strong>Файлы для оптической инспекции</strong><span>${caption}</span></header><div class="specifications2-route-inherited-files">${zone("pnp", "PnP", "программа установки компонентов")}${zone("gerber", "Gerber", "комплект производственных слоёв")}</div></section>`;
  }

  function renderSpecifications2AoiComment(draft, operation) {
    return `<section class="specifications2-route-aoi-comment"><label><span>Комментарий к оптической инспекции</span><textarea rows="1" data-specifications2-route-operation-comment="${escapeAttribute(operation.id)}" data-route-draft-id="${escapeAttribute(draft.id)}" placeholder="Укажите особенности контроля, допустимые отклонения или пояснение для оператора">${escapeHtml(operation.comment || "")}</textarea></label></section>`;
  }

  function renderSpecifications2RouteOperation(draft, operation, index) {
    const isConfirmingRemove = editorUi.confirmOperationRemoveId === operation.id;
    const scenarioLabel = operation.changesProperty === false ? "свойство не меняется" : "свойство меняется";
    const isSmtOperation = operation.operationId === "D3_L1_OP" || operation.operationId === "D3_L2_OP" || /smt/i.test(operation.name || "");
    const isAoiOperation = operation.operationId === "D3_AOI_OP" || /оптическ|aoi/i.test(operation.name || "");
    const isThroughHoleOperation = operation.operationId === "D5_OP1" || /выводн|tht|ручн(?:ой|ая)?\s+монтаж/i.test(operation.name || "");
    return `
      <article class="specifications2-route-operation">
        <div class="specifications2-route-operation-sequence"><strong aria-label="Переход к следующей операции">↓</strong></div>
        <div class="specifications2-route-operation-main">
          <strong>${escapeHtml(operation.name || "Операция без названия")}</strong>
          <small><b>${scenarioLabel}</b> · ${escapeHtml(getSpecifications2RouteOperationSummary(operation))}</small>
        </div>
        <div class="specifications2-route-operation-department"><span>Отдел выполнения</span><strong>${escapeHtml(operation.workCenter || "не указан")}</strong></div>
        <div class="specifications2-route-operation-arrow">→</div>
        <div class="specifications2-route-operation-department"><span>Следующий этап</span><strong>${escapeHtml(operation.nextWorkCenter || "не указан")}</strong><small>${escapeHtml(operation.nextOperation || "операция не указана")}</small></div>
        <div class="specifications2-route-operation-instruction">
          <span>Инструкция</span><strong class="${operation.instructionRequired ? "is-debt" : ""}">${operation.instructionRequired ? "требуется разработать" : "не требуется"}</strong>
        </div>
        <div class="specifications2-route-operation-actions ${isConfirmingRemove ? "is-confirming" : ""}">
          ${isConfirmingRemove ? `
            <button type="button" class="is-danger is-confirm" data-specifications2-route-operation-remove-confirm="${escapeAttribute(operation.id)}" data-route-draft-id="${escapeAttribute(draft.id)}" title="Подтвердить удаление">Удалить?</button>
          ` : `
            <button type="button" data-specifications2-route-operation-move="up" data-route-draft-id="${escapeAttribute(draft.id)}" data-route-operation-id="${escapeAttribute(operation.id)}" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-specifications2-route-operation-move="down" data-route-draft-id="${escapeAttribute(draft.id)}" data-route-operation-id="${escapeAttribute(operation.id)}" ${index === draft.operations.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" data-specifications2-route-operation-edit="${escapeAttribute(operation.id)}" data-route-draft-id="${escapeAttribute(draft.id)}">✎</button>
            <button type="button" class="is-danger" data-specifications2-route-operation-remove="${escapeAttribute(operation.id)}" data-route-draft-id="${escapeAttribute(draft.id)}" title="Удалить операцию">×</button>
          `}
        </div>
        ${isSmtOperation ? renderSpecifications2SmtFileZones(draft, operation) : ""}
        ${isThroughHoleOperation ? renderSpecifications2InstructionFileZones(draft, operation) : ""}
        ${isAoiOperation ? renderSpecifications2InheritedSmtFileLinks(draft) : ""}
        ${isAoiOperation ? renderSpecifications2AoiComment(draft, operation) : ""}
      </article>
    `;
  }

  function renderSpecifications2OperationEditor(draft) {
    const operationDraft = editorUi.operationDraft;
    if (!operationDraft || operationDraft.routeDraftId !== draft.id) return "";
    const value = operationDraft.value || {};
    const presetCatalog = getRouteOperationPresets() || {};
    const departments = (Array.isArray(presetCatalog.departments) ? presetCatalog.departments : []).filter((item) => item?.id && item?.name);
    const editedOperationIndex = operationDraft.mode === "edit"
      ? draft.operations.findIndex((operation) => operation.id === operationDraft.operationId)
      : draft.operations.length;
    const previousOperation = editedOperationIndex > 0 ? draft.operations[editedOperationIndex - 1] : null;
    const startIsLocked = Boolean(previousOperation?.nextWorkCenterId);
    const operationIsLocked = Boolean(startIsLocked && previousOperation?.nextOperationId);
    const selectedDepartmentId = String((startIsLocked ? previousOperation.nextWorkCenterId : value.workCenterId) || departments.find((item) => item.name === value.workCenter)?.id || "");
    const selectedDepartment = departments.find((item) => item.id === selectedDepartmentId);
    const operations = getSpecifications2DepartmentOperations(presetCatalog, selectedDepartmentId);
    const selectedOperationId = String(value.operationId || operations.find((item) => item.name === value.name)?.id || "");
    const selectedNextDepartmentId = String(value.nextWorkCenterId || departments.find((item) => item.name === value.nextWorkCenter)?.id || "");
    const nextOperations = getSpecifications2DepartmentOperations(presetCatalog, selectedNextDepartmentId);
    const selectedNextOperationId = String(value.nextOperationId || nextOperations.find((item) => item.name === value.nextOperation)?.id || "");
    const changesProperty = normalizeSpecifications2ChangesProperty(value.changesProperty);
    return `
      <form class="specifications2-route-operation-form" data-command-form data-specifications2-route-operation-form="${escapeAttribute(draft.id)}">
        <header><strong>${operationDraft.mode === "edit" ? "Изменить операцию" : "Новая операция"}</strong><span>Укажите, изменяет ли операция свойство изделия.</span></header>
        ${startIsLocked
          ? `<label class="specifications2-route-locked-start"><span>Отдел выполнения <i class="specifications2-required-mark">*</i> <small>задан предыдущей операцией</small></span><input type="hidden" name="workCenterId" value="${escapeAttribute(selectedDepartmentId)}"><input value="${escapeAttribute(selectedDepartment?.name || previousOperation.nextWorkCenter || "")}" disabled></label>`
          : `<label><span>Отдел выполнения <i class="specifications2-required-mark">*</i></span><select name="workCenterId" required><option value="">Выберите отдел</option>${departments.map((department) => `<option value="${escapeAttribute(department.id)}" ${department.id === selectedDepartmentId ? "selected" : ""}>${escapeHtml(department.name)}</option>`).join("")}</select></label>`}
        <fieldset class="specifications2-route-operation-choice ${operationIsLocked ? "is-locked" : ""}"><div><label for="specifications2-route-operation-select">Операция <i class="specifications2-required-mark">*</i>${operationIsLocked ? " · задана предыдущей операцией" : ""}</label><label class="specifications2-route-property-unchanged"><input type="checkbox" name="propertyUnchanged" ${changesProperty ? "" : "checked"}><span>Свойство не изменяется</span></label></div>${operationIsLocked ? `<input type="hidden" name="operationId" value="${escapeAttribute(selectedOperationId)}"><input value="${escapeAttribute(previousOperation.nextOperation || value.name || "")}" disabled>` : `<select id="specifications2-route-operation-select" name="operationId" required ${selectedDepartmentId ? "" : "disabled"}><option value="">${selectedDepartmentId ? "Выберите операцию" : "Сначала выберите отдел"}</option>${operations.map((operation) => `<option value="${escapeAttribute(operation.id)}" ${operation.id === selectedOperationId ? "selected" : ""}>${escapeHtml(operation.name)}</option>`).join("")}</select>`}</fieldset>
        ${renderSpecifications2PropertyChangeFields(changesProperty, value, escapeAttribute)}
        <label class="is-wide specifications2-route-instruction-checkbox"><input type="checkbox" name="instructionRequired" ${value.instructionRequired ? "checked" : ""}><span><strong>Требуется инструкция / документ</strong></span></label>
        <label><span>Куда передать после операции <i class="specifications2-required-mark">*</i></span><select name="nextWorkCenterId" required><option value="">Выберите следующий отдел</option>${departments.map((department) => `<option value="${escapeAttribute(department.id)}" ${department.id === selectedNextDepartmentId ? "selected" : ""}>${escapeHtml(department.name)}</option>`).join("")}</select></label>
        <label><span>Операция следующего отдела <i class="specifications2-required-mark">*</i></span><select name="nextOperationId" required ${selectedNextDepartmentId ? "" : "disabled"}><option value="">${selectedNextDepartmentId ? "Выберите следующую операцию" : "Сначала выберите следующий отдел"}</option>${nextOperations.map((operation) => `<option value="${escapeAttribute(operation.id)}" ${operation.id === selectedNextOperationId ? "selected" : ""}>${escapeHtml(operation.name)}</option>`).join("")}</select></label>
        <div><button type="button" data-specifications2-route-operation-cancel>Отмена</button><button type="submit">Сохранить</button></div>
      </form>
    `;
  }

  function renderSpecifications2DiagramPanel(entry) {
    const matrix = getSpecifications2DiagramMatrix(entry);
    const selectedKey = String(entry.selectedComponentKey || "");
    const selectedNodeKey = getSpecifications2SelectedNodeKey(entry);
    const body = matrix.rows.length
      ? `
        <div class="specifications2-diagram specifications2-diagram-matrix" style="--specifications2-level-count: ${Number(matrix.levels.length || 1)};" data-specifications2-diagram-scroll>
          <div class="specifications2-diagram-level-row">
            ${matrix.levels.map((level) => `
              <span>${escapeHtml(level.label || "")}<strong>${escapeHtml(String(level.count || 0))}</strong></span>
            `).join("")}
          </div>
          ${matrix.rows.map((row) => `
            <div class="specifications2-diagram-row" data-edge-key="${escapeAttribute(row.key || "")}">
              ${row.cells.map((cell) => renderSpecifications2DiagramCell(cell, selectedKey, selectedNodeKey)).join("")}
            </div>
          `).join("")}
        </div>
      `
      : renderUiEmptyState({
        iconName: "split",
        title: "Блок-схема не построена",
        text: "В файле нет достаточных связей Применяемость -> Спецификация -> Компонент.",
      });
    return renderUiPanel({
      title: "Блок-схема спецификации",
      meta: "визуализация связей из XLSX",
      className: "specifications2-panel specifications2-diagram-panel",
      body: renderUiPanelBody({ body }),
    });
  }

  function getSpecifications2DiagramMatrix(entry) {
    const levels = (entry.diagramLevels || []).map((level, index) => ({
      label: level.label || (index === 0 ? "Корень" : `Уровень ${index}`),
      count: (level.nodes || []).length,
    }));
    const depthByKey = new Map();
    (entry.diagramLevels || []).forEach((level, index) => {
      (level.nodes || []).forEach((node) => {
        if (node.nodeKey && !depthByKey.has(node.nodeKey)) depthByKey.set(node.nodeKey, index);
      });
    });
    const nodeByKey = getSpecifications2NodeMap(entry);
    const edges = entry.graphEdges || [];
    const columnCount = Math.max(1, levels.length, ...edges.map((edge) => {
      const fromDepth = depthByKey.get(edge.from) ?? 0;
      const toDepth = depthByKey.get(edge.to) ?? fromDepth + 1;
      return Math.max(fromDepth, toDepth) + 1;
    }));
    while (levels.length < columnCount) {
      levels.push({ label: `Уровень ${levels.length}`, count: 0 });
    }

    const incoming = new Set(edges.map((edge) => edge.to));
    const outgoing = new Map();
    edges.forEach((edge) => {
      if (!edge.from || !edge.to) return;
      const list = outgoing.get(edge.from) || [];
      list.push(edge.to);
      outgoing.set(edge.from, list);
    });
    // A block diagram is an overview, not a second copy of the full table.
    // Large sets of terminal components make the parent drift dozens of rows
    // away from its branch and render the graph unreadable. Keep structural
    // nodes intact and fold repeated terminal items into typed summary nodes.
    outgoing.forEach((childKeys, parentKey) => {
      const terminalByType = new Map();
      const structuralKeys = [];
      childKeys.forEach((childKey) => {
        if ((outgoing.get(childKey) || []).length) {
          structuralKeys.push(childKey);
          return;
        }
        const child = nodeByKey.get(childKey);
        const type = String(child?.type || "Компоненты").trim() || "Компоненты";
        const list = terminalByType.get(type) || [];
        list.push(childKey);
        terminalByType.set(type, list);
      });
      const compactedKeys = [...structuralKeys];
      terminalByType.forEach((keys, type) => {
        if (keys.length < 4) {
          compactedKeys.push(...keys);
          return;
        }
        const summaryKey = `diagram-summary:${parentKey}:${type}`;
        const examples = keys.slice(0, 2).map((key) => nodeByKey.get(key)?.label).filter(Boolean);
        nodeByKey.set(summaryKey, {
          nodeKey: summaryKey,
          type,
          label: `${keys.length} позиций`,
          meta: examples.length ? `Например: ${examples.join("; ")}` : "Конечные компоненты",
          quantity: "",
          unitOfMeasure: "",
          status: "summary",
        });
        const childDepth = Math.max(...keys.map((key) => depthByKey.get(key) ?? ((depthByKey.get(parentKey) ?? 0) + 1)));
        depthByKey.set(summaryKey, childDepth);
        compactedKeys.push(summaryKey);
      });
      outgoing.set(parentKey, compactedKeys);
    });
    const rootKeys = (entry.diagramLevels?.[0]?.nodes || [])
      .map((node) => node.nodeKey)
      .filter(Boolean);
    const fallbackRoots = [...nodeByKey.keys()].filter((key) => !incoming.has(key));
    const roots = rootKeys.length ? rootKeys : fallbackRoots;
    const rows = roots.flatMap((nodeKey) => buildSpecifications2DiagramTreeRows({
      nodeKey,
      depth: depthByKey.get(nodeKey) ?? 0,
      columnCount,
      nodeByKey,
      outgoing,
      depthByKey,
    }));

    const visibleKeysByDepth = Array.from({ length: columnCount }, () => new Set());
    rows.forEach((row) => row.cells.forEach((cell, depth) => {
      if (cell?.role !== "branch" && cell?.node?.nodeKey) visibleKeysByDepth[depth]?.add(cell.node.nodeKey);
    }));
    levels.forEach((level, depth) => {
      level.count = visibleKeysByDepth[depth]?.size || 0;
    });

    if (!rows.length) {
      const fallbackNodes = [...nodeByKey.values()].slice(0, 80);
      fallbackNodes.forEach((node) => {
        const cells = Array.from({ length: columnCount }, () => null);
        cells[depthByKey.get(node.nodeKey) ?? 0] = { role: "node", node };
        rows.push({ key: node.nodeKey, cells });
      });
    }

    return { levels, rows };
  }

  function buildSpecifications2DiagramTreeRows({ nodeKey, depth, columnCount, nodeByKey, outgoing, depthByKey, path = new Set() }) {
    const node = nodeByKey.get(nodeKey);
    if (!node || path.has(nodeKey)) return [];
    const nextPath = new Set(path);
    nextPath.add(nodeKey);
    const cells = Array.from({ length: columnCount }, () => null);
    const childKeys = (outgoing.get(nodeKey) || []).filter((childKey) => nodeByKey.has(childKey));
    cells[depth] = { role: depth === 0 ? "root" : "node", node, hasChildren: Boolean(childKeys.length) };
    if (!childKeys.length) return [{ key: nodeKey, cells }];

    const rows = [];
    const groupRowsByDepth = new Map();
    childKeys.forEach((childKey) => {
      const childDepth = Math.min(columnCount - 1, Math.max(depth + 1, depthByKey.get(childKey) ?? depth + 1));
      const childRows = buildSpecifications2DiagramTreeRows({
        nodeKey: childKey,
        depth: childDepth,
        columnCount,
        nodeByKey,
        outgoing,
        depthByKey,
        path: nextPath,
      });
      childRows.forEach((row, rowIndex) => {
        const nextCells = row.cells.slice();
        if (!nextCells[depth]) {
          nextCells[depth] = { role: "branch", node };
        }
        rows.push({
          key: `${nodeKey}->${row.key || childKey}`,
          cells: nextCells,
        });
        const groupedCell = nextCells[childDepth];
        if (groupedCell?.node?.nodeKey === childKey && groupedCell.role !== "branch") {
          const groupedRows = groupRowsByDepth.get(childDepth) || [];
          groupedRows.push(rows.length - 1);
          groupRowsByDepth.set(childDepth, groupedRows);
        }
      });
    });
    const directChildRowIndexes = Array.from(groupRowsByDepth.values()).flat();
    // Keep the reading origin visible: a centered parent can be pushed dozens
    // of rows below the viewport by a large component branch.
    let parentEntryIndex = 0;
    if (directChildRowIndexes.length) {
      const firstDirectRow = Math.min(...directChildRowIndexes);
      parentEntryIndex = firstDirectRow;
    }
    const ensureSpacerRow = (rowIndex) => {
      while (rows.length <= rowIndex) {
        const spacerCells = Array.from({ length: columnCount }, () => null);
        spacerCells[depth] = { role: "branch", node };
        rows.push({
          key: `${nodeKey}->spacer-${rows.length}`,
          cells: spacerCells,
        });
      }
    };
    groupRowsByDepth.forEach((directRowIndexes, groupDepth) => {
      const firstIndex = directRowIndexes[0];
      const lastIndex = directRowIndexes[directRowIndexes.length - 1];
      const firstCell = rows[firstIndex]?.cells?.[groupDepth];
      const shouldGroupSingleParent = Boolean(firstCell?.hasChildren);
      if (directRowIndexes.length < 2 && childKeys.length < 2 && !shouldGroupSingleParent) return;
      const entryIndex = Math.min(lastIndex, Math.max(firstIndex, parentEntryIndex));
      const spanFirstIndex = firstIndex;
      const spanLastIndex = Math.max(lastIndex, entryIndex + (entryIndex - spanFirstIndex));
      ensureSpacerRow(spanLastIndex);
      const directRows = new Set(directRowIndexes);
      for (let rowIndex = spanFirstIndex; rowIndex <= spanLastIndex; rowIndex += 1) {
        if (!rows[rowIndex].cells[groupDepth]) rows[rowIndex].cells[groupDepth] = { role: "branch", node };
        const cell = rows[rowIndex].cells[groupDepth];
        cell.group = {
          key: `${nodeKey}:${groupDepth}`,
          start: rowIndex === spanFirstIndex,
          end: rowIndex === spanLastIndex,
          entry: rowIndex === entryIndex,
          spacer: !directRows.has(rowIndex) || cell.role === "branch",
        };
      }
    });
    rows.forEach((row, rowIndex) => {
      row.cells[depth] = rowIndex === parentEntryIndex ? cells[depth] : { role: "branch", node };
    });
    return rows;
  }

  function renderSpecifications2DiagramCell(cell, selectedKey = "", selectedNodeKey = "") {
    if (!cell) return `<div class="specifications2-diagram-cell is-empty" aria-hidden="true"></div>`;
    const groupClass = cell.group
      ? [
        "is-grouped",
        cell.group.start ? "is-group-start" : "",
        cell.group.end ? "is-group-end" : "",
        cell.group.start && cell.group.end ? "is-group-single" : "",
        cell.group.entry ? "is-group-entry" : "",
        cell.group.spacer ? "is-group-spacer" : "",
      ].filter(Boolean).join(" ")
      : "";
    const groupAttribute = cell.group ? ` data-specifications2-group="${escapeAttribute(cell.group.key)}"` : "";
    if (cell.role === "branch") {
      return `
        <div class="specifications2-diagram-cell is-${escapeAttribute(cell.role)} ${escapeAttribute(groupClass)}" ${groupAttribute} aria-hidden="true">
          <span></span>
        </div>
      `;
    }
    const nodeClass = cell.role === "root" ? "is-root" : "is-child";
    const cellClass = [
      `is-${cell.role || "node"}`,
      cell.role === "root" ? "" : "is-child",
      cell.hasChildren ? "has-children" : "is-leaf",
      groupClass,
    ].filter(Boolean).join(" ");
    return `
      <div class="specifications2-diagram-cell ${escapeAttribute(cellClass)}"${groupAttribute}>
        ${renderSpecifications2DiagramNode(cell.node, selectedKey, selectedNodeKey, nodeClass)}
      </div>
    `;
  }

  function renderSpecifications2DiagramNode(node, selectedKey = "", selectedNodeKey = "", extraClassName = "") {
    const isSelected = node.selectionKey === selectedKey || node.nodeKey === selectedNodeKey;
    const quantityValue = node.quantity ?? "";
    const quantityText = quantityValue !== "" && quantityValue !== null && quantityValue !== undefined
      ? `${quantityValue} ${node.unitOfMeasure || ""}`.trim()
      : "";
    const rawMetaText = String(node.meta || node.source || "").trim();
    const rawLabelText = String(node.label || "").trim();
    const labelText = getSpecifications2DisplayLabel(rawLabelText, rawMetaText);
    const normalizedLabel = labelText.toLowerCase();
    const normalizedMeta = rawMetaText.toLowerCase();
    const isRowSource = /^строка\s+\d+/i.test(rawMetaText);
    const isDuplicateMeta = normalizedMeta && normalizedLabel.includes(normalizedMeta);
    const metaText = !isRowSource && !isDuplicateMeta ? rawMetaText : "";
    const fullTitle = [node.type, labelText, quantityText, rawMetaText].filter(Boolean).join(" · ");
    return `
      <article class="specifications2-diagram-node ${escapeAttribute(extraClassName)} ${node.status ? `is-${escapeAttribute(node.status)}` : ""} ${node.selectionKey ? "is-selectable" : ""} ${isSelected ? "is-selected" : ""}" tabindex="0" aria-selected="${isSelected ? "true" : "false"}" title="${escapeAttribute(fullTitle)}" data-specifications2-component="${escapeAttribute(node.selectionKey || "")}">
        <header class="specifications2-diagram-node-head">
          <span>${escapeHtml(node.type || "объект")}</span>
          ${quantityText ? `<em>${escapeHtml(quantityText)}</em>` : ""}
        </header>
        <strong>${escapeHtml(labelText)}</strong>
        ${metaText ? `<small>${escapeHtml(metaText)}</small>` : ""}
      </article>
    `;
  }

  function bindSpecifications2Events() {
    if (!editorOutsideClickBound) {
      editorOutsideClickBound = true;
      document.addEventListener("click", (event) => {
        if (!editorUi.menuRowId) return;
        if (event.target.closest?.("[data-specifications2-row-menu], .specifications2-row-menu")) return;
        editorUi.menuRowId = "";
        editorUi.confirmRemoveId = "";
        render({ skipRememberScroll: true });
      });
    }
    document.querySelector("[data-specifications2-upload]")?.addEventListener("click", () => {
      document.querySelector("[data-specifications2-file]")?.click();
    });
    document.querySelector("[data-specifications2-file]")?.addEventListener("change", async (event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      try {
        const entry = await runLongTask(
          () => importSpecifications2File(file),
          {
            title: "Загружаем спецификацию",
            detail: "Читаем XLSX, проверяем структуру и формируем дерево изделия",
          },
        );
        const store = readStore();
        const registry = [entry, ...store.registry.filter((item) => item.id !== entry.id)].slice(0, 20);
        writeStore({ selectedId: entry.id, registry });
        notifySaveSuccess(`Спецификация 2.0 загружена: ${entry.title}`);
        input.value = "";
        render({ skipRememberScroll: true });
      } catch (error) {
        notifySaveSuccess(`XLSX не загружен: ${error?.message || "ошибка чтения"}`);
      } finally {
        if (input.isConnected) input.value = "";
      }
    });
    document.querySelectorAll("[data-specifications2-select]").forEach((button) => {
      button.addEventListener("click", () => {
        const store = readStore();
        writeStore({ ...store, selectedId: button.dataset.specifications2Select || "" });
        render({ skipRememberScroll: true });
      });
    });
    document.querySelectorAll("[data-specifications2-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveTab(button.dataset.specifications2Tab || "tree");
        render({ skipRememberScroll: true });
      });
    });
    document.querySelector("[data-specifications2-publish]")?.addEventListener("click", async (event) => {
      const entryId = event.currentTarget.dataset.specifications2Publish || "";
      const store = readStore();
      const entry = store.registry.find((item) => item.id === entryId);
      if (!entry || typeof publishSpecifications2Entry !== "function") return;
      try {
        const publication = publishSpecifications2Entry(entry);
        const publishedEntry = { ...entry, publication, updatedAt: new Date().toISOString() };
        const registry = store.registry.map((item) => item.id === entryId
          ? publishedEntry
          : item);
        writeStore({ ...store, registry, selectedId: entryId });
        render({ skipRememberScroll: true });
        notifySaveSuccess(`Опубликована производственная ревизия ${publication.revision}`);
        if (typeof publishServerRevision === "function") {
          const serverResult = await publishServerRevision(publishedEntry);
          if (serverResult.ok) {
            hydratePublishedRevision(publishedEntry);
            notifySaveSuccess(serverResult.created ? "Серверная ревизия PostgreSQL сохранена" : "Серверная ревизия PostgreSQL уже актуальна");
          } else if (!serverResult.disabled) {
            notifySaveSuccess(`Серверная копия будет повторена позже: ${serverResult.error}`);
          }
        }
      } catch (error) {
        notifySaveSuccess(`Публикация не выполнена: ${error?.message || "ошибка подготовки данных"}`);
      }
    });
    document.querySelector("[data-specifications2-server-work-order]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const entry = getSelectedEntry(readStore());
      const serverRevision = entry?.publication?.revision ? getPublishedRevision(entry.id)?.item : null;
      if (!serverRevision || typeof createServerWorkOrder !== "function") return;
      const payload = new FormData(form);
      const routeSourceDraftId = String(payload.get("routeSourceDraftId") || "");
      const quantity = Number(payload.get("quantity") || 0);
      if (!routeSourceDraftId || !Number.isFinite(quantity) || quantity <= 0) return;
      const submit = form.querySelector("button[type='submit']");
      if (submit) submit.disabled = true;
      try {
        const idempotencyKey = globalThis.crypto?.randomUUID?.() || `spec2-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const result = await createServerWorkOrder({ revisionId: serverRevision.id, routeSourceDraftId, quantity, idempotencyKey });
        notifySaveSuccess(result.created ? "Серверный заказ-наряд создан и передан в планирование" : "Существующий серверный заказ-наряд открыт без дублирования");
      } catch (error) {
        notifySaveSuccess(`Заказ-наряд не создан: ${error?.message || "ошибка сервера"}`);
      } finally {
        if (submit?.isConnected) submit.disabled = false;
      }
    });
    const updateSelectedRouteDraft = (draftId, updater) => {
      const store = readStore();
      const selectedId = store.selectedId || store.registry[0]?.id || "";
      const registry = store.registry.map((entry) => {
        if (entry.id !== selectedId) return entry;
        const routeDrafts = normalizeSpecifications2RouteDrafts(entry.routeDrafts);
        return {
          ...entry,
          routeDrafts: routeDrafts.map((draft) => draft.id === draftId ? updater(draft) : draft).filter(Boolean),
        };
      });
      writeStore({ ...store, registry, selectedId });
      editorUi.operationDraft = null;
      editorUi.confirmOperationRemoveId = "";
      clearOperationRemoveOutsideHandler();
      render({ skipRememberScroll: true });
    };
    document.querySelectorAll("[data-specifications2-route-generate]").forEach((button) => {
      button.addEventListener("click", () => {
        const draftId = button.dataset.specifications2RouteGenerate || "";
        const catalog = getRouteOperationPresets() || {};
        let generatedCount = 0;
        updateSelectedRouteDraft(draftId, (draft) => {
          const generated = generateSpecifications2ProductionStages(draft, catalog);
          generatedCount = generated.operations.length;
          return generated;
        });
        notifySaveSuccess(generatedCount ? `Сформировано этапов: ${generatedCount}` : "Этапы не сформированы: проверьте справочник операций");
      });
    });
    document.querySelector("[data-specifications2-route-generate-all]")?.addEventListener("click", () => {
      const catalog = getRouteOperationPresets() || {};
      const store = readStore();
      const selectedId = store.selectedId || store.registry[0]?.id || "";
      let generatedRoutes = 0;
      let createdDrafts = 0;
      const registry = store.registry.map((entry) => {
        if (entry.id !== selectedId) return entry;
        const items = getSpecifications2ManufacturedItems(entry.treeRows || []);
        const existingDrafts = normalizeSpecifications2RouteDrafts(entry.routeDrafts);
        const draftByProductKey = new Map(existingDrafts.map((draft) => [draft.productKey, draft]));
        items.forEach((item) => {
          let draft = draftByProductKey.get(item.key);
          if (!draft) {
            draft = createSpecifications2RouteDraft(item);
            draftByProductKey.set(item.key, draft);
            createdDrafts += 1;
          }
          if (!draft.operations.length) {
            const generated = generateSpecifications2ProductionStages(draft, catalog);
            if (generated.operations.length) {
              draftByProductKey.set(item.key, generated);
              generatedRoutes += 1;
            }
          }
        });
        const routeDrafts = [...draftByProductKey.values()];
        return {
          ...entry,
          routeDrafts,
          selectedRouteDraftId: entry.selectedRouteDraftId || routeDrafts[0]?.id || "",
        };
      });
      writeStore({ ...store, registry, selectedId });
      render({ skipRememberScroll: true });
      notifySaveSuccess(`Маршруты сформированы: ${generatedRoutes}; новых черновиков: ${createdDrafts}`);
    });
    document.querySelectorAll("[data-specifications2-route-create]").forEach((button) => {
      button.addEventListener("click", () => {
        const productKey = button.dataset.specifications2RouteCreate || "";
        const store = readStore();
        const selectedId = store.selectedId || store.registry[0]?.id || "";
        let createdDraft = null;
        const registry = store.registry.map((entry) => {
          if (entry.id !== selectedId) return entry;
          const item = getSpecifications2ManufacturedItems(entry.treeRows || []).find((candidate) => candidate.key === productKey);
          if (!item) return entry;
          createdDraft = createSpecifications2RouteDraft(item);
          return {
            ...entry,
            routeDrafts: [...normalizeSpecifications2RouteDrafts(entry.routeDrafts), createdDraft],
            selectedRouteDraftId: createdDraft.id,
          };
        });
        if (!createdDraft) return;
        writeStore({ ...store, registry, selectedId });
        render({ skipRememberScroll: true });
        notifySaveSuccess(`Черновик маршрутной карты создан: ${createdDraft.designation}`);
      });
    });
    document.querySelectorAll("[data-specifications2-route-select]").forEach((button) => {
      button.addEventListener("click", () => {
        const routeDraftId = button.dataset.specifications2RouteSelect || "";
        const store = readStore();
        const selectedId = store.selectedId || store.registry[0]?.id || "";
        const registry = store.registry.map((entry) => entry.id === selectedId
          ? { ...entry, selectedRouteDraftId: routeDraftId }
          : entry);
        writeStore({ ...store, registry, selectedId });
        editorUi.operationDraft = null;
        render({ skipRememberScroll: true });
      });
    });
    document.querySelectorAll("[data-specifications2-normalization-select]").forEach((button) => {
      button.addEventListener("click", () => {
        const routeDraftId = button.dataset.specifications2NormalizationSelect || "";
        const store = readStore();
        const selectedId = store.selectedId || store.registry[0]?.id || "";
        const registry = store.registry.map((entry) => entry.id === selectedId
          ? { ...entry, selectedRouteDraftId: routeDraftId }
          : entry);
        writeStore({ ...store, registry, selectedId });
        render({ skipRememberScroll: true });
      });
    });
    document.querySelector("[data-specifications2-normalization-generate-all]")?.addEventListener("click", () => {
      const store = readStore();
      const selectedId = store.selectedId || store.registry[0]?.id || "";
      let generatedCount = 0;
      const effectiveFrom = new Date().toISOString().slice(0, 10);
      const registry = store.registry.map((entry) => {
        if (entry.id !== selectedId) return entry;
        const routeDrafts = normalizeSpecifications2RouteDrafts(entry.routeDrafts).map((draft) => {
          let nextDraft = draft;
          draft.operations.forEach((operation) => {
            if (isSpecifications2LaborNormComplete(operation.laborNorm)) return;
            nextDraft = applySpecifications2LaborNormRevision(
              nextDraft,
              operation.id,
              getSpecifications2SuggestedLaborNorm(operation),
              { effectiveFrom },
            );
            generatedCount += 1;
          });
          return nextDraft;
        });
        return { ...entry, routeDrafts, updatedAt: new Date().toISOString() };
      });
      writeStore({ ...store, registry, selectedId });
      render({ skipRememberScroll: true });
      notifySaveSuccess(generatedCount
        ? `Плановые нормы созданы: ${generatedCount}`
        : "Все операции уже имеют плановые нормы");
    });
    document.querySelectorAll("[data-specifications2-normalization-operation]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const operationId = form.dataset.specifications2NormalizationOperation || "";
        const draftId = form.dataset.routeDraftId || "";
        const norm = normalizeSpecifications2LaborNorm({
          calculationMode: data.get("calculationMode"),
          setupMinutes: data.get("setupMinutes"),
          unitsPerHour: data.get("unitsPerHour"),
          fixedMinutes: data.get("fixedMinutes"),
        });
        editorUi.normalizationRevisionOperationId = "";
        updateSelectedRouteDraft(draftId, (draft) => applySpecifications2LaborNormRevision(draft, operationId, norm, {
          effectiveFrom: data.get("effectiveFrom"),
        }));
        notifySaveSuccess("Ревизия нормы сохранена");
      });
    });
    document.querySelectorAll("[data-specifications2-normalization-revision-new]").forEach((button) => {
      button.addEventListener("click", () => {
        editorUi.normalizationRevisionOperationId = button.dataset.specifications2NormalizationRevisionNew || "";
        render({ skipRememberScroll: true });
      });
    });
    document.querySelectorAll("[data-specifications2-normalization-history]").forEach((button) => {
      button.addEventListener("click", () => {
        const operationId = button.dataset.specifications2NormalizationHistory || "";
        editorUi.normalizationHistoryOperationId = editorUi.normalizationHistoryOperationId === operationId ? "" : operationId;
        render({ skipRememberScroll: true });
      });
    });
    document.querySelector("[data-specifications2-normalization-revision-cancel]")?.addEventListener("click", () => {
      editorUi.normalizationRevisionOperationId = "";
      render({ skipRememberScroll: true });
    });
    document.querySelectorAll("[data-specifications2-normalization-operation] select[name='calculationMode']").forEach((select) => {
      select.addEventListener("change", () => {
        const form = select.closest("[data-specifications2-normalization-operation]");
        const fixedMode = select.value === "fixed";
        form.dataset.calculationMode = fixedMode ? "fixed" : "rate";
        form.querySelectorAll(".is-rate input").forEach((input) => { input.disabled = fixedMode; });
        form.querySelectorAll(".is-fixed input").forEach((input) => { input.disabled = !fixedMode; });
      });
    });
    document.querySelectorAll("[data-specifications2-route-operation-comment]").forEach((field) => {
      field.addEventListener("change", () => {
        const draftId = field.dataset.routeDraftId || "";
        const operationId = field.dataset.specifications2RouteOperationComment || "";
        const comment = cleanText(field.value);
        updateSelectedRouteDraft(draftId, (draft) => ({
          ...draft,
          updatedAt: new Date().toISOString(),
          operations: draft.operations.map((operation) => operation.id === operationId
            ? { ...operation, comment }
            : operation),
        }));
        notifySaveSuccess("Комментарий к оптической инспекции сохранён");
      });
    });
    document.querySelectorAll("[data-specifications2-production-file]").forEach((input) => {
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        const kind = input.dataset.specifications2ProductionFile || "";
        const draftId = input.dataset.routeDraftId || "";
        const operationId = input.dataset.routeOperationId || "";
        const kindLabel = {
          pnp: "PnP",
          gerber: "Gerber",
          instructionDoc: "Инструкция DOC",
          instructionPdf: "Инструкция PDF",
        }[kind] || "Файл";
        const kindRequirement = {
          pnp: "требуется файл TXT",
          gerber: "требуется архив ZIP",
          instructionDoc: "требуется документ DOC или DOCX",
          instructionPdf: "требуется документ PDF",
        }[kind] || "неподдерживаемый формат";
        if (!isSpecifications2ProductionFileAccepted(kind, file.name)) {
          notifySaveSuccess(`${kindLabel} не загружен: ${kindRequirement}`);
          input.value = "";
          return;
        }
        const storageKey = `${draftId}::${operationId}::${kind}`;
        try {
          if (file.size > SPECIFICATIONS2_SHARED_FILE_MAX_BYTES) {
            throw new Error("для межбраузерного теста размер файла не должен превышать 1 МБ");
          }
          const inlineDataUrl = await readSpecifications2FileAsDataUrl(file);
          await writeSpecifications2ProductionFile(storageKey, file);
          const metadata = {
            storageKey,
            name: file.name,
            size: file.size,
            type: file.type,
            uploadedAt: new Date().toISOString(),
            inlineDataUrl,
          };
          updateSelectedRouteDraft(draftId, (draft) => ({
            ...draft,
            updatedAt: new Date().toISOString(),
            operations: draft.operations.map((operation) => operation.id === operationId
              ? { ...operation, productionFiles: { ...normalizeSpecifications2ProductionFiles(operation.productionFiles), [kind]: metadata } }
              : operation),
          }));
          if (typeof uploadServerAttachment === "function") {
            const serverResult = await uploadServerAttachment({ fileName: file.name, mediaType: file.type, inlineDataUrl });
            if (serverResult.ok && serverResult.item?.id) {
              updateSelectedRouteDraft(draftId, (draft) => ({
                ...draft,
                updatedAt: new Date().toISOString(),
                operations: draft.operations.map((operation) => operation.id === operationId
                  ? { ...operation, productionFiles: { ...normalizeSpecifications2ProductionFiles(operation.productionFiles), [kind]: { ...normalizeSpecifications2ProductionFiles(operation.productionFiles)[kind], serverAttachmentId: serverResult.item.id, contentDigest: serverResult.item.contentDigest || "" } } }
                  : operation),
              }));
              notifySaveSuccess(`${kindLabel} сохранён в серверном хранилище`);
            } else if (!serverResult.disabled) {
              notifySaveSuccess(`${kindLabel} сохранён локально; серверная копия будет повторена позже`);
            }
          }
          notifySaveSuccess(`${kindLabel} прикреплён: ${file.name}`);
        } catch (error) {
          notifySaveSuccess(`Файл не сохранён: ${error?.message || "ошибка хранилища"}`);
        }
      });
    });
    document.querySelectorAll("[data-specifications2-production-file-open]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const draft = normalizeSpecifications2RouteDrafts(getSelectedEntry()?.routeDrafts)
            .find((item) => item.operations.some((operation) => Object.values(normalizeSpecifications2ProductionFiles(operation.productionFiles))
              .some((file) => file?.storageKey === button.dataset.specifications2ProductionFileOpen)));
          const metadata = draft?.operations
            .flatMap((operation) => Object.values(normalizeSpecifications2ProductionFiles(operation.productionFiles)))
            .find((file) => file?.storageKey === button.dataset.specifications2ProductionFileOpen);
          let blob = null;
          const serverAttachmentId = String(button.dataset.serverAttachmentId || metadata?.serverAttachmentId || "").trim();
          if (serverAttachmentId && typeof downloadServerAttachment === "function") {
            const serverResult = await downloadServerAttachment({ id: serverAttachmentId });
            if (serverResult.ok && serverResult.blob) blob = serverResult.blob;
          }
          if (!blob) blob = await readSpecifications2SharedProductionFile(metadata || {
            storageKey: button.dataset.specifications2ProductionFileOpen || "",
          });
          if (!blob) throw new Error("файл не найден в общем хранилище");
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = button.dataset.fileName || "production-file";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
          notifySaveSuccess(`Файл не открыт: ${error?.message || "ошибка хранилища"}`);
        }
      });
    });
    document.querySelectorAll("[data-specifications2-production-file-remove]").forEach((button) => {
      button.addEventListener("click", async () => {
        const kind = button.dataset.specifications2ProductionFileRemove || "";
        const kindLabel = {
          pnp: "PnP",
          gerber: "Gerber",
          instructionDoc: "Инструкция DOC",
          instructionPdf: "Инструкция PDF",
        }[kind] || "Файл";
        const draftId = button.dataset.routeDraftId || "";
        const operationId = button.dataset.routeOperationId || "";
        const draft = normalizeSpecifications2RouteDrafts(getSelectedEntry()?.routeDrafts).find((item) => item.id === draftId);
        const operation = draft?.operations.find((item) => item.id === operationId);
        const file = normalizeSpecifications2ProductionFiles(operation?.productionFiles)[kind];
        try {
          if (file?.storageKey) await deleteSpecifications2ProductionFile(file.storageKey);
          updateSelectedRouteDraft(draftId, (currentDraft) => ({
            ...currentDraft,
            updatedAt: new Date().toISOString(),
            operations: currentDraft.operations.map((item) => item.id === operationId
              ? { ...item, productionFiles: { ...normalizeSpecifications2ProductionFiles(item.productionFiles), [kind]: null } }
              : item),
          }));
          notifySaveSuccess(`${kindLabel} удалён`);
        } catch (error) {
          notifySaveSuccess(`Файл не удалён: ${error?.message || "ошибка хранилища"}`);
        }
      });
    });
    document.querySelector("[data-specifications2-route-add-operation]")?.addEventListener("click", (event) => {
      const routeDraftId = event.currentTarget.dataset.specifications2RouteAddOperation || "";
      const draft = normalizeSpecifications2RouteDrafts(getSelectedEntry()?.routeDrafts).find((item) => item.id === routeDraftId);
      const previousOperation = draft?.operations[draft.operations.length - 1];
      editorUi.operationDraft = {
        routeDraftId,
        mode: "add",
        value: previousOperation?.nextWorkCenterId ? {
          workCenterId: previousOperation.nextWorkCenterId,
          workCenter: previousOperation.nextWorkCenter,
          operationId: previousOperation.nextOperationId,
          name: previousOperation.nextOperation,
        } : {},
      };
      render({ skipRememberScroll: true });
      queueMicrotask(() => document.querySelector("[data-specifications2-route-operation-form] select[name='operationId']")?.focus());
    });
    document.querySelectorAll("[data-specifications2-route-operation-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        const routeDraftId = button.dataset.routeDraftId || "";
        const operationId = button.dataset.specifications2RouteOperationEdit || "";
        const draft = normalizeSpecifications2RouteDrafts(getSelectedEntry()?.routeDrafts).find((item) => item.id === routeDraftId);
        const operation = draft?.operations.find((item) => item.id === operationId);
        if (!operation) return;
        editorUi.operationDraft = { routeDraftId, operationId, mode: "edit", value: operation };
        render({ skipRememberScroll: true });
      });
    });
    document.querySelectorAll("[data-specifications2-route-operation-move]").forEach((button) => {
      button.addEventListener("click", () => {
        const draftId = button.dataset.routeDraftId || "";
        updateSelectedRouteDraft(draftId, (draft) => applySpecifications2RouteDraftAction(draft, {
          type: button.dataset.specifications2RouteOperationMove || "",
          operationId: button.dataset.routeOperationId || "",
        }));
      });
    });
    document.querySelectorAll("[data-specifications2-route-operation-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const operationId = button.dataset.specifications2RouteOperationRemove || "";
        editorUi.confirmOperationRemoveId = operationId;
        render({ skipRememberScroll: true });
        armOperationRemoveOutsideCancel(operationId);
      });
    });
    document.querySelectorAll("[data-specifications2-route-operation-remove-confirm]").forEach((button) => {
      button.addEventListener("click", () => {
        const operationId = button.dataset.specifications2RouteOperationRemoveConfirm || "";
        const draftId = button.dataset.routeDraftId || "";
        updateSelectedRouteDraft(draftId, (draft) => applySpecifications2RouteDraftAction(draft, { type: "remove", operationId }));
      });
    });
    document.querySelector("[data-specifications2-route-operation-cancel]")?.addEventListener("click", () => {
      editorUi.operationDraft = null;
      render({ skipRememberScroll: true });
    });
    document.querySelector("[data-specifications2-route-operation-form] select[name='workCenterId']")?.addEventListener("change", (event) => {
      const formElement = event.currentTarget.closest("form");
      const form = new FormData(formElement);
      const workCenterId = String(form.get("workCenterId") || "").trim();
      const nextWorkCenterId = String(form.get("nextWorkCenterId") || "").trim();
      const nextOperationId = String(form.get("nextOperationId") || "").trim();
      const catalog = getRouteOperationPresets() || {};
      const department = (catalog.departments || []).find((item) => item.id === workCenterId);
      const nextDepartment = (catalog.departments || []).find((item) => item.id === nextWorkCenterId);
      const nextOperation = (catalog.operations || []).find((item) => item.id === nextOperationId);
      const changesProperty = getSpecifications2ChangesPropertyFromForm(form);
      editorUi.operationDraft = {
        ...editorUi.operationDraft,
        value: {
          ...editorUi.operationDraft?.value,
          workCenterId,
          workCenter: String(department?.name || "").trim(),
          nextWorkCenterId,
          nextWorkCenter: String(nextDepartment?.name || "").trim(),
          nextOperationId,
          nextOperation: String(nextOperation?.name || "").trim(),
          operationId: "",
          name: "",
          instructionRequired: form.has("instructionRequired"),
          ...readSpecifications2PropertyChangeForm(form, changesProperty),
        },
      };
      render({ skipRememberScroll: true });
    });
    document.querySelector("[data-specifications2-route-operation-form] select[name='operationId']")?.addEventListener("change", (event) => {
      const formElement = event.currentTarget.closest("form");
      const form = new FormData(formElement);
      const workCenterId = String(form.get("workCenterId") || "").trim();
      const operationId = String(form.get("operationId") || "").trim();
      const nextWorkCenterId = String(form.get("nextWorkCenterId") || "").trim();
      const nextOperationId = String(form.get("nextOperationId") || "").trim();
      const catalog = getRouteOperationPresets() || {};
      const department = (catalog.departments || []).find((item) => item.id === workCenterId);
      const nextDepartment = (catalog.departments || []).find((item) => item.id === nextWorkCenterId);
      const nextOperation = (catalog.operations || []).find((item) => item.id === nextOperationId);
      const operation = (catalog.operations || []).find((item) => item.id === operationId);
      const changesProperty = getSpecifications2ChangesPropertyFromForm(form);
      editorUi.operationDraft = {
        ...editorUi.operationDraft,
        value: {
          ...editorUi.operationDraft?.value,
          workCenterId,
          workCenter: String(department?.name || "").trim(),
          nextWorkCenterId,
          nextWorkCenter: String(nextDepartment?.name || "").trim(),
          nextOperationId,
          nextOperation: String(nextOperation?.name || "").trim(),
          operationId,
          name: String(operation?.name || "").trim(),
          instructionRequired: form.has("instructionRequired"),
          ...readSpecifications2PropertyChangeForm(form, changesProperty),
        },
      };
      render({ skipRememberScroll: true });
    });
    document.querySelector("[data-specifications2-route-operation-form] select[name='nextWorkCenterId']")?.addEventListener("change", (event) => {
      const form = new FormData(event.currentTarget.closest("form"));
      const nextWorkCenterId = String(form.get("nextWorkCenterId") || "").trim();
      const catalog = getRouteOperationPresets() || {};
      const nextDepartment = (catalog.departments || []).find((item) => item.id === nextWorkCenterId);
      editorUi.operationDraft = {
        ...editorUi.operationDraft,
        value: {
          ...editorUi.operationDraft?.value,
          nextWorkCenterId,
          nextWorkCenter: String(nextDepartment?.name || "").trim(),
          nextOperationId: "",
          nextOperation: "",
          instructionRequired: form.has("instructionRequired"),
          ...readSpecifications2PropertyChangeForm(form),
        },
      };
      render({ skipRememberScroll: true });
    });
    document.querySelector("[data-specifications2-route-operation-form] input[name='propertyUnchanged']")?.addEventListener("change", (event) => {
      const form = new FormData(event.currentTarget.closest("form"));
      const changesProperty = getSpecifications2ChangesPropertyFromForm(form);
      const nextWorkCenterId = String(form.get("nextWorkCenterId") || "").trim();
      const nextOperationId = String(form.get("nextOperationId") || "").trim();
      const catalog = getRouteOperationPresets() || {};
      const nextDepartment = (catalog.departments || []).find((item) => item.id === nextWorkCenterId);
      const nextOperation = (catalog.operations || []).find((item) => item.id === nextOperationId);
      editorUi.operationDraft = {
        ...editorUi.operationDraft,
        value: {
          ...editorUi.operationDraft?.value,
          nextWorkCenterId,
          nextWorkCenter: String(nextDepartment?.name || "").trim(),
          nextOperationId,
          nextOperation: String(nextOperation?.name || "").trim(),
          instructionRequired: form.has("instructionRequired"),
          ...readSpecifications2PropertyChangeForm(form, changesProperty),
        },
      };
      render({ skipRememberScroll: true });
    });
    document.querySelector("[data-specifications2-route-operation-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const routeDraftId = event.currentTarget.dataset.specifications2RouteOperationForm || "";
      const form = new FormData(event.currentTarget);
      const workCenterId = String(form.get("workCenterId") || "").trim();
      const operationId = String(form.get("operationId") || "").trim();
      const nextWorkCenterId = String(form.get("nextWorkCenterId") || "").trim();
      const nextOperationId = String(form.get("nextOperationId") || "").trim();
      const catalog = getRouteOperationPresets() || {};
      const department = (catalog.departments || []).find((item) => item.id === workCenterId);
      const nextDepartment = (catalog.departments || []).find((item) => item.id === nextWorkCenterId);
      const operation = (catalog.operations || []).find((item) => item.id === operationId);
      const nextOperation = (catalog.operations || []).find((item) => item.id === nextOperationId);
      const value = {
        workCenterId,
        workCenter: String(department?.name || "").trim(),
        nextWorkCenterId,
        nextWorkCenter: String(nextDepartment?.name || "").trim(),
        nextOperationId,
        nextOperation: String(nextOperation?.name || "").trim(),
        operationId,
        name: String(operation?.name || "").trim(),
        instructionRequired: form.has("instructionRequired"),
        ...readSpecifications2PropertyChangeForm(form),
      };
      if (!value.operationId || !value.name || !value.workCenterId || !value.workCenter || !value.nextWorkCenterId || !value.nextWorkCenter || !value.nextOperationId || !value.nextOperation || (value.changesProperty && (!value.inputState || !value.outputState))) return;
      const operationDraft = editorUi.operationDraft;
      updateSelectedRouteDraft(routeDraftId, (draft) => applySpecifications2RouteDraftAction(draft, {
        type: operationDraft?.mode === "edit" ? "update" : "add",
        operationId: operationDraft?.operationId || "",
        value,
      }));
      notifySaveSuccess(operationDraft?.mode === "edit" ? "Операция изменена" : "Операция добавлена в маршрут");
    });
    document.querySelector("[data-specifications2-route-ready]")?.addEventListener("click", (event) => {
      const draftId = event.currentTarget.dataset.specifications2RouteReady || "";
      let isPreparedForNorming = false;
      updateSelectedRouteDraft(draftId, (draft) => {
        const updatedDraft = applySpecifications2RouteDraftAction(draft, { type: "toggle-ready" });
        isPreparedForNorming = updatedDraft.status === "ready-for-norming";
        return updatedDraft;
      });
      if (isPreparedForNorming) {
        setActiveTab("normalization");
        render({ skipRememberScroll: true });
        notifySaveSuccess("Маршрут подготовлен к нормированию");
        return;
      }
      notifySaveSuccess("Маршрут возвращён в черновик");
    });
    document.querySelector("[data-specifications2-route-delete]")?.addEventListener("click", (event) => {
      const draftId = event.currentTarget.dataset.specifications2RouteDelete || "";
      if (editorUi.confirmRouteDraftDeleteId !== draftId) {
        editorUi.confirmRouteDraftDeleteId = draftId;
        render({ skipRememberScroll: true });
        return;
      }
      const store = readStore();
      const selectedId = store.selectedId || store.registry[0]?.id || "";
      const registry = store.registry.map((entry) => {
        if (entry.id !== selectedId) return entry;
        const routeDrafts = normalizeSpecifications2RouteDrafts(entry.routeDrafts).filter((draft) => draft.id !== draftId);
        return {
          ...entry,
          routeDrafts,
          selectedRouteDraftId: routeDrafts[0]?.id || "",
        };
      });
      editorUi.confirmRouteDraftDeleteId = "";
      editorUi.operationDraft = null;
      writeStore({ ...store, registry, selectedId });
      render({ skipRememberScroll: true });
      notifySaveSuccess("Черновик маршрутной карты удалён");
    });
    const updateSelectedEditorRows = (action) => {
      const store = readStore();
      const selectedId = store.selectedId || store.registry[0]?.id || "";
      const registry = store.registry.map((entry) => {
        if (entry.id !== selectedId) return entry;
        const editorRows = entry.editorRows?.length
          ? normalizeSpecifications2EditorRows(entry.editorRows)
          : createSpecifications2EditorRows(entry.treeRows || []);
        editorUi.historyEntryId = entry.id;
        editorUi.historyRows = editorRows.map((row) => ({ ...row }));
        const nextRows = action.type === "remove"
          ? removeSpecifications2EditorBranch(editorRows, action.id)
          : applySpecifications2EditorAction(editorRows, action);
        return {
          ...entry,
          editorRows: nextRows,
          editedAt: new Date().toISOString(),
          selectedComponentKey: action.focusId ? `edit:${action.focusId}` : entry.selectedComponentKey,
        };
      });
      writeStore({ ...store, registry, selectedId });
      editorUi.draft = null;
      editorUi.menuRowId = "";
      editorUi.confirmRemoveId = "";
      render({ skipRememberScroll: true });
      if (action.type === "remove") notifySaveSuccess("Ветка спецификации удалена");
    };
    document.querySelector("[data-specifications2-editor-undo]")?.addEventListener("click", () => {
      const store = readStore();
      const selectedId = store.selectedId || store.registry[0]?.id || "";
      if (editorUi.historyEntryId !== selectedId || !Array.isArray(editorUi.historyRows)) return;
      const registry = store.registry.map((entry) => entry.id === selectedId
        ? { ...entry, editorRows: editorUi.historyRows.map((row) => ({ ...row })), editedAt: new Date().toISOString() }
        : entry);
      editorUi.historyRows = null;
      writeStore({ ...store, registry, selectedId });
      render({ skipRememberScroll: true });
      notifySaveSuccess("Последнее изменение структуры отменено");
    });
    document.querySelector("[data-specifications2-editor-reset]")?.addEventListener("click", () => {
      if (!editorUi.confirmReset) {
        editorUi.confirmReset = true;
        editorUi.confirmRemoveId = "";
        render({ skipRememberScroll: true });
        return;
      }
      const store = readStore();
      const selectedId = store.selectedId || store.registry[0]?.id || "";
      const registry = store.registry.map((entry) => {
        if (entry.id !== selectedId) return entry;
        const restored = { ...entry };
        delete restored.editorRows;
        delete restored.editedAt;
        restored.selectedComponentKey = "";
        return restored;
      });
      editorUi.draft = null;
      editorUi.confirmReset = false;
      editorUi.historyEntryId = "";
      editorUi.historyRows = null;
      editorUi.menuRowId = "";
      writeStore({ ...store, registry, selectedId });
      render({ skipRememberScroll: true });
      notifySaveSuccess("Структура восстановлена из исходного XLSX");
    });
    const getEditorValue = (rowId) => {
      const entry = getSelectedEntry();
      const rows = entry?.editorRows?.length
        ? normalizeSpecifications2EditorRows(entry.editorRows)
        : createSpecifications2EditorRows(entry?.treeRows || []);
      return rows.find((row) => row.id === rowId) || null;
    };
    const openEditor = (mode, anchorId) => {
      const current = getEditorValue(anchorId);
      editorUi.menuRowId = "";
      editorUi.draft = {
        mode,
        anchorId,
        value: mode === "edit" ? current : {
          label: "",
          designation: "",
          type: "Компонент",
          quantity: "1",
          unitOfMeasure: "шт.",
        },
      };
      render({ skipRememberScroll: true });
      queueMicrotask(() => document.querySelector("[data-specifications2-editor-form] input[name='label']")?.focus());
    };
    document.querySelectorAll("[data-specifications2-add-child]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openEditor("child", button.dataset.specifications2AddChild || "");
      });
    });
    document.querySelectorAll("[data-specifications2-edit-row]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openEditor("edit", button.dataset.specifications2EditRow || "");
      });
    });
    document.querySelectorAll("[data-specifications2-row-menu]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const rowId = button.dataset.specifications2RowMenu || "";
        editorUi.draft = null;
        editorUi.menuRowId = editorUi.menuRowId === rowId ? "" : rowId;
        render({ skipRememberScroll: true });
        queueMicrotask(positionSpecifications2RowMenu);
      });
    });
    document.querySelectorAll("[data-specifications2-add-sibling]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openEditor("sibling", button.dataset.specifications2AddSibling || "");
      });
    });
    document.querySelectorAll("[data-specifications2-move]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        updateSelectedEditorRows({
          type: button.dataset.specifications2Move || "",
          id: button.dataset.specifications2RowId || "",
          focusId: button.dataset.specifications2RowId || "",
        });
      });
    });
    document.querySelectorAll("[data-specifications2-remove-row]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const id = button.dataset.specifications2RemoveRow || "";
        if (!id) return;
        editorUi.confirmRemoveId = id;
        editorUi.confirmReset = false;
        render({ skipRememberScroll: true });
        queueMicrotask(positionSpecifications2RowMenu);
      });
    });
    document.querySelectorAll("[data-specifications2-confirm-remove-row]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const id = button.dataset.specifications2ConfirmRemoveRow || "";
        if (!id || editorUi.confirmRemoveId !== id) return;
        updateSelectedEditorRows({ type: "remove", id });
      });
    });
    document.querySelector("[data-specifications2-editor-cancel]")?.addEventListener("click", () => {
      editorUi.draft = null;
      render({ skipRememberScroll: true });
    });
    document.querySelector("[data-specifications2-editor-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const draft = editorUi.draft;
      if (!draft) return;
      const value = {
        label: String(form.get("label") || "").trim(),
        designation: String(form.get("designation") || "").trim(),
        type: String(form.get("type") || "").trim(),
        quantity: String(form.get("quantity") || "").trim(),
        unitOfMeasure: String(form.get("unitOfMeasure") || "").trim(),
      };
      if (!value.label || !value.type) return;
      updateSelectedEditorRows({
        type: draft.mode === "edit" ? "update" : "add",
        mode: draft.mode,
        id: draft.anchorId,
        value,
      });
      notifySaveSuccess(draft.mode === "edit" ? "Элемент спецификации изменён" : "Элемент спецификации добавлен");
    });
    let draggedSpecifications2RowId = "";
    document.querySelectorAll("[data-specifications2-tree-row]").forEach((row) => {
      row.addEventListener("dragstart", (event) => {
        draggedSpecifications2RowId = row.dataset.specifications2TreeRow || "";
        row.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", draggedSpecifications2RowId);
      });
      row.addEventListener("dragover", (event) => {
        if (!draggedSpecifications2RowId || draggedSpecifications2RowId === row.dataset.specifications2TreeRow) return;
        event.preventDefault();
        row.classList.add("is-drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("is-drop-target");
        const targetId = row.dataset.specifications2TreeRow || "";
        if (draggedSpecifications2RowId && targetId && draggedSpecifications2RowId !== targetId) {
          updateSelectedEditorRows({ type: "reparent", id: draggedSpecifications2RowId, parentId: targetId, focusId: draggedSpecifications2RowId });
        }
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("is-dragging");
        document.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
        draggedSpecifications2RowId = "";
      });
    });
    const setTreeExpanded = (treeKey, expanded, focusKey = treeKey) => {
      if (!treeKey) return;
      const store = readStore();
      const selectedId = store.selectedId || store.registry[0]?.id || "";
      const registry = store.registry.map((entry) => {
        if (entry.id !== selectedId) return entry;
        const collapsed = new Set((entry.collapsedTreeKeys || []).map(String));
        if (expanded) collapsed.delete(treeKey);
        else collapsed.add(treeKey);
        return { ...entry, collapsedTreeKeys: [...collapsed] };
      });
      writeStore({ ...store, registry, selectedId });
      render({ skipRememberScroll: true });
      queueMicrotask(() => {
        [...document.querySelectorAll("[data-specifications2-tree-row]")]
          .find((row) => row.dataset.specifications2TreeRow === focusKey)?.focus();
      });
    };
    document.querySelectorAll("[data-specifications2-tree-toggle]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const treeKey = button.dataset.specifications2TreeToggle || "";
        setTreeExpanded(treeKey, button.getAttribute("aria-expanded") !== "true");
      });
    });
    document.querySelectorAll("[data-specifications2-tree-row]").forEach((row) => {
      row.addEventListener("keydown", (event) => {
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        const visibleRows = [...document.querySelectorAll("[data-specifications2-tree-row]")];
        const index = visibleRows.indexOf(row);
        const rowId = row.dataset.specifications2TreeRow || "";
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          visibleRows[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
          return;
        }
        if (event.key === "ArrowRight") {
          if (row.getAttribute("aria-expanded") === "false") {
            event.preventDefault();
            setTreeExpanded(rowId, true);
            return;
          }
          const firstChild = visibleRows.find((candidate) => candidate.dataset.specifications2TreeParent === rowId);
          if (firstChild) {
            event.preventDefault();
            firstChild.focus();
          }
          return;
        }
        if (row.getAttribute("aria-expanded") === "true") {
          event.preventDefault();
          setTreeExpanded(rowId, false);
          return;
        }
        const parentId = row.dataset.specifications2TreeParent || "";
        const parent = visibleRows.find((candidate) => candidate.dataset.specifications2TreeRow === parentId);
        if (parent) {
          event.preventDefault();
          parent.focus();
        }
      });
    });
    document.querySelectorAll("[data-specifications2-component]").forEach((element) => {
      const selectComponent = () => {
        const selectionKey = element.dataset.specifications2Component || "";
        if (!selectionKey) return;
        const store = readStore();
        const selectedId = store.selectedId || store.registry[0]?.id || "";
        const registry = store.registry.map((entry) => (
          entry.id === selectedId ? { ...entry, selectedComponentKey: selectionKey } : entry
        ));
        writeStore({ ...store, registry, selectedId });
        render({ skipRememberScroll: true });
      };
      element.addEventListener("click", selectComponent);
      element.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectComponent();
      });
    });
    document.querySelector("[data-specifications2-delete]")?.addEventListener("click", (event) => {
      const id = event.currentTarget.dataset.specifications2Delete || "";
      const store = readStore();
      writeStore({ registry: store.registry.filter((item) => item.id !== id), selectedId: "" });
      notifySaveSuccess("Импорт Спецификации 2.0 удален из песочницы");
      render({ skipRememberScroll: true });
    });
    if (SPECIFICATIONS2_RKD_DRAFT_ENABLED) {
      document.querySelector("[data-specifications2-rkd-draft]")?.addEventListener("click", async (event) => {
        const id = event.currentTarget.dataset.specifications2RkdDraft || "";
        const entry = readStore().registry.find((item) => item.id === id);
        if (!entry) return;
        const fileName = await runLongTask(
          () => downloadSpecifications2RkdDraft(entry),
          {
            title: "Формируем черновик РКД",
            detail: "Собираем структуру документа и подготавливаем файл Word",
          },
        );
        notifySaveSuccess(`Черновик РКД сформирован: ${fileName}`);
      });
    }
  }

  async function importSpecifications2File(file) {
    const workbook = await readWorkbookFromXlsx(file);
    const analysis = analyzeSpecifications2Workbook(workbook);
    return {
      id: `spec2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      fileName: file.name,
      importedAt: new Date().toISOString(),
      title: analysis.title,
      workbookMeta: {
        sheets: workbook.sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.length, formulas: sheet.formulas.length })),
      },
      ...analysis,
    };
  }

  return {
    bindSpecifications2Events,
    renderSpecifications2Page,
  };
}

export function createSpecifications2EditorRows(treeRows = []) {
  const visualRows = buildTreeTableVisualRows(treeRows || []);
  return visualRows.map((row, index) => ({
    id: String(row.treeVisualState?.id || row.selectionKey || row.nodeKey || `editor-row-${index + 1}`),
    parentId: String(row.treeVisualState?.parentId || ""),
    order: index,
    label: cleanText(row.label),
    designation: cleanText(row.designation),
    type: cleanText(row.type || "Компонент"),
    quantity: row.quantity ?? "",
    unitOfMeasure: cleanText(row.unitOfMeasure),
    source: cleanText(row.source),
    status: cleanText(row.status || "ok"),
    message: cleanText(row.message),
  }));
}

export function normalizeSpecifications2EditorRows(rows = []) {
  const normalized = (Array.isArray(rows) ? rows : []).filter(Boolean).map((row, index) => ({
    id: cleanText(row.id) || `editor-row-${index + 1}`,
    parentId: cleanText(row.parentId),
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
    label: cleanText(row.label),
    designation: cleanText(row.designation),
    type: cleanText(row.type || "Компонент"),
    quantity: row.quantity ?? "",
    unitOfMeasure: cleanText(row.unitOfMeasure),
    source: cleanText(row.source),
    status: cleanText(row.status || "ok"),
    message: cleanText(row.message),
  }));
  const ids = new Set(normalized.map((row) => row.id));
  const seen = new Set();
  return normalized.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    if (row.parentId && !ids.has(row.parentId)) row.parentId = "";
    return true;
  });
}

export function applySpecifications2EditorAction(sourceRows = [], action = {}) {
  const rows = normalizeSpecifications2EditorRows(sourceRows).map((row) => ({ ...row }));
  const indexById = new Map(rows.map((row, index) => [row.id, index]));
  const row = rows[indexById.get(String(action.id || ""))];
  const rootId = rows.find((item) => !item.parentId)?.id || "";
  const childrenOf = (parentId) => rows
    .filter((item) => item.parentId === parentId)
    .sort((left, right) => left.order - right.order || rows.indexOf(left) - rows.indexOf(right));
  const descendantsOf = (id) => {
    const found = [];
    const visit = (parentId) => childrenOf(parentId).forEach((child) => {
      if (found.includes(child.id)) return;
      found.push(child.id);
      visit(child.id);
    });
    visit(id);
    return found;
  };
  const resequence = (parentId) => childrenOf(parentId).forEach((item, index) => { item.order = index; });

  if (action.type === "update" && row) {
    Object.assign(row, sanitizeSpecifications2EditorValue(action.value, row));
  }

  if (action.type === "add" && row) {
    const parentId = action.mode === "sibling" ? row.parentId : row.id;
    const siblings = childrenOf(parentId);
    const value = sanitizeSpecifications2EditorValue(action.value, {});
    const id = cleanText(action.newId) || `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    rows.push({
      id,
      parentId,
      order: action.mode === "sibling" ? row.order + 1 : siblings.length,
      ...value,
      source: parentId ? rows.find((item) => item.id === parentId)?.label || "Добавлено вручную" : "Добавлено вручную",
      status: "ok",
      message: "",
    });
    if (action.mode === "sibling") {
      siblings.filter((item) => item.id !== row.id && item.order > row.order).forEach((item) => { item.order += 1; });
    }
    resequence(parentId);
  }

  if ((action.type === "up" || action.type === "down") && row) {
    const siblings = childrenOf(row.parentId);
    const index = siblings.findIndex((item) => item.id === row.id);
    const target = siblings[index + (action.type === "up" ? -1 : 1)];
    if (target) [row.order, target.order] = [target.order, row.order];
    resequence(row.parentId);
  }

  if (action.type === "indent" && row && row.id !== rootId) {
    const siblings = childrenOf(row.parentId);
    const index = siblings.findIndex((item) => item.id === row.id);
    const previous = siblings[index - 1];
    if (previous) {
      const oldParentId = row.parentId;
      row.parentId = previous.id;
      row.order = childrenOf(previous.id).length;
      resequence(oldParentId);
      resequence(previous.id);
    }
  }

  if (action.type === "outdent" && row && row.id !== rootId && row.parentId) {
    const parent = rows.find((item) => item.id === row.parentId);
    if (parent) {
      const oldParentId = row.parentId;
      const nextParentId = parent.parentId;
      row.parentId = nextParentId;
      row.order = parent.order + 1;
      childrenOf(nextParentId).filter((item) => item.id !== row.id && item.order > parent.order).forEach((item) => { item.order += 1; });
      resequence(oldParentId);
      resequence(nextParentId);
    }
  }

  if (action.type === "reparent" && row && row.id !== rootId) {
    const parentId = cleanText(action.parentId);
    const forbidden = new Set([row.id, ...descendantsOf(row.id)]);
    if (indexById.has(parentId) && !forbidden.has(parentId)) {
      const oldParentId = row.parentId;
      row.parentId = parentId;
      row.order = childrenOf(parentId).length;
      resequence(oldParentId);
      resequence(parentId);
    }
  }

  if (action.type === "remove" && row && row.id !== rootId) {
    const removeIds = new Set([row.id, ...descendantsOf(row.id)]);
    const parentId = row.parentId;
    const kept = rows.filter((item) => !removeIds.has(item.id));
    const normalizedKept = normalizeSpecifications2EditorRows(kept);
    normalizedKept.filter((item) => item.parentId === parentId)
      .sort((left, right) => left.order - right.order)
      .forEach((item, index) => { item.order = index; });
    return normalizedKept;
  }

  return normalizeSpecifications2EditorRows(rows);
}

export function removeSpecifications2EditorBranch(sourceRows = [], rowId = "") {
  const rows = normalizeSpecifications2EditorRows(sourceRows).map((row) => ({ ...row }));
  const id = cleanText(rowId).replace(/::\d+$/, "");
  const row = rows.find((item) => item.id === id);
  const rootId = rows.find((item) => !item.parentId)?.id || "";
  if (!row || row.id === rootId) return rows;

  const removeIds = new Set([row.id]);
  let changed = true;
  while (changed) {
    changed = false;
    rows.forEach((item) => {
      if (!removeIds.has(item.id) && removeIds.has(item.parentId)) {
        removeIds.add(item.id);
        changed = true;
      }
    });
  }

  const kept = rows.filter((item) => !removeIds.has(item.id));
  const siblings = kept
    .filter((item) => item.parentId === row.parentId)
    .sort((left, right) => left.order - right.order);
  siblings.forEach((item, index) => { item.order = index; });
  return normalizeSpecifications2EditorRows(kept);
}

function sanitizeSpecifications2EditorValue(value = {}, fallback = {}) {
  return {
    label: cleanText(value.label ?? fallback.label),
    designation: cleanText(value.designation ?? fallback.designation),
    type: cleanText(value.type ?? fallback.type ?? "Компонент"),
    quantity: value.quantity ?? fallback.quantity ?? "",
    unitOfMeasure: cleanText(value.unitOfMeasure ?? fallback.unitOfMeasure),
  };
}

export function buildSpecifications2EditorAnalysis(sourceRows = []) {
  const rows = normalizeSpecifications2EditorRows(sourceRows);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map();
  rows.forEach((row) => {
    const list = children.get(row.parentId) || [];
    list.push(row);
    children.set(row.parentId, list);
  });
  children.forEach((list) => list.sort((left, right) => left.order - right.order));
  const flat = [];
  const visited = new Set();
  const append = (row, level, path = new Set()) => {
    if (!row || visited.has(row.id) || path.has(row.id)) return;
    visited.add(row.id);
    const nextPath = new Set(path);
    nextPath.add(row.id);
    const parent = byId.get(row.parentId);
    flat.push({
      id: row.id,
      selectionKey: `edit:${row.id}`,
      nodeKey: row.id,
      parentKey: row.parentId,
      level,
      levelLabel: level === 0 ? "изделие" : "позиция",
      label: row.label,
      designation: row.designation,
      type: row.type,
      quantity: row.quantity,
      unitOfMeasure: row.unitOfMeasure,
      source: parent?.label || row.source || (level === 0 ? "верхний уровень" : "Редактор"),
      status: row.label && row.type ? "ok" : "error",
      message: row.label && row.type ? "" : "Заполните наименование и тип",
    });
    (children.get(row.id) || []).forEach((child) => append(child, level + 1, nextPath));
  };
  (children.get("") || []).forEach((root) => append(root, 0));
  rows.filter((row) => !visited.has(row.id)).forEach((row) => append(row, 0));

  const graphNodes = flat.map((row) => ({
    selectionKey: row.selectionKey,
    nodeKey: row.nodeKey,
    parentKey: row.parentKey,
    parentLabel: byId.get(row.parentKey)?.label || "",
    diagramRow: 1,
    label: row.label,
    type: row.type,
    meta: row.designation || row.source,
    quantity: row.quantity,
    unitOfMeasure: row.unitOfMeasure,
    source: row.source,
    status: row.status,
  }));
  const graphEdges = flat.filter((row) => row.parentKey).map((row) => ({
    edgeKey: `${row.parentKey}->${row.nodeKey}`,
    from: row.parentKey,
    to: row.nodeKey,
    row: "",
    type: row.type,
  }));
  const maxLevel = Math.max(0, ...flat.map((row) => Number(row.level || 0)));
  const diagramLevels = Array.from({ length: maxLevel + 1 }, (_, level) => ({
    label: level === 0 ? "Корень" : `Уровень ${level}`,
    nodes: graphNodes.filter((node) => flat.find((row) => row.nodeKey === node.nodeKey)?.level === level),
  }));
  const errors = flat.filter((row) => row.status === "error").map((row) => ({
    severity: "error",
    title: "Неполные данные редактора",
    message: `Проверьте элемент «${row.label || "Без названия"}».`,
    row: "",
  }));
  return {
    title: flat[0]?.label || "Спецификация",
    treeRows: flat,
    graphNodes,
    graphEdges,
    diagramLevels,
    errors,
    stats: {
      rows: flat.length,
      sections: Math.max(1, flat.filter((row) => isAssemblyType(row.type)).length),
      nodes: graphNodes.length,
      edges: graphEdges.length,
      types: new Set(flat.map((row) => row.type)).size,
      typeList: [...new Set(flat.map((row) => row.type))].slice(0, 4).join(", "),
      assemblyWarnings: errors.length,
    },
  };
}

export function getSpecifications2ManufacturedItems(treeRows = []) {
  const seen = new Set();
  return (Array.isArray(treeRows) ? treeRows : []).flatMap((row) => {
    const designation = cleanText(row.designation) || extractDesignation(row.label);
    if (!designation) return [];
    const key = cleanText(row.nodeKey || row.id || row.selectionKey || designation);
    const uniqueKey = normalizeKey(designation);
    if (seen.has(uniqueKey)) return [];
    seen.add(uniqueKey);
    return [{
      key,
      label: getSpecifications2DisplayLabel(row.label, designation) || designation,
      designation,
      type: cleanText(row.type || "Изделие"),
    }];
  });
}

export function normalizeSpecifications2RouteDrafts(drafts = []) {
  return (Array.isArray(drafts) ? drafts : []).filter(Boolean).map((draft, draftIndex) => ({
    id: cleanText(draft.id) || `route-draft-${draftIndex + 1}`,
    productKey: cleanText(draft.productKey),
    productLabel: cleanText(draft.productLabel),
    designation: cleanText(draft.designation),
    status: draft.status === "ready-for-norming" ? "ready-for-norming" : "draft",
    createdAt: cleanText(draft.createdAt),
    updatedAt: cleanText(draft.updatedAt),
    operations: (Array.isArray(draft.operations) ? draft.operations : []).filter(Boolean).map((operation, operationIndex) => ({
      id: cleanText(operation.id) || `operation-${operationIndex + 1}`,
      order: Number.isFinite(Number(operation.order)) ? Number(operation.order) : operationIndex,
      operationId: cleanText(operation.operationId),
      name: cleanText(operation.name),
      workCenterId: cleanText(operation.workCenterId),
      workCenter: cleanText(operation.workCenter),
      nextWorkCenterId: cleanText(operation.nextWorkCenterId),
      nextWorkCenter: cleanText(operation.nextWorkCenter),
      nextOperationId: cleanText(operation.nextOperationId),
      nextOperation: cleanText(operation.nextOperation),
      instructionRequired: operation.instructionRequired === true,
      changesProperty: normalizeSpecifications2ChangesProperty(operation.changesProperty),
      inputState: cleanText(operation.inputState),
      outputState: cleanText(operation.outputState),
      comment: cleanText(operation.comment),
      productionFiles: normalizeSpecifications2ProductionFiles(operation.productionFiles),
      laborNorm: normalizeSpecifications2LaborNorm(operation.laborNorm),
    })).sort((left, right) => left.order - right.order).map((operation, index) => ({ ...operation, order: index })),
  }));
}

export function createSpecifications2RouteDraft(item, options = {}) {
  const now = options.now || new Date().toISOString();
  return {
    id: cleanText(options.id) || `route-draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    productKey: cleanText(item?.key),
    productLabel: cleanText(item?.label),
    designation: cleanText(item?.designation),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    operations: [],
  };
}

export function applySpecifications2RouteDraftAction(sourceDraft, action = {}) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0];
  if (!draft) return null;
  const operations = draft.operations.map((operation) => ({ ...operation }));
  const index = operations.findIndex((operation) => operation.id === action.operationId);
  const now = action.now || new Date().toISOString();
  if (action.type === "add") {
    const value = sanitizeSpecifications2RouteOperation(action.value);
    operations.push({
      id: cleanText(action.newId) || `operation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      order: operations.length,
      ...value,
    });
  }
  if (action.type === "update" && index >= 0) {
    operations[index] = { ...operations[index], ...sanitizeSpecifications2RouteOperation(action.value) };
  }
  if (action.type === "remove" && index >= 0) operations.splice(index, 1);
  if ((action.type === "up" || action.type === "down") && index >= 0) {
    const targetIndex = index + (action.type === "up" ? -1 : 1);
    if (operations[targetIndex]) [operations[index], operations[targetIndex]] = [operations[targetIndex], operations[index]];
  }
  const normalizedOperations = operations.map((operation, operationIndex) => {
    const previousOperation = operationIndex > 0 ? operations[operationIndex - 1] : null;
    return {
      ...operation,
      ...(previousOperation?.nextWorkCenterId ? {
        workCenterId: previousOperation.nextWorkCenterId,
        workCenter: previousOperation.nextWorkCenter,
        operationId: previousOperation.nextOperationId,
        name: previousOperation.nextOperation,
      } : {}),
      order: operationIndex,
    };
  });
  const next = { ...draft, operations: normalizedOperations, updatedAt: now };
  if (action.type === "toggle-ready") {
    const readiness = inspectSpecifications2RouteDraft(next);
    next.status = next.status === "ready-for-norming" ? "draft" : readiness.ready ? "ready-for-norming" : "draft";
  } else if (draft.status === "ready-for-norming") {
    next.status = "draft";
  }
  return next;
}

function sanitizeSpecifications2RouteOperation(value = {}) {
  const sanitized = {
    operationId: cleanText(value.operationId),
    name: cleanText(value.name),
    workCenterId: cleanText(value.workCenterId),
    workCenter: cleanText(value.workCenter),
    nextWorkCenterId: cleanText(value.nextWorkCenterId),
    nextWorkCenter: cleanText(value.nextWorkCenter),
    nextOperationId: cleanText(value.nextOperationId),
    nextOperation: cleanText(value.nextOperation),
    instructionRequired: value.instructionRequired === true,
    changesProperty: normalizeSpecifications2ChangesProperty(value.changesProperty),
    inputState: cleanText(value.inputState),
    outputState: cleanText(value.outputState),
    comment: cleanText(value.comment),
  };
  if (Object.prototype.hasOwnProperty.call(value, "productionFiles")) {
    sanitized.productionFiles = normalizeSpecifications2ProductionFiles(value.productionFiles);
  }
  if (Object.prototype.hasOwnProperty.call(value, "laborNorm")) {
    sanitized.laborNorm = normalizeSpecifications2LaborNorm(value.laborNorm);
  }
  return sanitized;
}

function normalizeSpecifications2LaborNormValues(value = {}) {
  const nonNegative = (input) => {
    const number = Number(String(input ?? "").replace(",", "."));
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
  };
  const legacyUnitMinutes = nonNegative(value.unitMinutes);
  const unitsPerHour = nonNegative(value.unitsPerHour) || (legacyUnitMinutes > 0 ? nonNegative(60 / legacyUnitMinutes) : 0);
  return {
    calculationMode: value.calculationMode === "fixed" ? "fixed" : "rate",
    setupMinutes: nonNegative(value.setupMinutes),
    unitsPerHour,
    fixedMinutes: nonNegative(value.fixedMinutes),
  };
}

function normalizeSpecifications2LaborRevision(value = {}, index = 0) {
  const values = normalizeSpecifications2LaborNormValues(value);
  const effectiveFrom = cleanText(value.effectiveFrom).slice(0, 10);
  const effectiveTo = cleanText(value.effectiveTo).slice(0, 10);
  return {
    id: cleanText(value.id) || `labor-revision-${index + 1}`,
    number: Math.max(1, Math.floor(Number(value.number) || index + 1)),
    ...values,
    effectiveFrom,
    effectiveTo,
    reason: cleanText(value.reason),
    source: cleanText(value.source) || "manual",
    createdAt: cleanText(value.createdAt),
  };
}

function getSpecifications2LaborRevisionAt(revisions = [], referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate || Date.now());
  const dateKey = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  return [...revisions]
    .filter((revision) => (!revision.effectiveFrom || revision.effectiveFrom <= dateKey) && (!revision.effectiveTo || revision.effectiveTo >= dateKey))
    .sort((left, right) => String(right.effectiveFrom).localeCompare(String(left.effectiveFrom)) || right.number - left.number)[0]
    || [...revisions].sort((left, right) => right.number - left.number)[0]
    || null;
}

export function normalizeSpecifications2LaborNorm(value = {}) {
  const legacyValues = normalizeSpecifications2LaborNormValues(value);
  let revisions = Array.isArray(value.revisions)
    ? value.revisions.filter(Boolean).map(normalizeSpecifications2LaborRevision)
    : [];
  const legacyComplete = legacyValues.calculationMode === "fixed" ? legacyValues.fixedMinutes > 0 : legacyValues.unitsPerHour > 0;
  if (!revisions.length && legacyComplete) {
    revisions = [normalizeSpecifications2LaborRevision({
      ...legacyValues,
      id: cleanText(value.revisionId) || "labor-revision-1",
      number: 1,
      effectiveFrom: cleanText(value.effectiveFrom) || cleanText(value.createdAt).slice(0, 10) || new Date().toISOString().slice(0, 10),
      reason: cleanText(value.reason) || "Первичная плановая норма",
      source: cleanText(value.source) || "legacy",
      createdAt: cleanText(value.createdAt),
    }, 0)];
  }
  revisions = revisions
    .sort((left, right) => String(left.effectiveFrom).localeCompare(String(right.effectiveFrom)) || left.number - right.number)
    .map((revision, index, list) => ({
      ...revision,
      number: index + 1,
      effectiveTo: list[index + 1]?.effectiveFrom ? shiftSpecifications2IsoDate(list[index + 1].effectiveFrom, -1) : "",
    }));
  const activeRevision = getSpecifications2LaborRevisionAt(revisions);
  return {
    ...(activeRevision || legacyValues),
    revisions,
    activeRevisionId: activeRevision?.id || "",
  };
}

export function getSpecifications2LaborNormAt(value = {}, referenceDate = new Date()) {
  const normalized = normalizeSpecifications2LaborNorm(value);
  const revision = getSpecifications2LaborRevisionAt(normalized.revisions, referenceDate);
  return revision ? { ...revision, revisions: normalized.revisions, activeRevisionId: revision.id } : normalized;
}

export function isSpecifications2LaborNormComplete(value = {}) {
  const norm = normalizeSpecifications2LaborNorm(value);
  return norm.calculationMode === "fixed" ? norm.fixedMinutes > 0 : norm.unitsPerHour > 0;
}

export function calculateSpecifications2LaborOperation(value = {}, quantity = 1) {
  const norm = normalizeSpecifications2LaborNorm(value);
  const units = Math.max(1, Math.floor(Number(quantity) || 1));
  const productionMinutes = norm.unitsPerHour > 0 ? (60 * units) / norm.unitsPerHour : 0;
  const laborMinutes = norm.calculationMode === "fixed" ? norm.fixedMinutes : norm.setupMinutes + productionMinutes;
  const durationMinutes = laborMinutes;
  return {
    laborMinutes: Math.round(laborMinutes * 100) / 100,
    durationMinutes: Math.round(durationMinutes * 100) / 100,
  };
}

export function calculateSpecifications2LaborPlan(sourceDraft = {}, quantity = 1) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0] || { operations: [] };
  return draft.operations.reduce((result, operation) => {
    if (!isSpecifications2LaborNormComplete(operation.laborNorm)) return result;
    const calculation = calculateSpecifications2LaborOperation(operation.laborNorm, quantity);
    result.completedOperations += 1;
    result.laborMinutes += calculation.laborMinutes;
    result.durationMinutes += calculation.durationMinutes;
    return result;
  }, { completedOperations: 0, laborMinutes: 0, durationMinutes: 0 });
}

export function applySpecifications2LaborNorm(sourceDraft = {}, operationId = "", value = {}) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0];
  if (!draft) return null;
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    operations: draft.operations.map((operation) => operation.id === operationId
      ? { ...operation, laborNorm: normalizeSpecifications2LaborNorm(value) }
      : operation),
  };
}

export function applySpecifications2LaborNormRevision(sourceDraft = {}, operationId = "", value = {}, metadata = {}) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0];
  if (!draft) return null;
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    operations: draft.operations.map((operation) => {
      if (operation.id !== operationId) return operation;
      const current = normalizeSpecifications2LaborNorm(operation.laborNorm);
      const revision = normalizeSpecifications2LaborRevision({
        ...value,
        id: cleanText(metadata.id) || `labor-revision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        number: current.revisions.length + 1,
        effectiveFrom: cleanText(metadata.effectiveFrom) || new Date().toISOString().slice(0, 10),
        reason: cleanText(metadata.reason) || (current.revisions.length ? "Изменение нормы" : "Первичная плановая норма"),
        source: cleanText(metadata.source) || "manual",
        createdAt: cleanText(metadata.createdAt) || new Date().toISOString(),
      }, current.revisions.length);
      return { ...operation, laborNorm: normalizeSpecifications2LaborNorm({ revisions: [...current.revisions, revision] }) };
    }),
  };
}

export function generateSpecifications2ProductionStages(sourceDraft = {}, catalog = {}) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0];
  if (!draft || draft.operations.length) return draft;
  const operations = (Array.isArray(catalog.operations) ? catalog.operations : []).filter((item) => item?.id && item?.name);
  const departments = (Array.isArray(catalog.departments) ? catalog.departments : []).filter((item) => item?.id && item?.name);
  const operationById = new Map(operations.map((operation) => [operation.id, operation]));
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const product = cleanText(`${draft.productLabel} ${draft.designation}`).toLowerCase();
  let sequence = ["D1_OP3", "D9_OP1", "D4_OP2", "D1_OP2"];
  if (product.includes("пластин") || product.includes("проклад") || product.includes("крюк") || product.includes("простав")) {
    sequence = ["D1_OP3", "D9_OP1", "D4_OP2", "D1_OP2"];
  } else if (product.includes("кабел")) {
    sequence = ["D1_OP3", "D5_OP1", "D4_OP2", "D1_OP2"];
  } else if (product.includes("плат")) {
    sequence = ["D1_OP3", "D3_L1_OP", "D3_AOI_OP", "D3_UW_OP", "D5_OP1", "D6_OP1", "D4_OP2", "D1_OP2"];
  }
  const resolved = sequence.map((id) => operationById.get(id)).filter(Boolean);
  if (resolved.length < 2) return draft;
  const stateByOperationId = {
    D3_L1_OP: ["Печатная плата и комплектующие", "Смонтированная печатная плата"],
    D3_UW_OP: ["Смонтированная печатная плата", "Отмытая печатная плата"],
    D5_OP1: [product.includes("кабел") ? "Комплект кабеля" : "Изделие после предыдущего этапа", product.includes("кабел") ? "Собранный кабель" : "Изделие после выводного монтажа"],
    D6_OP1: ["Собранное изделие", "Прошитое изделие"],
    D9_OP1: ["Заготовка", product.includes("пластин") ? "Механически обработанная пластина" : "Механически обработанная деталь"],
  };
  const generatedOperations = resolved.slice(0, -1).map((operation, index) => {
    const nextOperation = resolved[index + 1];
    const states = stateByOperationId[operation.id] || [];
    const changesProperty = states.length === 2;
    return {
      id: `generated-${draft.id}-${index + 1}`,
      order: index,
      operationId: operation.id,
      name: operation.name,
      workCenterId: operation.workCenterId,
      workCenter: departmentById.get(operation.workCenterId)?.name || operation.workCenterId,
      nextWorkCenterId: nextOperation.workCenterId,
      nextWorkCenter: departmentById.get(nextOperation.workCenterId)?.name || nextOperation.workCenterId,
      nextOperationId: nextOperation.id,
      nextOperation: nextOperation.name,
      instructionRequired: false,
      changesProperty,
      inputState: states[0] || "",
      outputState: states[1] || "",
      laborNorm: normalizeSpecifications2LaborNorm(),
    };
  });
  return {
    ...draft,
    status: "draft",
    updatedAt: new Date().toISOString(),
    operations: generatedOperations,
  };
}

function formatSpecifications2LaborHours(minutes = 0) {
  const value = Math.max(0, Number(minutes) || 0);
  if (!value) return "0 ч";
  if (value < 60) return `${Math.round(value * 10) / 10} мин`;
  return `${Math.round((value / 60) * 100) / 100} ч`;
}

export function inspectSpecifications2RouteDraft(sourceDraft = {}) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0] || { operations: [] };
  const operations = draft.operations || [];
  const checks = [
    { label: "Добавлена хотя бы одна операция", ok: operations.length > 0 },
    { label: "Операции выбраны из справочника", ok: operations.length > 0 && operations.every((item) => item.operationId && item.name) },
    { label: "У каждой операции указан отдел", ok: operations.length > 0 && operations.every((item) => item.workCenterId && item.workCenter) },
    { label: "Указано направление после операции", ok: operations.length > 0 && operations.every((item) => item.nextWorkCenterId && item.nextWorkCenter && item.nextOperationId && item.nextOperation) },
    { label: "Определён сценарий каждой операции", ok: operations.length > 0 && operations.every((item) => item.changesProperty === false || (item.inputState && item.outputState)) },
  ];
  const completed = checks.filter((check) => check.ok).length;
  return { checks, completed, total: checks.length, ready: completed === checks.length };
}

export function getSpecifications2InstructionDebtCount(sourceDrafts = []) {
  const drafts = Array.isArray(sourceDrafts) ? sourceDrafts : [sourceDrafts];
  return drafts.filter(Boolean).reduce((total, draft) => total + (Array.isArray(draft.operations) ? draft.operations : [])
    .filter((operation) => operation?.instructionRequired === true).length, 0);
}

function getSpecifications2RouteDraftStatusLabel(draft) {
  if (draft.status !== "ready-for-norming") return "Черновик";
  const operations = Array.isArray(draft.operations) ? draft.operations : [];
  const normalizedCount = operations.filter((operation) => isSpecifications2LaborNormComplete(operation.laborNorm)).length;
  if (operations.length && normalizedCount === operations.length) return "Нормирование завершено";
  if (normalizedCount > 0) return "На нормировании";
  return "Готова к нормированию";
}

async function readWorkbookFromXlsx(file) {
  const archive = await readZipEntries(await file.arrayBuffer());
  const workbookXml = textEntry(archive, "xl/workbook.xml");
  const workbookRelsXml = textEntry(archive, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !workbookRelsXml) {
    throw new Error("в файле не найден workbook.xml");
  }

  const sharedStrings = parseSharedStrings(textEntry(archive, "xl/sharedStrings.xml"));
  const sheetDefs = parseWorkbookSheets(workbookXml, workbookRelsXml);
  const sheets = sheetDefs.map((sheetDef) => {
    const xml = textEntry(archive, sheetDef.path);
    return parseWorksheet(sheetDef.name, xml, sharedStrings);
  }).filter((sheet) => sheet.rows.length);

  if (!sheets.length) throw new Error("в XLSX нет листов со строками");
  return { sheets };
}

async function readZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) throw new Error("файл не похож на XLSX/ZIP");
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decodeText(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const data = compressionMethod === 0
      ? compressed
      : compressionMethod === 8
        ? new Uint8Array(await inflateRaw(compressed))
        : null;
    if (!data) throw new Error(`XLSX содержит неподдерживаемое сжатие: ${compressionMethod}`);
    entries.set(name.replace(/^\/+/, ""), data);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(view) {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("браузер не поддерживает распаковку XLSX");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).arrayBuffer();
}

function textEntry(archive, path) {
  const bytes = archive.get(path.replace(/^\/+/, ""));
  return bytes ? decodeText(bytes) : "";
}

function decodeText(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function parseXml(source) {
  if (!source) return null;
  return new DOMParser().parseFromString(source, "application/xml");
}

function parseWorkbookSheets(workbookXml, relsXml) {
  const workbook = parseXml(workbookXml);
  const rels = parseXml(relsXml);
  const relMap = new Map([...rels.querySelectorAll("Relationship")].map((rel) => [
    rel.getAttribute("Id"),
    normalizeWorkbookTarget(rel.getAttribute("Target") || ""),
  ]));
  return [...workbook.querySelectorAll("sheet")].map((sheet) => ({
    name: sheet.getAttribute("name") || "Лист",
    path: relMap.get(sheet.getAttribute("r:id")) || "",
  })).filter((sheet) => sheet.path);
}

function normalizeWorkbookTarget(target) {
  const clean = target.replace(/^\/+/, "");
  if (clean.startsWith("xl/")) return clean;
  return `xl/${clean.replace(/^\.\.\//, "")}`;
}

function parseSharedStrings(sharedStringsXml) {
  const xml = parseXml(sharedStringsXml);
  if (!xml) return [];
  return [...xml.querySelectorAll("si")].map((item) => (
    [...item.querySelectorAll("t")].map((node) => node.textContent || "").join("")
  ));
}

function parseWorksheet(name, worksheetXml, sharedStrings) {
  const xml = parseXml(worksheetXml);
  if (!xml) return { name, rows: [], formulas: [] };
  const formulas = [];
  const rows = [...xml.querySelectorAll("sheetData row")].map((rowNode) => {
    const rowIndex = Number(rowNode.getAttribute("r") || 0);
    const row = {
      index: rowIndex,
      outlineLevel: Number(rowNode.getAttribute("outlineLevel") || 0),
      cells: {},
    };
    [...rowNode.querySelectorAll("c")].forEach((cellNode) => {
      const ref = cellNode.getAttribute("r") || "";
      const key = columnKeyFromCellRef(ref);
      const formula = cellNode.querySelector("f")?.textContent || "";
      const value = parseCellValue(cellNode, sharedStrings);
      if (formula) formulas.push({ ref, formula, value });
      row.cells[key] = { ref, value, formula };
    });
    return row;
  });
  return { name, rows, formulas };
}

function parseCellValue(cellNode, sharedStrings) {
  const type = cellNode.getAttribute("t") || "";
  if (type === "inlineStr") {
    return [...cellNode.querySelectorAll("is t")].map((node) => node.textContent || "").join("");
  }
  const raw = cellNode.querySelector("v")?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (type === "b") return raw === "1";
  if (raw === "") return "";
  const numeric = Number(raw);
  return Number.isFinite(numeric) && /^-?\d+(?:\.\d+)?$/.test(raw) ? numeric : raw;
}

function columnKeyFromCellRef(ref) {
  return String(ref || "").replace(/\d+/g, "");
}

export function analyzeSpecifications2Workbook(workbook) {
  const sheet = workbook.sheets[0];
  const header = detectHeader(sheet.rows);
  if (!header) throw new Error("не найдена строка заголовков шаблона");

  const rows = sheet.rows
    .filter((row) => row.index > header.rowIndex)
    .map((row) => normalizeSpecifications2Row(row, header))
    .filter((row) => row.product || row.unit || row.name);
  if (!rows.length) throw new Error("после заголовка нет строк спецификации");

  return buildSpecifications2Analysis(rows, sheet, header);
}

function detectHeader(rows) {
  for (const row of rows) {
    const columns = {};
    Object.entries(row.cells).forEach(([column, cell]) => {
      const key = resolveSpecifications2HeaderKey(normalizeHeader(cell.value));
      if (key) columns[key] = column;
    });
    const requiredKeys = ["index", "specification", "applicability", "type", "name", "unitOfMeasure", "quantity"];
    if (requiredKeys.every((key) => columns[key])) return { rowIndex: row.index, columns };
  }
  return null;
}

function resolveSpecifications2HeaderKey(normalized) {
  if (["№", "no", "номер"].map(normalizeHeader).includes(normalized)) return "index";
  if (normalized === "спецификации (се)" || normalized === "спецификация (се)") return "specification";
  if (normalized === "применяемость") return "applicability";
  if (normalized === "тип компонента") return "type";
  if (normalized.includes("наименование") || normalized === "обозначение") return "name";
  if (normalized.includes("ед. изм") || normalized.includes("ед изм") || normalized.includes("единица")) return "unitOfMeasure";
  if (normalized.includes("кол-во") || normalized.includes("количество")) return "quantity";
  return "";
}

function normalizeSpecifications2Row(row, header) {
  const cell = (key) => {
    const column = header.columns[key];
    return column ? row.cells[column]?.value ?? "" : "";
  };
  return {
    row: row.index,
    index: cell("index"),
    product: cleanText(cell("applicability")),
    unit: cleanText(cell("specification")),
    type: cleanText(cell("type")),
    name: cleanText(cell("name")),
    unitOfMeasure: cleanText(cell("unitOfMeasure")),
    quantity: cell("quantity"),
    formulas: Object.values(row.cells).filter((item) => item.formula).map((item) => ({ ref: item.ref, formula: item.formula, value: item.value })),
  };
}

function buildSpecifications2Analysis(rows, sheet, header) {
  const sections = buildSectionIndex(rows);
  const graph = buildGraph(rows, sections);
  const continuity = inspectContinuity(rows, sections, graph);
  const treeRows = buildTreeRows(rows, graph, continuity);
  const diagramLevels = buildDiagramLevels(graph, continuity);
  const graphNodes = buildGraphNodes(graph, continuity);
  const typeCounts = countBy(rows.map((row) => row.type || "Без типа"));
  const title = detectRootTitle(rows) || rows[0]?.product || "Спецификация XLSX";

  return {
    title,
    rows,
    treeRows,
    diagramLevels,
    graphNodes,
    graphEdges: graph.edges.map((edge) => ({ ...edge })),
    errors: continuity.errors,
    stats: {
      rows: rows.length,
      sections: sections.length,
      nodes: graph.nodes.size,
      edges: graph.edges.length,
      types: typeCounts.size,
      typeList: [...typeCounts.keys()].slice(0, 4).join(", "),
      assemblyWarnings: continuity.errors.filter((item) => item.severity !== "error").length,
    },
    diagnostics: {
      sheetName: sheet.name,
      headerRow: header.rowIndex,
      formulas: sheet.formulas,
    },
  };
}

function buildSectionIndex(rows) {
  const sectionMap = new Map();
  rows.forEach((row) => {
    const product = row.product || SPECIFICATIONS2_ROOT_LABEL;
    const unit = row.unit || "";
    const key = `${normalizeKey(product)}::${normalizeKey(unit)}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, {
        key,
        product,
        unit,
        rows: [],
      });
    }
    sectionMap.get(key).rows.push(row);
  });
  return [...sectionMap.values()];
}

function buildGraph(rows, sections) {
  const nodes = new Map();
  const edges = [];
  const ensureNode = (label, type = "Объект", source = "") => {
    const key = normalizeNodeKey(label);
    if (!key) return null;
    if (!nodes.has(key)) {
      nodes.set(key, {
        key,
        label,
        designation: extractDesignation(label),
        type,
        source,
      });
    }
    return nodes.get(key);
  };
  const addEdge = (fromLabel, toLabel, type, row = null) => {
    const from = ensureNode(fromLabel, fromLabel === SPECIFICATIONS2_ROOT_LABEL ? "Корень" : "Изделие");
    const to = ensureNode(toLabel, type, row ? `строка ${row.row}` : "");
    if (!from || !to || from.key === to.key) return;
    const edgeKey = `${from.key}->${to.key}`;
    const existingEdge = edges.find((edge) => edge.edgeKey === edgeKey);
    if (existingEdge) {
      if (row && !existingEdge.row) {
        existingEdge.row = row.row || "";
      }
      return;
    }
    edges.push({ edgeKey, from: from.key, to: to.key, row: row?.row || "", type });
  };

  sections.forEach((section) => {
    if (isSyntheticRoot(section.product)) {
      ensureNode(section.unit, "Изделие", "верхний уровень");
      return;
    }
    addEdge(section.product, section.unit, "Узел");
  });
  sections.forEach((section) => {
    section.rows.forEach((row) => {
      addEdge(row.unit, row.name, row.type || "Позиция", row);
    });
  });

  return { nodes, edges };
}

function inspectContinuity(rows, sections, graph) {
  const errors = [];
  const designationToLabels = new Map();
  graph.nodes.forEach((node) => {
    if (!node.designation) return;
    const list = designationToLabels.get(node.designation) || [];
    list.push(node.label);
    designationToLabels.set(node.designation, list);
  });
  sections.forEach((section) => {
    if (isSyntheticRoot(section.product)) return;
    const productKey = normalizeNodeKey(section.product);
    const isReferenced = rows.some((row) => normalizeNodeKey(row.name) === productKey || normalizeNodeKey(row.unit) === productKey);
    if (!isReferenced) {
      errors.push({
        severity: "error",
        title: "Раздел не подключен к верхнему уровню",
        message: `Изделие "${section.product}" имеет строки, но не найдено как узел или позиция в другой части шаблона.`,
        row: section.rows[0]?.row || "",
      });
    }
  });

  rows.forEach((row) => {
    ["product", "unit", "type", "name", "unitOfMeasure"].forEach((field) => {
      if (!row[field] && field !== "product") {
        errors.push({
          severity: "error",
          title: "Пустое обязательное поле",
          message: `В строке не заполнено поле "${field}".`,
          row: row.row,
        });
      }
    });
    if (row.quantity === "" || row.quantity == null) {
      errors.push({
        severity: "error",
        title: "Не указано количество",
        message: "Колонка Кол-во на изделие пустая.",
        row: row.row,
      });
    }

    if (!isAssemblyType(row.type)) return;
    const itemKey = normalizeNodeKey(row.name);
    const designation = extractDesignation(row.name);
    const hasExactSection = sections.some((section) => normalizeNodeKey(section.product) === itemKey || normalizeNodeKey(section.unit) === itemKey);
    if (hasExactSection) return;
    const designationMatches = designation ? (designationToLabels.get(designation) || []).filter((label) => normalizeNodeKey(label) !== itemKey) : [];
    if (designationMatches.length) {
      errors.push({
        severity: "warning",
        title: "Сборочная позиция совпадает только по обозначению",
        message: `"${row.name}" не совпадает текстом с разделом, но найдено похожее обозначение: ${designationMatches[0]}. Возможна ошибка написания.`,
        row: row.row,
      });
      return;
    }
    errors.push({
      severity: "warning",
      title: "Сборочная позиция не раскрывается",
      message: `"${row.name}" не найдена как отдельный раздел или узел. Если это вложенная сборка, цепочка будет оборвана.`,
      row: row.row,
    });
  });

  const rowStatus = new Map();
  errors.forEach((error) => {
    if (!error.row) return;
    const current = rowStatus.get(Number(error.row));
    if (current === "error") return;
    rowStatus.set(Number(error.row), error.severity === "error" ? "error" : "warning");
  });

  return { errors, rowStatus };
}

function buildTreeRows(rows, graph, continuity) {
  const rowByNumber = new Map(rows.map((row) => [Number(row.row), row]));
  const incoming = new Set(graph.edges.map((edge) => edge.to));
  const outgoing = new Map();
  graph.edges.forEach((edge) => {
    const list = outgoing.get(edge.from) || [];
    list.push(edge);
    outgoing.set(edge.from, list);
  });
  const roots = [...graph.nodes.values()].filter((node) => !incoming.has(node.key));
  const fallbackRoots = roots.length ? roots : [...graph.nodes.values()].slice(0, 1);
  const result = [];

  const appendNode = (node, edge = null, level = 0, parentKey = "", path = new Set()) => {
    if (!node || path.has(node.key)) return;
    const nextPath = new Set(path);
    nextPath.add(node.key);
    const sourceRow = edge?.row ? rowByNumber.get(Number(edge.row)) : null;
    const error = sourceRow
      ? continuity.errors.find((item) => Number(item.row) === Number(sourceRow.row))
      : null;
    result.push({
      selectionKey: sourceRow ? `row:${sourceRow.row}` : `node:${node.key}`,
      nodeKey: node.key,
      parentKey,
      level,
      levelLabel: level === 0
        ? "изделие"
        : sourceRow?.index !== "" && sourceRow?.index != null
          ? `№ ${sourceRow.index}`
          : "узел",
      label: node.label,
      designation: node.designation || extractDesignation(node.label),
      type: sourceRow?.type || node.type || edge?.type || "Объект",
      quantity: sourceRow?.quantity ?? "",
      unitOfMeasure: sourceRow?.unitOfMeasure || "",
      source: sourceRow?.unit || (level === 0 ? "верхний уровень" : graph.nodes.get(parentKey)?.label || node.source || ""),
      status: sourceRow ? continuity.rowStatus.get(sourceRow.row) || "ok" : "ok",
      message: error?.title || "",
    });
    (outgoing.get(node.key) || []).forEach((childEdge) => {
      appendNode(graph.nodes.get(childEdge.to), childEdge, level + 1, node.key, nextPath);
    });
  };

  fallbackRoots.forEach((root) => appendNode(root));
  return result;
}

function buildDiagramLevels(graph, continuity) {
  const incoming = new Map();
  const parentByChild = new Map();
  const outgoing = new Map();
  graph.edges.forEach((edge) => {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    if (!parentByChild.has(edge.to)) parentByChild.set(edge.to, edge.from);
    const list = outgoing.get(edge.from) || [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  });
  const roots = [...graph.nodes.values()].filter((node) => !incoming.has(node.key) || isSyntheticRoot(node.label));
  const levels = [];
  const visited = new Set();
  let frontier = roots.length ? roots.map((node) => node.key) : [...graph.nodes.keys()].slice(0, 1);
  const rowByNode = assignDiagramRows(graph, outgoing, roots);

  for (let depth = 0; depth < 24 && frontier.length; depth += 1) {
    const nodes = frontier
      .filter((key) => !visited.has(key))
      .map((key) => graph.nodes.get(key))
      .filter(Boolean);
    nodes.forEach((node) => visited.add(node.key));
    if (nodes.length) {
      levels.push({
        label: depth === 0 ? "Корень" : depth === 1 ? "Узлы" : `Уровень ${depth}`,
        nodes: nodes.map((node) => ({
          selectionKey: `node:${node.key}`,
          nodeKey: node.key,
          parentKey: parentByChild.get(node.key) || "",
          parentLabel: graph.nodes.get(parentByChild.get(node.key))?.label || "",
          diagramRow: rowByNode.get(node.key) || 1,
          label: node.label,
          type: node.type,
          meta: node.designation || node.source,
          status: continuity.errors.some((error) => error.message?.includes(node.label)) ? "warning" : "ok",
        })),
      });
    }
    frontier = [...new Set(nodes.flatMap((node) => outgoing.get(node.key) || []))];
  }
  return levels;
}

function buildGraphNodes(graph, continuity) {
  const parentByChild = new Map();
  const incoming = new Map();
  const outgoing = new Map();
  graph.edges.forEach((edge) => {
    if (!parentByChild.has(edge.to)) parentByChild.set(edge.to, edge.from);
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    const list = outgoing.get(edge.from) || [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  });
  const roots = [...graph.nodes.values()].filter((node) => !incoming.has(node.key) || isSyntheticRoot(node.label));
  const rowByNode = assignDiagramRows(graph, outgoing, roots);
  return [...graph.nodes.values()].map((node) => ({
    selectionKey: `node:${node.key}`,
    nodeKey: node.key,
    parentKey: parentByChild.get(node.key) || "",
    parentLabel: graph.nodes.get(parentByChild.get(node.key))?.label || "",
    diagramRow: rowByNode.get(node.key) || 1,
    label: node.label,
    type: node.type,
    meta: node.designation || node.source,
    status: continuity.errors.some((error) => error.message?.includes(node.label)) ? "warning" : "ok",
  }));
}

function assignDiagramRows(graph, outgoing, roots) {
  const rowByNode = new Map();
  const heightByNode = new Map();
  const rootKeys = roots.length ? roots.map((node) => node.key) : [...graph.nodes.keys()].slice(0, 1);

  const measure = (nodeKey, path = new Set()) => {
    if (!nodeKey) return 1;
    if (heightByNode.has(nodeKey)) return heightByNode.get(nodeKey);
    if (path.has(nodeKey)) return 1;
    const nextPath = new Set(path);
    nextPath.add(nodeKey);
    const children = outgoing.get(nodeKey) || [];
    const height = Math.max(1, children.reduce((sum, childKey) => sum + measure(childKey, nextPath), 0));
    heightByNode.set(nodeKey, height);
    return height;
  };

  const visit = (nodeKey, row, path = new Set()) => {
    if (!nodeKey || rowByNode.has(nodeKey) || path.has(nodeKey)) return;
    const nextPath = new Set(path);
    nextPath.add(nodeKey);
    rowByNode.set(nodeKey, row);
    let childRow = row;
    (outgoing.get(nodeKey) || []).forEach((childKey) => {
      visit(childKey, childRow, nextPath);
      childRow += measure(childKey, nextPath);
    });
  };

  let rootRow = 1;
  rootKeys.forEach((key) => {
    visit(key, rootRow);
    rootRow += measure(key);
  });

  let nextRow = Math.max(1, ...rowByNode.values()) + 1;
  graph.nodes.forEach((node) => {
    if (rowByNode.has(node.key)) return;
    rowByNode.set(node.key, nextRow);
    nextRow += 1;
  });
  return rowByNode;
}

function detectRootTitle(rows) {
  const rootSection = rows.find((row) => isSyntheticRoot(row.product) && row.unit);
  return rootSection?.unit || rows.find((row) => row.product && !isSyntheticRoot(row.product))?.product || "";
}

function normalizeHeader(value) {
  return cleanText(value).toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return cleanText(value).toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

function normalizeNodeKey(value) {
  return normalizeKey(value);
}

function shiftSpecifications2IsoDate(value, days = 0) {
  const date = new Date(`${String(value || "").slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractDesignation(value) {
  const text = cleanText(value).toUpperCase();
  return text.match(/[А-ЯЁA-Z]{2,}\.\d{6}\.\d{3}/)?.[0] || "";
}

function getSpecifications2DisplayLabel(value, explicitDesignation = "") {
  const label = cleanText(value);
  const designation = cleanText(explicitDesignation) || extractDesignation(label);
  if (!label || !designation) return label;
  if (normalizeKey(label) === normalizeKey(designation)) return label;
  const escapedDesignation = designation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutLeadingDesignation = label
    .replace(new RegExp(`^${escapedDesignation}(?:\\s*[·:;—–-]\\s*|\\s+)`, "i"), "")
    .trim();
  return withoutLeadingDesignation || label;
}

function isSyntheticRoot(value) {
  return normalizeKey(value) === SPECIFICATIONS2_ROOT_LABEL;
}

function isAssemblyType(value) {
  return SPECIFICATIONS2_ASSEMBLY_TYPES.has(normalizeKey(value));
}

function countBy(values) {
  const map = new Map();
  values.forEach((value) => map.set(value, (map.get(value) || 0) + 1));
  return map;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
