"use client";

import { useEffect } from "react";

/**
 * Toast reutilizável (LB-12). Inline, sem dependência externa — só Tailwind,
 * acessível. Pill invertida (`bg-foreground text-background`) para contraste em
 * ambos os temas sem novo token de cor. Não rouba foco (ação confirmatória,
 * não um diálogo).
 *
 * Acessibilidade: `role="status" aria-live="polite"` — leitor de tela anuncia a
 * mensagem sem interromper.
 */
type ToastProps = {
  open: boolean;
  message: string;
  /** Duração em ms até auto-fechar. Default 2500. */
  durationMs?: number;
  onClose: () => void;
};

export function Toast({ open, message, durationMs = 2500, onClose }: ToastProps) {
  // Auto-fechamento: arma um timer quando `open` vira true e limpa no unmount/fecho.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(id);
  }, [open, durationMs, onClose]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none"
    >
      <div className="pointer-events-auto max-w-sm rounded-full border border-current/10 bg-foreground px-4 py-2 text-center text-base text-background shadow-lg">
        {message}
      </div>
    </div>
  );
}