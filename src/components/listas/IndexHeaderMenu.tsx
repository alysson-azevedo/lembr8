"use client";

import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/login/actions";

/** Trigger "⋮" + menu com "Sair" — header do índice (`/`). */
export function IndexHeaderMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Esc fecha; foco volta ao trigger.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mais opções"
        title="Mais opções"
        className="flex min-h-11 min-w-11 items-center justify-center text-2xl text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden="true">⋮</span>
      </button>

      {open ? (
        <>
          {/* Backdrop invisível: clicar fora fecha (mesmo padrão do ListaScreen). */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="menu"
            aria-label="Opções"
            className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded border border-current/20 bg-surface py-1"
          >
            {/* Único item (por ora): logout — destrutivo, form server action.
                Ponto de extensão para perfil futuro: novos itens (não-destrutivos)
                entram acima do "Sair". */}
            <form action={logout}>
              <button
                type="submit"
                role="menuitem"
                className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-danger hover:bg-current/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span aria-hidden="true">🚪</span> Sair
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
