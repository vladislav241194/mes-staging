import { createRoot } from "react-dom/client";
import { nomenclatureFixture } from "./modules/nomenclature/fixture";
import { NomenclatureScenario } from "./modules/nomenclature/NomenclatureScenario";

const root = document.querySelector<HTMLElement>("#root");
if (!root) throw new Error("React migration lab root is missing");
createRoot(root).render(<NomenclatureScenario payload={nomenclatureFixture} />);
