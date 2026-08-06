import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

/**
 * Cliente para uso no browser (Client Components). Sincroniza a sessão nos
 * cookies via `@supabase/ssr` para permanecer autenticado entre reloads.
 * Sujeito às policies de RLS.
 */
export function getBrowserSupabase(): SupabaseClient {
  return createBrowserClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
}

/**
 * Cliente "puro" com a publishable key, sem cookies — usado em testes e em
 * contextos sem request associada. Sujeito às policies de RLS.
 */
export function createPublicClient(): SupabaseClient {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
}

/** Cliente com a secret key — ignora RLS. Nunca importar em código de browser. */
export function createServiceClient(): SupabaseClient {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
