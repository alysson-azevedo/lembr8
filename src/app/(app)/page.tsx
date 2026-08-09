import { logout } from "@/app/login/actions";
import { ListasIndex } from "@/components/listas/ListasIndex";

/**
 * Tela índice de listas (`/`) — header "Lembr8"/"Sair" (server) + índice
 * client (criar em 1 toque + lista de listas). Logado vê o índice; deslogado é
 * redirecionado pelo layout compartilhado (CA 1/2).
 */
export default function IndexPage() {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Lembr8</h1>
          <p className="mt-2 text-muted">Suas listas</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded border border-current px-4 py-2 text-sm min-h-11"
          >
            Sair
          </button>
        </form>
      </div>

      <ListasIndex />
    </>
  );
}