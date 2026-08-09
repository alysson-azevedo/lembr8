import type { TodoItem, TodoRepository } from "./types";

const STORAGE_KEY = "lembr8.todos";

/**
 * Funções puras de domínio do todo — operam sobre arrays sem mutar a entrada
 * e sem tocar storage. Testáveis isoladamente em node (sem DOM).
 */

/** Adiciona um item ao final da lista (ordem de inserção). Texto vazio/whitespace não adiciona. */
export function addTodo(items: TodoItem[], texto: string): TodoItem[] {
  const limpo = texto.trim();
  if (!limpo) return items;
  const item: TodoItem = {
    id: crypto.randomUUID(),
    texto: limpo,
    concluido: false,
  };
  return [...items, item];
}

/** Alterna o estado de conclusão do item com o id dado; no-op se não existir. */
export function toggleTodo(items: TodoItem[], id: string): TodoItem[] {
  return items.map((item) =>
    item.id === id ? { ...item, concluido: !item.concluido } : item,
  );
}

/** Subset do `Storage` do browser que a camada precisa. Permite injetar um
 * fake nos testes (node/jsdom sem `localStorage` real controlado). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isTodoItem(value: unknown): value is TodoItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.texto === "string" &&
    typeof v.concluido === "boolean"
  );
}

function parseTodos(raw: string | null): TodoItem[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(isTodoItem);
  } catch {
    return [];
  }
}

/**
 * Adapter localStorage da camada de acesso aos dados. Persistência imediata a
 * cada operação. `storage` é injetável para testes; em produção usa o
 * `localStorage` do browser.
 */
export function createLocalStorageRepository(
  storage: StorageLike = globalThis.localStorage,
  key: string = STORAGE_KEY,
): TodoRepository {
  let cache: TodoItem[] | null = null;

  function read(): TodoItem[] {
    if (cache === null) cache = parseTodos(storage.getItem(key));
    return cache;
  }

  function write(items: TodoItem[]): void {
    cache = items;
    storage.setItem(key, JSON.stringify(items));
  }

  return {
    list() {
      return read();
    },
    add(texto) {
      const before = read();
      const next = addTodo(before, texto);
      // addTodo devolve a mesma referência quando o texto é vazio (no-op).
      if (next === before) return null;
      write(next);
      return next[next.length - 1];
    },
    toggle(id) {
      write(toggleTodo(read(), id));
    },
  };
}