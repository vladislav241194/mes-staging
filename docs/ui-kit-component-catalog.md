# UI Kit Component Catalog

| Component | Helper | CSS Contract | Status |
| --- | --- | --- | --- |
| ModulePage | `renderUiModulePage` | `[data-ui-component="ModulePage"]` | production |
| ModuleSidebar | `renderUiModuleSidebar` | `[data-ui-component="ModuleSidebar"]` | production |
| ModuleHeader | `renderUiModuleHeader` | `[data-ui-component="ModuleHeader"]` | production |
| ModuleWorkspace | `renderUiModulePage` | `[data-ui-component="ModuleWorkspace"]` | production |
| ModuleContent | `renderUiModulePage` | `[data-ui-component="ModuleContent"]` | production |
| Panel | `renderUiPanel` | `[data-ui-component="Panel"]` | production |
| PanelHead | `renderUiPanelHead` | `[data-ui-component="PanelHead"]` | production |
| PanelBody | `renderUiPanelBody` | `[data-ui-component="PanelBody"]` | production |
| PanelFooter | `renderUiPanelFooter` | `[data-ui-component="PanelFooter"]` | production |
| ActionButton | `renderUiActionButton` | `[data-ui-component="ActionButton"]` | production |
| ActionBar | `renderUiActionBar` | `[data-ui-component="ActionBar"]` | production |
| Toolbar | `renderUiToolbar` | `[data-ui-component="Toolbar"]` | production |
| FilterBar | `renderUiFilterBar` | `[data-ui-component="FilterBar"]` | production |
| StatusToken | `renderUiStatusToken` | `[data-ui-component="StatusToken"]` | production |
| TableWrap | `renderUiTableWrap` | `[data-ui-component="TableWrap"]` | production |
| FormField | `renderUiFormField` | `[data-ui-component="FormField"]` | production |
| Dropdown | `renderUiDropdownFrame` | `[data-ui-component="Dropdown"]` | production |
| Modal | `renderUiModalFrame`, `renderUiModalShell` | `[data-ui-component="Modal"]` | production |
| Drawer | `renderUiDrawerFrame`, `renderUiDrawerShell` | `[data-ui-component="Drawer"]` | production |
| EmptyState | `renderUiEmptyState` | `[data-ui-component="EmptyState"]` | production |
| DemoBadge | `renderUiDemoBadge` | `[data-ui-component="DemoBadge"]` | production for demo marking |
| DemoMarker | marker helpers | `[data-ui-component="DemoMarker"]` | production for demo marking |
| GanttBar | `renderUiGanttBar` | `[data-ui-component="GanttBar"]` | production showcase, Gantt special runtime |

## Duplicate Patterns To Avoid

- Raw primary/secondary/table buttons without ActionButton marker.
- Local table wrappers with vertical scroll.
- Local panel headers with zero inset.
- Custom status pills with direct colors.
- Standalone modal headers and footers without PanelHead/PanelFooter marker.

## Production Showcase

`visualSystem` now includes `visual-system-internal-ui-kit`, which renders production helpers directly.
