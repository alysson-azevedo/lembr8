import { cookies } from "next/headers";
import { createServerClient as ssrCreateServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

/**
 * Cliente para Server Components, Route Handlers e Server Actions. Lê e grava
 * a sessão nos cookies httpOnly da rota — mantém o estado de auth entre
 * reloads no servidor (padrão `@supabase/ssr`). Sujeito às policies de RLS.
 */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return ssrCreateServerClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component: cookies só podem ser alterados numa mutation
            // (Server Action). Ignorar aqui é o padrão `@supabase/ssr` — o
            // middleware atualiza a sessão no fluxo seguinte.
          }
        },
      },
    },
  );
}