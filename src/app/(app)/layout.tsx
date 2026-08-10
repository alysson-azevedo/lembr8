import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getBuildInfo } from "@/lib/build-info";
import { homeGate } from "@/lib/todos/gate";
import { SyncController } from "@/components/sync/SyncController";

export const dynamic = "force-dynamic";

/**
 * Shell compartilhado das rotas autenticadas (LB-5): gate de auth (deslogado →
 * login em `/` e `/listas/[id]`) + container reusado da LB-4 (`min-h-dvh`,
 * `items-start sm:items-center`, safe-area padding, `max-w-[28rem]`) + rodapé
 * Ambiente/Build. Cada rota desenha só seu header e conteúdo.
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
    <main className="min-h-dvh flex items-start justify-center sm:items-center">
      <div className="w-full max-w-[28rem] px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
        <div className="mt-8 space-y-1 font-mono text-[0.8rem] text-muted">
          <p>Ambiente: {environment}</p>
          <p>Build: {commit}</p>
        </div>
      </div>
      <SyncController />
    </main>
  );
}