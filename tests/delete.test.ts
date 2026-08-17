import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalFirstRepository,
  deleteItemFromLista,
  deleteListaCascade,
  mergeCache,
  migrateV3toV4,
  type CacheState,
  type CacheStateV3,
  type PendingOp,
} from "@/lib/todos/repository";
import { FakeCloudAdapter } from "@/lib/todos/cloud-adapter";
import type { CloudState, ItemRecord, ListRecord } from "@/lib/todos/cloud-adapter";
import type { Item } from "@/lib/todos/types";

/**
 * Lógica de exclusão (LB-8) — node, sem DOM/Supabase. Testa as funções puras de
 * domínio (deleteItemFromLista, deleteListaCascade), o merge upsert-only com
 * filtro de tombstone local (deletedIds), a migração v3→v4 e o repositório
 * (deleteItem/deleteLista + sync com hard delete no cloud).
 */

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-02T00:00:00.000Z";

type LocalList = CacheState["lists"][number];
type LocalItem = CacheState["items"][number];

function localList(id: string, nome: string, updatedAt = T0): LocalList {
  return { id, nome, pinned: false, createdAt: T0, updatedAt };
}
function localItem(
  id: string,
  listId: string,
  texto: string,
  concluido = false,
  updatedAt = T0,
): LocalItem {
  return { id, listId, texto, concluido, createdAt: T0, updatedAt };
}
function cloudList(id: string, nome: string, updatedAt = T0): ListRecord {
  return { id, nome, pinned: false, created_at: T0, updated_at: updatedAt };
}
function cloudItem(
  id: string,
  listId: string,
  texto: string,
  concluido = false,
  updatedAt = T0,
): ItemRecord {
  return { id, list_id: listId, texto, concluido, created_at: T0, updated_at: updatedAt };
}

describe("deleteItemFromLista — hard delete de item (LB-8)", () => {
  const items: Item[] = [
    { id: "i1", listId: "l1", texto: "arroz", concluido: false },
    { id: "i2", listId: "l1", texto: "feijão", concluido: false },
    { id: "i3", listId: "l2", texto: "leite", concluido: false },
  ];

  it("remove o item pelo id e preserva a ordem dos demais", () => {
    const out = deleteItemFromLista(items, "i2");
    expect(out.map((i) => i.id)).toEqual(["i1", "i3"]);
  });

  it("preserva itens de outras listas", () => {
    const out = deleteItemFromLista(items, "i1");
    expect(out.map((i) => [i.id, i.listId])).toEqual([
      ["i2", "l1"],
      ["i3", "l2"],
    ]);
  });

  it("id inexistente é no-op (mesma referência)", () => {
    expect(deleteItemFromLista(items, "zzz")).toBe(items);
  });

  it("não muta a entrada", () => {
    const snapshot = [...items];
    deleteItemFromLista(items, "i1");
    expect(items).toEqual(snapshot);
  });

  it("preserva timestamps (ItemRecordLocal não perde createdAt/updatedAt)", () => {
    const rec: LocalItem[] = [
      { id: "i1", listId: "l1", texto: "a", concluido: false, createdAt: T0, updatedAt: T1 },
    ];
    const out = deleteItemFromLista(rec, "i1");
    expect(out).toEqual([]);
  });
});

