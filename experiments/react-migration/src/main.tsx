import { componentTypesFixture, componentTypesUpdateFixture } from "./modules/component-types/fixture";
import { nomenclatureFixture, nomenclatureUpdateFixture } from "./modules/nomenclature/fixture";
import { mountReactMigrationIsland, type ReactMigrationScenarioId } from "./mount";

const root = document.querySelector<HTMLElement>("#root");
if (!root) throw new Error("React migration lab root is missing");
const searchParams = new URL(window.location.href).searchParams;
const scenario: ReactMigrationScenarioId = searchParams.get("scenario") === "component-types" ? "componentTypes" : "nomenclature";
const initialPayload = scenario === "componentTypes" ? componentTypesFixture : nomenclatureFixture;
const updatePayload = scenario === "componentTypes" ? componentTypesUpdateFixture : nomenclatureUpdateFixture;
let lifecycleStatus: HTMLElement | null = null;
const performancePrefix = `mes-react-island:${scenario}`;
let nextExpectedRevision = 1;
const markRevisionStart = (revision: number) => {
  const markName = `${performancePrefix}:start:${revision}`;
  performance.clearMarks(markName);
  performance.mark(markName);
};
const recordRevisionCommit = (revision: number) => {
  const startName = `${performancePrefix}:start:${revision}`;
  const commitName = `${performancePrefix}:commit:${revision}`;
  const measureName = `${performancePrefix}:duration:${revision}`;
  performance.mark(commitName);
  performance.clearMeasures(measureName);
  if (performance.getEntriesByName(startName, "mark").length) performance.measure(measureName, startName, commitName);
  const duration = performance.getEntriesByName(measureName, "measure").at(-1)?.duration;
  root.dataset.reactIslandScenario = scenario;
  root.dataset.reactIslandRevision = String(revision);
  if (typeof duration === "number") root.dataset.reactIslandCommitMs = duration.toFixed(2);
  nextExpectedRevision = revision + 1;
};
const renderLegacyFallback = (context: LegacyFallbackContext) => {
  const fallback = document.createElement("section");
  fallback.className = "legacy-fallback";
  fallback.dataset.legacyFallback = context.reason;
  fallback.setAttribute("role", context.error ? "alert" : "status");
  const title = document.createElement("strong");
  title.textContent = "Legacy-интерфейс восстановлен";
  const text = document.createElement("p");
  text.textContent = context.reason === "disabled"
    ? "React-сценарий выключен feature flag."
    : "React-сценарий остановлен; пользователь может продолжить в прежнем интерфейсе.";
  fallback.append(title, text);
  root.replaceChildren(fallback);
  if (lifecycleStatus) lifecycleStatus.textContent = context.error ? `legacy: ${context.error.message}` : `legacy: ${context.reason}`;
};
const featureGate = createReactIslandFeatureGate({
  enabled: searchParams.get("react") !== "0",
  target: root,
  mount(target, payload, onError) {
    return mountReactMigrationIsland(target, scenario, payload, {
      onError,
      onReady: ({ revision }) => recordRevisionCommit(revision),
    });
  },
  renderLegacy: renderLegacyFallback,
});
markRevisionStart(nextExpectedRevision);
featureGate.activate(initialPayload);

const lifecycleQaEnabled = searchParams.get("lifecycle_qa") === "1";
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
      markRevisionStart(nextExpectedRevision);
      status.textContent = featureGate.update(updatePayload) ? "updated" : `rejected: ${featureGate.getState()}`;
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
    featureGate.update(crashingPayload);
  });
  unmountButton.addEventListener("click", () => {
    featureGate.dispose();
    errorButton.disabled = true;
    updateButton.disabled = true;
    unmountButton.disabled = true;
    status.textContent = "unmounted";
  });
  if (featureGate.getState() === "legacy") status.textContent = "legacy: disabled";
}
import { createReactIslandFeatureGate, type LegacyFallbackContext } from "./feature-gate";
