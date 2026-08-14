"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addItemToLista,
  deleteItem,
  deleteLista,
  renameList,
  toggleItem,
  useHydrated,
  useLista,
} from "@/lib/todos/store";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Item, Lista } from "@/lib/todos/types";

/**
 * Tela da lista (`/listas/[id]`) — título editável (click-to-edit), subtítulo de
 * contagem, entrada inline (LB-4) e seções a-fazer (topo) / concluídos (embaixo).
 * Reutilização/duplicado ao adicionar via Enter. Exclusão de item (botão "×")
 * e de lista (item "Excluir lista" num menu overflow "⋮" no cabeçalho), ambas
 * com confirmação prévia (LB-8, rework: exclusão de lista só dentro do detalhe).
 * Consome só o `store`.
 */
type Confirmacao =
  | { tipo: "item"; alvo: Item }
  | { tipo: "lista"; alvo: Lista };

export function ListaScreen({ listId }: { listId: string }) {
  const { lista, aFazer, concluidos } = useLista(listId);
  const hydrated = useHydrated();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);

  // Deep-link para lista inexistente/excluída: volta ao índice (LB-8 §4).
  useEffect(() => {
    if (hydrated && !lista) router.replace("/");
  }, [hydrated, lista, router]);

  // highlight transitório do item focado (duplicado ativo): scrollIntoView + some em ~1,2s.
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`item-${highlightId}`);
    el?.scrollIntoView({ block: "nearest" });
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1200);
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, [highlightId]);

  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  function startEdit() {
    if (!lista) return;
    setDraft(lista.nome);
    setEditing(true);
  }

  function commitEdit() {
    if (!lista) return;
    const nome = draft.trim();
    if (nome && nome !== lista.nome) renameList(listId, nome);
    setEditing(false);
  }

  function addItem() {
    const input = inputRef.current;
    if (!input) return;
    const texto = input.value.trim();
    if (!texto) return;
    const outcome = addItemToLista(listId, texto);
    input.value = "";
    input.focus();
    if (outcome.kind === "duplicate" && outcome.existingId) {
      setHighlightId(outcome.existingId);
    }
  }

  function confirmarExclusao() {
    if (!confirmacao) return;
    if (confirmacao.tipo === "item") {
      deleteItem(confirmacao.alvo.id);
    } else {
      deleteLista(confirmacao.alvo.id);
      // O usuário estava dentro da lista excluída: volta ao índice (LB-8 §2.2).
      router.replace("/");
    }
    setConfirmacao(null);
  }

  const tituloConfirmacao = confirmacao?.tipo === "item" ? "Excluir item?" : "Excluir lista?";
  const descricaoConfirmacao =
    confirmacao?.tipo === "item"
      ? `Excluir "${confirmacao.alvo.texto}" da lista? Esta ação não pode ser desfeita.`
      : confirmacao?.tipo === "lista"
        ? `Excluir "${confirmacao.alvo.nome}" e todos os seus itens? Esta ação não pode ser desfeita.`
        : "";
  const labelConfirmacao = confirmacao?.tipo === "item" ? "Excluir" : "Excluir lista";

  return (
    <div className="mt-6">
      {lista ? (
        <div className="flex items-center justify-between gap-3">
          {editing ? (
            <input
              ref={titleRef}
              type="text"
              value={draft}
              aria-label="Nome da lista"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitEdit();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setEditing(false);
                }
              }}
              onBlur={commitEdit}
              className="w-full rounded border border-current/20 px-3 py-2 text-base outline-none focus:border-current/50"
            />
          ) : (
            <h1
              className="text-3xl font-semibold cursor-text"
              onClick={startEdit}
              title="Toque para renomear"
            >
              {lista.nome}
            </h1>
          )}

          {/* Menu overflow "⋮" com a ação destrutiva de excluir a lista
              (rework LB-8: exclusão de lista só dentro do detalhe, em submenu). */}
          {!editing ? (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuAberto((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuAberto}
                aria-label="Mais opções da lista"
                title="Mais opções"
                className="flex min-h-11 min-w-11 items-center justify-center text-2xl text-muted hover:text-foreground"
              >
                ⋮
              </button>
              {menuAberto ? (
                <>
                  {/* Backdrop invisível: clicar fora fecha o menu. */}
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={() => setMenuAberto(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div
                    role="menu"
                    aria-label="Opções da lista"
                    className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded border border-current/20 bg-background py-1"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuAberto(false);
                        setConfirmacao({ tipo: "lista", alvo: lista });
                      }}
                      className="flex min-h-11 w-full items-center px-3 text-base text-red-600 dark:text-red-400"
                    >
                      Excluir lista
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {lista ? (
        <p className="mt-2 text-muted text-base">
          {aFazer.length} a fazer · {concluidos.length} concluídos
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="text"
        placeholder="Adicione um item e pressione Enter"
        enterKeyHint="enter"
        aria-label="Novo item"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addItem();
          }
        }}
        className="mt-4 w-full rounded border border-current/20 px-3 py-3 text-base outline-none focus:border-current/50"
      />

      {hydrated && aFazer.length === 0 && concluidos.length === 0 ? (
        <p className="mt-4 text-base text-muted">
          Nenhum item ainda. Digite acima e pressione Enter para começar.
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-current/10">
        {aFazer.map((item) => (
          <li key={item.id} id={`item-${item.id}`} className="flex items-center gap-3 py-2">
            <label
              className={`flex min-h-11 flex-1 items-center gap-3 cursor-pointer ${
                highlightId === item.id ? "rounded bg-current/10" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={item.concluido}
                onChange={() => toggleItem(item.id)}
                className="size-5"
                aria-label={`Marcar "${item.texto}" como concluído`}
              />
              <span>{item.texto}</span>
            </label>
            <button
              type="button"
              onClick={() => setConfirmacao({ tipo: "item", alvo: item })}
              className="flex min-h-11 min-w-11 items-center justify-center text-lg text-muted hover:text-foreground"
              aria-label={`Excluir "${item.texto}"`}
              title="Excluir item"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {concluidos.length > 0 ? (
        <div className="mt-4 border-t border-current/10 pt-4">
          <p className="text-muted text-base">Concluídos</p>
          <ul className="mt-2 divide-y divide-current/10">
            {concluidos.map((item) => (
              <li key={item.id} id={`item-${item.id}`} className="flex items-center gap-3 py-2">
                <label
                  className={`flex min-h-11 flex-1 items-center gap-3 cursor-pointer ${
                    highlightId === item.id ? "rounded bg-current/10" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.concluido}
                    onChange={() => toggleItem(item.id)}
                    className="size-5"
                    aria-label={`Reativar "${item.texto}"`}
                  />
                  <span className="line-through text-muted">{item.texto}</span>
                </label>
                <button
                  type="button"
                  onClick={() => setConfirmacao({ tipo: "item", alvo: item })}
                  className="flex min-h-11 min-w-11 items-center justify-center text-lg text-muted hover:text-foreground"
                  aria-label={`Excluir "${item.texto}"`}
                  title="Excluir item"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmacao !== null}
        title={tituloConfirmacao}
        description={descricaoConfirmacao}
        confirmLabel={labelConfirmacao}
        destructive
        onConfirm={confirmarExclusao}
        onCancel={() => setConfirmacao(null)}
      />
    </div>
  );
}