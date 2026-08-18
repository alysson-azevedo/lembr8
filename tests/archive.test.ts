import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalFirstRepository,
  mergeCache,
  migrateV5toV6,
  type CacheStateV5,
  type StorageLike,
} from "@/lib/todos/repository";
import { FakeCloudAdapter } from "@/lib/todos/cloud-adapter";
import type { ListRecord } from "@/lib/todos/cloud-adapter";

/**
 * Lógica de arquivar/desarquivar listas (LB-16) — node, sem DOM/Supabase. Testa
 * `archiveLista`/`unarchiveLista` (toggle não destrutivo), `listIndex` filtrando
 * arquivadas (AC 2/9), `listArchivedIndex` (AC 3/4), o default `archivedAt=null`
 * (AC 10), a persistência (AC 6), o fluxo offline (AC 8), a propagação
 * cross-device via merge (AC 7), a preservação de `pinned` (AC 12) e o
 * no-regression em outros comportamentos (AC 13).
 */

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const store = { ...initial };
  return {
    getItem(key) {
      return key in store ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = value;
    },
    removeItem(key) {
      delete store[key];
    },
  };
}

function tickClock(start = 0): () => string {
  let t = start;
  return () => new Date(t++ * 1000).toISOString();
}

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-02T00:00:00.000Z";
const T2 = "2026-01-03T00:00:00.000Z";

describe("archiveLista/unarchiveLista — toggle não destrutivo (AC 1, 4, 5)", () => {
  let storage: StorageLike;
  let clock: () => string;

  beforeEach(() => {
    storage = memoryStorage();
    clock = tickClock();
  });

  it("lista nova nasce não-arquivada (archivedAt=null, AC 10)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    expect(r.getLista(l.id)?.archived).toBe(false);
    expect(r.listIndex()).toContainEqual(
      expect.objectContaining({ id: l.id, pinned: false }),
    );
  });

  it("arquivar seta archivedAt (não-null) e enfileira pending {kind:list} (AC 1)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    r.archiveLista(l.id);
    expect(r.getLista(l.id)?.archived).toBe(true);
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.pending).toContainEqual({ kind: "list", id: l.id });
    // archivedAt preenchido no registro persistido.
    expect(raw.lists[0].archivedAt).not.toBeNull();
  });

  it("desarquivar limpa archivedAt (null) e enfileira pending (AC 4)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    r.archiveLista(l.id);
    expect(r.getLista(l.id)?.archived).toBe(true);
    r.unarchiveLista(l.id);
    expect(r.getLista(l.id)?.archived).toBe(false);
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.lists[0].archivedAt).toBeNull();
  });

  it("arquivar bumpa updated_at (propaga cross-device via merge, AC 7)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    const antes = JSON.parse(storage.getItem("lembr8.data")!).lists[0].updatedAt;
    r.archiveLista(l.id);
    const depois = JSON.parse(storage.getItem("lembr8.data")!).lists[0].updatedAt;
    expect(depois > antes).toBe(true);
  });

  it("arquivar id inexistente é no-op", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    expect(() => r.archiveLista("id-fantasma")).not.toThrow();
  });

  it("arquivar já-arquivada é no-op; desarquivar já-ativa é no-op", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    r.archiveLista(l.id);
    const ts1 = r.getLista(l.id)?.archived;
    r.archiveLista(l.id); // no-op
    expect(r.getLista(l.id)?.archived).toBe(ts1);
    r.unarchiveLista(l.id);
    r.unarchiveLista(l.id); // no-op
    expect(r.getLista(l.id)?.archived).toBe(false);
  });
});

