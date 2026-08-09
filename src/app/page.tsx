import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { getBuildInfo } from "@/lib/build-info";
import { logout } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { environment, commit } = getBuildInfo();

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[28rem] p-6">
        <h1 className="text-3xl font-semibold">Lembr8</h1>

        {user ? (
          <div className="mt-4 space-y-4">
            <p>
              Conectado como{" "}
              <span className="font-medium">{user.email}</span>
            </p>
            <form action={logout}>
              <button
                type="submit"
                className="rounded border border-current px-4 py-2 text-sm"
              >
                Sair
              </button>
            </form>
          </div>
        ) : (
          <p className="mt-2">
            App de lembretes.{" "}
            <Link href="/login" className="underline">
              Entrar
            </Link>
            .
          </p>
        )}

        <div className="mt-8 space-y-1 font-mono text-[0.8rem] text-muted">
          <p>Ambiente: {environment}</p>
          <p>Build: {commit}</p>
        </div>
      </div>
    </main>
  );
}