import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createPublicClient, createServiceClient } from "@/lib/supabase/client";

/**
 * Roda contra o Supabase local em Docker. Garante que a RLS de `profiles`
 * isola os dados por usuário — critério de segurança de `docs/stack.md`.
 */

const service = createServiceClient();
const created: string[] = [];

async function createUser() {
  const email = `test-${randomUUID()}@lembr8.local`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user.id);
  return { id: data.user.id, email, password: data.user.id };
}

afterAll(async () => {
  await Promise.all(created.map((id) => service.auth.admin.deleteUser(id)));
});

describe("RLS de profiles", () => {
  it("cria o perfil automaticamente no signup", async () => {
    const user = await createUser();
    const { data, error } = await service
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBe(user.id);
  });

  it("não expõe perfis para o usuário anônimo", async () => {
    await createUser();
    const anon = createPublicClient();
    const { data, error } = await anon.from("profiles").select("id");
    expect(data).toBeNull();
    // `anon` não tem GRANT na tabela — bloqueio antes mesmo da RLS.
    expect(error?.code).toBe("42501");
  });

  it("expõe apenas o próprio perfil para o usuário autenticado", async () => {
    const owner = await createUser();
    const other = await createUser();

    const password = randomUUID();
    await service.auth.admin.updateUserById(owner.id, { password });

    const client = createPublicClient();
    const { error: signInError } = await client.auth.signInWithPassword({
      email: owner.email,
      password,
    });
    expect(signInError).toBeNull();

    const { data } = await client.from("profiles").select("id");
    expect(data).toEqual([{ id: owner.id }]);
    expect(data?.some((row) => row.id === other.id)).toBe(false);
  });
});
