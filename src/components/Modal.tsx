import { useEffect, useRef, type ReactNode } from 'react';
import { ui } from '../store.ts';

// A native modal dialog; Escape and the close button both clear `ui.dialog`.
export function Modal({ open, title, children }: { open: boolean; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) { d.showModal(); d.querySelector<HTMLElement>('[data-autofocus]')?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-label={title} onClose={() => ui.set({ dialog: null })}>
      <header><h2>{title}</h2><button type="button" aria-label="Close" onClick={() => ui.set({ dialog: null })}>×</button></header>
      {children}
    </dialog>
  );
}
