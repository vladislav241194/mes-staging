# UI Contract Coverage Report

Generated: 2026-07-05T20:38:27.020Z

Viewport: 1710x1112

## Summary

- modules checked: 19
- contract: 13
- special-runtime: 2
- partial: 4
- legacy: 0
- unknown: 0

## Modules

module | status | AppShell | ModulePage | Panel | TableWrap | ActionButton | StatusToken | Overlay | exception | next migration
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
gantt | special-runtime | yes | - | - | - | yes | yes | yes | gantt-v1: GanttRuntime | special guardrails only
planning | contract | yes | yes | yes | yes | yes | yes | yes |  | covered
dispatch | partial | yes | yes | yes | - | yes | - | yes | Диспетчерская намеренно оставлена заглушкой после вывода старого функционала. | Либо удалить модуль из продуктового контура, либо собрать новый Dispatcher runtime через ModuleHeader/Panel.
shiftMasterBoard | contract | yes | yes | yes | - | yes | yes | yes |  | covered
authSessionPrototype | contract | yes | yes | yes | - | yes | - | yes | layout/data-dense module: TableWrap may be absent or specialized on some states | ActionBar/Toolbar
shiftWorkOrders | partial | yes | yes | yes | - | yes | - | yes | Живой журнал СЗН уже использует часть UI-kit, но browser coverage все еще фиксирует неполный hard-runtime contract. | Довести TableWrap/StatusToken/detail-panel до единого MES table/detail contract без изменения логики СЗН.
routes | contract | yes | yes | yes | yes | yes | - | yes |  | StatusToken
products | contract | yes | yes | yes | - | yes | - | yes |  | TableWrap
nomenclature | contract | yes | yes | yes | yes | yes | yes | yes |  | covered
productionStructureMatrix | contract | yes | yes | yes | yes | yes | yes | yes |  | covered
employees | partial | yes | yes | yes | - | yes | - | yes | Экран сотрудников оставлен как совместимость рядом с модулем структуры и не является целевой точкой ввода прав. | После финализации модуля структуры либо удалить экран, либо перевести на ModuleHeader/ActionBar/TableWrap.
timesheet | partial | yes | yes | yes | yes | yes | yes | yes | Табель является data-dense таблицей с особым режимом плотности; текущее покрытие не равно обычной панельной странице. | Выделить отдельный data-dense runtime contract или мигрировать header/action controls в hard-runtime без изменения таблицы.
roles | contract | yes | yes | yes | yes | yes | yes | yes |  | covered
directories | contract | yes | yes | yes | yes | yes | - | yes |  | covered
visualSystem | special-runtime | yes | - | yes | yes | yes | yes | yes | visual-system-v1: VisualSystemRuntime | special guardrails only
authPrototype | contract | yes | yes | yes | - | yes | - | - | layout/data-dense module: TableWrap may be absent or specialized on some states | ActionBar/Toolbar
planningTable | contract | yes | yes | yes | yes | yes | yes | yes |  | covered
supply | contract | yes | yes | yes | yes | yes | yes | yes |  | covered
shopMap | contract | yes | yes | yes | yes | yes | - | yes |  | covered

## Component Counts

- gantt: AppShell:1, ActionButton:56, StatusToken:4, Dropdown:1, GanttRuntime:1, GanttToolbar:1, GanttCanvas:1, GanttTimeline:1, GanttRowsLayer:1, GanttSlot:3, GanttDependencyLayer:1, GanttDependencyArrow:6
- planning: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:1, TableWrap:1, ActionButton:55, StatusToken:25, ActionBar:1, Dropdown:1
- dispatch: AppShell:1, ModulePage:1, Panel:1, ActionButton:43, Dropdown:1
- shiftMasterBoard: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:2, ActionButton:69, StatusToken:2, ActionBar:1, Dropdown:1
- authSessionPrototype: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:2, ActionButton:43, EmptyState:2, Dropdown:1
- shiftWorkOrders: AppShell:1, ModulePage:1, Panel:2, ActionButton:43, EmptyState:2, Dropdown:1
- routes: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:2, TableWrap:1, ActionButton:603, ActionBar:3, Dropdown:41
- products: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:1, ActionButton:44, ActionBar:1, EmptyState:1, Dropdown:1
- nomenclature: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:1, TableWrap:1, ActionButton:109, StatusToken:54, ActionBar:1, FilterBar:1, Dropdown:1
- productionStructureMatrix: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:2, TableWrap:1, ActionButton:51, StatusToken:7, ActionBar:1, Dropdown:1
- employees: AppShell:1, ModulePage:1, Panel:1, ActionButton:43, Dropdown:1
- timesheet: AppShell:1, ModulePage:1, Panel:2, TableWrap:1, ActionButton:2403, StatusToken:1, Toolbar:1, FilterBar:1, Dropdown:1
- roles: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:3, TableWrap:2, ActionButton:44, StatusToken:79, ActionBar:2, Dropdown:1
- directories: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:1, TableWrap:1, ActionButton:97, ActionBar:1, Dropdown:4
- visualSystem: AppShell:1, Panel:16, TableWrap:2, ActionButton:199, StatusToken:21, ActionBar:1, Toolbar:1, FilterBar:1, EmptyState:1, Modal:1, Drawer:1, Dropdown:2, VisualSystemRuntime:1
- authPrototype: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:1, ActionButton:9
- planningTable: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:11, TableWrap:8, ActionButton:43, StatusToken:104, ActionBar:1, Dropdown:1
- supply: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:2, TableWrap:1, ActionButton:103, StatusToken:1, ActionBar:1, Dropdown:1
- shopMap: AppShell:1, ModulePage:1, ModuleHeader:1, Panel:5, TableWrap:1, ActionButton:63, ActionBar:1, Dropdown:1
