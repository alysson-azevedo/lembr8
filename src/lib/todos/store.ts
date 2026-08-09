"use client";

import { useSyncExternalStore } from "react";
import { createLocalStorageRepository } from "./repository";
import type { TodoItem, TodoRepository } from "./types";

/**
 * Ponte client-only entre a UI e a camada única de acesso aos dados (LB-3).
 * A UI consome `useTodos` / `addTodoItem` / `toggleTodoItem` — nunca acessa
 * `localStorage` ou o repositório diretamente. `useSyncExternalStore` lê o
 * storage só no cliente (após hidratação), evitando acesso ao `localStorage`
 * durante a renderização no servidor e mismatch de hidratação.
 */

const listeners = new Set<() => void>();
const EMPTY: TodoItem[] = [];

let repo: TodoRepository | null = null;
function repoInstance(): TodoRepository {
  if (!repo) repo = createLocalStorageRepository();
  return repo;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Itens do todo em ordem de inserção, a partir da camada de acesso aos dados. */
export function useTodos(): TodoItem[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => repoInstance().list(),
    () => EMPTY,
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

/** Adiciona um item e notifica a UI; `null` se o texto for vazio. */
export function addTodoItem(texto: string): TodoItem | null {
  const added = repoInstance().add(texto);
  if (added) notify();
  return added;
}

/** Alterna concluído / a fazer do item e notifica a UI. */
export function toggleTodoItem(id: string): void {
  repoInstance().toggle(id);
  notify();
}

/** Apenas para testes: descarta o repositório em cache e os ouvintes. */
export function __resetTodoStoreForTests(): void {
  repo = null;
  listeners.clear();
}