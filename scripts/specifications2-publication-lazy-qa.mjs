import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const appSource = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(!appSource.includes('import { publishSpecifications2Entry as buildSpecifications2Publication } from "./modules/specifications2/publication.js";'), "Specifications 2.0 publication must not remain a static app import");
expect(appSource.includes('import("./modules/specifications2/publication.js")'), "Specifications 2.0 publication must load with its module");
expect(!appSource.includes('import { createSpecifications2RevisionsReadModel } from "./modules/domain_api/specifications2_revisions_read_model.js";'), "Specifications 2.0 revision read API must not remain a static app import");
expect(!appSource.includes('import { createSpecifications2PublishCommands } from "./modules/domain_api/specifications2_publish_commands.js";'), "Specifications 2.0 publish API must not remain a static app import");
expect(!appSource.includes('import { createSpecifications2AttachmentCommands } from "./modules/domain_api/specifications2_attachment_commands.js";'), "Specifications 2.0 attachment API must not remain a static app import");
expect(appSource.includes('import("./modules/domain_api/specifications2_revisions_read_model.js")'), "Specifications 2.0 revision read API must load with its module");
expect(appSource.includes('import("./modules/domain_api/specifications2_publish_commands.js")'), "Specifications 2.0 publish API must load with its module");
expect(appSource.includes('import("./modules/domain_api/specifications2_attachment_commands.js")'), "Specifications 2.0 attachment API must load with its module");
expect(appSource.includes("initializeSpecifications2Module(createSpecifications2Module, publishSpecifications2Entry)"), "Publication factory must be injected after the lazy import resolves");
expect(appSource.includes("function initializeSpecifications2Module(factory, buildSpecifications2Publication)"), "Specifications 2.0 initializer must keep a synchronous publication dependency");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}
console.log("Specifications 2.0 publication lazy-load QA passed");
