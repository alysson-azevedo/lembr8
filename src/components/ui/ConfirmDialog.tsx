"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Diálogo de confirmação reutilizável (LB-8). Inline, sem dependência externa
 * — só Tailwind, acessível. A barreira contra perda acidental é a confirmação
 * prévia; não há undo depois.
 *
 * Acessibilidade: `role="dialog" aria-modal`, foco inicial no botão Cancelar
 * (ação não-destrutiva), `Esc` e clique no overlay cancelam, focus trap entre
 * os dois botões (Tab/Shift+Tab não sai do diálogo).
 */
type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Foco inicial no Cancelar ao abrir (ação não-destrutiva).
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => cancelRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Esc cancela; Tab/Shift+Tab percorre só os dois botões (focus trap).
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        if (document.activeElement === confirmRef.current) {
          cancelRef.current?.focus();
        } else {
          confirmRef.current?.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center bg-black/40"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="w-full max-w-sm rounded border border-current/20 bg-background p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-base text-muted">{description}</p>
        <div className="mt-5 flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded border border-current/20 px-3 py-2 text-base"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`min-h-11 flex-1 rounded border border-current/20 px-3 py-2 text-base ${
              destructive ? "text-red-600 dark:text-red-400" : ""
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}