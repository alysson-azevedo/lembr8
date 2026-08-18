import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createPublicClient, createServiceClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

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

// --- Helpers para lists/items (LB-6) ---

async function signIn(user: { id: string; email: string }, password: string): Promise<SupabaseClient> {
  const client = createPublicClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password });
  expect(error).toBeNull();
  return client;
}

const T1 = "2026-01-02T00:00:00.000Z";
const T2 = "2026-01-03T00:00:00.000Z";

describe("RLS de lists", () => {
  it("usuário só vê suas próprias listas", async () => {
    const a = await createUser();
    const b = await createUser();
    const pa = randomUUID();
    const pb = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    await service.auth.admin.updateUserById(b.id, { password: pb });

    const ca = await signIn(a, pa);
    const cb = await signIn(b, pb);

    const { error: ea } = await ca
      .from("lists")
      .insert({ id: randomUUID(), nome: "Lista A" });
    expect(ea).toBeNull();
    const { error: eb } = await cb
      .from("lists")
      .insert({ id: randomUUID(), nome: "Lista B" });
    expect(eb).toBeNull();

    const { data: da } = await ca.from("lists").select("nome");
    expect(da?.map((r) => r.nome)).toEqual(["Lista A"]);
    const { data: db } = await cb.from("lists").select("nome");
    expect(db?.map((r) => r.nome)).toEqual(["Lista B"]);
  });

  it("default auth.uid() preenche o dono; insert com user_id alheio é rejeitado", async () => {
    const a = await createUser();
    const b = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    // forjar user_id do outro usuário → policy with check rejeita.
    const { error } = await ca
      .from("lists")
      .insert({ id: randomUUID(), user_id: b.id, nome: "Fraude" });
    expect(error).not.toBeNull();
    // e de fato não grava.
    const { data } = await service.from("lists").select("id").eq("user_id", b.id);
    expect(data?.length ?? 0).toBe(0);
  });
});

describe("RLS de items (isolamento via join em list_id)", () => {
  it("usuário só vê itens das suas listas", async () => {
    const a = await createUser();
    const b = await createUser();
    const pa = randomUUID();
    const pb = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    await service.auth.admin.updateUserById(b.id, { password: pb });
    const ca = await signIn(a, pa);
    const cb = await signIn(b, pb);

    const la = randomUUID();
    const lb = randomUUID();
    await ca.from("lists").insert({ id: la, nome: "A" });
    await cb.from("lists").insert({ id: lb, nome: "B" });

    const { error: ea } = await ca
      .from("items")
      .insert({ id: randomUUID(), list_id: la, texto: "item A" });
    expect(ea).toBeNull();

    // A não enxerga itens de B e vice-versa.
    const { data: da } = await ca.from("items").select("texto");
    expect(da?.map((r) => r.texto)).toEqual(["item A"]);
    const { data: db } = await cb.from("items").select("texto");
    expect(db).toEqual([]);
  });

  it("insert de item com list_id alheio é rejeitado", async () => {
    const a = await createUser();
    const b = await createUser();
    const pa = randomUUID();
    const pb = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    await service.auth.admin.updateUserById(b.id, { password: pb });
    const ca = await signIn(a, pa);
    const cb = await signIn(b, pb);

    const lb = randomUUID();
    await cb.from("lists").insert({ id: lb, nome: "B" });

    const { error } = await ca
      .from("items")
      .insert({ id: randomUUID(), list_id: lb, texto: "intruso" });
    expect(error).not.toBeNull();
  });
});

