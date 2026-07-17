const DEFAULT_OPTIONS = {
  title: "Сервис выполняет расчёт",
  detail: "Пожалуйста, не закрывайте страницу",
  revealDelayMs: 180,
  minimumVisibleMs: 420,
};

let overlay = null;
let activeTaskId = 0;

function ensureOverlay() {
  if (overlay?.isConnected) return overlay;
  overlay = document.querySelector(".mes-long-task-overlay");
  if (overlay) return overlay;
  overlay = document.createElement("section");
  overlay.className = "mes-long-task-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="mes-long-task-card">
      <span class="mes-long-task-kicker">MES · обработка данных</span>
      <div class="mes-long-task-spinner" aria-hidden="true"><i></i><i></i><i></i></div>
      <strong data-mes-long-task-title></strong>
      <span data-mes-long-task-detail></span>
      <div class="mes-long-task-progress" aria-hidden="true"><i></i></div>
      <small>Интерфейс продолжит работу автоматически</small>
    </div>
  `;
  document.body.append(overlay);
  return overlay;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function runLongTask(task, options = {}) {
  if (typeof task !== "function") return undefined;
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const taskId = ++activeTaskId;
  const element = ensureOverlay();
  element.querySelector("[data-mes-long-task-title]").textContent = settings.title;
  element.querySelector("[data-mes-long-task-detail]").textContent = settings.detail;
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
