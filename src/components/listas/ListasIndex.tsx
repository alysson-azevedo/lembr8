"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
 *
 * Filtro por nome (LB-17, PR1 — rework affordance expansível): botão-ícone `🔍`
 * no topo (estado fechado, mínimo espaço) → ao clicar, expande `<input
 * type="search">` com autoFocus + botão `✕` para fechar (animação CSS ~150ms).
 * Case-insensitive por substring, sem debounce. Estados `filtroAberto` e
 * `filtroNome` são efêmeros (não persistem). Fechar (`✕` ou `Escape`) limpa o
 * texto. Ver `docs/product/design/lb-17-filtro-listas.md`. O toggle "exibir
 * arquivadas" (PR2) depende de LB-16 e fica pendente.
 */
export function ListasIndex() {
  const listas = useListas();
  const hydrated = useHydrated();
  const router = useRouter();
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [filtroNome, setFiltroNome] = useState("");

  const visiveis = useMemo(() => {
    const q = filtroNome.trim().toLowerCase();
    if (q === "") return listas;
    return listas.filter((l) => l.nome.toLowerCase().includes(q));
  }, [listas, filtroNome]);

  function fecharFiltro() {
    setFiltroAberto(false);
    setFiltroNome("");
  }

  return (
    <div className="mt-6">
      {listas.length > 0 ? (
        <div className="flex items-center gap-2">
          {filtroAberto ? (
            <div className="flex flex-1 items-center gap-2 overflow-hidden transition-all duration-150">
              <input
                type="search"
                inputMode="search"
                autoFocus
                value={filtroNome}
                onChange={(e) => setFiltroNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") fecharFiltro();
                }}
                placeholder="Filtrar por nome"
                aria-label="Filtrar listas por nome"
                className="flex-1 min-h-11 rounded border border-current/20 bg-background px-3 py-2 text-base text-foreground placeholder:text-muted"
              />
              <button
                type="button"
                onClick={fecharFiltro}
                aria-label="Fechar filtro"
                className="flex min-h-11 min-w-11 items-center justify-center text-base text-muted hover:text-foreground"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFiltroAberto(true)}
              aria-label="Abrir filtro por nome"
              aria-expanded={false}
              className="flex min-h-11 min-w-11 items-center justify-center text-base text-foreground hover:bg-current/5"
            >
              <span aria-hidden="true">🔍</span>
            </button>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          const lista = createList();
          router.push(`/listas/${lista.id}`);
        }}
        className="mt-2 w-full min-h-11 rounded border border-current/20 px-3 py-2 text-base"
      >
        Nova lista
      </button>

      {hydrated && listas.length === 0 ? (
        <p className="mt-4 text-base text-muted">
          Nenhuma lista ainda. Toque em &lsquo;Nova lista&rsquo; para começar.
        </p>
      ) : null}

      {listas.length > 0 && visiveis.length > 0 ? (
        <ul className="mt-4 divide-y divide-current/10">
          {visiveis.map((lista) => (
            <Linha key={lista.id} lista={lista} />
          ))}
        </ul>
      ) : null}

      {hydrated && listas.length > 0 && visiveis.length === 0 ? (
        <p className="mt-4 text-base text-muted">
          Nenhuma lista encontrada com esse nome.
        </p>
      ) : null}
    </div>
  );
}

/** Linha do índice: `<Link>` (nome + pin + contagem) — 📌 só quando fixada. */
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