describe("RPC sync_push — merge server-side", () => {
  it("só grava nas próprias listas (user_id = auth.uid())", async () => {
    const a = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    const id = randomUUID();
    const { error } = await ca.rpc("sync_push", {
      p_lists: [{ id, nome: "Lista A", created_at: T1, updated_at: T1 }],
      p_items: [],
    });
    expect(error).toBeNull();
    const { data } = await service.from("lists").select("user_id").eq("id", id).single();
    expect(data?.user_id).toBe(a.id);
  });

  it("empate de updated_at NÃO sobrescreve (primeiro que chega vence)", async () => {
    const a = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    const id = randomUUID();
    await ca.rpc("sync_push", {
      p_lists: [{ id, nome: "Primeiro", created_at: T1, updated_at: T1 }],
      p_items: [],
    });
    // mesma updated_at → não sobrescreve.
    await ca.rpc("sync_push", {
      p_lists: [{ id, nome: "Segundo", created_at: T1, updated_at: T1 }],
      p_items: [],
    });
    const { data } = await service.from("lists").select("nome").eq("id", id).single();
    expect(data?.nome).toBe("Primeiro");
  });

  it("updated_at estritamente maior sobrescreve (última escrita vence)", async () => {
    const a = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    const id = randomUUID();
    await ca.rpc("sync_push", {
      p_lists: [{ id, nome: "Antigo", created_at: T1, updated_at: T1 }],
      p_items: [],
    });
    await ca.rpc("sync_push", {
      p_lists: [{ id, nome: "Novo", created_at: T1, updated_at: T2 }],
      p_items: [],
    });
    const { data } = await service.from("lists").select("nome").eq("id", id).single();
    expect(data?.nome).toBe("Novo");
  });

  it("item com list_id alheio é rejeitado pela RLS do invoker", async () => {
    const a = await createUser();
    const b = await createUser();
    const pa = randomUUID();
    const pb = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    await service.auth.admin.updateUserById(b.id, { password: pb });
    const ca = await signIn(a, pa);
    const cb = await signIn(b, pb);

    const lb = randomUUID();
    await cb.from("lists").insert({ id: lb, nome: "B" });

    const { error } = await ca.rpc("sync_push", {
      p_lists: [],
      p_items: [{ id: randomUUID(), list_id: lb, texto: "intruso", concluido: false, created_at: T1, updated_at: T1 }],
    });
    expect(error).not.toBeNull();
  });

  it("item é upsertado na própria lista do usuário", async () => {
    const a = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    const la = randomUUID();
    const ii = randomUUID();
    await ca.from("lists").insert({ id: la, nome: "A" });
    const { error } = await ca.rpc("sync_push", {
      p_lists: [],
      p_items: [{ id: ii, list_id: la, texto: "arroz", concluido: false, created_at: T1, updated_at: T1 }],
    });
    expect(error).toBeNull();
    const { data } = await service.from("items").select("texto").eq("id", ii).single();
    expect(data?.texto).toBe("arroz");
  });
});

describe("RLS de lists/items — anon sem acesso", () => {
  it("anon não lê lists nem items (sem grant)", async () => {
    const anon = createPublicClient();
    const { data: dl, error: el } = await anon.from("lists").select("id");
    expect(dl).toBeNull();
    expect(el?.code).toBe("42501");
    const { data: di, error: ei } = await anon.from("items").select("id");
    expect(di).toBeNull();
    expect(ei?.code).toBe("42501");
  });
});

