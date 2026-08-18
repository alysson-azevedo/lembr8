"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addItemToLista,
  archiveLista,
  deleteItem,
  deleteLista,
  renameList,
  toggleItem,
  togglePinLista,
  unarchiveLista,
  useHydrated,
  useItemSuggestions,
  useLista,
} from "@/lib/todos/store";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { copyToClipboard, listaDeepLink } from "@/lib/clipboard/copyLink";
import { ItemSuggestions } from "@/components/listas/ItemSuggestions";
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
  | { tipo: "lista"; alvo: Lista }
  | { tipo: "archive"; alvo: Lista };

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
  const [toast, setToast] = useState<{ message: string } | null>(null);

  // Copia o deep link da lista para a área de transferência (LB-12).
  // O menu fecha síncrono antes do await (AC 4); o toast surge conforme o resultado.
  async function onCopiarLink() {
    if (!lista) return;
    setMenuAberto(false);
    const ok = await copyToClipboard(listaDeepLink(lista.id));
    setToast({ message: ok ? "Link copiado" : "Não foi possível copiar o link" });
  }

  // Autocomplete (LB-13): combobox sobre o input de novo item.
  const [query, setQuery] = useState(""); // espelha o valor do input p/ matching
  const [aberto, setAberto] = useState(false); // visibilidade do dropdown
  const [ativoIdx, setAtivoIdx] = useState<number | null>(null); // destaque (↓/↑)
  const listboxId = "sugestoes-novo-item";
  const sugestoes = useItemSuggestions(query, 6); // ≤6, mais recente primeiro
  const mostrar = aberto && sugestoes.length > 0; // dropdown só com sugestões

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
    setQuery(""); // limpa o espelho do autocomplete
    setAberto(false);
    setAtivoIdx(null);
    input.focus();
    if (outcome.kind === "duplicate" && outcome.existingId) {
      setHighlightId(outcome.existingId);
    }
  }

  // Selecionar uma sugestão (LB-13 AC 4): preenche o campo e fecha o dropdown.
  // **Não cria item** — o usuário confirma com Enter, que dispara `addItem()`
  // (pois `aberto=false` → `mostrar=false` → cai no else do Enter). `addItem`
  // roda `addItemToLista` (criar/reutilizar/duplicado da LB-5, intocada) — AC 5.
  function selecionar(texto: string) {
    const input = inputRef.current;
    if (input) {
      input.value = texto;
      input.focus();
    }
    setQuery(texto); // mantém query sincrônico com o campo preenchido
    setAberto(false); // AC 4: fecha ao selecionar
    setAtivoIdx(null);
  }

  function confirmarExclusao() {
    if (!confirmacao) return;
    if (confirmacao.tipo === "item") {
      deleteItem(confirmacao.alvo.id);
    } else if (confirmacao.tipo === "lista") {
      deleteLista(confirmacao.alvo.id);
      // O usuário estava dentro da lista excluída: volta ao índice (LB-8 §2.2).
      router.replace("/");
    } else if (confirmacao.tipo === "archive") {
      archiveLista(confirmacao.alvo.id);
      // Arquivar não redireciona: o usuário permanece na tela da lista; o menu
      // agora lê "Desarquivar lista" e a lista some do índice ao voltar (LB-16).
    }
    setConfirmacao(null);
  }

  const tituloConfirmacao =
    confirmacao?.tipo === "item"
      ? "Excluir item?"
      : confirmacao?.tipo === "lista"
        ? "Excluir lista?"
        : confirmacao?.tipo === "archive"
          ? "Arquivar lista?"
          : "";
  const descricaoConfirmacao =
    confirmacao?.tipo === "item"
      ? `Excluir "${confirmacao.alvo.texto}" da lista? Esta ação não pode ser desfeita.`
      : confirmacao?.tipo === "lista"
        ? `Excluir "${confirmacao.alvo.nome}" e todos os seus itens? Esta ação não pode ser desfeita.`
        : confirmacao?.tipo === "archive"
          ? `Arquivar "${confirmacao.alvo.nome}"? Ela sairá da tela inicial e ficará em Arquivadas. Você pode desarquivar a qualquer momento.`
          : "";
  const labelConfirmacao =
    confirmacao?.tipo === "item"
      ? "Excluir"
      : confirmacao?.tipo === "lista"
        ? "Excluir lista"
        : confirmacao?.tipo === "archive"
          ? "Arquivar"
          : "";
  // Apenas excluir item/lista é destrutivo (vermelho); arquivar é aviso (não destrutivo).
  const destructive = confirmacao?.tipo === "item" || confirmacao?.tipo === "lista";

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
              <span className="flex items-center gap-1">
                {lista.nome}
                {lista.pinned ? (
                  <span aria-label={`Fixada: "${lista.nome}"`} className="text-xl align-middle">
                    <span aria-hidden="true">📌</span>
                  </span>
                ) : null}
              </span>
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
                    {/* LB-14 — Fixar/Desfixar (não destrutivo, toggle — texto
                        reflete o estado). Não destrutivo vem antes do destrutivo
                        (mesmo princípio de ordenamento de LB-8/LB-12). */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuAberto(false);
                        togglePinLista(lista.id);
                      }}
                      className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-foreground hover:bg-current/5"
                    >
                      <span aria-hidden="true">📌</span>{" "}
                      {lista.pinned ? "Desfixar lista" : "Fixar lista"}
                    </button>
                    {/* Copiar link (não destrutivo, vem antes da ação destrutiva — LB-12). */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={onCopiarLink}
                      className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-foreground hover:bg-current/5"
                    >
                      <span aria-hidden="true">🔗</span> Copiar link
                    </button>
                    {/* LB-16 — Arquivar/Desarquivar (não destrutivo, toggle — texto
                        reflete o estado). Arquivar abre o ConfirmDialog (aviso);
                        desarquivar é sem confirmação (reversão trivial, padrão de
                        fixar LB-14). */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuAberto(false);
                        if (lista.archived) {
                          unarchiveLista(lista.id);
                        } else {
                          setConfirmacao({ tipo: "archive", alvo: lista });
                        }
                      }}
                      className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-foreground hover:bg-current/5"
                    >
                      <span aria-hidden="true">🗃️</span>{" "}
                      {lista.archived ? "Desarquivar lista" : "Arquivar lista"}
                    </button>
                    {/* Excluir lista (destrutivo, vermelho — LB-8). */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuAberto(false);
                        setConfirmacao({ tipo: "lista", alvo: lista });
                      }}
                      className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-red-600 dark:text-red-400 hover:bg-current/5"
                    >
                      <span aria-hidden="true">🗑️</span> Excluir lista
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

      <div className="relative mt-4">
        <input
          ref={inputRef}
          type="text"
          placeholder="Adicione um item e pressione Enter"
          enterKeyHint="enter"
          aria-label="Novo item"
          role="combobox"
          aria-expanded={mostrar}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            ativoIdx !== null && mostrar
              ? `${listboxId}-opt-${ativoIdx}`
              : undefined
          }
          onChange={(e) => {
            setQuery(e.target.value);
            setAtivoIdx(null); // sem auto-highlight: a cada digitação reseta o destaque
            setAberto(e.target.value.trim().length > 0);
          }}
          onBlur={() => {
            // fecha após um tick para o click da option registrar antes do blur.
            setTimeout(() => {
              setAberto(false);
              setAtivoIdx(null);
            }, 120);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (mostrar && ativoIdx !== null) {
                selecionar(sugestoes[ativoIdx]); // preenche + fecha (NÃO cria item)
              } else {
                addItem(); // comportamento LB-3/LB-5 intacto
              }
              return;
            }
            if (!mostrar) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setAtivoIdx((i) =>
                i === null ? 0 : Math.min(i + 1, sugestoes.length - 1),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setAtivoIdx((i) =>
                i === null ? sugestoes.length - 1 : Math.max(i - 1, 0),
              );
            } else if (event.key === "Escape") {
              event.preventDefault();
              setAberto(false); // AC 9: Esc fecha sem limpar o campo
              setAtivoIdx(null);
            }
          }}
          className="w-full rounded border border-current/20 px-3 py-3 text-base outline-none focus:border-current/50"
        />
        {mostrar ? (
          <ItemSuggestions
            listboxId={listboxId}
            suggestions={sugestoes}
            activeIndex={ativoIdx}
            onSelect={selecionar}
            onHover={setAtivoIdx}
          />
        ) : null}
      </div>

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
        destructive={destructive}
        onConfirm={confirmarExclusao}
        onCancel={() => setConfirmacao(null)}
      />

      <Toast
        open={toast !== null}
        message={toast?.message ?? ""}
        onClose={() => setToast(null)}
      />
    </div>
  );
}