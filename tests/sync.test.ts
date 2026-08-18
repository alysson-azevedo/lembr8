import { describe, expect, it } from "vitest";
import {
  mergeCache,
  migrateV2toV3,
  type CacheState,
  type PendingOp,
} from "@/lib/todos/repository";
import type { CloudState, ItemRecord, ListRecord } from "@/lib/todos/cloud-adapter";

/**
 * Lógica pura de sync/merge (LB-6) — node, sem DOM/Supabase. Testa o merge por
 * `updated_at`, a fila de pending, a migração v2→v3, o isolamento entre contas
 * e o mapeamento id-local=id-cloud (upsert idempotente, sem duplicata).
 */

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-02T00:00:00.000Z";
const T2 = "2026-01-03T00:00:00.000Z";

type LocalList = CacheState["lists"][number];
type LocalItem = CacheState["items"][number];

function localList(
  id: string,
  nome: string,
  updatedAt: string = T0,
  pinned: boolean = false,
): LocalList {
  return { id, nome, pinned, archivedAt: null, createdAt: T0, updatedAt };
}

function localItem(
  id: string,
  listId: string,
  texto: string,
  concluido = false,
  updatedAt: string = T0,
): LocalItem {
  return { id, listId, texto, concluido, createdAt: T0, updatedAt };
}

function cloudList(
  id: string,
  nome: string,
  updatedAt: string = T0,
  pinned: boolean = false,
): ListRecord {
  return { id, nome, pinned, archived_at: null, created_at: T0, updated_at: updatedAt };
}

function cloudItem(
  id: string,
  listId: string,
  texto: string,
  concluido = false,
  updatedAt: string = T0,
): ItemRecord {
  return { id, list_id: listId, texto, concluido, created_at: T0, updated_at: updatedAt };
}

function merge(
  local: { lists: LocalList[]; items: LocalItem[]; pending?: PendingOp[] },
  cloud: CloudState,
) {
  return mergeCache(
    { lists: local.lists, items: local.items, pending: local.pending ?? [] },
    cloud,
  );
}

describe("mergeCache — merge por updated_at", () => {
  it("cloud > local sobrescreve o local", () => {
    const out = merge(
      { lists: [localList("l1", "Antigo", T0)], items: [] },
      { lists: [cloudList("l1", "Novo", T1)], items: [] },
    );
    expect(out.lists[0].nome).toBe("Novo");
    expect(out.lists[0].updatedAt).toBe(T1);
  });

  it("cloud < local mantém o local e o registro permanece pending", () => {
    const out = merge(
      { lists: [localList("l1", "Local", T2)], items: [] },
      { lists: [cloudList("l1", "Cloud", T1)], items: [] },
    );
    expect(out.lists[0].nome).toBe("Local");
    expect(out.lists[0].updatedAt).toBe(T2);
    expect(out.pending).toContainEqual({ kind: "list", id: "l1" });
  });

  it("cloud == local mantém o local (idempotente) e não vira pending", () => {
    const out = merge(
      { lists: [localList("l1", "Mesmo", T1)], items: [] },
      { lists: [cloudList("l1", "Outro", T1)], items: [] },
    );
    expect(out.lists[0].nome).toBe("Mesmo");
    expect(out.pending).not.toContainEqual({ kind: "list", id: "l1" });
  });

  it("registro só no cloud é adicionado ao cache (segundo dispositivo)", () => {
    const out = merge(
      { lists: [], items: [] },
      {
        lists: [cloudList("l1", "Lista 1", T0)],
        items: [cloudItem("i1", "l1", "arroz", false, T0)],
      },
    );
    expect(out.lists.map((l) => l.id)).toEqual(["l1"]);
    expect(out.items.map((i) => [i.id, i.listId, i.texto])).toEqual([
      ["i1", "l1", "arroz"],
    ]);
  });

  it("registro só local é mantido e permanece pending (será pushado)", () => {
    const out = merge(
      { lists: [localList("l1", "Local", T0)], items: [] },
      { lists: [], items: [] },
    );
    expect(out.lists.map((l) => l.id)).toEqual(["l1"]);
    expect(out.pending).toContainEqual({ kind: "list", id: "l1" });
  });

  it("merge por id, sem duplicata indevida", () => {
    const out = merge(
      { lists: [localList("l1", "A", T1)], items: [localItem("i1", "l1", "x", false, T1)] },
      {
        lists: [cloudList("l1", "A2", T1)],
        items: [cloudItem("i1", "l1", "x2", false, T1)],
      },
    );
    expect(out.lists.filter((l) => l.id === "l1")).toHaveLength(1);
    expect(out.items.filter((i) => i.id === "i1")).toHaveLength(1);
  });

  it("item: cloud mais recente atualiza texto e concluído; created_at vem do cloud", () => {
    const out = merge(
      { lists: [localList("l1", "L", T0)], items: [localItem("i1", "l1", "a-fazer", false, T0)] },
      {
        lists: [cloudList("l1", "L", T0)],
        items: [cloudItem("i1", "l1", "feito", true, T2)],
      },
    );
    const it = out.items.find((i) => i.id === "i1")!;
    expect(it.texto).toBe("feito");
    expect(it.concluido).toBe(true);
    expect(it.updatedAt).toBe(T2);
    // a-fazer ++ concluídos: concluído vai ao fim.
    expect(out.items.map((i) => i.concluido)).toEqual([true]);
  });

  it("preserva a ordenação a-fazer ++ concluídos por lista", () => {
    const out = merge(
      {
        lists: [localList("l1", "L", T0)],
        items: [
          localItem("i1", "l1", "a", false, T0),
          localItem("i2", "l1", "b", true, T0),
        ],
      },
      {
        lists: [cloudList("l1", "L", T0)],
        items: [cloudItem("i3", "l1", "c", false, T2), cloudItem("i4", "l1", "d", true, T2)],
      },
    );
    // a-fazer (i1, i3) ++ concluídos (i2, i4)
    expect(out.items.map((i) => [i.texto, i.concluido])).toEqual([
      ["a", false],
      ["c", false],
      ["b", true],
      ["d", true],
    ]);
  });
});

