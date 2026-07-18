import type { ReactNode } from "react";

export function ModuleHeader({ eyebrow, title, badge }: { eyebrow: string; title: string; badge?: ReactNode }) {
  return (
    <header className="module-header" data-ui-component="ModuleHeader">
      <div><p>{eyebrow}</p><h1>{title}</h1></div>
      {badge}
    </header>
  );
}

export function ModulePage({ header, sidebar, children }: { header: ReactNode; sidebar: ReactNode; children: ReactNode }) {
  return (
    <main className="module-page" data-ui-component="ModulePage">
      {header}
      <div className="module-layout">
        {sidebar}
        <section className="workspace" data-ui-component="ModuleWorkspace">{children}</section>
      </div>
    </main>
  );
}

export function ModuleSidebar({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <aside className="module-sidebar" aria-label={label} data-ui-component="ModuleSidebar">
      <strong>{title}</strong>
      {children}
    </aside>
  );
}

export function SidebarItem({ active, count, label, onClick }: { active: boolean; count: number; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={active ? "filter is-active" : "filter"}
      data-ui-component="SidebarItem"
      onClick={onClick}
      type="button"
    >
      <span>{label}</span><b>{count}</b>
    </button>
  );
}

export function Panel({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  return <div className="panel" data-ui-component="Panel">{heading}{children}</div>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="table-wrap" data-ui-component="TableWrap">{children}</div>;
}

export function ActionButton({ children, disabled = false, title, variant = "primary" }: { children: ReactNode; disabled?: boolean; title?: string; variant?: "primary" | "secondary" | "danger" }) {
  return <button className={`action action--${variant}`} data-ui-component="ActionButton" disabled={disabled} title={title} type="button">{children}</button>;
}

export function SelectableRow({ children, onSelect, selected }: { children: ReactNode; onSelect(): void; selected: boolean }) {
  return (
    <tr
      aria-selected={selected}
      className={selected ? "is-selected" : ""}
      data-ui-component="SelectableRow"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
    >
      {children}
    </tr>
  );
}

export interface DetailField {
  label: string;
  value: ReactNode;
}

export function DetailPanel({ emptyText, eyebrow, fields, title }: { emptyText: string; eyebrow: string; fields: DetailField[]; title?: string }) {
  return (
    <aside className="detail" aria-live="polite" data-ui-component="DetailPanel">
      {title ? <>
        <p>{eyebrow}</p><h2>{title}</h2>
        <dl>{fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      </> : <p>{emptyText}</p>}
    </aside>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state" data-ui-component="EmptyState" role="status">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export function SystemState({ title, text, tone = "error" }: { title: string; text: string; tone?: "error" | "neutral" }) {
  return (
    <div className={`system-state system-state--${tone}`} data-ui-component="SystemState" role={tone === "error" ? "alert" : "status"}>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export function StatusToken({ label, tone }: { label: string; tone: "success" | "warning" | "neutral" }) {
  return <span className={`status status--${tone}`} data-ui-component="StatusToken">{label}</span>;
}
