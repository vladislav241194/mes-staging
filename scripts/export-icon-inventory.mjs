import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MES_ICON_ENTRIES,
  MES_ICON_SOURCE_PACKAGE,
  getMesIconName,
  getMesIconReferenceAssetPath,
  getMesIconSvg,
} from "../src/icons/registry.js";
import { renderContourFavicon } from "./contour-favicon.mjs";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const OUT_DIR = path.join(ROOT, "reports", "mes-icon-full-inventory-assets");
const OUT_MD = path.join(ROOT, "reports", "mes-icon-full-inventory.md");

const EXCLUDED_SLUGS = new Set(["production-floor-plan"]);
const EXCLUDED_FILE_PATTERNS = [/production-floor-plan\.svg$/i];

const SCAN_ROOTS = ["src", "scripts", "styles", "index.html"];
const SKIP_DIRS = new Set(["node_modules", "dist", "tmp", ".git", "reports", "assets/icon-references"]);
const SKIP_FILES = new Set([
  "src/icons/registry.js",
  "src/icons/custom-mes/registry.js",
]);

const INLINE_SVG_ELEMENTS = [
  {
    id: "employee-hierarchy-connectors",
    group: "Технические SVG: структура",
    title: "Линии иерархии сотрудников",
    file: "src/app.js:14560",
    standardSize: "динамический слой, размер контейнера",
    additionalSizes: "зависит от высоты дерева сотрудников",
    description: "Пустой SVG-слой, в который runtime рисует соединительные линии дерева сотрудников. Для пользователя означает визуальную связь между руководителем, отделом, участком и сотрудниками.",
    notes: "Это не пиктограмма, а техническая SVG-разметка. При переработке иконок менять как icon-set не нужно.",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 72" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"><path d="M24 12v48"/><path d="M24 24h50"/><path d="M24 48h86"/><circle cx="24" cy="24" r="3" fill="#64748b"/><circle cx="24" cy="48" r="3" fill="#64748b"/></svg>`,
  },
  {
    id: "visual-gantt-dependency",
    group: "Технические SVG: Gantt",
    title: "Демо-зависимость Ганта",
    file: "src/app.js:22806",
    standardSize: "220x34 в UI-состояниях",
    additionalSizes: "только demo/visualSystem",
    description: "Ломаная линия со стрелкой, показывает зависимость между плановыми операциями. Для пользователя означает порядок выполнения и связку операций.",
    notes: "Используется как визуальный пример в UI-состояниях, не как кнопочная иконка.",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 34" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M 10 17 H 74 V 8 H 132 V 24 H 200"/><path d="M 199 20 L 209 24 L 199 28"/></svg>`,
  },
  {
    id: "visual-gantt-transfer-arrow",
    group: "Технические SVG: Gantt",
    title: "Демо-поток передачи Ганта",
    file: "src/app.js:22841",
    standardSize: "220x54 в UI-состояниях",
    additionalSizes: "только demo/visualSystem",
    description: "Кривая стрелка между двумя операциями, показывает передаточную партию или поток между операциями. Для пользователя означает движение части объема дальше по маршруту.",
    notes: "Используется в демонстрации Gantt transfer-flow.",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 54" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M 74 37 C 104 48, 127 8, 158 19"/><path d="M 156 15 L 169 20 L 156 25"/></svg>`,
  },
  {
    id: "inline-route-print-qr-placeholder",
    group: "Печать и документы",
    title: "QR-плейсхолдер маршрутной печати",
    file: "src/app.js:28790",
    standardSize: "116x116",
    additionalSizes: "фиксированный размер в печатной форме",
    description: "Динамически сгенерированный QR-подобный SVG из прямоугольников. Для пользователя означает машинно-считываемую ссылку/идентификатор печатной маршрутной формы.",
    notes: "Не является UI-иконкой; при переработке пиктограмм обычно не трогать.",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" width="116" height="116" shape-rendering="crispEdges"><rect width="29" height="29" fill="#fff"/><g fill="#0f172a"><rect x="4" y="4" width="7" height="7"/><rect x="18" y="4" width="7" height="7"/><rect x="4" y="18" width="7" height="7"/><rect x="13" y="13" width="2" height="2"/><rect x="17" y="14" width="1" height="5"/><rect x="14" y="20" width="7" height="1"/><rect x="22" y="15" width="2" height="2"/><rect x="13" y="5" width="2" height="1"/><rect x="9" y="14" width="1" height="2"/></g></svg>`,
  },
  {
    id: "gantt-dependencies-layer",
    group: "Технические SVG: Gantt",
    title: "Слой зависимостей Ганта",
    file: "src/app.js:37440",
    standardSize: "динамический слой над canvas Ганта",
    additionalSizes: "ширина шкалы времени x высота строк",
    description: "Большой SVG-слой с marker-стрелками и path-зависимостями. Для пользователя означает реальные связи между слотами планирования, в том числе проблемные и transfer-связи.",
    notes: "Критичная геометрия Ганта; не менять как часть icon redesign.",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 96" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><defs><marker id="inv-arrow" markerWidth="11" markerHeight="11" refX="9.5" refY="5.5" orient="auto"><path d="M 1 1.5 L 9.5 5.5 L 1 9.5 Z" fill="#64748b"/></marker></defs><path d="M28 22 C80 22 70 54 128 54 S172 30 214 30" marker-end="url(#inv-arrow)"/><path d="M34 72 H118 V80 H190" stroke="#2563eb" marker-end="url(#inv-arrow)"/></svg>`,
  },
];

