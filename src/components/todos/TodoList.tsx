"use client";

import { useRef } from "react";
import {
  addTodoItem,
  toggleTodoItem,
  useHydrated,
  useTodos,
} from "@/lib/todos/store";

/**
 * Lista de tarefas (todo) com entrada inline e checkbox (LB-3). Consome apenas a
 * camada única de acesso aos dados (`store`) — nunca acessa o storage direto.
 */
export function TodoList() {
  const items = useTodos();
  const hydrated = useHydrated();
  const inputRef = useRef<HTMLInputElement>(null);

  function addItem() {
    const input = inputRef.current;
    if (!input) return;
    const texto = input.value.trim();
    if (!texto) return;
    if (addTodoItem(texto)) {
      input.value = "";
      input.focus();
    }
  }

  return (
    <div className="mt-6">
      <input
        ref={inputRef}
        type="text"
        placeholder="Adicione um item e pressione Enter"
        enterKeyHint="enter"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addItem();
          }
        }}
        aria-label="Novo item"
        className="w-full rounded border border-current/20 px-3 py-3 text-base outline-none focus:border-current/50"
      />

      {hydrated && items.length === 0 ? (
        <p className="mt-4 text-base text-muted">
          Nenhum item ainda. Digite acima e pressione Enter para começar.
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-current/10">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex min-h-11 items-center gap-3 py-2">
              <input
                type="checkbox"
                checked={item.concluido}
                onChange={() => toggleTodoItem(item.id)}
                className="size-5"
                aria-label={`Marcar "${item.texto}" como concluído`}
              />
              <span className={item.concluido ? "line-through text-muted" : ""}>
                {item.texto}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}