describe("deleteListaCascade — hard delete de lista em cascade (LB-8)", () => {
  const lists: LocalList[] = [localList("l1", "Compras"), localList("l2", "Churrasco")];
  const items: LocalItem[] = [
    localItem("i1", "l1", "arroz"),
    localItem("i2", "l1", "feijão", true),
    localItem("i3", "l2", "carne"),
  ];

  it("remove a lista e todos os seus itens", () => {
    const out = deleteListaCascade({ lists, items }, "l1");
    expect(out.lists.map((l) => l.id)).toEqual(["l2"]);
    expect(out.items.map((i) => i.id)).toEqual(["i3"]);
  });

  it("devolve os ids a marcar no tombstone (lista + itens da lista)", () => {
    const out = deleteListaCascade({ lists, items }, "l1");
    expect(out.deletedIds).toEqual({ lists: ["l1"], items: ["i1", "i2"] });
  });

  it("lista sem itens devolve só o id da lista", () => {
    const out = deleteListaCascade(
      { lists: [localList("l3", "Vazia")], items: [] },
      "l3",
    );
    expect(out.deletedIds).toEqual({ lists: ["l3"], items: [] });
  });

  it("preserva listas e itens de outras listas", () => {
    const out = deleteListaCascade({ lists, items }, "l2");
    expect(out.lists.map((l) => l.id)).toEqual(["l1"]);
    expect(out.items.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(out.deletedIds).toEqual({ lists: ["l2"], items: ["i3"] });
  });

  it("não muta a entrada", () => {
    const listsSnap = [...lists];
    const itemsSnap = [...items];
    deleteListaCascade({ lists, items }, "l1");
    expect(lists).toEqual(listsSnap);
    expect(items).toEqual(itemsSnap);
  });
});

describe("mergeCache — upsert-only + filtro de deletedIds (LB-8)", () => {
  function merge(
    local: {
      lists: LocalList[];
      items: LocalItem[];
      pending?: PendingOp[];
      deletedIds?: { lists: string[]; items: string[] };
    },
    cloud: CloudState,
  ) {
    return mergeCache(
      {
        lists: local.lists,
        items: local.items,
        pending: local.pending ?? [],
        deletedIds: local.deletedIds,
      },
      cloud,
    );
  }

  it("item em deletedIds NÃO é reimportado do cloud (sem ressuscitação)", () => {
    const out = merge(
      { lists: [localList("l1", "L")], items: [], deletedIds: { lists: [], items: ["i1"] } },
      { lists: [cloudList("l1", "L")], items: [cloudItem("i1", "l1", "arroz")] },
    );
    expect(out.items.map((i) => i.id)).toEqual([]);
  });

  it("lista em deletedIds NÃO é reimportada do cloud", () => {
    const out = merge(
      { lists: [], items: [], deletedIds: { lists: ["l1"], items: [] } },
      { lists: [cloudList("l1", "Excluída")], items: [] },
    );
    expect(out.lists.map((l) => l.id)).toEqual([]);
  });

  it("item em deletedIds é pulado mesmo se só no cloud (não vira pending)", () => {
    const out = merge(
      { lists: [localList("l1", "L")], items: [], deletedIds: { lists: [], items: ["i1"] } },
      { lists: [cloudList("l1", "L")], items: [cloudItem("i1", "l1", "arroz")] },
    );
    expect(out.pending).not.toContainEqual({ kind: "item", id: "i1" });
  });

  it("upsert-only: registro só local é mantido mesmo ausente do cloud (não removido)", () => {
    const out = merge(
      {
        lists: [localList("l1", "Local", T1)],
        items: [localItem("i1", "l1", "arroz", false, T1)],
      },
      { lists: [], items: [] },
    );
    expect(out.lists.map((l) => l.id)).toEqual(["l1"]);
    expect(out.items.map((i) => i.id)).toEqual(["i1"]);
  });

  it("sem deletedIds: comportamento inalterado (rega o comportamento LB-6)", () => {
    const out = merge(
      { lists: [], items: [] },
      {
        lists: [cloudList("l1", "Lista 1")],
        items: [cloudItem("i1", "l1", "arroz")],
      },
    );
    expect(out.lists.map((l) => l.id)).toEqual(["l1"]);
    expect(out.items.map((i) => i.id)).toEqual(["i1"]);
  });

  it("itens de lista excluída (órfãos no cloud) não entram no merge", () => {
    const out = merge(
      {
        lists: [],
        items: [],
        deletedIds: { lists: ["l1"], items: [] },
      },
      {
        lists: [cloudList("l2", "Outra")],
        items: [
          cloudItem("i1", "l1", "órfão"), // lista l1 foi excluída
          cloudItem("i2", "l2", "ok"),
        ],
      },
    );
    // l1 não volta; i1 (de l1) não volta; l2 e i2 entram.
    expect(out.lists.map((l) => l.id)).toEqual(["l2"]);
    expect(out.items.map((i) => i.id)).toEqual(["i2"]);
  });
});

describe("migrateV3toV4 — tombstone local no cache (LB-8)", () => {
  it("adiciona deletedIds vazio preservando lists/items/pending/migrated", () => {
    const v3: CacheStateV3 = {
      version: 3,
      userId: "user-a",
      lists: [localList("l1", "Lista 1")],
      items: [localItem("i1", "l1", "arroz")],
      pending: [{ kind: "list", id: "l1" }],
      migrated: true,
      lastSyncAt: T0,
    };
    const v4 = migrateV3toV4(v3);
    expect(v4.version).toBe(4);
    expect(v4.deletedIds).toEqual({ lists: [], items: [] });
    expect(v4.userId).toBe("user-a");
    expect(v4.migrated).toBe(true);
    expect(v4.lists.map((l) => l.id)).toEqual(["l1"]);
    expect(v4.items.map((i) => i.id)).toEqual(["i1"]);
    expect(v4.pending).toContainEqual({ kind: "list", id: "l1" });
    expect(v4.lastSyncAt).toBe(T0);
  });
});

/** Storage em memória para o repositório. */
function memoryStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem(key: string) {
      return key in store ? store[key] : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
  };
}

