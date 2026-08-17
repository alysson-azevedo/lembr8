"use client";

import { useSyncExternalStore } from "react";
import { createLocalFirstRepository, nextListaName } from "./repository";
import type {
  AddOutcome,
  Item,
  Lista,
  ListaIndex,
  ListasRepository,
} from "./types";

/**
 * Ponte client-only entre a UI e a camada única de acesso aos dados (LB-5).
 * A UI consome `useListas` / `useLista` / `createList` / `renameList` /
 * `addItemToLista` / `toggleItem` — nunca acessa `localStorage` ou o
 * repositório diretamente. `useSyncExternalStore` lê o storage só no cliente
 * (após hidratação), evitando acesso ao `localStorage` durante a renderização
 * no servidor e mismatch de hidratação.
 *
 * Snapshots derivados (índice e tela da lista) são memoizados por identidade do
 * estado: só são recalculados quando o estado muda, mantendo referências estáveis
 * entre renders (requisito do `useSyncExternalStore`).
 */

const listeners = new Set<() => void>();
const EMPTY_INDEX: ListaIndex[] = [];
const EMPTY_ITEMS: Item[] = [];
const EMPTY_STRINGS: string[] = [];

// Ouvintes de mutação (LB-7): disparam só em create/rename/add/toggle, usados
// pelo SyncController para o trigger de sync pós-mutação (debounced). Separados
// dos `listeners` de render (useSyncExternalStore) — estes também disparam em
// sync()/resetForUser(), o que re-acionaria o trigger em loop.
const mutationListeners = new Set<() => void>();

type ListaScreen = { lista: Lista | null; aFazer: Item[]; concluidos: Item[] };
const EMPTY_SCREEN: ListaScreen = {
  lista: null,
  aFazer: EMPTY_ITEMS,
  concluidos: EMPTY_ITEMS,
};

let repo: ListasRepository | null = null;
function repoInstance(): ListasRepository {
  if (!repo) repo = createLocalFirstRepository();
  return repo;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Registra `cb` chamado ao final de toda mutação (create/rename/add/toggle).
 * Usado pelo SyncController para o trigger de sync debounced (LB-7). Não
 * confundir com `subscribe` (snapshot da UI), que dispara também em
 * `sync()`/`resetForUser()`. Retorna a dessubinscrição.
 */
export function subscribeToMutations(cb: () => void): () => void {
  mutationListeners.add(cb);
  return () => {
    mutationListeners.delete(cb);
  };
}

/** Notifica os ouvintes de mutação (create/rename/add/toggle — não sync/reset). */
function notifyMutations(): void {
  for (const listener of mutationListeners) listener();
}

// Cache de snapshots derivados — invalidado quando o estado do repo muda.
// O repo troca a referência interna só em mutação; usamos um contador de
// versão para saber quando recalcular, mantendo referências estáveis entre
// renders (requisito do `useSyncExternalStore`).
let version = 0;
function bumpVersion(): void {
  version += 1;
  indexCache = null;
  screenCache = null;
  suggestionsCache = null;
}

let indexCache: { version: number; data: ListaIndex[] } | null = null;
let screenCache: { version: number; listId: string; data: ListaScreen } | null =
  null;
let suggestionsCache: {
  version: number;
  query: string;
  limit: number;
  data: string[];
} | null = null;

/** Índice de listas com contagem de a-fazer (tela `/`). */
export function useListas(): ListaIndex[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (indexCache && indexCache.version === version) return indexCache.data;
      const data = repoInstance().listIndex();
      indexCache = { version, data };
      return data;
    },
    () => EMPTY_INDEX,
  );
}