describe("listIndex filtra arquivadas; listArchivedIndex lista arquivadas (AC 2, 3, 4, 9)", () => {
  let storage: StorageLike;
  let clock: () => string;

  beforeEach(() => {
    storage = memoryStorage();
    clock = tickClock();
  });

  it("arquivar remove a lista do índice (AC 2)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const a = r.createList("A");
    r.createList("B");
    r.archiveLista(a.id);
    const idx = r.listIndex();
    expect(idx.map((l) => l.nome)).toEqual(["B"]);
    // A não aparece no índice de ativas.
    expect(idx.find((l) => l.id === a.id)).toBeUndefined();
  });

  it("listArchivedIndex lista as arquivadas (AC 3)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const a = r.createList("A");
    r.createList("B");
    r.archiveLista(a.id);
    const arq = r.listArchivedIndex();
    expect(arq.map((l) => l.nome)).toEqual(["A"]);
    // B não aparece nas arquivadas.
    expect(arq.find((l) => l.nome === "B")).toBeUndefined();
  });

  it("desarquivar devolve a lista ao índice (AC 4)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const a = r.createList("A");
    r.createList("B");
    r.archiveLista(a.id);
    r.unarchiveLista(a.id);
    const idx = r.listIndex();
    expect(idx.map((l) => l.nome).sort()).toEqual(["A", "B"]);
    expect(r.listArchivedIndex()).toEqual([]);
  });

  it("listArchivedIndex ordena por updated_at desc", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const a = r.createList("A"); // T0
    const b = r.createList("B"); // T1
    r.archiveLista(a.id); // A arquivada em T2
    r.archiveLista(b.id); // B arquivada em T3 (mais recente)
    // B (T3) antes de A (T2).
    expect(r.listArchivedIndex().map((l) => l.nome)).toEqual(["B", "A"]);
  });

  it("arquivadas não aparecem no índice após reload (AC 9)", () => {
    const storage2 = memoryStorage();
    const clock2 = tickClock();
    const r = createLocalFirstRepository({ storage: storage2, adapter: null, clock: clock2 });
    const a = r.createList("A");
    r.createList("B");
    r.archiveLista(a.id);
    // reabre: nova instância lê do storage.
    const r2 = createLocalFirstRepository({ storage: storage2, adapter: null, clock: clock2 });
    expect(r2.listIndex().map((l) => l.nome)).toEqual(["B"]);
    expect(r2.listArchivedIndex().map((l) => l.nome)).toEqual(["A"]);
  });
});

describe("Interação com fixação (AC 12) — pinned preservado ao arquivar", () => {
  let storage: StorageLike;
  let clock: () => string;

  beforeEach(() => {
    storage = memoryStorage();
    clock = tickClock();
  });

  it("arquivar lista fixada preserva pinned; ao desarquivar volta à seção Fixadas (AC 12)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const a = r.createList("A");
    r.togglePinLista(a.id); // fixa A
    expect(r.listIndex()[0].id).toBe(a.id); // A no topo (Fixadas)
    r.archiveLista(a.id);
    // A some do índice (incl. Fixadas).
    expect(r.listIndex().find((l) => l.id === a.id)).toBeUndefined();
    // mas pinned permanece no registro (preservado).
    const arq = r.listArchivedIndex();
    expect(arq[0].pinned).toBe(true);
    // ao desarquivar, A volta à seção Fixadas (topo).
    r.unarchiveLista(a.id);
    const idx = r.listIndex();
    expect(idx[0].id).toBe(a.id);
    expect(idx[0].pinned).toBe(true);
  });
});

describe("No-regression: arquivar/desarquivar não afeta itens/ordem/fixação (AC 13)", () => {
  it("itens da lista arquivada permanecem intactos", () => {
    const storage = memoryStorage();
    const clock = tickClock();
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    r.addItem(l.id, "arroz");
    r.archiveLista(l.id);
    // itens preservados (a lista existe, só está arquivada).
    const items = r.listItems(l.id);
    expect(items.map((i) => i.texto)).toEqual(["arroz"]);
    r.unarchiveLista(l.id);
    expect(r.listItems(l.id).map((i) => i.texto)).toEqual(["arroz"]);
  });
});

describe("Persistência e offline (AC 6, 8)", () => {
  it("archivedAt persiste entre sessões (AC 6)", () => {
    const storage = memoryStorage();
    const clock = tickClock();
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const a = r.createList("A");
    const b = r.createList("B");
    r.archiveLista(a.id);
    const r2 = createLocalFirstRepository({ storage, adapter: null, clock });
    expect(r2.getLista(a.id)?.archived).toBe(true);
    expect(r2.getLista(b.id)?.archived).toBe(false);
  });

  it("arquivar funciona offline (adapter null) e mantém pending para sync (AC 8)", () => {
    const storage = memoryStorage();
    const clock = tickClock();
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    r.archiveLista(l.id);
    expect(r.getLista(l.id)?.archived).toBe(true);
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.pending).toContainEqual({ kind: "list", id: l.id });
  });
});

