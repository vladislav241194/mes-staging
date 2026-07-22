export function createShiftCalendarLegacyApi(dependencies = {}) {
  const {
    app = null,
    escapeCssIdentifier = () => "",
    moveShiftWorkbenchDate = () => false,
    setShiftWorkbenchDate = () => false,
    setShiftWorkbenchToday = () => false,
  } = dependencies;

  function bindShiftCalendarEvents() {
    if (!app || typeof app.querySelector !== "function" || typeof app.querySelectorAll !== "function") {
      return false;
    }

    const dateField = app.querySelector("[data-shift-calendar-date]");
    dateField?.addEventListener("change", (event) => {
      setShiftWorkbenchDate(event.target.value);
    });

    app.querySelectorAll("[data-shift-calendar-step]").forEach((button) => {
      button.addEventListener("click", () => {
        moveShiftWorkbenchDate(button.dataset.shiftCalendarStep || 0);
      });
    });

    app.querySelector("[data-shift-calendar-today]")?.addEventListener("click", () => {
      setShiftWorkbenchToday();
    });

    app.querySelectorAll("[data-shift-calendar-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const inputId = button.dataset.shiftCalendarOpen || "";
        let field = dateField;
        if (inputId) {
          let escapedInputId = "";
          try {
            escapedInputId = escapeCssIdentifier(inputId);
          } catch {
            return;
          }
          if (!escapedInputId) return;
          field = app.querySelector(`#${escapedInputId}`);
        }
        if (!field) return;
        field.focus({ preventScroll: true });
        if (typeof field.showPicker === "function") {
          field.showPicker();
        }
      });
    });

    return true;
  }

  return { bindShiftCalendarEvents };
}
