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

export function SidebarItem({ active, count, label, meta, onClick }: { active: boolean; count: number; label: string; meta?: ReactNode; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={active ? "filter is-active" : "filter"}
      data-ui-component="SidebarItem"
      onClick={onClick}
      type="button"
    >
      <span className="filter-copy"><span>{label}</span>{meta ? <small>{meta}</small> : null}</span><b>{count}</b>
    </button>
  );
}

export function Panel({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  return <div className="panel" data-ui-component="Panel">{heading}{children}</div>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="table-wrap ui-table-wrap" data-scroll-contract="horizontal-only" data-ui-component="TableWrap">{children}</div>;
}

export function MetricGrid({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  return <div aria-label={label} className={["metric-grid", className].filter(Boolean).join(" ")} data-ui-component="MetricGrid">{children}</div>;
}

export function MetricCard({ label, meta, value }: { label: ReactNode; meta?: ReactNode; value: ReactNode }) {
  return <article className="metric-card" data-ui-component="MetricCard"><span>{label}</span><strong>{value}</strong>{meta ? <small>{meta}</small> : null}</article>;
}

export function ActionButton({ children, disabled = false, onClick, title, variant = "primary" }: { children: ReactNode; disabled?: boolean; onClick?(): void; title?: string; variant?: "primary" | "secondary" | "danger" }) {
  return <button className={`action action--${variant}`} data-ui-component="ActionButton" disabled={disabled} onClick={onClick} title={title} type="button">{children}</button>;
}

export function DeleteConfirmation({ busy = false, children, error = "", id, onCancel, onConfirm, title }: {
  busy?: boolean;
  children: ReactNode;
  error?: string;
  id: string;
  onCancel(): void;
  onConfirm(): void;
  title: string;
}) {
  return <div aria-labelledby={id} className="react-nomenclature-delete-confirm" data-ui-component="DeleteConfirmation" role="alertdialog">
    <h3 id={id}>{title}</h3>
    {children}
    {error ? <p className="react-nomenclature-command-error" role="alert">{error}</p> : null}
    <div className="react-nomenclature-editor-actions">
      <ActionButton disabled={busy} onClick={onCancel} variant="secondary">Не удалять</ActionButton>
      <ActionButton disabled={busy} onClick={onConfirm} variant="danger">{busy ? "Удаление…" : "Удалить"}</ActionButton>
    </div>
  </div>;
}

export function OperationalPage({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  return <main aria-label={label} className={["module-page", className].filter(Boolean).join(" ")} data-ui-component="OperationalPage">{children}</main>;
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
