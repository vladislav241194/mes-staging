import assert from "node:assert/strict";
import { buildSpecifications2RkdDraftDocx } from "../src/modules/specifications2/rkd_docx_draft.js";

const bytes = buildSpecifications2RkdDraftDocx({
  title: "АБВГ.469659.001 Калоша",
  fileName: "АБВГ.469659.001 Калоша.xlsx",
  treeRows: [
    { nodeKey: "root", label: "АБВГ.469659.001 Калоша", designation: "АБВГ.469659.001", type: "Изделие", level: 0, status: "ok" },
    { nodeKey: "board", parentKey: "root", label: "АБВГ.468332.002 Плата управления", designation: "АБВГ.468332.002", type: "СЕ", quantity: 1, unitOfMeasure: "шт.", level: 1, status: "ok" },
    { nodeKey: "pcb", parentKey: "board", label: "BAT_SW v.6.2.4", type: "ПП", quantity: 1, unitOfMeasure: "шт.", level: 2, status: "ok" },
    { nodeKey: "cap", parentKey: "board", label: "Чип конденсатор 100нФ", type: "РЭК", quantity: 7, unitOfMeasure: "шт.", level: 2, status: "ok" },
  ],
});

assert(bytes instanceof Uint8Array);
assert(bytes.length > 5000);
assert.equal(bytes[0], 0x50);
assert.equal(bytes[1], 0x4b);
const raw = new TextDecoder().decode(bytes);
assert(raw.includes("[Content_Types].xml"));
assert(raw.includes("word/document.xml"));
assert(raw.includes("ПОЯСНИТЕЛЬНАЯ ЗАПИСКА"));
assert(raw.includes("АБВГ.469659.001 ПЗ"));
assert(raw.includes("Чип конденсатор 100нФ"));
assert(raw.includes("Описание и обоснование конструкции"));
assert(raw.includes("ЛИСТ РЕГИСТРАЦИИ ИЗМЕНЕНИЙ"));
assert(raw.includes("word/footer2.xml"));

console.log(`Specifications 2.0 RКД DOCX draft: OK (${bytes.length} bytes)`);
