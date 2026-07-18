import { nomenclatureFixture, nomenclatureUpdateFixture } from "./modules/nomenclature/fixture";
import { mountNomenclatureReactIsland } from "./mount";

const root = document.querySelector<HTMLElement>("#root");
if (!root) throw new Error("React migration lab root is missing");
let lifecycleStatus: HTMLElement | null = null;
const island = mountNomenclatureReactIsland(root, nomenclatureFixture, {
  onError(error) {
    if (lifecycleStatus) lifecycleStatus.textContent = `error: ${error.message}`;
  },
});

const lifecycleQaEnabled = new URL(window.location.href).searchParams.get("lifecycle_qa") === "1";
if (lifecycleQaEnabled) {
  const controls = document.querySelector<HTMLElement>("[data-lifecycle-controls]");
  const updateButton = document.querySelector<HTMLButtonElement>("[data-lifecycle-update]");
  const errorButton = document.querySelector<HTMLButtonElement>("[data-lifecycle-error]");
  const unmountButton = document.querySelector<HTMLButtonElement>("[data-lifecycle-unmount]");
  const status = document.querySelector<HTMLElement>("[data-lifecycle-status]");
  if (!controls || !updateButton || !errorButton || !unmountButton || !status) throw new Error("Lifecycle QA controls are missing");

  lifecycleStatus = status;
  controls.hidden = false;
  updateButton.addEventListener("click", () => {
    try {
      island.update(nomenclatureUpdateFixture);
      status.textContent = "updated";
    } catch (error) {
      status.textContent = error instanceof Error ? `rejected: ${error.message}` : "rejected";
    }
  });
  errorButton.addEventListener("click", () => {
    const crashingPayload = new Proxy({}, {
      get() {
        throw new Error("Lifecycle QA render failure");
      },
    });
    island.update(crashingPayload);
  });
  unmountButton.addEventListener("click", () => {
    island.unmount();
    errorButton.disabled = true;
    updateButton.disabled = true;
    unmountButton.disabled = true;
    status.textContent = "unmounted";
  });
}
