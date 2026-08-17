"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createList,
  togglePinLista,
  useHydrated,
  useListas,
} from "@/lib/todos/store";
import type { ListaIndex } from "@/lib/todos/types";

/**
 * Índice de listas (`/`) — botão "Nova lista" (1 toque cria `Lista N` e abre) +
 * listas em duas seções (LB-14): **Fixadas** (`pinned=true`, topo) e **Demais**
 * (`pinned=false`), ambas por modificação mais recente (`updated_at` desc) —
 * ordem entregue pronta pelo `listIndex()`; a UI só particiona por `pinned`.
 * Cada linha tem um botão 📌 (fora do `<Link>`) que fixa/desfixa (toggle, não
 * destrutivo, sem confirmação). A exclusão de lista NÃO é exposta aqui (rework
 * LB-8): é uma ação do detalhe, no menu overflow da `ListaScreen`. Consome só o
 * `store` (camada única de acesso aos dados).
 */
export function ListasIndex() {
  const listas = useListas();
  const hydrated = useHydrated();
  const router = useRouter();

  const pinned = listas.filter((l) => l.pinned);
  const demais = listas.filter((l) => !l.pinned);
  // Headers só quando as duas seções coexistem (AC 14): sem fixadas → índice
  // flat só com Demais (sem header órfão); todas fixadas → só Fixadas.
  const mostrarHeaders = pinned.length > 0 && demais.length > 0;

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

      {pinned.length > 0 ? (
        <section className="mt-4">
          {mostrarHeaders ? <p className="text-muted text-base">Fixadas</p> : null}
          <ul
            className={`divide-y divide-current/10 ${
              mostrarHeaders ? "mt-2" : ""
            }`}
          >
            {pinned.map((lista) => (
              <Linha key={lista.id} lista={lista} />
            ))}
          </ul>
        </section>
      ) : null}

      {demais.length > 0 ? (
        <section className={pinned.length > 0 ? "mt-6" : "mt-4"}>
          {mostrarHeaders ? <p className="text-muted text-base">Demais</p> : null}
          <ul
            className={`divide-y divide-current/10 ${
              mostrarHeaders ? "mt-2" : ""
            }`}
          >
            {demais.map((lista) => (
              <Linha key={lista.id} lista={lista} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Linha do índice: `<Link>` (nome + contagem) + botão 📌 de fixar (fora do link). */
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
      <button
        type="button"
        onClick={() => togglePinLista(lista.id)}
        aria-label={
          lista.pinned ? `Desfixar "${lista.nome}"` : `Fixar "${lista.nome}"`
        }
        title={lista.pinned ? "Desfixar lista" : "Fixar lista"}
        className={`flex min-h-11 min-w-11 items-center justify-center text-lg ${
          lista.pinned ? "text-foreground" : "text-muted hover:text-foreground"
        }`}
      >
        <span aria-hidden="true">📌</span>
      </button>
    </li>
  );
}