const ACTION_DESCRIPTIONS = {
  alert: "Предупреждение или проблема. Для пользователя означает, что строка, операция или действие требует внимания.",
  "arrow-left": "Переход назад, предыдущий элемент, предыдущая дата или сдвиг влево.",
  "arrow-right": "Переход вперед, следующий элемент, следующая дата или сдвиг вправо.",
  "backspace-apple": "Удаление последней введенной цифры в PIN/числовом вводе, по логике клавиатуры Apple.",
  book: "Инструкция, справочник или открываемая документация.",
  bug: "Report/ошибка/технологическая проблема, которую нужно зафиксировать или просмотреть.",
  calendar: "Выбор даты, смены или календарного периода.",
  camera: "Фото к report: сделать снимок или прикрепить изображение проблемы.",
  chart: "Аналитика, график, сравнение показателей.",
  check: "Подтверждение, успешное состояние или готовность.",
  "chevron-down": "Раскрыть список, группу или выпадающий блок.",
  "chevron-right": "Перейти внутрь, раскрыть вправо или показать следующий уровень.",
  "chevron-up": "Поднять строку или свернуть вверх.",
  clock: "Время, длительность, часы смены или отметка времени.",
  close: "Закрыть окно, модалку или отменить локальный просмотр.",
  copy: "Скопировать значение или дублировать объект.",
  directory: "Справочник, папка или набор записей.",
  document: "Документ: маршрут, СЗН, заказ-наряд, PDF или печатная форма.",
  download: "Скачать, сформировать PDF или выгрузить печатную форму.",
  edit: "Редактирование записи или переключение в режим правки.",
  filter: "Фильтр таблицы, списка или набора данных.",
  focus: "Фокус-режим интерфейса или полноэкранный рабочий режим.",
  gantt: "Диаграмма Ганта, планирование нагрузки и календарное размещение операций.",
  info: "Информационная подсказка, пустое состояние или нейтральное объяснение.",
  keyboard: "Ввод с клавиатуры или цифровой ввод.",
  lock: "Закрытый доступ, авторизация, просмотр без редактирования.",
  unlock: "Успешная авторизация или открытый доступ.",
  map: "Карта цеха, расположение участка или ресурсная схема.",
  minus: "Уменьшить масштаб, убрать или свернуть значение.",
  monitor: "Диспетчерский/экранный модуль, мониторинг или рабочий экран.",
  open: "Открыть карточку, строку или подробности.",
  package: "Партия, упаковка, складская приемка или материальный объект.",
  palette: "UI-состояния, визуальная система и настройки внешнего вида.",
  plus: "Добавить строку, объект или увеличить масштаб.",
  print: "Печать документа или печатная форма.",
  refresh: "Обновить, пересчитать, перестроить или сбросить состояние.",
  reset: "Сбросить настройку или значение к исходному состоянию.",
  route: "Маршрутная карта, цепочка операций или переход по маршруту.",
  "route-edit": "Редактирование зависимостей/маршрута в планировании.",
  save: "Сохранить изменения.",
  search: "Поиск или пустой результат поиска.",
  selection: "Выбор строки, активное выделение или выбранный объект.",
  settings: "Настройки, параметры или служебная конфигурация.",
  split: "Разделить, добавить узел, декомпозировать структуру.",
  target: "Цель, контрольная точка, KPI или выбранный ориентир.",
  today: "Вернуться к сегодняшней дате.",
  trash: "Удалить объект или строку.",
  "trash-soft": "Мягкое/контекстное удаление строки без главного destructive акцента.",
  tree: "Древовидная структура, иерархия документов или состава.",
  upload: "Загрузить файл или импортировать данные.",
  worker: "Исполнитель, сотрудник, рабочее место или человек в смене.",
};

