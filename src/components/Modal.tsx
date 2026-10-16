import { useEffect, useRef, type ReactNode } from 'react';
import { ui } from '../store.ts';

const close = () => ui.set({ dialog: null });

// A native dialog; Escape and the close button both clear `ui.dialog`. With `anchor`, it drops down below that
// element instead of covering the middle of the view, and a click elsewhere closes it.
export function Modal({ open, title, anchor, children }: { open: boolean; title: string; anchor?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!open) { if (d.open) d.close(); return; }
    if (!d.open) {
      if (anchor) {
        const r = document.querySelector(anchor)!.getBoundingClientRect();
        Object.assign(d.style, { position: 'fixed', margin: '0', top: `${r.bottom + 6}px`, left: `${Math.max(8, Math.min(r.left, innerWidth - 340))}px` });
        d.show();
      } else d.showModal();
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!anchor) return;
    const onDown = (e: PointerEvent) => { if (!d.contains(e.target as Node) && !(e.target as Element).closest(anchor)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('pointerdown', onDown);
    addEventListener('keydown', onKey);
    return () => { removeEventListener('pointerdown', onDown); removeEventListener('keydown', onKey); };
  }, [open, anchor]);
  return (
    <dialog ref={ref} aria-label={title} onClose={close}>
      <header><h2>{title}</h2><button type="button" aria-label="Close" onClick={close}>×</button></header>
      {children}
    </dialog>
  );
}