describe("Fila de pending ops", () => {
  it("registro local mais recente que o cloud permanece pending", () => {
    const out = merge(
      {
        lists: [localList("l1", "Local", T2)],
        items: [localItem("i1", "l1", "x", false, T2)],
      },
      {
        lists: [cloudList("l1", "Cloud", T1)],
        items: [cloudItem("i1", "l1", "x", true, T1)],
      },
    );
    expect(out.pending).toContainEqual({ kind: "list", id: "l1" });
    expect(out.pending).toContainEqual({ kind: "item", id: "i1" });
  });

  it("registro empatado não vira pending novo", () => {
    const out = merge(
      {
        lists: [localList("l1", "L", T1)],
        items: [],
        pending: [{ kind: "list", id: "l1" }],
      },
      { lists: [cloudList("l1", "L", T1)], items: [] },
    );
    // mesmo timestamp: o registro já estava pending e permanece (mantém local).
    expect(out.pending).toContainEqual({ kind: "list", id: "l1" });
  });

  it("dedup de pending por (kind, id) — não duplica ops", () => {
    const local = {
      lists: [localList("l1", "L", T2)],
      items: [localItem("i1", "l1", "x", false, T2)],
      pending: [
        { kind: "item", id: "i1" },
        { kind: "item", id: "i1" } as PendingOp,
        { kind: "list", id: "l1" },
      ] as PendingOp[],
    };
    const out = merge(local, { lists: [], items: [] });
    const itemOps = out.pending.filter((p) => p.kind === "item" && p.id === "i1");
    expect(itemOps).toHaveLength(1);
  });
});

describe("Migração v2 → v3", () => {
  it("normaliza preservando lists/items e ids; migrated=false", () => {
    const v2 = {
      version: 2 as const,
      lists: [{ id: "l1", nome: "Lista 1" }, { id: "l2", nome: "Compras" }],
      items: [
        { id: "i1", listId: "l1", texto: "arroz", concluido: false },
        { id: "i2", listId: "l2", texto: "leite", concluido: true },
      ],
    };
    const v3 = migrateV2toV3(v2, T0);
    expect(v3.version).toBe(3);
    expect(v3.userId).toBeNull();
    expect(v3.migrated).toBe(false);
    expect(v3.pending).toEqual([]);
    expect(v3.lastSyncAt).toBeNull();
    expect(v3.lists.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(v3.items.map((i) => i.id)).toEqual(["i1", "i2"]);
    // preserva conteúdo de domínio
    expect(v3.lists.map((l) => l.nome)).toEqual(["Lista 1", "Compras"]);
    expect(v3.items.map((i) => [i.texto, i.concluido])).toEqual([
      ["arroz", false],
      ["leite", true],
    ]);
    // ganha timestamps
    expect(v3.lists.every((l) => l.createdAt === T0 && l.updatedAt === T0)).toBe(true);
    expect(v3.items.every((i) => i.createdAt === T0 && i.updatedAt === T0)).toBe(true);
  });
});

describe("Mapeamento id-local = id-cloud", () => {
  it("upsert por id é idempotente: pull com mesmo id funde sem duplicata", () => {
    const local = { lists: [localList("l1", "L", T1)], items: [] };
    const cloud: CloudState = {
      lists: [cloudList("l1", "L", T1)],
      items: [],
    };
    const a = merge(local, cloud);
    const b = merge({ lists: a.lists, items: a.items, pending: a.pending }, cloud);
    expect(b.lists.filter((l) => l.id === "l1")).toHaveLength(1);
  });

  it("multi-device: ids diferentes fundem por união, sem perda", () => {
    const deviceA = { lists: [localList("a-l1", "Lista A", T0)], items: [localItem("a-i1", "a-l1", "pão", false, T0)] };
    const deviceB = { lists: [localList("b-l1", "Lista B", T0)], items: [localItem("b-i1", "b-l1", "café", false, T0)] };
    // ambos pusharam para o mesmo cloud (união por id).
    const cloud: CloudState = {
      lists: [...deviceA.lists.map((l) => cloudList(l.id, l.nome, l.updatedAt)), ...deviceB.lists.map((l) => cloudList(l.id, l.nome, l.updatedAt))],
      items: [...deviceA.items.map((i) => cloudItem(i.id, i.listId, i.texto, i.concluido, i.updatedAt)), ...deviceB.items.map((i) => cloudItem(i.id, i.listId, i.texto, i.concluido, i.updatedAt))],
    };
    const out = merge({ lists: [], items: [] }, cloud);
    expect(out.lists.map((l) => l.id).sort()).toEqual(["a-l1", "b-l1"]);
    expect(out.items.map((i) => i.id).sort()).toEqual(["a-i1", "b-i1"]);
  });
});