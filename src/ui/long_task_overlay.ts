interface LongTaskOptions {
  title: string;
  detail: string;
  revealDelayMs: number;
  minimumVisibleMs: number;
}

const DEFAULT_OPTIONS: Readonly<LongTaskOptions> = {
  title: "Сервис выполняет расчёт",
  detail: "Пожалуйста, не закрывайте страницу",
  revealDelayMs: 180,
  minimumVisibleMs: 420,
};

let overlay: HTMLElement | null = null;
let activeTaskId = 0;

function ensureOverlay(): HTMLElement {
  if (overlay?.isConnected) return overlay;
  const existingOverlay = document.querySelector<HTMLElement>(".mes-long-task-overlay");
  if (existingOverlay) {
    overlay = existingOverlay;
    return existingOverlay;
  }
  const createdOverlay = document.createElement("section");
  createdOverlay.className = "mes-long-task-overlay";
  createdOverlay.setAttribute("role", "status");
  createdOverlay.setAttribute("aria-live", "polite");
  createdOverlay.setAttribute("aria-hidden", "true");
  createdOverlay.innerHTML = `
    <div class="mes-long-task-card">
      <span class="mes-long-task-kicker">MES · обработка данных</span>
      <div class="mes-long-task-spinner" aria-hidden="true"><i></i><i></i><i></i></div>
      <strong data-mes-long-task-title></strong>
      <span data-mes-long-task-detail></span>
      <div class="mes-long-task-progress" aria-hidden="true"><i></i></div>
      <small>Интерфейс продолжит работу автоматически</small>
    </div>
  `;
  document.body.append(createdOverlay);
  overlay = createdOverlay;
  return createdOverlay;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function runLongTask<T>(
  task: (() => T | PromiseLike<T>) | null | undefined,
  options: Partial<LongTaskOptions> = {},
): Promise<T | undefined> {
  if (typeof task !== "function") return undefined;
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const taskId = ++activeTaskId;
  const element = ensureOverlay();
  const titleElement = element.querySelector<HTMLElement>("[data-mes-long-task-title]");
  const detailElement = element.querySelector<HTMLElement>("[data-mes-long-task-detail]");
  if (!titleElement || !detailElement) throw new Error("Long task overlay template is incomplete");
  titleElement.textContent = settings.title;
  detailElement.textContent = settings.detail;
  element.classList.add("is-pending");
  element.setAttribute("aria-hidden", "false");

  // Give the browser time to paint the overlay before a synchronous calculation
  // occupies the main thread. This wrapper is used only for intentionally heavy actions.
  await wait(Math.max(0, Number(settings.revealDelayMs) || 0));
  element.classList.add("is-visible");
  const visibleAt = Date.now();

  try {
    return await task();
  } finally {
    const remaining = Math.max(0, Number(settings.minimumVisibleMs) - (Date.now() - visibleAt));
    if (remaining) await wait(remaining);
    if (taskId !== activeTaskId) return;
    element.classList.remove("is-visible", "is-pending");
    element.setAttribute("aria-hidden", "true");
  }
}
