/*
 * Experimental, removable RКД draft export.
 * Removal contract: delete this file, its import/button/event hook in render.js,
 * and scripts/specifications2-rkd-draft-qa.mjs. Specification import stays intact.
 */

export const SPECIFICATIONS2_RKD_DRAFT_ENABLED = true;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// A4 portrait. Working field: 185 mm between the 20 mm left and 5 mm right
// frame offsets used by ESKD paper documents.
const CONTENT_WIDTH = 10488;

export function downloadSpecifications2RkdDraft(entry) {
  const bytes = buildSpecifications2RkdDraftDocx(entry);
  const fileName = `${sanitizeFileName(entry?.title || "specification")}-RKD-draft.docx`;
  const url = URL.createObjectURL(new Blob([bytes], { type: DOCX_MIME }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}

export function buildSpecifications2RkdDraftDocx(entry = {}) {
  const generatedAt = new Date();
  const rows = normalizeRows(entry.treeRows);
  const root = rows.find((row) => row.level === 0) || rows[0] || {};
  const sectionRows = getSectionRows(rows);
  const warningCount = rows.filter((row) => row.status && row.status !== "ok").length;
  const title = cleanText(entry.title || root.label || "Изделие");
  const designation = cleanText(root.designation || extractDesignation(title) || "не указано");
  const documentDesignation = designation === "не указано" ? "[ОБОЗНАЧЕНИЕ] ПЗ" : `${designation} ПЗ`;

  const body = [
    paragraph("[НАИМЕНОВАНИЕ ОРГАНИЗАЦИИ]", "Organization"),
    spacer(4),
    paragraph(title.toUpperCase(), "Title"),
    paragraph("ПОЯСНИТЕЛЬНАЯ ЗАПИСКА", "Title"),
    paragraph(documentDesignation, "DocumentCode"),
    spacer(4),
    approvalTable(),
    spacer(5),
    paragraph(`[Город] ${generatedAt.getFullYear()}`, "TitleMeta"),
    titleSectionBreak(),
    paragraph("СОДЕРЖАНИЕ", "SectionTitle"),
    tocField(),
    pageBreak(),
    paragraph("Настоящий документ является автоматически сформированным черновиком. До присвоения статуса подлинника он подлежит проверке разработчиком, согласованию и нормоконтролю.", "Warning"),
    heading("1 Общие сведения", 1),
    infoTable([
      ["Наименование изделия", title],
      ["Обозначение", designation],
      ["Обозначение документа", documentDesignation],
      ["Вид документа", "Пояснительная записка (черновик)"],
      ["Назначение", "[Требуется заполнить]"],
      ["Область применения", "[Требуется заполнить]"],
      ["Исполнение", "[Требуется заполнить]"],
      ["Литера", "[Требуется установить]"],
    ]),
    heading("2 Назначение и область применения", 1),
    paragraph("[Привести назначение изделия, область и условия применения, ограничения и основные исходные требования.]"),
    heading("3 Техническая характеристика", 1),
    paragraph("[Привести основные технические данные, параметры, характеристики и требования, определяющие конструкцию изделия.]"),
    heading("4 Состав изделия", 1),
    paragraph(`Предварительная структура сформирована по данным MES. Количество записей — ${rows.length}. Перед выпуском требуется сверка с утвержденной спецификацией.`),
    structureTable(rows),
    heading("5 Описание и обоснование конструкции", 1),
    paragraph("Для сборочных единиц автоматически подготовлены подразделы. В каждом подразделе необходимо обосновать принятые решения и дать ссылки на соответствующие чертежи, схемы и расчеты."),
    ...sectionRows.flatMap((row, index) => sectionBlock(row, index + 1)),
    heading("6 Расчеты, подтверждающие работоспособность", 1),
    paragraph("[Добавить расчеты или ссылки на самостоятельные расчетные документы с указанием их обозначений.]"),
    heading("7 Требования к изготовлению и контролю", 1),
    paragraph("[Указать критические материалы, покрытия, допуски, методы контроля, испытания и специальные технологические требования.]"),
    heading("8 План дооформления комплекта РКД", 1),
    workPlanTable(),
    heading("9 Ссылочные документы", 1),
    referenceTable(),
    heading("10 Данные формирования и контроль", 1),
    infoTable([
      ["Источник структуры", cleanText(entry.fileName || "Спецификации 2.0 / MES")],
      ["Дата генерации", formatDateTime(generatedAt)],
      ["Количество позиций", String(rows.length)],
      ["Предупреждения структуры", String(warningCount)],
      ["Проверил", "[ФИО / должность / дата]"],
      ["Нормоконтроль", "[ФИО / должность / дата]"],
    ]),
    paragraph("Перед выпуском проверить полноту состава, обозначения, количества, единицы измерения, актуальность ревизий и соответствие применимым стандартам ЕСКД.", "Warning"),
    pageBreak(),
    paragraph("ЛИСТ РЕГИСТРАЦИИ ИЗМЕНЕНИЙ", "SectionTitle"),
    changesTable(),
  ].join("");

  const documentXml = xmlHeader() + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="567" w:right="284" w:bottom="2551" w:left="1134" w:header="284" w:footer="0" w:gutter="0"/><w:pgBorders w:offsetFrom="text"><w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/></w:pgBorders></w:sectPr></w:body></w:document>`;
  const timestamp = generatedAt.toISOString();

  return createStoredZip([
    ["[Content_Types].xml", contentTypesXml()],
    ["_rels/.rels", packageRelationshipsXml()],
    ["docProps/core.xml", corePropertiesXml(title, timestamp)],
    ["docProps/app.xml", appPropertiesXml()],
    ["word/document.xml", documentXml],
    ["word/styles.xml", stylesXml()],
    ["word/settings.xml", settingsXml()],
    ["word/footer1.xml", firstPageFooterXml(title, documentDesignation)],
    ["word/footer2.xml", continuationFooterXml(documentDesignation)],
    ["word/footer3.xml", continuationFooterXml(documentDesignation)],
    ["word/_rels/document.xml.rels", documentRelationshipsXml()],
  ]);
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(Boolean).map((row, index) => ({
    label: cleanText(row.label || `Позиция ${index + 1}`),
    designation: cleanText(row.designation || extractDesignation(row.label || "")),
    type: cleanText(row.type || "—"),
    quantity: row.quantity === "" || row.quantity == null ? "—" : String(row.quantity),
    unitOfMeasure: cleanText(row.unitOfMeasure || "—"),
    source: cleanText(row.source || "—"),
    status: cleanText(row.status || "ok"),
    level: Math.max(0, Number(row.level || 0)),
    nodeKey: cleanText(row.nodeKey || row.selectionKey || `row-${index}`),
    parentKey: cleanText(row.parentKey || ""),
  }));
}

function getSectionRows(rows) {
  const parentKeys = new Set(rows.map((row) => row.parentKey).filter(Boolean));
  return rows.filter((row) => row.level === 0 || parentKeys.has(row.nodeKey)).slice(0, 24);
}

function sectionBlock(row, number) {
  return [
    heading(`5.${number} ${row.label}`, 2),
    infoTable([
      ["Обозначение", row.designation || "не указано"],
      ["Тип", row.type],
      ["Описание конструкции", "[Требуется заполнить]"],
      ["Чертежи и схемы", "[Добавить файлы / ссылки / номера листов]"],
      ["Технические требования", "[Требуется заполнить]"],
      ["Материалы и покрытия", "[Требуется заполнить]"],
      ["Примечания", "[Требуется заполнить]"],
    ]),
  ];
}

function structureTable(rows) {
  const widths = [650, 4743, 780, 720, 650, 2945];
  const header = tableRow(["Ур.", "Наименование и обозначение", "Тип", "Кол-во", "Ед.", "Источник"], widths, true);
  const data = rows.map((row) => tableRow([
    String(row.level + 1),
    `${"   ".repeat(Math.min(row.level, 8))}${row.label}${row.designation && !row.label.includes(row.designation) ? `\n${row.designation}` : ""}`,
    row.type,
    row.quantity,
    row.unitOfMeasure,
    row.source,
  ], widths, false, row.status !== "ok")).join("");
  return table(header + data, widths);
}

function workPlanTable() {
  const widths = [2600, 4583, 1900, 1405];
  const rows = [
    ["Состав изделия", "Проверить позиции, количества и применяемость", "Конструктор", "Не начато"],
    ["Чертежи", "Добавить сборочные чертежи, деталировки и схемы", "Конструктор", "Не начато"],
    ["Описание", "Оформить назначение, устройство и условия эксплуатации", "Конструктор", "Не начато"],
    ["Технические требования", "Указать материалы, допуски, покрытия и контроль", "Технолог", "Не начато"],
    ["Проверка", "Провести согласование и нормоконтроль", "Нормоконтроль", "Не начато"],
  ];
  return table(
    tableRow(["Раздел", "Требуемое действие", "Ответственный", "Статус"], widths, true)
      + rows.map((row) => tableRow(row, widths)).join(""),
    widths,
  );
}

function infoTable(rows) {
  const widths = [2700, 7788];
  return table(rows.map((row) => tableRow(row, widths)).join(""), widths);
}

function approvalTable() {
  const widths = [2200, 4144, 2072, 2072];
  return table([
    tableRow(["СОГЛАСОВАНО", "", "УТВЕРЖДАЮ", ""], widths, true),
    tableRow(["Должность", "[должность]", "Должность", "[должность]"], widths),
    tableRow(["Подпись", "________ / [ФИО]", "Подпись", "________ / [ФИО]"], widths),
    tableRow(["Дата", "__.__.20__", "Дата", "__.__.20__"], widths),
  ].join(""), widths);
}

function referenceTable() {
  const widths = [3000, 7488];
  const rows = [
    ["ГОСТ Р 2.104-2023", "ЕСКД. Основные надписи"],
    ["ГОСТ Р 2.105-2019", "ЕСКД. Общие требования к текстовым документам"],
    ["ГОСТ Р 2.106-2019", "ЕСКД. Текстовые документы"],
    ["[Обозначение]", "[Добавить применяемые стандарты и конструкторские документы]"],
  ];
  return table(tableRow(["Обозначение", "Наименование"], widths, true) + rows.map((row) => tableRow(row, widths)).join(""), widths);
}

function changesTable() {
  const widths = [700, 1500, 1700, 1700, 1600, 1288, 1000, 1000];
  const header = tableRow(["Изм.", "Номера листов измененных", "замененных", "новых", "аннулированных", "Всего листов", "№ документа", "Дата"], widths, true);
  const blanks = Array.from({ length: 12 }, () => tableRow(["", "", "", "", "", "", "", ""], widths)).join("");
  return table(header + blanks, widths);
}

function table(rowsXml, widths, accent = "") {
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  const borders = `<w:tblBorders><w:top w:val="single" w:sz="8" w:color="000000"/><w:left w:val="single" w:sz="8" w:color="000000"/><w:bottom w:val="single" w:sz="8" w:color="000000"/><w:right w:val="single" w:sz="8" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_WIDTH}" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/>${borders}${accent ? `<w:tblStyle w:val="TableGrid"/>` : ""}<w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowsXml}</w:tbl>`;
}

function tableRow(values, widths, header = false, warning = false, fill = "") {
  const cells = values.map((value, index) => tableCell(value, widths[index], header, warning, fill)).join("");
  return `<w:tr><w:trPr>${header ? "<w:tblHeader/>" : ""}<w:cantSplit/></w:trPr>${cells}</w:tr>`;
}

function tableCell(value, width, header, warning, fill) {
  const background = fill || (warning ? "E7E7E7" : "FFFFFF");
  const style = header ? "TableHeader" : "TableText";
  const lines = String(value ?? "").split("\n");
  const runs = lines.map((line, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join("");
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${background}"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r>${runs}</w:r></w:p></w:tc>`;
}

function paragraph(text, style = "Normal") {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function spacer(lines = 1) {
  return Array.from({ length: lines }, () => paragraph("", "Normal")).join("");
}

function pageBreak() {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function titleSectionBreak() {
  return `<w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="567" w:right="284" w:bottom="2551" w:left="1134" w:header="284" w:footer="0" w:gutter="0"/><w:pgBorders w:offsetFrom="text"><w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/></w:pgBorders></w:sectPr></w:pPr></w:p>`;
}

function tocField() {
  return `<w:p><w:fldSimple w:instr="TOC \\o &quot;1-2&quot; \\h \\z \\u"><w:r><w:t>Обновите поле содержания в Word</w:t></w:r></w:fldSimple></w:p>`;
}

function heading(text, level) {
  return paragraph(text, level === 1 ? "Heading1" : "Heading2");
}

function stylesXml() {
  const font = `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/>`;
  return xmlHeader() + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="288" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>${style("Normal", "Обычный", "paragraph", `<w:qFormat/><w:pPr><w:spacing w:after="0" w:line="288" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:rPr>${font}<w:sz w:val="24"/></w:rPr>`)}${style("Organization", "Организация", "paragraph", `<w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:rPr>${font}<w:sz w:val="24"/></w:rPr>`)}${style("Title", "Заголовок документа", "paragraph", `<w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/><w:keepNext/></w:pPr><w:rPr>${font}<w:b/><w:sz w:val="28"/></w:rPr>`)}${style("DocumentCode", "Обозначение документа", "paragraph", `<w:pPr><w:jc w:val="center"/><w:spacing w:before="300" w:after="120"/><w:keepNext/></w:pPr><w:rPr>${font}<w:sz w:val="28"/></w:rPr>`)}${style("TitleMeta", "Данные титула", "paragraph", `<w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:rPr>${font}<w:sz w:val="22"/></w:rPr>`)}${style("SectionTitle", "Ненумерованный заголовок", "paragraph", `<w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/><w:keepNext/></w:pPr><w:rPr>${font}<w:b/><w:sz w:val="28"/></w:rPr>`)}${style("Heading1", "Заголовок 1", "paragraph", `<w:qFormat/><w:pPr><w:spacing w:before="240" w:after="160"/><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr>${font}<w:b/><w:sz w:val="28"/></w:rPr>`)}${style("Heading2", "Заголовок 2", "paragraph", `<w:qFormat/><w:pPr><w:spacing w:before="200" w:after="120"/><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr>${font}<w:b/><w:sz w:val="24"/></w:rPr>`)}${style("Warning", "Предупреждение", "paragraph", `<w:pPr><w:spacing w:before="120" w:after="120"/><w:ind w:left="360" w:right="360"/><w:jc w:val="both"/></w:pPr><w:rPr>${font}<w:b/><w:sz w:val="22"/></w:rPr>`)}${style("TableText", "Текст таблицы", "paragraph", `<w:pPr><w:spacing w:after="0" w:line="220" w:lineRule="auto"/></w:pPr><w:rPr>${font}<w:sz w:val="18"/></w:rPr>`)}${style("TableHeader", "Заголовок таблицы", "paragraph", `<w:pPr><w:spacing w:after="0" w:line="220" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:rPr>${font}<w:b/><w:sz w:val="18"/></w:rPr>`)}</w:styles>`;
}

function style(id, name, type, content) {
  return `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>${content}</w:style>`;
}

function contentTypesXml() {
  return xmlHeader() + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/footer3.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function packageRelationshipsXml() {
  return xmlHeader() + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function documentRelationshipsXml() {
  return xmlHeader() + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer3.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`;
}

function settingsXml() {
  return xmlHeader() + `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/></w:settings>`;
}

function firstPageFooterXml(title, designation) {
  const widths = [1050, 1850, 1050, 1550, 2988, 2000];
  const rows = [
    footerRow(["Изм.", "Лист", "№ докум.", "Подп.", "Дата", ""], widths, true),
    footerRow(["Разраб.", "[ФИО]", "", "", "", title], widths),
    footerRow(["Пров.", "[ФИО]", "", "", "", designation], widths),
    footerRow(["Н. контр.", "[ФИО]", "", "", "", "Пояснительная записка"], widths),
    footerRow(["Утв.", "[ФИО]", "", "", "", "Лит.   Лист   Листов"], widths),
  ].join("");
  return xmlHeader() + `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${footerTable(rows, widths)}<w:p/></w:ftr>`;
}

function continuationFooterXml(designation) {
  const widths = [1400, 6088, 1500, 1500];
  const page = `<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>`;
  const pages = `<w:fldSimple w:instr="NUMPAGES"><w:r><w:t>1</w:t></w:r></w:fldSimple>`;
  const row = footerRowXml([
    footerCellText("Изм.  Лист  № докум.  Подп.  Дата", widths[0]),
    footerCellText(designation, widths[1], true),
    footerCellXml(`<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="14"/></w:rPr><w:t>Лист </w:t></w:r>${page}`, widths[2]),
    footerCellXml(`<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="14"/></w:rPr><w:t>Листов </w:t></w:r>${pages}`, widths[3]),
  ]);
  return xmlHeader() + `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${footerTable(row, widths)}<w:p/></w:ftr>`;
}

function footerTable(rows, widths) {
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="12" w:color="000000"/><w:left w:val="single" w:sz="12" w:color="000000"/><w:bottom w:val="single" w:sz="12" w:color="000000"/><w:right w:val="single" w:sz="12" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
}

function footerRow(values, widths, bold = false) {
  return footerRowXml(values.map((value, index) => footerCellText(value, widths[index], bold)));
}

function footerRowXml(cells) {
  return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join("")}</w:tr>`;
}

function footerCellText(value, width, bold = false) {
  return footerCellXml(`<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>${bold ? "<w:b/>" : ""}<w:sz w:val="14"/></w:rPr><w:t>${escapeXml(value)}</w:t></w:r>`, width);
}

function footerCellXml(content, width) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>${content}</w:p></w:tc>`;
}

function corePropertiesXml(title, timestamp) {
  return xmlHeader() + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)} — черновик РКД</dc:title><dc:creator>MES</dc:creator><dc:subject>Автоматически сформированный каркас РКД</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`;
}

function appPropertiesXml() {
  return xmlHeader() + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MES Specifications 2.0</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><Company>MES</Company><AppVersion>1.0</AppVersion></Properties>`;
}

function createStoredZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  entries.forEach(([name, source]) => {
    const nameBytes = encoder.encode(name);
    const data = typeof source === "string" ? encoder.encode(source) : source;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length;
  });
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralOffset, true);
  return concatBytes([...localParts, ...centralParts, eocd]);
}

function concatBytes(parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sanitizeFileName(value) {
  return cleanText(value).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").slice(0, 96) || "specification";
}

function formatDateTime(value) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(value.getDate())}.${pad(value.getMonth() + 1)}.${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractDesignation(value) {
  return cleanText(value).toUpperCase().match(/[А-ЯЁA-Z]{2,}\.\d{6}\.\d{3}/)?.[0] || "";
}

function escapeXml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function xmlHeader() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
}
