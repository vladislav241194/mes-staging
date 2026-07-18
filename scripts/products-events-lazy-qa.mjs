import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const assert = (value, message) => {
  if (!value) throw new Error(message);
};

const appSource = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
const appEventsSource = await readFile(resolve(process.cwd(), "src/modules/app_events/service.js"), "utf8");
const routesEventsSource = await readFile(resolve(process.cwd(), "src/modules/routes/events.js"), "utf8");

assert(
  !appSource.includes('import { createProductsEventsModule } from "./modules/products/events.js";'),
  "Products event handlers must not remain a static application import",
);
assert(
  appSource.includes('loadProductsEventsModule: () => import("./modules/products/events.js")'),
  "App must pass a dedicated dynamic loader for products event handlers",
);
assert(
  appEventsSource.includes("loadProductsEventsModule,"),
  "App events service must forward the products event loader",
);
assert(
  routesEventsSource.includes("async function ensureProductsEvents()"),
  "Routes events must create the products event runtime lazily",
);
assert(
  routesEventsSource.includes("if (productsEventsApi) return productsEventsApi;"),
  "Products event runtime must be cached after its first load",
);
assert(
  routesEventsSource.includes("if (!productsEventsLoad)"),
  "Products event runtime must coalesce concurrent loads",
);
assert(
  routesEventsSource.includes("function bindProductsEvents(method, ...args)"),
  "Products event bind calls must dispatch through the lazy runtime",
);
assert(
  routesEventsSource.includes("if (productsEventsApi)"),
  "Loaded products event handlers must bind synchronously after a render",
);
assert(
  routesEventsSource.includes("const renderRoot = app.firstElementChild;"),
  "Deferred products event bindings must capture their render root",
);
assert(
  routesEventsSource.includes("if (app.firstElementChild !== renderRoot) return;"),
  "Deferred products event bindings must not attach to a later render",
);
assert(
  routesEventsSource.includes('bindProductsEvents("bindSpekiEvents", ...args);'),
  "Specifications bindings must use the lazy products event runtime",
);
assert(
  routesEventsSource.includes('bindProductsEvents("bindNomenclatureEvents", ...args);'),
  "Nomenclature bindings must use the lazy products event runtime",
);
assert(
  routesEventsSource.includes('bindProductsEvents("bindBomListsEvents", ...args);'),
  "BOM bindings must use the lazy products event runtime",
);

console.log("Products events lazy-load QA passed");