function escapeMd(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n+/g, "<br>");
}

function slugFileName(value) {
  return String(value || "icon")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "icon";
}

function normalizeSvgForPreview(svg) {
  let output = String(svg || "").trim();
  if (!output) return "";
  output = output.replace(/^<svg\b(?![^>]*xmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
  output = output.replace(/^<svg\b([^>]*)>/, (match, attrs = "") => {
    let nextAttrs = attrs;
    if (!/\bcolor=/.test(nextAttrs) && !/\bstyle=/.test(nextAttrs)) {
      nextAttrs += ' style="color:#10243a"';
    }
    return `<svg${nextAttrs}>`;
  });
  return output;
}

async function writePreview(name, svg) {
  const fileName = `${slugFileName(name)}.svg`;
  const filePath = path.join(OUT_DIR, fileName);
  await writeFile(filePath, normalizeSvgForPreview(svg), "utf8");
  return `./mes-icon-full-inventory-assets/${fileName}`;
}

async function walkFiles(entryPath) {
  const absPath = path.join(ROOT, entryPath);
  const itemStat = await stat(absPath);
  if (itemStat.isFile()) return [entryPath];
  const files = [];
  async function walk(relativeDir) {
    const absoluteDir = path.join(ROOT, relativeDir);
    for (const entry of await readdir(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(relativePath)) continue;
        await walk(relativePath);
        continue;
      }
      files.push(relativePath);
    }
  }
  await walk(entryPath);
  return files;
}

function isTextFile(filePath) {
  return /\.(js|mjs|css|html|svg|json)$/i.test(filePath);
}

function moduleHint(filePath, lineNumber) {
  if (filePath.includes("nomenclature")) return "Номенклатура";
  if (filePath.includes("dispatch")) return "Диспетчерская";
  if (!filePath.endsWith("src/app.js")) return filePath;
  const line = Number(lineNumber);
  if (line < 9000) return "Планирование / общие блоки";
  if (line < 12550) return "Журнал СЗН / модалки / печать";
  if (line < 14500) return "Снабжение / supply";
  if (line < 15550) return "Табель";
  if (line < 17000) return "Структура / сотрудники / shell";
  if (line < 19650) return "Главный shell / карта цеха";
  if (line < 20350) return "Авторизация";
  if (line < 21350) return "Рабочий стол";
  if (line < 22150) return "UI-состояния";
  if (line < 26000) return "Спецификации / BOM / Номенклатура";
  if (line < 30200) return "Маршрутные карты / Заказ-наряды";
  if (line < 33000) return "Справочники";
  if (line < 40000) return "Gantt / планирование нагрузки";
  return "Runtime helpers";
}

function captureIconNames(line) {
  const patterns = [
    /\bicon\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\brenderIcon\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\biconName\s*[:=]\s*["'`]([^"'`]+)["'`]/g,
    /\bicon\s*:\s*["'`]([^"'`]+)["'`]/g,
    /\bgetMesCustomIconName\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ];
  const names = [];
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) names.push(match[1]);
  }
  return names;
}

async function collectIconUsage() {
  const usage = new Map();
  const files = [];
  for (const root of SCAN_ROOTS) files.push(...await walkFiles(root));
  for (const file of files) {
    const normalizedFile = file.split(path.sep).join("/");
    if (!isTextFile(normalizedFile) || SKIP_FILES.has(normalizedFile)) continue;
    if (normalizedFile.includes("src/icons/mes-mixed/source/")) continue;
    const text = await readFile(path.join(ROOT, normalizedFile), "utf8").catch(() => "");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rawName of captureIconNames(line)) {
        const normalizedName = getMesIconName(rawName) || rawName;
        if (!normalizedName || EXCLUDED_SLUGS.has(normalizedName)) continue;
        if (!usage.has(normalizedName)) usage.set(normalizedName, []);
        usage.get(normalizedName).push({
          rawName,
          file: normalizedFile,
          line: index + 1,
          module: moduleHint(normalizedFile, index + 1),
        });
      }
    });
  }
  return usage;
}

