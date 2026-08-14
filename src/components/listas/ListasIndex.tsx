"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createList, useHydrated, useListas } from "@/lib/todos/store";

/**
 * Índice de listas (`/`) — botão "Nova lista" (1 toque cria `Lista N` e abre) +
 * lista de listas com contagem de a-fazer. A exclusão de lista NÃO é exposta
 * aqui (rework LB-8): excluir lista é uma ação do detalhe da lista, em submenu
 * de um menu overflow na `ListaScreen`. Consome só o `store` (camada única de
 * acesso aos dados).
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

      <ul className="mt-4 divide-y divide-current/10">
        {listas.map((lista) => (
          <li key={lista.id}>
            <Link
              href={`/listas/${lista.id}`}
              className="flex min-h-11 items-center justify-between gap-4 text-base"
            >
              <span>{lista.nome}</span>
              <span className="text-muted text-base">
                {lista.aFazer} a fazer
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}