import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * Adapter do cloud (LB-6): ponte injetável entre o repository local-first e o
 * Supabase. O repository chama `push()` (upsert com merge por `updated_at` via
 * RPC `sync_push`) e `pull()` (select das listas/itens do usuário autenticado).
 *
 * Injetável para testes: em node/jsdom injeta um `FakeCloudAdapter` em memória
 * (sem Supabase real). A UI/store não importam este módulo — só a fábrica do
 * repository o resolve (lazy, no client).
 */

/** Registro de lista no formato do cloud (timestamps ISO para o merge + fixação LB-14 + arquivamento LB-16). */
export type ListRecord = {
  id: string;
  nome: string;
  pinned: boolean;
  /** `null`/ausente = ativa; string ISO = arquivada (LB-16). */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Registro de item no formato do cloud (timestamps ISO para o merge). */
export type ItemRecord = {
  id: string;
  list_id: string;
  texto: string;
  concluido: boolean;
  created_at: string;
  updated_at: string;
};

/** Resultado do pull. */
export type CloudState = { lists: ListRecord[]; items: ItemRecord[] };

/** Adapter do cloud — injetável para testes. */
export interface CloudAdapter {
  /** Push em lote com merge por `updated_at` (RPC `sync_push`). */
  push(lists: ListRecord[], items: ItemRecord[]): Promise<void>;
  /** Pull de todas as listas/itens do usuário autenticado. */
  pull(): Promise<CloudState>;
  /** Hard delete das listas/itens pelos ids (RLS filtra por `auth.uid()`). LB-8. */
  delete(listIds: string[], itemIds: string[]): Promise<void>;
}

/** Adapter real: cliente Supabase do browser (RLS filtra por `auth.uid()`). */
export function createSupabaseCloudAdapter(): CloudAdapter {
  return {
    async push(lists, items) {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.rpc("sync_push", {
        p_lists: lists,
        p_items: items,
      });
      if (error) throw error;
    },

    async pull() {
      const supabase = getBrowserSupabase();
      const [listsRes, itemsRes] = await Promise.all([
        supabase.from("lists").select("id,nome,pinned,archived_at,created_at,updated_at"),
        supabase.from("items").select(
          "id,list_id,texto,concluido,created_at,updated_at",
        ),
      ]);
      if (listsRes.error) throw listsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      return {
        lists: (listsRes.data ?? []) as ListRecord[],
        items: (itemsRes.data ?? []) as ItemRecord[],
      };
    },

    async delete(listIds, itemIds) {
      const supabase = getBrowserSupabase();
      // Itens primeiro (lida com órfãos e com adapters sem cascade); a lista
      // depois derruba o restante via FK on delete cascade. RLS filtra por
      // auth.uid() — só afeta a conta autenticada.
      if (itemIds.length > 0) {
        const { error } = await supabase.from("items").delete().in("id", itemIds);
        if (error) throw error;
      }
      if (listIds.length > 0) {
        const { error } = await supabase.from("lists").delete().in("id", listIds);
        if (error) throw error;
      }
    },
  };
}

/**
 * Adapter em memória para testes (node/jsdom sem Supabase real). Mantém um
 * estado de "cloud" por usuário (`auth.uid()` simulado): o push grava por id
 * respeitando o mesmo merge "última escrita vence / empate primeiro-vence" da
 * RPC `sync_push`; o pull devolve tudo do usuário corrente.
 */
export class FakeCloudAdapter implements CloudAdapter {
  /** Estado cloud: map user_id → { lists, items } por id. */
  private users = new Map<string, Map<string, { lists: ListRecord[]; items: ItemRecord[] }>>();
  public currentUser: string | null = null;
  /** Quando `true`, push/pull rejeitam para simular falha de rede. */
  public offline = false;

  private bucket(): Map<string, { lists: ListRecord[]; items: ItemRecord[] }> {
    const uid = this.currentUser;
    if (!uid) throw new Error("FakeCloudAdapter: currentUser não setado");
    let b = this.users.get(uid);
    if (!b) {
      b = new Map();
      this.users.set(uid, b);
    }
    return b;
  }

  /** Define o usuário autenticado (simula `auth.uid()`). */
  setUser(uid: string | null): void {
    this.currentUser = uid;
  }

  async push(lists: ListRecord[], items: ItemRecord[]): Promise<void> {
    if (this.offline) throw new Error("offline");
    const bucket = this.bucket();
    let state = bucket.get("state");
    if (!state) {
      state = { lists: [], items: [] };
      bucket.set("state", state);
    }
    // merge por updated_at (estritamente maior vence; empate mantém o atual).
    for (const l of lists) {
      const ex = state.lists.find((x) => x.id === l.id);
      if (!ex) state.lists.push({ ...l, archived_at: l.archived_at ?? null });
      else if (l.updated_at > ex.updated_at) {
        ex.nome = l.nome;
        ex.pinned = l.pinned;
        ex.archived_at = l.archived_at ?? null;
        ex.updated_at = l.updated_at;
        ex.created_at = l.created_at;
      }
    }
    for (const it of items) {
      const ex = state.items.find((x) => x.id === it.id);
      if (!ex) state.items.push({ ...it });
      else if (it.updated_at > ex.updated_at) {
        ex.texto = it.texto;
        ex.concluido = it.concluido;
        ex.updated_at = it.updated_at;
        ex.created_at = it.created_at;
      }
    }
  }

  async pull(): Promise<CloudState> {
    if (this.offline) throw new Error("offline");
    const bucket = this.bucket();
    const state = bucket.get("state") ?? { lists: [], items: [] };
    return {
      lists: state.lists.map((l) => ({ ...l })),
      items: state.items.map((i) => ({ ...i })),
    };
  }

  async delete(listIds: string[], itemIds: string[]): Promise<void> {
    if (this.offline) throw new Error("offline");
    const bucket = this.bucket();
    const state = bucket.get("state");
    if (!state) return; // nada no cloud: delete é no-op.
    // Sem cascade no fake: remove listas e itens explicitamente por id.
    if (listIds.length > 0) {
      const rem = new Set(listIds);
      state.lists = state.lists.filter((l) => !rem.has(l.id));
    }
    if (itemIds.length > 0) {
      const rem = new Set(itemIds);
      state.items = state.items.filter((i) => !rem.has(i.id));
    }
  }
}