function getEntrySourcePath(entry) {
  if (!entry || entry.source !== "custom-svg") return "";
  const candidate = path.join("src/icons/mes-mixed/source/custom-approved/svg/by-semantic", `${entry.semanticSlug}.svg`);
  return candidate;
}

function getStandardSize(entry) {
  if (entry.group === "Отделы") return "22px в auth-плитках; базовый SVG 24x24";
  if (entry.group === "Участки и линии" || entry.group === "Оборудование / ресурсные зоны") return "22px в auth-плитках участков; базовый SVG 24x24";
  if (entry.group === "System Lucide Icons" || entry.group === "Системные UI-иконки") return "16px системный размер; контейнер кнопки 36px";
  if (entry.group === "Gantt / Planning") return "16px в кнопках/панелях; SVG-слои динамические";
  return "16px системный размер; базовый SVG 24x24";
}

function getAdditionalSizes(entry, used) {
  const sizes = new Set(["14px compact/table", "18px global svg fallback"]);
  if (entry.group === "Отделы" || entry.group === "Участки и линии" || entry.group === "Оборудование / ресурсные зоны") {
    sizes.add("22px auth tile");
    sizes.add("24px source/reference");
  }
  if (used.some((item) => item.module.includes("UI-состояния"))) sizes.add("16/18/20/32px preview samples");
  if (used.some((item) => item.module.includes("Авторизация") || item.module.includes("Рабочий стол"))) sizes.add("40px keypad delete для backspace");
  if (used.some((item) => item.file.includes("module-smoke"))) sizes.add("служебные smoke SVG без production-размера");
  return [...sizes].join("; ");
}

