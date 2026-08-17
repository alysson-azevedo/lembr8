import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getBuildInfo } from "@/lib/build-info";
import { homeGate } from "@/lib/todos/gate";
import { SyncController } from "@/components/sync/SyncController";

export const dynamic = "force-dynamic";

/**
 * Shell compartilhado das rotas autenticadas (LB-5): gate de auth (deslogado →
 * login em `/` e `/listas/[id]`) + container reusado da LB-4 (`min-h-dvh`,
 * safe-area padding, `max-w-[28rem]`) + rodapé Ambiente/Build. Cada rota
 * desenha só seu header e conteúdo.
 *
 * (LB-11) O rodapé Ambiente/Build saiu do container de conteúdo e passou a
 * ser `<footer>` irmão dele, na base do `<main>` (coluna flex). Assim não
 * ocupa mais espaço vertical no fluxo do conteúdo da rota e fica discreto na
 * base do shell, sem mudar a lógica/origem dos dados (`getBuildInfo()`).
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (homeGate(user) === "redirect-login") redirect("/login");

  const { environment, commit } = getBuildInfo();

  return (
    <main className="min-h-dvh flex flex-col">
      <div className="flex-1 w-full max-w-[28rem] self-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] flex items-start justify-center sm:items-center">
        {children}
      </div>
      <footer className="w-full max-w-[28rem] self-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center font-mono text-[0.8rem] text-muted">
        <p className="flex flex-wrap justify-center gap-x-2 gap-y-0.5">
          <span>Ambiente: {environment}</span>
          <span aria-hidden="true" className="opacity-50">·</span>
          <span>Build: {commit}</span>
        </p>
      </footer>
      <SyncController />
    </main>
  );
}