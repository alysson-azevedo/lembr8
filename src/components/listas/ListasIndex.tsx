"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createList,
  useHydrated,
  useListas,
} from "@/lib/todos/store";
import type { ListaIndex } from "@/lib/todos/types";

/**
 * Índice de listas (`/`) — botão "Nova lista" (1 toque cria `Lista N` e abre) +
 * listas em sequência (LB-14): fixadas (`pinned=true`) primeiro, demais depois,
 * todas por modificação mais recente (`updated_at` desc) — ordem entregue pronta
 * pelo `listIndex()`. O pin só aparece em listas fixadas (indicador visual);
 * fixar/desfixar é feito no menu overflow "⋮" do detalhe (`ListaScreen`). A
 * exclusão de lista NÃO é exposta aqui (rework LB-8). Consome só o `store`
 * (camada única de acesso aos dados).
 */
export function ListasIndex() {
  const listas = useListas();
  const hydrated = useHydrated();
  const router = useRouter();

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

/** Linha do índice: `<Link>` (nome + contagem) + 📌 só quando fixada. */
function Linha({ lista }: { lista: ListaIndex }) {
  return (
    <li className="flex items-center gap-2">
      <Link
        href={`/listas/${lista.id}`}
        className="flex min-h-11 flex-1 items-center justify-between gap-4 text-base"
      >
        <span>{lista.nome}</span>
        <span className="text-muted text-base">{lista.aFazer} a fazer</span>
      </Link>
      {lista.pinned ? (
        <span
          aria-label={`Fixada: "${lista.nome}"`}
          className="flex min-w-11 items-center justify-center text-lg text-foreground"
        >
          <span aria-hidden="true">📌</span>
        </span>
      ) : null}
    </li>
  );
}