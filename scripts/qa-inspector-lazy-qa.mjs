import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const [indexSource, inspectorSource] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "src/qa_inspector.js"), "utf8"),
]);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(!indexSource.includes('<script type="module" src="./src/qa_inspector.js?v=2"></script>'),
  "QA-инспектор не должен быть статическим модулем стартовой страницы");
expect(!indexSource.includes('<link rel="stylesheet" href="./styles/ui/qa-inspector.css?v=2"'),
  "CSS QA-инспектора не должен быть частью критического пути");
expect(indexSource.includes('params.get("qa_inspector") === "1"'),
  "должен сохраниться URL-переключатель qa_inspector=1");
expect(indexSource.includes('event.key.toLowerCase() === "q"'),
  "должно сохраниться сочетание Cmd/Ctrl+Shift+Q");
expect(inspectorSource.includes('export function startQaInspector'),
  "динамический QA-инспектор должен экспортировать стартовую функцию");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}

console.log("QA inspector lazy-load QA passed");