function describeEntry(entry) {
  const known = ACTION_DESCRIPTIONS[entry.iconName] || ACTION_DESCRIPTIONS[entry.semanticSlug];
  if (known) return known;
  if (entry.group === "Отделы") {
    return `Производственная иконка отдела «${entry.title}». Для пользователя означает выбор отдела, принадлежность задачи/сотрудника к верхнему уровню оргструктуры и быстрый визуальный поиск нужного производственного направления.`;
  }
  if (entry.group === "Участки и линии") {
    return `Производственная иконка участка или линии «${entry.title}». Для пользователя означает конкретное место выполнения работ внутри отдела, выбор участка при авторизации и привязку операций к ресурсной зоне.`;
  }
  if (entry.group === "Оборудование / ресурсные зоны") {
    return `Иконка оборудования или ресурсной зоны «${entry.title}». Для пользователя означает конкретный станок, рабочее место или технологическую зону, где выполняется операция.`;
  }
  if (entry.group === "Складские зоны") {
    return `Иконка складской зоны «${entry.title}». Для пользователя означает движение, хранение, выдачу или приемку изделия/компонента.`;
  }
  if (entry.group === "Функциональные направления") {
    return `Иконка функционального направления «${entry.title}». Для пользователя означает служебную функцию, поддержку производства или административную область.`;
  }
  return `Системная иконка «${entry.title || entry.iconName}». Для пользователя означает действие или объект с семантикой ${entry.semanticSlug}; требуется ручная проверка смысла при глобальной переработке.`;
}

function detailRecommendation(entry) {
  if (entry.group === "System Lucide Icons" || entry.group === "Системные UI-иконки") {
    return "Детализация минимальная: форма должна читаться в 14-16px, без мелких внутренних элементов.";
  }
  if (entry.group === "Отделы" || entry.group === "Участки и линии" || entry.group === "Оборудование / ресурсные зоны") {
    return "Основной тест читаемости 22px; допустимы 2-3 узнаваемые формы, но без плотной заливки и микродеталей.";
  }
  return "Ориентир 16-24px; оставить один главный силуэт и понятный контур.";
}

function usageSummary(used, entry) {
  const runtimeIds = entry?.runtimeIds?.length ? `runtimeIds: ${entry.runtimeIds.join(", ")}` : "";
  if (!used.length && runtimeIds) return `${runtimeIds}<br>динамический lookup через getMesCustomIconNameForRuntimeId`;
  if (!used.length) return "Registry / UI-состояния; прямой вызов в runtime не найден";
  const modules = [...new Set(used.map((item) => item.module))].slice(0, 6).join(", ");
  const refs = used.slice(0, 4).map((item) => `${item.file}:${item.line}`).join("<br>");
  const runtimeSuffix = runtimeIds ? `<br>${runtimeIds}` : "";
  return `${used.length} выз. · ${modules}<br>${refs}${used.length > 4 ? "<br>..." : ""}${runtimeSuffix}`;
}

