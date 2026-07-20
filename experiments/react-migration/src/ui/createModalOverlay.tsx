import type { ReactNode, useEffect as UseEffect, useRef as UseRef } from "react";
import { ActionButton } from "./components";

export interface ModalOverlayProps {
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  footer?: ReactNode;
  label: string;
  onClose(): void;
  title: string;
}

export function createModalOverlay(useEffect: typeof UseEffect, useRef: typeof UseRef) {
  return function ModalOverlay({ children, className = "", eyebrow, footer, label, onClose, title }: ModalOverlayProps) {
    const dialogRef = useRef<HTMLElement>(null);
    useEffect(() => {
      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const dialog = dialogRef.current;
      const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
      (focusable()[0] || dialog)?.focus();
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
        if (event.key !== "Tab") return;
        const items = focusable();
        if (!items.length) { event.preventDefault(); dialog?.focus(); return; }
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      };
      document.addEventListener("keydown", onKeyDown);
      return () => { document.removeEventListener("keydown", onKeyDown); requestAnimationFrame(() => { if (previousFocus?.isConnected) previousFocus.focus(); }); };
    }, [onClose]);
    return <div className="react-modal-backdrop" data-ui-component="ModalBackdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section aria-label={label} aria-modal="true" className={["react-modal", className].filter(Boolean).join(" ")} data-ui-component="Modal" ref={dialogRef} role="dialog" tabIndex={-1}><header><div>{eyebrow ? <span>{eyebrow}</span> : null}<h2>{title}</h2></div><ActionButton onClick={onClose} variant="secondary">Закрыть</ActionButton></header><div className="react-modal-body">{children}</div>{footer ? <footer>{footer}</footer> : null}</section></div>;
  };
}