describe("RLS de delete — hard delete só do dono (LB-8 AC 6)", () => {
  it("usuário deleta sua própria lista e ela some", async () => {
    const a = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    const id = randomUUID();
    const { error: ins } = await ca
      .from("lists")
      .insert({ id, nome: "Para deletar" });
    expect(ins).toBeNull();

    const { error } = await ca.from("lists").delete().eq("id", id);
    expect(error).toBeNull();
    const { data } = await service.from("lists").select("id").eq("id", id);
    expect(data).toEqual([]);
  });

  it("usuário NÃO deleta lista de outra conta (RLS rejeita / 0 linhas)", async () => {
    const a = await createUser();
    const b = await createUser();
    const pa = randomUUID();
    const pb = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    await service.auth.admin.updateUserById(b.id, { password: pb });
    const ca = await signIn(a, pa);
    const cb = await signIn(b, pb);

    const lb = randomUUID();
    const { error: ins } = await cb.from("lists").insert({ id: lb, nome: "Do B" });
    expect(ins).toBeNull();

    // A tenta deletar a lista de B: a RLS bloqueia (0 linhas afetadas).
    const { error, count } = await ca
      .from("lists")
      .delete()
      .eq("id", lb)
      .select("id");
    expect(error).toBeNull();
    expect(count ?? 0).toBe(0);
    // a lista de B permanece.
    const { data } = await service.from("lists").select("id").eq("id", lb).single();
    expect(data?.id).toBe(lb);
  });

  it("usuário deleta seu próprio item e ele some", async () => {
    const a = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    const la = randomUUID();
    const ii = randomUUID();
    await ca.from("lists").insert({ id: la, nome: "A" });
    await ca
      .from("items")
      .insert({ id: ii, list_id: la, texto: "item A" });

    const { error } = await ca.from("items").delete().eq("id", ii);
    expect(error).toBeNull();
    const { data } = await service.from("items").select("id").eq("id", ii);
    expect(data).toEqual([]);
  });

  it("usuário NÃO deleta item de lista de outra conta (RLS rejeita / 0 linhas)", async () => {
    const a = await createUser();
    const b = await createUser();
    const pa = randomUUID();
    const pb = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    await service.auth.admin.updateUserById(b.id, { password: pb });
    const ca = await signIn(a, pa);
    const cb = await signIn(b, pb);

    const lb = randomUUID();
    const ib = randomUUID();
    await cb.from("lists").insert({ id: lb, nome: "B" });
    await cb
      .from("items")
      .insert({ id: ib, list_id: lb, texto: "item B" });

    // A tenta deletar o item de B: bloqueado pela RLS do join em list_id.
    const { error, count } = await ca
      .from("items")
      .delete()
      .eq("id", ib)
      .select("id");
    expect(error).toBeNull();
    expect(count ?? 0).toBe(0);
    const { data } = await service.from("items").select("id").eq("id", ib).single();
    expect(data?.id).toBe(ib);
  });

  it("deletar a lista derruba os itens em cascade (FK on delete cascade)", async () => {
    const a = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    const la = randomUUID();
    const ii = randomUUID();
    await ca.from("lists").insert({ id: la, nome: "A" });
    await ca
      .from("items")
      .insert({ id: ii, list_id: la, texto: "arroz" });

    await ca.from("lists").delete().eq("id", la);
    const { data } = await service.from("items").select("id").eq("id", ii);
    expect(data).toEqual([]);
  });
});

describe("RPC sync_push — pinned (LB-14, AC 11/12/13)", () => {
  it("upsert com pinned=true persiste e é lido de volta", async () => {
    const a = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    const id = randomUUID();
    const { error } = await ca.rpc("sync_push", {
      p_lists: [{ id, nome: "Mercado", pinned: true, created_at: T1, updated_at: T1 }],
      p_items: [],
    });
    expect(error).toBeNull();
    const { data } = await service
      .from("lists")
      .select("nome,pinned")
      .eq("id", id)
      .single();
    expect(data?.pinned).toBe(true);
  });

  it("pinned ausente no payload cai em false (compat com client antigo)", async () => {
    const a = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    const id = randomUUID();
    await ca.rpc("sync_push", {
      p_lists: [{ id, nome: "Sem pin", created_at: T1, updated_at: T1 }],
      p_items: [],
    });
    const { data } = await service.from("lists").select("pinned").eq("id", id).single();
    expect(data?.pinned).toBe(false);
  });

  it("default da coluna é false no insert direto (AC 12 — aditivo, sem fixar existentes)", async () => {
    const a = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    const id = randomUUID();
    const { error } = await ca.from("lists").insert({ id, nome: "Nova" });
    expect(error).toBeNull();
    const { data } = await service.from("lists").select("pinned").eq("id", id).single();
    expect(data?.pinned).toBe(false);
  });

  it("updated_at estritamente maior sobrescreve o pinned (merge cross-device, AC 11)", async () => {
    const a = await createUser();
    const pa = randomUUID();
    await service.auth.admin.updateUserById(a.id, { password: pa });
    const ca = await signIn(a, pa);

    const id = randomUUID();
    await ca.rpc("sync_push", {
      p_lists: [{ id, nome: "L", pinned: false, created_at: T1, updated_at: T1 }],
      p_items: [],
    });
    // versão mais recente fixada → vence.
    await ca.rpc("sync_push", {
      p_lists: [{ id, nome: "L", pinned: true, created_at: T1, updated_at: T2 }],
      p_items: [],
    });
    const { data } = await service.from("lists").select("pinned").eq("id", id).single();
    expect(data?.pinned).toBe(true);
  });
});
