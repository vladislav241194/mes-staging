import { nomenclatureFixture, nomenclatureUpdateFixture } from "./modules/nomenclature/fixture";
import { mountNomenclatureReactIsland } from "./mount";

const root = document.querySelector<HTMLElement>("#root");
if (!root) throw new Error("React migration lab root is missing");
const island = mountNomenclatureReactIsland(root, nomenclatureFixture);

const lifecycleQaEnabled = new URL(window.location.href).searchParams.get("lifecycle_qa") === "1";
if (lifecycleQaEnabled) {
  const controls = document.querySelector<HTMLElement>("[data-lifecycle-controls]");
  const updateButton = document.querySelector<HTMLButtonElement>("[data-lifecycle-update]");
  const unmountButton = document.querySelector<HTMLButtonElement>("[data-lifecycle-unmount]");
  const status = document.querySelector<HTMLElement>("[data-lifecycle-status]");
  if (!controls || !updateButton || !unmountButton || !status) throw new Error("Lifecycle QA controls are missing");

  controls.hidden = false;
  updateButton.addEventListener("click", () => {
    try {
      island.update(nomenclatureUpdateFixture);
      status.textContent = "updated";
    } catch (error) {
      status.textContent = error instanceof Error ? `rejected: ${error.message}` : "rejected";
    }
  });
  unmountButton.addEventListener("click", () => {
    island.unmount();
    unmountButton.disabled = true;
    status.textContent = "unmounted";
  });
}