/** Dados da tela da lista `/listas/[id]`: lista + a-fazer + concluídos. */
export function useLista(listId: string): ListaScreen {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (
        screenCache &&
        screenCache.version === version &&
        screenCache.listId === listId
      ) {
        return screenCache.data;
      }
      const lista = repoInstance().getLista(listId);
      const items = repoInstance().listItems(listId);
      const aFazer = items.filter((i) => !i.concluido);
      const concluidos = items.filter((i) => i.concluido);
      const data: ListaScreen = { lista, aFazer, concluidos };
      screenCache = { version, listId, data };
      return data;
    },
    () => EMPTY_SCREEN,
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Sugestões de autocomplete para o campo de novo item (LB-13): itens de todas
 * as listas da conta, mais recente primeiro (`updatedAt` desc), casamento por
 * prefixo insensível a acento/caixa, ≤`limit` (default 6). Lê só do cache (sem
 * Supabase). Memoizado por `(version, query, limit)` para manter referência
 * estável entre renders (requisito do `useSyncExternalStore`); invalidado em
 * toda mutação/sync/reset via `bumpVersion`.
 */
export function useItemSuggestions(query: string, limit = 6): string[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (
        suggestionsCache &&
        suggestionsCache.version === version &&
        suggestionsCache.query === query &&
        suggestionsCache.limit === limit
      ) {
        return suggestionsCache.data;
      }
      const data = repoInstance().listItemSuggestions(query, limit);
      suggestionsCache = { version, query, limit, data };
      return data;
    },
    () => EMPTY_STRINGS,
  );
}

/** `true` após a hidratação no cliente; adia o estado vazio para evitar flash. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Cria uma lista com nome `Lista N` (auto-incremento) e a retorna (para abrir). */
export function createList(): Lista {
  const listas = repoInstance().listListas();
  const nome = nextListaName(listas);
  const lista = repoInstance().createList(nome);
  bumpVersion();
  notify();
  notifyMutations();
  return lista;
}

/** Renomeia uma lista e notifica a UI. */
export function renameList(id: string, nome: string): void {
  repoInstance().renameList(id, nome);
  bumpVersion();
  notify();
  notifyMutations();
}

/** Adiciona um item a uma lista (reutilização/duplicado) e notifica a UI. */
export function addItemToLista(
  listId: string,
  texto: string,
): AddOutcome {
  const outcome = repoInstance().addItem(listId, texto);
  bumpVersion();
  notify();
  notifyMutations();
  return outcome;
}

/** Alterna concluído / a fazer do item e notifica a UI. */
export function toggleItem(id: string): void {
  repoInstance().toggleItem(id);
  bumpVersion();
  notify();
  notifyMutations();
}

/** Hard delete de um item (cache + tombstone local) e notifica a UI. LB-8. */
export function deleteItem(id: string): void {
  repoInstance().deleteItem(id);
  bumpVersion();
  notify();
  notifyMutations();
}

/** Hard delete de uma lista em cascade (cache + tombstone local) e notifica a UI. LB-8. */
export function deleteLista(id: string): void {
  repoInstance().deleteLista(id);
  bumpVersion();
  notify();
  notifyMutations();
}

/**
 * Sincroniza o cache com o cloud (push dos pendentes + pull/merge por
 * `updated_at`). Acionado pelo `SyncController` ao montar/reconectar/logar.
 * Após o pull, invalida os snapshots para a UI refletir mudanças do cloud.
 */
export async function sync(): Promise<{ pushed: number; pulled: number }> {
  const result = await repoInstance().sync();
  bumpVersion();
  notify();
  return result;
}

/**
 * Reinicia o cache para outra conta (isolamento no login/logout). Chamado pelo
 * `SyncController` em `SIGNED_IN`/`SIGNED_OUT`. Invalida os snapshots.
 */
export function resetForUser(userId: string | null): void {
  repoInstance().resetForUser(userId);
  bumpVersion();
  notify();
}

/** Apenas para testes: descarta o repositório em cache, os ouvintes e a versão. */
export function __resetListasStoreForTests(): void {
  repo = null;
  listeners.clear();
  mutationListeners.clear();
  version = 0;
  indexCache = null;
  screenCache = null;
  suggestionsCache = null;
}