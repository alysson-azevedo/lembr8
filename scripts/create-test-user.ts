/**
 * Cria (ou recria) um usuário de teste no Supabase local para validação
 * manual do login no browser.
 *
 *   pnpm exec tsx scripts/create-test-user.ts
 *
 * Recria o usuário toda vez (deleta e cria) para garantir a senha. Sobe as
 * chaves do stack local via `supabase status` quando as env vars ausentes
 * (mesmo princípio do `tests/setup.ts`).
 */
import { execFileSync } from "node:child_process";
import { createServiceClient } from "../src/lib/supabase/client";

type Status = { API_URL: string; PUBLISHABLE_KEY: string; SECRET_KEY: string };

function localStatus(): Status {
  const out = execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(out) as Status;
}

const TEST_EMAIL = "demo@lembr8.local";
const TEST_PASSWORD = "lembr8-demo";

async function main() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    !process.env.SUPABASE_SECRET_KEY
  ) {
    const status = localStatus();
    process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY;
    process.env.SUPABASE_SECRET_KEY = status.SECRET_KEY;
  }

  const service = createServiceClient();

  // Tenta deletar um usuário demo anterior para recriar com senha limpa.
  const { data: list } = await service.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === TEST_EMAIL);
  if (existing) {
    await service.auth.admin.deleteUser(existing.id);
  }

  const { data, error } = await service.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;

  console.log(`Usuário de teste criado: ${data.user.email}`);
  console.log(`Senha: ${TEST_PASSWORD}`);
  console.log("Use essas credenciais na tela de /login.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});