describe("Sync cross-device do archived_at via merge por updated_at (AC 7)", () => {
  let cloud: FakeCloudAdapter;
  let clock: () => string;

  beforeEach(() => {
    cloud = new FakeCloudAdapter();
    cloud.setUser("user-a");
    clock = tickClock();
  });

  it("arquivar em um device propaga para o outro após sync (AC 7)", async () => {
    const ra = createLocalFirstRepository({
      storage: memoryStorage(),
      adapter: cloud,
      userId: "user-a",
      clock,
    });
    const l = ra.createList("Mercado");
    ra.archiveLista(l.id);
    await ra.sync();
    expect((await cloud.pull()).lists[0].archived_at).not.toBeNull();

    const rb = createLocalFirstRepository({
      storage: memoryStorage(),
      adapter: cloud,
      userId: "user-a",
      clock: tickClock(100),
    });
    await rb.sync();
    expect(rb.getLista(l.id)?.archived).toBe(true);
  });

  it("merge: cloud mais recente (arquivada) vence o local ativo", () => {
    const outCloudWin = mergeCache(
      {
        lists: [{ id: "l1", nome: "L", pinned: false, archivedAt: null, createdAt: T0, updatedAt: T0 }],
        items: [],
        pending: [],
      },
      {
        lists: [{ id: "l1", nome: "L", pinned: false, archived_at: T2, created_at: T0, updated_at: T2 }],
        items: [],
      },
    );
    expect(outCloudWin.lists[0].archivedAt).not.toBeNull();
  });

  it("merge: local mais recente (arquivada) vence e permanece pending", () => {
    const outLocalWin = mergeCache(
      {
        lists: [{ id: "l1", nome: "L", pinned: false, archivedAt: T2, createdAt: T0, updatedAt: T2 }],
        items: [],
        pending: [],
      },
      {
        lists: [{ id: "l1", nome: "L", pinned: false, archived_at: null, created_at: T0, updated_at: T1 }],
        items: [],
      },
    );
    expect(outLocalWin.lists[0].archivedAt).not.toBeNull();
    expect(outLocalWin.pending).toContainEqual({ kind: "list", id: "l1" });
  });

  it("lista só no cloud é importada com seu archived_at", () => {
    const cloudList: ListRecord = {
      id: "l1",
      nome: "Cloud",
      pinned: false,
      archived_at: T2,
      created_at: T0,
      updated_at: T0,
    };
    const out = mergeCache(
      { lists: [], items: [], pending: [] },
      { lists: [cloudList], items: [] },
    );
    expect(out.lists[0].archivedAt).not.toBeNull();
  });
});

describe("Migração v5 → v6: archivedAt aditivo default null (AC 10)", () => {
  it("adiciona archivedAt=null a cada lista, preservando o resto", () => {
    const v5: CacheStateV5 = {
      version: 5,
      userId: "user-a",
      lists: [
        { id: "l1", nome: "Lista 1", pinned: true, createdAt: T0, updatedAt: T1 },
        { id: "l2", nome: "Compras", pinned: false, createdAt: T0, updatedAt: T2 },
      ],
      items: [],
      pending: [{ kind: "list", id: "l1" }],
      migrated: true,
      lastSyncAt: T0,
      deletedIds: { lists: [], items: [] },
    };
    const v6 = migrateV5toV6(v5);
    expect(v6.version).toBe(6);
    expect(v6.lists.every((l) => l.archivedAt === null)).toBe(true);
    // preserva identidade e demais campos (incl. pinned).
    expect(v6.lists.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(v6.lists[0].pinned).toBe(true);
    expect(v6.pending).toEqual([{ kind: "list", id: "l1" }]);
    expect(v6.deletedIds).toEqual({ lists: [], items: [] });
  });

  it("cache v5 legado é migrado para v6 ao carregar, sem arquivar listas (AC 10)", () => {
    const storage = memoryStorage();
    storage.setItem(
      "lembr8.data",
      JSON.stringify({
        version: 5,
        userId: "user-a",
        lists: [
          { id: "l1", nome: "Lista 1", pinned: true, createdAt: T0, updatedAt: T1 },
          { id: "l2", nome: "Compras", pinned: false, createdAt: T0, updatedAt: T2 },
        ],
        items: [],
        pending: [],
        migrated: true,
        lastSyncAt: null,
        deletedIds: { lists: [], items: [] },
      }),
    );
    const r = createLocalFirstRepository({
      storage,
      adapter: null,
      userId: "user-a",
      clock: tickClock(),
    });
    expect(r.listIndex().every((l) => l.pinned !== undefined)).toBe(true);
    // nenhuma lista arquivada após o upgrade.
    expect(r.listArchivedIndex()).toEqual([]);
    // uma mutação persiste o v6 no disco.
    r.renameList("l1", "Lista 1");
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.version).toBe(6);
    expect(raw.lists.every((l: { archivedAt: string | null }) => l.archivedAt === null)).toBe(true);
  });
});