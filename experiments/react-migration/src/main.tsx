import { nomenclatureFixture } from "./modules/nomenclature/fixture";
import { mountNomenclatureReactIsland } from "./mount";

const root = document.querySelector<HTMLElement>("#root");
if (!root) throw new Error("React migration lab root is missing");
mountNomenclatureReactIsland(root, nomenclatureFixture);
