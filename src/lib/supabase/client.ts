import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

// Acesso LITERAL a process.env.NEXT_PUBLIC_* — obrigatório para o Next.js
// embutir essas variáveis no bundle do browser em build time. Acesso indireto
// (process.env[name]) NÃO é embutido, e falha em runtime no client.
function requiredServerEnv(name: string): string {
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error("Variável de ambiente ausente: NEXT_PUBLIC_SUPABASE_URL");
  if (!publishableKey) throw new Error("Variável de ambiente ausente: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return createBrowserClient(url, publishableKey);
}

/**
 * Cliente "puro" com a publishable key, sem cookies — usado em testes e em
 * contextos sem request associada. Sujeito às policies de RLS.
 */
export function createPublicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error("Variável de ambiente ausente: NEXT_PUBLIC_SUPABASE_URL");
  if (!publishableKey) throw new Error("Variável de ambiente ausente: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return createClient(url, publishableKey);
}

/** Cliente com a secret key — ignora RLS. Nunca importar em código de browser. */
export function createServiceClient(): SupabaseClient {
  return createClient(
    requiredServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredServerEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
