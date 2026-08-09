import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getBuildInfo } from "@/lib/build-info";
import { logout } from "@/app/login/actions";
import { homeGate } from "@/lib/todos/gate";
import { TodoList } from "@/components/todos/TodoList";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Deslogado → login (CA 1). Logado → lista de tarefas.
  if (homeGate(user) === "redirect-login") redirect("/login");

  const { environment, commit } = getBuildInfo();

  return (
    <main className="min-h-dvh flex items-start justify-center sm:items-center">
      <div className="w-full max-w-[28rem] px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Lembr8</h1>
            <p className="mt-2 text-muted">Sua lista de tarefas</p>
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

        <TodoList />

        <div className="mt-8 space-y-1 font-mono text-[0.8rem] text-muted">
          <p>Ambiente: {environment}</p>
          <p>Build: {commit}</p>
        </div>
      </div>
    </main>
  );
}