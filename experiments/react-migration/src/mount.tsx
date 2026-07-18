import { createRoot, type Root } from "react-dom/client";
import { NomenclatureScenario } from "./modules/nomenclature/NomenclatureScenario";

export interface NomenclatureReactIslandHandle {
  update(payload: unknown): void;
  unmount(): void;
}

export function mountNomenclatureReactIsland(target: HTMLElement, initialPayload: unknown): NomenclatureReactIslandHandle {
  if (!(target instanceof HTMLElement)) throw new TypeError("Nomenclature React island requires an HTMLElement target");

  const root: Root = createRoot(target);
  let mounted = true;

  const render = (payload: unknown) => {
    if (!mounted) throw new Error("Nomenclature React island is already unmounted");
    root.render(<NomenclatureScenario payload={payload} />);
  };

  render(initialPayload);
  return {
    update(payload) {
      render(payload);
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      root.unmount();
    },
  };
}
