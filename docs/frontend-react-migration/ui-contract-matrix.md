# MES React UI contract matrix

Date: 2026-07-19
Baseline: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`

This matrix converts the existing HTML renderer contracts into React component
boundaries. It does not declare every legacy visual difference correct. Each
difference must be classified before migration as shared, process-specific, or
unresolved.

## Shared contracts

| Legacy renderer / marker | React boundary | Invariant | Allowed variation |
| --- | --- | --- | --- |
| `renderUiModulePage` / `ModulePage` | `ModulePage` | One semantic page root and one workspace | Layout family and protected mode |
| `renderUiModuleHeader` / `ModuleHeader` | `ModuleHeader` | Eyebrow, title, description/actions slots | Standard, special, absent |
| `renderUiModuleSidebar` / `ModuleSidebar` | `ModuleSidebar` | Named navigation/filter region | Required or absent; width by family |
| `renderUiSidebarItem` / `SidebarItem` | `SidebarItem` | Button semantics, active state, optional count | Registry, tree, filter variants |
| `renderUiPanel` / `Panel` | `Panel` | Header/body separation and stable surface | Density and process-specific content |
| `renderUiTableWrap` / `TableWrap` | `TableWrap` | Horizontal overflow owner and table semantics | Dense, standard, print |
| `renderUiStatusToken` / `StatusToken` | `StatusToken` | Text plus semantic tone; color is not the only signal | Domain-specific labels mapped to shared tones |
| `renderUiActionButton` / `ActionButton` | `ActionButton` | Native button state, focus, disabled reason | Primary, secondary, danger, compact |
| `renderUiSystemState` / `SystemState` | `SystemState` | Explicit loading, empty, error and unavailable states | Message and recovery action |
| modal/drawer/dropdown renderers | Overlay primitives | Focus ownership, close behavior, labelled frame | Size and domain content |

## Module-family decisions

| Family | Shared | Remains specialized | First proof |
| --- | --- | --- | --- |
| Registry/sidebar | Page, header, sidebar, filters, panel, table, status | Entity-specific columns and detail card | Nomenclature read-only scenario |
| Dense planning | Header, toolbar, status, loading/error | Dense grids, calendar and planning calculations | After registry proof |
| Operational | Status, action, overlay frames | Workshop board, worker fact entry, shift documents | After PostgreSQL final acceptance |
| Protected canvas | Shell-level states only | Gantt geometry and Specifications tree/editor | Late migration with dedicated guardrails |
| Admin/standalone | Buttons, panels, states | Security perimeter and standalone shell | Separate acceptance path |

## Difference classification

- **Shared:** same user meaning and behavior. Implement once.
- **Process-specific:** same primitive, different composition required by the
  manufacturing workflow. Keep a named specialized component.
- **Unresolved:** two legacy implementations disagree and neither is approved.
  Do not encode both as permanent React variants; select a target during the
  module acceptance pass.

The initial lab implements `ModulePage`, `ModuleHeader`, `ModuleSidebar`,
`SidebarItem`, `Panel`, `TableWrap`, and `StatusToken`. It deliberately leaves
write actions disabled until an accepted API contract is connected.
