import { SidebarItem } from "../../ui/components";

export type DirectorySectionId = "operations" | "componentTypes" | "nomenclatureTypes" | "statuses";

const DIRECTORY_SECTIONS: ReadonlyArray<{ id: DirectorySectionId; label: string }> = [
  { id: "operations", label: "Операции" },
  { id: "componentTypes", label: "Типы компонентов" },
  { id: "nomenclatureTypes", label: "Типы номенклатуры" },
  { id: "statuses", label: "Статусы" },
];

export function DirectorySectionNavigation({
  activeId,
  onNavigate,
}: {
  activeId: DirectorySectionId;
  onNavigate?(sectionId: DirectorySectionId): void;
}) {
  if (!onNavigate) return null;
  return <div className="react-directory-section-navigation" data-react-directory-section-navigation>
    <span className="react-directory-section-navigation-label">Справочники</span>
    {DIRECTORY_SECTIONS.map((section) => <SidebarItem
      active={section.id === activeId}
      count={null}
      key={section.id}
      label={section.label}
      onClick={() => onNavigate(section.id)}
    />)}
    <span className="react-directory-section-navigation-label">Фильтры раздела</span>
  </div>;
}
