"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createList, deleteLista, useHydrated, useListas } from "@/lib/todos/store";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ListaIndex } from "@/lib/todos/types";

/**
 * Índice de listas (`/`) — botão "Nova lista" (1 toque cria `Lista N` e abre) +
 * lista de listas com contagem de a-fazer e botão "×" para excluir a lista
 * (com confirmação; o diálogo avisa que os itens vão junto). Consome só o
 * `store` (camada única de acesso aos dados). LB-8.
 */
export function ListasIndex() {
  const listas = useListas();
  const hydrated = useHydrated();
  const router = useRouter();
  const [alvo, setAlvo] = useState<ListaIndex | null>(null);

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => {
          const lista = createList();
          router.push(`/listas/${lista.id}`);
        }}
        className="w-full min-h-11 rounded border border-current/20 px-3 py-2 text-base"
      >
        Nova lista
      </button>

      {hydrated && listas.length === 0 ? (
        <p className="mt-4 text-base text-muted">
          Nenhuma lista ainda. Toque em &lsquo;Nova lista&rsquo; para começar.
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-current/10">
        {listas.map((lista) => (
          <li key={lista.id} className="flex items-center gap-4">
            <Link
              href={`/listas/${lista.id}`}
              className="flex min-h-11 flex-1 items-center justify-between gap-4 text-base"
            >
              <span>{lista.nome}</span>
              <span className="text-muted text-base">
                {lista.aFazer} a fazer
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setAlvo(lista)}
              className="flex min-h-11 min-w-11 items-center justify-center text-lg text-muted hover:text-foreground"
              aria-label={`Excluir lista "${lista.nome}"`}
              title="Excluir lista"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={alvo !== null}
        title="Excluir lista?"
        description={
          alvo
            ? `Excluir "${alvo.nome}" e todos os seus itens? Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir lista"
        destructive
        onConfirm={() => {
          if (alvo) deleteLista(alvo.id);
          setAlvo(null);
        }}
        onCancel={() => setAlvo(null)}
      />
    </div>
  );
}