function tickClock() {
  let t = 0;
  return () => new Date(t++ * 1000).toISOString();
}

describe("createLocalFirstRepository — deleteItem/deleteLista (LB-8)", () => {
  let storage: ReturnType<typeof memoryStorage>;
  let clock: () => string;

  beforeEach(() => {
    storage = memoryStorage();
    clock = tickClock();
  });

  it("deleteItem remove do cache, marca deletedIds.items e remove de pending", () => {
    const repo = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = repo.createList("Lista 1");
    repo.addItem(l.id, "arroz");
    repo.addItem(l.id, "feijão");
    const arroz = repo.listItems(l.id).find((i) => i.texto === "arroz")!;

    repo.deleteItem(arroz.id);

    expect(repo.listItems(l.id).map((i) => i.texto)).toEqual(["feijão"]);
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.deletedIds.items).toContain(arroz.id);
    expect(raw.deletedIds.lists).toEqual([]);
    // não há pending de um item excluído.
    expect(raw.pending).not.toContainEqual({ kind: "item", id: arroz.id });
  });

  it("deleteItem de id inexistente é no-op", () => {
    const repo = createLocalFirstRepository({ storage, adapter: null, clock });
    expect(() => repo.deleteItem("inexistente")).not.toThrow();
    expect(repo.listListas()).toEqual([]);
  });

  it("deleteLista remove a lista e seus itens do cache (cascade) e marca ids", () => {
    const repo = createLocalFirstRepository({ storage, adapter: null, clock });
    const l1 = repo.createList("Compras");
    repo.addItem(l1.id, "arroz");
    repo.addItem(l1.id, "feijão");
    const l2 = repo.createList("Churrasco");
    repo.addItem(l2.id, "carne");

    repo.deleteLista(l1.id);

    expect(repo.listListas().map((l) => l.nome)).toEqual(["Churrasco"]);
    expect(repo.listItems(l1.id)).toEqual([]);
    // l2 e seus itens permanecem.
    expect(repo.listItems(l2.id).map((i) => i.texto)).toEqual(["carne"]);
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.deletedIds.lists).toContain(l1.id);
    // itens de l1 marcados, mas não o de l2.
    const carne = repo.listItems(l2.id)[0];
    expect(raw.deletedIds.items).not.toContain(carne.id);
    expect(raw.pending).not.toContainEqual({ kind: "list", id: l1.id });
  });

  it("deleteLista remove os ids da lista e itens de pending", () => {
    const repo = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = repo.createList("Lista 1");
    repo.addItem(l.id, "arroz");
    const arroz = repo.listItems(l.id)[0];
    // ambos estão pending (criados).
    const raw0 = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw0.pending).toContainEqual({ kind: "list", id: l.id });
    expect(raw0.pending).toContainEqual({ kind: "item", id: arroz.id });

    repo.deleteLista(l.id);
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.pending).not.toContainEqual({ kind: "list", id: l.id });
    expect(raw.pending).not.toContainEqual({ kind: "item", id: arroz.id });
  });

  it("re-adicionar texto de item excluído cria NOVO item distinto (AC 5)", () => {
    const repo = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = repo.createList("Lista 1");
    repo.addItem(l.id, "arroz");
    const original = repo.listItems(l.id)[0];
    repo.deleteItem(original.id);
    // re-adiciona mesmo texto.
    repo.addItem(l.id, "arroz");
    const novo = repo.listItems(l.id)[0];
    expect(novo.id).not.toBe(original.id); // novo id distinto
    expect(novo.texto).toBe("arroz");
  });

  it("cache v4 persiste deletedIds e recarrega preservando", () => {
    const storageA = memoryStorage();
    const r = createLocalFirstRepository({ storage: storageA, adapter: null, clock });
    const l = r.createList("Lista 1");
    r.addItem(l.id, "arroz");
    const arroz = r.listItems(l.id)[0];
    r.deleteItem(arroz.id);
    expect(JSON.parse(storageA.getItem("lembr8.data")!).version).toBe(5);

    const r2 = createLocalFirstRepository({ storage: storageA, adapter: null, clock });
    expect(r2.listItems(l.id)).toEqual([]);
    expect(JSON.parse(storageA.getItem("lembr8.data")!).deletedIds.items).toContain(
      arroz.id,
    );
  });

  it("migra cache v3 legado para v4 adicionando deletedIds", () => {
    storage.setItem(
      "lembr8.data",
      JSON.stringify({
        version: 3,
        userId: "user-a",
        lists: [{ id: "l1", nome: "Lista 1", createdAt: T0, updatedAt: T0 }],
        items: [],
        pending: [],
        migrated: true,
        lastSyncAt: null,
      }),
    );
    const repo = createLocalFirstRepository({ storage, adapter: null, userId: "user-a", clock });
    expect(repo.listListas().map((l) => l.nome)).toEqual(["Lista 1"]);
    // a migração v3→v4→v5 é lazy em memória; uma mutação a persiste no novo formato.
    repo.renameList("l1", "Lista 1");
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.version).toBe(5);
    expect(raw.deletedIds).toEqual({ lists: [], items: [] });
  });
});

