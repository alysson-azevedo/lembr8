import Link from "next/link";
import { logout } from "@/app/login/actions";
import { ListasArquivadas } from "@/components/listas/ListasArquivadas";

/**
 * Tela de listas arquivadas (`/arquivadas`, LB-16) — header "← Listas"/"Sair"
 * (server) + componente client que lista as listas arquivadas. Cada linha
 * navega ao detalhe da lista, onde o menu "⋮" permite desarquivar. Deslogado é
 * redirecionado pelo layout compartilhado.
 */
export default async function ArquivadasPage() {
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

      <ListasArquivadas />
    </>
  );
}