import Link from "next/link";
import { logout } from "@/app/login/actions";
import { ListaScreen } from "@/components/listas/ListaScreen";

/**
 * Tela da lista (`/listas/[id]`) — header "← Listas"/"Sair" (server) + tela da
 * lista client (título editável, entrada inline, seções a-fazer/concluídos).
 * Deslogado é redirecionado pelo layout compartilhado (CA 1).
 */
export default async function ListaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex min-h-11 items-center text-base"
          aria-label="Voltar para o índice de listas"
        >
          ← Listas
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="rounded border border-current px-4 py-2 text-sm min-h-11"
          >
            Sair
          </button>
        </form>
      </div>

      <ListaScreen listId={id} />
    </>
  );
}