describe("createLocalFirstRepository — sync com hard delete + tombstone (LB-8)", () => {
  let storage: ReturnType<typeof memoryStorage>;
  let cloud: FakeCloudAdapter;
  let clock: () => string;

  beforeEach(() => {
    storage = memoryStorage();
    cloud = new FakeCloudAdapter();
    clock = tickClock();
    cloud.setUser("user-a");
  });

  function repo() {
    return createLocalFirstRepository({
      storage,
      adapter: cloud,
      userId: "user-a",
      clock,
    });
  }

  it("sync online: push executa hard delete no cloud e limpa deletedIds em sucesso", async () => {
    const r = repo();
    const l = r.createList("Lista 1");
    r.addItem(l.id, "arroz");
    r.addItem(l.id, "feijão");
    await r.sync(); // sobe tudo

    const arroz = r.listItems(l.id).find((i) => i.texto === "arroz")!;
    r.deleteItem(arroz.id);
    // deletedIds tem o item; ainda no cloud.
    const remote = await cloud.pull();
    expect(remote.items.map((i) => i.id)).toContain(arroz.id);

    await r.sync();

    // cloud não tem mais o item (hard delete).
    const remote2 = await cloud.pull();
    expect(remote2.items.map((i) => i.id)).not.toContain(arroz.id);
    // deletedIds limpo em sucesso.
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.deletedIds.items).toEqual([]);
    expect(raw.deletedIds.lists).toEqual([]);
  });

  it("sync online: deleteLista derruba a lista e itens no cloud (hard delete)", async () => {
    const r = repo();
    const l = r.createList("Compras");
    r.addItem(l.id, "arroz");
    r.addItem(l.id, "feijão");
    const itemIds = r.listItems(l.id).map((i) => i.id);
    await r.sync();

    r.deleteLista(l.id);
    await r.sync();

    const remote = await cloud.pull();
    expect(remote.lists.map((x) => x.id)).not.toContain(l.id);
    // os itens da lista foram derrubados (hard delete explícito dos ids).
    for (const iid of itemIds) {
      expect(remote.items.map((x) => x.id)).not.toContain(iid);
    }
  });

  it("pull não ressuscita item excluído mesmo se o cloud ainda o tem", async () => {
    // Cenário: exclui offline, cloud ainda tem o item; ao sincronizar, o push
    // deleta do cloud e o pull (upsert-only + filtro deletedIds) não reimporta.
    const r = repo();
    const l = r.createList("Lista 1");
    r.addItem(l.id, "arroz");
    await r.sync();
    const arroz = r.listItems(l.id)[0];

    // exclui offline (cloud.set offline simula o cloud "ainda tem" o item).
    cloud.offline = true;
    r.deleteItem(arroz.id);
    expect(r.listItems(l.id)).toEqual([]);
    // deletedIds preservado offline.
    expect(JSON.parse(storage.getItem("lembr8.data")!).deletedIds.items).toContain(
      arroz.id,
    );

    // reconecta: push deleta do cloud, pull não ressuscita.
    cloud.offline = false;
    await r.sync();
    expect(r.listItems(l.id)).toEqual([]);
    const remote = await cloud.pull();
    expect(remote.items.map((i) => i.id)).not.toContain(arroz.id);
  });

  it("sync offline: deleteIds preservados para o próximo sync (retry)", async () => {
    const r = repo();
    const l = r.createList("Lista 1");
    r.addItem(l.id, "arroz");
    const arroz = r.listItems(l.id)[0];
    r.deleteItem(arroz.id);

    cloud.offline = true;
    await r.sync();
    // rede falhou: deletedIds mantido.
    expect(JSON.parse(storage.getItem("lembr8.data")!).deletedIds.items).toContain(
      arroz.id,
    );

    // reconecta: esvazia.
    cloud.offline = false;
    await r.sync();
    expect(JSON.parse(storage.getItem("lembr8.data")!).deletedIds.items).toEqual([]);
  });

  it("pull upsert-only: registro só local não é removido por ausência no cloud", async () => {
    const r = repo();
    const l = r.createList("Lista 1");
    r.addItem(l.id, "arroz");
    // não sincroniza: o item existe só local. sync com cloud vazio.
    await r.sync();
    expect(r.listItems(l.id).map((i) => i.texto)).toEqual(["arroz"]);
  });
});