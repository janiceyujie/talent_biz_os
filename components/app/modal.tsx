"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        if (previous?.isConnected && !document.querySelector("dialog[open]")) previous.focus();
      });
    };
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={onClose}>
      <header>
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="關閉視窗" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