function renderTable(rows) {
  return [
    "| Иконка | iconName / semanticSlug | Описание и смысл для пользователя | Стандартный размер | Доп. размеры | Где используется | Источник / статус | Подсказка для подбора или генерации |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((row) => [
      row.preview,
      `\`${escapeMd(row.iconName)}\`<br><small>${escapeMd(row.semanticSlug)}</small>`,
      escapeMd(row.description),
      escapeMd(row.standardSize),
      escapeMd(row.additionalSizes),
      escapeMd(row.usage),
      `${escapeMd(row.source)}<br>${escapeMd(row.status)}${row.sourcePath ? `<br><small>${escapeMd(row.sourcePath)}</small>` : ""}`,
      escapeMd(row.recommendation),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
  ].join("\n");
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const usage = await collectIconUsage();
  const rowsByGroup = new Map();
  const excluded = [];

  for (const entry of MES_ICON_ENTRIES) {
    if (EXCLUDED_SLUGS.has(entry.semanticSlug) || EXCLUDED_SLUGS.has(entry.iconName)) {
      excluded.push(`${entry.semanticSlug} (${entry.source})`);
      continue;
    }
    const svg = getMesIconSvg(entry.iconName);
    if (!svg) continue;
    const previewPath = await writePreview(entry.iconName, svg);
    const used = usage.get(entry.iconName) || usage.get(entry.semanticSlug) || [];
    const group = entry.group || "Прочее";
    if (!rowsByGroup.has(group)) rowsByGroup.set(group, []);
    rowsByGroup.get(group).push({
      preview: `<img src="${previewPath}" width="32" height="32" alt="${escapeMd(entry.iconName)}">`,
      iconName: entry.iconName,
      semanticSlug: entry.semanticSlug,
      description: describeEntry(entry),
      standardSize: getStandardSize(entry),
      additionalSizes: getAdditionalSizes(entry, used),
      usage: usageSummary(used, entry),
      source: `${entry.sourceLabel || entry.source}${entry.lucideComponent ? ` / ${entry.lucideComponent}` : ""}`,
      status: entry.status,
      sourcePath: getEntrySourcePath(entry),
      recommendation: `${detailRecommendation(entry)} ${entry.note || ""}`.trim(),
    });
  }

  const inlineRows = [];
  for (const item of INLINE_SVG_ELEMENTS) {
    const previewPath = await writePreview(item.id, item.svg);
    inlineRows.push({
      preview: `<img src="${previewPath}" width="52" height="32" alt="${escapeMd(item.id)}">`,
      iconName: item.id,
      semanticSlug: item.id,
      description: item.description,
      standardSize: item.standardSize,
      additionalSizes: item.additionalSizes,
      usage: item.file,
      source: "inline/dynamic SVG",
      status: "runtime technical",
      sourcePath: item.file,
      recommendation: item.notes,
    });
  }

  const faviconRows = [];
  for (const contour of ["admin", "pilot", "default"]) {
    const id = `favicon-${contour}`;
    const previewPath = await writePreview(id, renderContourFavicon(contour));
    faviconRows.push({
      preview: `<img src="${previewPath}" width="32" height="32" alt="${id}">`,
      iconName: id,
      semanticSlug: id,
      description: `Favicon контура ${contour}. Для пользователя означает, в каком контуре открыт браузер: admin, pilot или default/staging.`,
      standardSize: "64x64 viewBox, браузер масштабирует до 16/32px",
      additionalSizes: "browser tab 16px; bookmarks 32px; OS preview 64px",
      usage: "scripts/contour-favicon.mjs, /favicon.svg",
      source: "dynamic favicon SVG",
      status: "runtime",
      sourcePath: "scripts/contour-favicon.mjs",
      recommendation: "Очень высокая читаемость в 16px: крупная буква/знак, минимум деталей, контрастный фон.",
    });
  }

  const fileSvgExcluded = [];
  for (const file of await walkFiles("assets")) {
    if (!file.endsWith(".svg")) continue;
    if (EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(file))) fileSvgExcluded.push(file);
  }
  for (const file of await walkFiles("src/icons/mes-mixed/source/local-fallback-svg")) {
    if (EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(file))) fileSvgExcluded.push(file);
  }

  const sourceFiles = (await walkFiles("src/icons/mes-mixed/source/custom-approved/svg/by-semantic"))
    .filter((file) => file.endsWith(".svg"))
    .sort();

  const sectionOrder = [
    "Отделы",
    "Участки и линии",
    "Оборудование / ресурсные зоны",
    "Складские зоны",
    "Функциональные направления",
    "Gantt / Planning",
    "Системные UI-иконки",
    "System Lucide Icons",
    "Special fallback icons",
  ];

  const sections = [];
  for (const group of sectionOrder) {
    const rows = rowsByGroup.get(group);
    if (!rows?.length) continue;
    sections.push(`## ${group}\n\n${renderTable(rows)}\n`);
  }
  for (const [group, rows] of rowsByGroup.entries()) {
    if (sectionOrder.includes(group)) continue;
    sections.push(`## ${group}\n\n${renderTable(rows)}\n`);
  }

  const usedIconCount = [...usage.keys()].filter((name) => !EXCLUDED_SLUGS.has(name)).length;
  const md = `# Полная выгрузка SVG-иконок MES

Дата выгрузки: ${new Date().toISOString()}

Задача: собрать все SVG-иконки и SVG-элементы системы для последующей глобальной переработки. Производственный план / floor-plan исключен по ТЗ.

## Как читать таблицу

- **Иконка**: preview из файла в \`reports/mes-icon-full-inventory-assets/\`.
- **Стандартный размер**: основной размер, в котором значок должен быть читаем в системе.
- **Доп. размеры**: дополнительные реальные контексты, которые влияют на детализацию будущей генерации/трассировки.
- **Где используется**: прямые вызовы \`icon(...)\`, \`iconName\`, \`getMesCustomIconName(...)\` или registry-only, если прямого runtime-вызова нет.
- **Источник / статус**: custom SVG, Lucide-compatible SVG, virtual custom или dynamic inline.

## Сводка

| Метрика | Значение |
|---|---:|
| Registry entries всего | ${MES_ICON_ENTRIES.length} |
| Registry entries в отчете | ${MES_ICON_ENTRIES.length - excluded.length} |
| Custom SVG в registry | ${MES_ICON_SOURCE_PACKAGE.customSvgCount} |
| Lucide-compatible SVG в registry | ${MES_ICON_SOURCE_PACKAGE.lucideReactCount} |
| Local fallback SVG | ${MES_ICON_SOURCE_PACKAGE.localFallbackCount} |
| Прямо найдено имен иконок в runtime/code | ${usedIconCount} |
| Inline/dynamic SVG элементов добавлено | ${INLINE_SVG_ELEMENTS.length} |
| Favicon SVG вариантов добавлено | ${faviconRows.length} |
| Source custom SVG файлов | ${sourceFiles.length} |

## Глобальная шкала размеров

| Контекст | Размер |
|---|---|
| Глобальный fallback \`svg\` | 18x18 |
| Базовая системная иконка | 16x16 |
| Compact / table icon | 14-15px |
| Sidebar module tab | сейчас встречается 10-17px по слоям CSS; требует отдельной нормализации |
| Action button host | 36px контейнер, SVG 14-18px |
| Table action host | 30px контейнер, SVG 14-15px |
| Auth department/unit tile icon | 22px SVG в 42px контейнере |
| VisualSystem preview samples | 16 / 18 / 20 / 32px |
| PIN backspace | до 40px в auth/desktop keypad |
| Print QR placeholder | 116x116 |
| Favicon | 64x64 source, браузер масштабирует |

## Исключено по ТЗ

${[...excluded, ...fileSvgExcluded].length ? [...excluded, ...fileSvgExcluded].map((item) => `- \`${item}\``).join("\n") : "- Ничего"}

${sections.join("\n")}

## Inline / dynamic SVG элементы

${renderTable(inlineRows)}

## Favicon / контуры

${renderTable(faviconRows)}

## Source custom SVG файлы

Эти файлы являются исходниками для custom registry и в основной таблице выше представлены как runtime SVG. Список нужен, чтобы при замене значков не забыть источник:

${sourceFiles.map((file) => `- \`${file}\``).join("\n")}

## Практические выводы для переработки

1. Для 14-16px значков нельзя использовать плотные заливки и сложные производственные сцены: они превращаются в темные пятна.
2. Для отделов и участков главный контрольный размер сейчас 22px в авторизации; именно там нужно проверять читаемость custom SVG.
3. Системные действия лучше держать в одном outline-стиле, потому что они встречаются в кнопках, таблицах, модалках, sidebar и topbar.
4. Gantt dependency layer, QR и favicon не являются обычными иконками; их лучше перерабатывать отдельно от общего icon-set.
5. Registry содержит часть иконок без прямых runtime-вызовов: они доступны через UI-состояния и mapping, но перед production-заменой их нужно разделить на “используется” и “резерв”.
`;

  await writeFile(OUT_MD, md, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUT_MD)}`);
  console.log(`Wrote ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
