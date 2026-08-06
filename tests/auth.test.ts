import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createPublicClient, createServiceClient } from "@/lib/supabase/client";

/**
 * Roda contra o Supabase local em Docker (`pnpm db:start`). Valida o fluxo de
 * auth da LB-2: login com credenciais válidas/inválidas, persistência da
 * sessão e logout.
 */

const service = createServiceClient();
const created: string[] = [];

async function createUser(password = randomUUID()) {
  const email = `test-${randomUUID()}@lembr8.local`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user.id);
  return { id: data.user.id, email, password };
}

afterAll(async () => {
  await Promise.all(created.map((id) => service.auth.admin.deleteUser(id)));
});

describe("Auth — login com e-mail e senha (LB-2)", () => {
  it("autentica com credenciais válidas (CA 1)", async () => {
    const user = await createUser();
    const client = createPublicClient();

    const { error } = await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(error).toBeNull();

    const {
      data: { user: sessionUser },
    } = await client.auth.getUser();
    expect(sessionUser?.id).toBe(user.id);
  });

  it("rejeita credenciais inválidas sem criar sessão (CA 2)", async () => {
    const user = await createUser();
    const client = createPublicClient();

    const { error } = await client.auth.signInWithPassword({
      email: user.email,
      password: "senha-errada",
    });
    expect(error).not.toBeNull();

    const {
      data: { user: sessionUser },
    } = await client.auth.getUser();
    expect(sessionUser).toBeNull();
  });

  it("mantém sessão ativa após o login (CA 3 — pré-requisito)", async () => {
    const user = await createUser();
    const client = createPublicClient();
    await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });

    // A persistência entre reloads no browser é garantida pelos cookies
    // gravados pelo `@supabase/ssr` (middleware + server client); em node o
    // supabase-js não mantém cookies, então validamos aqui o pré-requisito:
    // sessão ativa com access token. A persistência real é validada
    // manualmente/E2E (ver comentário do PR).
    const { data: session } = await client.auth.getSession();
    expect(session.session?.access_token).toBeTruthy();
  });

  it("encerra a sessão no logout (CA 4)", async () => {
    const user = await createUser();
    const client = createPublicClient();
    await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });

    const { error } = await client.auth.signOut();
    expect(error).toBeNull();

    const {
      data: { user: sessionUser },
    } = await client.auth.getUser();
    expect(sessionUser).toBeNull();
  });
});