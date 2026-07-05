# Phase 6 Compatibility Wrappers

| wrapper | delegates to | why kept | removal condition |
| --- | --- | --- | --- |
| `renderDispatchPage` in `src/app.js` | `renderDispatchModulePage` in `src/modules/dispatch/render.js` | The current module switch still calls the historical app-level function name. | Remove after module router extraction can call module renderers directly. |

## Rule

Compatibility wrappers must stay thin. They may pass dependencies into extracted renderers, but must not contain duplicated HTML, selectors, state mutation or business logic.
