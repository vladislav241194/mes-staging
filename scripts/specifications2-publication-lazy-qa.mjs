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
expect(appSource.includes('import("./modules/domain_api/specifications2_work_order_commands.js")'), "Specifications 2.0 work-order API must load with its production owner");
expect(appSource.includes("createSpecifications2ProductionOwner({"), "Specifications 2.0 must initialize the production command owner");
expect(!appSource.includes("initializeSpecifications2Module"), "Specifications 2.0 legacy initializer must be retired");
expect(!appSource.includes("ensureSpecifications2Module"), "Specifications 2.0 legacy loader must be retired");
expect(!appSource.includes("specifications2/render.js"), "Specifications 2.0 legacy renderer must not remain in the runtime graph");
expect(!appSource.includes("specifications2PublishCommands"), "Specifications 2.0 app shell must not retain the legacy publish command adapter");
expect(!appSource.includes("specifications2AttachmentCommands"), "Specifications 2.0 app shell must not retain the legacy attachment command adapter");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}
console.log("Specifications 2.0 publication lazy-load QA passed");
