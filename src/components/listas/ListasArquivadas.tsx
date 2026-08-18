"use client";

import Link from "next/link";
import { useHydrated, useListasArquivadas } from "@/lib/todos/store";
import type { ListaIndex } from "@/lib/todos/types";

/**
 * Tela de listas arquivadas (`/arquivadas`, LB-16) — listas com `archivedAt`
 * preenchido, ordenadas por modificação (`updated_at` desc). Cada linha é um
 * `<Link>` para o detalhe da lista, onde o menu "⋮" permite desarquivar
 * (AC 4). Sem botão "Nova lista" (a rota é de gestão, não de criação). O
 * indicador 📌 reflete o `pinned` preservado ao arquivar (PO (e), AC 12).
 * Consome só o `store`.
 */
export function ListasArquivadas() {
  const listas = useListasArquivadas();
  const hydrated = useHydrated();

  return (
    <div className="mt-6">
      <h1 className="text-3xl font-semibold">Arquivadas</h1>

      {hydrated && listas.length === 0 ? (
        <p className="mt-4 text-base text-muted">
          Nenhuma lista arquivada. Arquive uma lista pelo menu &ldquo;⋮&rdquo; na tela dela.
        </p>
      ) : null}

      {listas.length > 0 ? (
        <ul className="mt-4 divide-y divide-current/10">
          {listas.map((lista) => (
            <Linha key={lista.id} lista={lista} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Linha de arquivadas: `<Link>` (nome + pin + contagem) — 📌 se fixada (preservado). */
function Linha({ lista }: { lista: ListaIndex }) {
  return (
    <li className="flex items-center gap-2">
      <Link
        href={`/listas/${lista.id}`}
        className="flex min-h-11 flex-1 items-center justify-between gap-4 text-base"
      >
        <span className="flex items-center gap-1">
          {lista.nome}
          {lista.pinned ? (
            <span aria-label={`Fixada: "${lista.nome}"`} className="text-sm">
              <span aria-hidden="true">📌</span>
            </span>
          ) : null}
        </span>
        <span className="text-muted text-base">{lista.aFazer} a fazer</span>
      </Link>
    </li>
  );
}