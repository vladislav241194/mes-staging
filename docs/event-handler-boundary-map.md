# Event Handler Boundary Map

Phase 6 intentionally does not move event delegation or state mutation. Render extraction is allowed only when selectors and `data-*` attributes remain stable.

| module | data attributes | event handlers | state mutation | safe to move render | notes |
| --- | --- | --- | --- | --- | --- |
| `dispatch` | none module-specific in extracted body | none | none | yes | Placeholder renderer moved to `src/modules/dispatch/render.js`. Wrapper kept in `src/app.js`. |
| `nomenclature` | `data-nomenclature-*` | create/edit/delete/select handlers in `src/app.js` | yes | later with tests | Render includes form IDs and row selectors; not moved in Phase 6. |
| `directories` | directory row/filter/editor selectors | modal/editor handlers in `src/app.js` | yes | later with selector smoke | Too coupled for current safe pass. |
| `roles` | role preset/module access selectors | RBAC/auth-related handlers | yes | later with auth checks | Must preserve role/session behavior. |
| `planning` | planning/order route row controls | planning labor and order handlers | yes | no mass move | Business calculations and forms are coupled. |
| `gantt` | slot/dependency/resize/drag selectors | Gantt operational handlers | yes | no Phase 6 move | Protected by Phase 5 contract. |
| `timesheet` | timesheet cell/modal selectors | calendar/schedule handlers | yes | no Phase 6 move | Production availability logic is coupled. |
| `productionStructureMatrix` | matrix row/control selectors | structure matrix handlers | yes | no Phase 6 move | Source of org model and permissions. |
| `authPrototype` | auth wizard selectors | auth/session flow handlers | yes | no Phase 6 move | Login behavior must not change. |
| `authSessionPrototype` | report/fact/workdesk selectors | workdesk fact/report handlers | yes | no Phase 6 move | Connected to shift assignments and reports. |

## Rule

When moving a renderer out of `src/app.js`, preserve:

- `data-*` attributes;
- form IDs;
- class names used by QA scripts;
- button `type`;
- text that smoke tests rely on.

If any selector changes, update the owning functional QA in the same commit.
