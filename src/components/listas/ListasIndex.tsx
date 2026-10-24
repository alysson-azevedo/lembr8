"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  createList,
  useHydrated,
  useListas,
  useTemArquivadas,
} from "@/lib/todos/store";
import type { ListaIndex } from "@/lib/todos/types";

/**
 * Índice de listas (`/`) — botão "Nova lista" (1 toque cria `Lista N` e abre) +
 * listas em sequência (LB-14): fixadas (`pinned=true`) primeiro, demais depois,
 * todas por modificação mais recente (`updated_at` desc) — ordem entregue pronta
 * pelo `listIndex()`. O pin só aparece em listas fixadas (indicador visual);
 * fixar/desfixar é feito no menu overflow "⋮" do detalhe (`ListaScreen`). A
 * exclusão de lista NÃO é exposta aqui (rework LB-8). Listas arquivadas não
 * aparecem (LB-16: `listIndex()` filtra `archivedAt !== null`); a entrada
 * "Arquivadas" no rodapé leva à rota `/arquivadas`. Consome só o `store`
 * (camada única de acesso aos dados).
 *
 * Filtro por nome (LB-17, PR1 — rework affordance expansível): botão-ícone `🔍`
 * no topo (estado fechado, mínimo espaço) → ao clicar, expande `<input
 * type="search">` com autoFocus + botão `✕` para fechar (animação CSS ~150ms).
 * Case-insensitive por substring, sem debounce. Estados `filtroAberto` e
 * `filtroNome` são efêmeros (não persistem). Fechar (`✕` ou `Escape`) limpa o
 * texto. Ver `docs/product/design/lb-17-filtro-listas.md`. O toggle "exibir
 * arquivadas" (PR2) depende de LB-16 e fica pendente.
 *
 * Botão "Nova lista" compacto (LB-19): a linha só-🔍 e o botão full-width
 * viram uma toolbar de UMA linha `[＋ Nova lista] … [🔍]` (`justify-between`)
 * no estado default com listas — 96px → 44px de controles antes da primeira
 * lista. Botão primário preenchido (`bg-foreground text-background`, padrão do
 * login) com `＋` em `aria-hidden`; alvo `min-h-11` (LB-4) preservado
 * literalmente em todas as variantes — a compactação é horizontal + merge de
 * linhas, nunca do alvo. Variantes por contexto: toolbar (`shrink-0`) com
 * listas; filtro aberto → compacto `mt-2` abaixo do input (LB-17 intocado);
 * índice vazio → `w-full` (CTA de onboarding). 1 toque continua criando
 * `Lista N` e abrindo o detalhe (LB-5, intocado). Ver
 * `docs/product/design/lb-19-ux-botao-compacto.md`.
 */

// Classes base do botão "Nova lista" (LB-19 §2.2) — idem nas três variantes.
const CLASSES_BOTAO_NOVA_LISTA =
  "flex min-h-11 items-center justify-center gap-2 rounded bg-foreground px-4 py-2 text-base font-medium text-background hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function ListasIndex() {
  const listas = useListas();
  const temArquivadas = useTemArquivadas();
  const hydrated = useHydrated();
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
        <div className="flex items-center justify-between gap-2">
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
            <>
              <BotaoNovaLista
                className={`${CLASSES_BOTAO_NOVA_LISTA} shrink-0`}
              />
              <button
                type="button"
                onClick={() => setFiltroAberto(true)}
                aria-label="Abrir filtro por nome"
                aria-expanded={false}
                className="flex min-h-11 min-w-11 items-center justify-center text-base text-foreground hover:bg-current/5"
              >
                <span aria-hidden="true">🔍</span>
              </button>
            </>
          )}
        </div>
      ) : null}

      {listas.length === 0 || filtroAberto ? (
        <BotaoNovaLista
          className={`${
            listas.length === 0 ? "w-full" : "mt-2 shrink-0"
          } ${CLASSES_BOTAO_NOVA_LISTA}`}
        />
      ) : null}

      {hydrated && listas.length === 0 && !temArquivadas ? (
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

      {hydrated && temArquivadas ? (
        <p className="mt-6 text-base">
          <Link
            href="/arquivadas"
            className="text-muted underline-offset-4 hover:text-foreground hover:underline"
          >
            Arquivadas
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Botão "Nova lista" do índice (LB-19): compacto na toolbar / abaixo do filtro
 * aberto, full-width no índice vazio — as variantes vêm via `className` (a
 * base compartilhada é `CLASSES_BOTAO_NOVA_LISTA`). 1 toque cria `Lista N` e
 * abre o detalhe (LB-5, intocado). O rótulo "Nova lista" permanece text node
 * direto do `<button>` (não envolver em span) — os testes usam `getByText`, e
 * o `＋` em `<span aria-hidden>` fica fora do nome acessível.
 */
function BotaoNovaLista({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        const lista = createList();
        router.push(`/listas/${lista.id}`);
      }}
      className={className}
    >
      <span aria-hidden="true">＋</span> Nova lista
    </button>
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