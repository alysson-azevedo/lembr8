import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalFirstRepository,
  mergeCache,
  migrateV4toV5,
  type CacheStateV4,
  type StorageLike,
} from "@/lib/todos/repository";
import { FakeCloudAdapter } from "@/lib/todos/cloud-adapter";
import type { ListRecord } from "@/lib/todos/cloud-adapter";

/**
 * Lógica de fixar/desfixar listas (LB-14) — node, sem DOM/Supabase. Testa o
 * toggle (`togglePinLista`), a ordenação do índice (Fixadas → Demais por
 * `updated_at` desc, AC 5/6/7), o default `pinned=false` (AC 12), a persistência
 * (AC 10), o fluxo offline (AC 9), a propagação cross-device via merge (AC 11) e
 * o reposicionamento por mutação (AC 8).
 */

/** Storage em memória (node não tem localStorage). */
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

/** Relógio determinístico (ticks incrementais) para timestamps estáveis. */
function tickClock(start = 0): () => string {
  let t = start;
  return () => new Date(t++ * 1000).toISOString();
}

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-02T00:00:00.000Z";
const T2 = "2026-01-03T00:00:00.000Z";

describe("togglePinLista — toggle não destrutivo (AC 3, 4)", () => {
  let storage: StorageLike;
  let clock: () => string;

  beforeEach(() => {
    storage = memoryStorage();
    clock = tickClock();
  });

  it("lista nova nasce não-fixada (pinned=false, AC 12)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    expect(r.getLista(l.id)?.pinned).toBe(false);
    expect(r.listIndex()[0].pinned).toBe(false);
  });

  it("fixar seta pinned=true e enfileira pending {kind:list}", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    r.togglePinLista(l.id);
    expect(r.getLista(l.id)?.pinned).toBe(true);
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.pending).toContainEqual({ kind: "list", id: l.id });
  });

  it("desfixar volta pinned=false (toggle, reversível, AC 2/3)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    r.togglePinLista(l.id); // fixa
    r.togglePinLista(l.id); // desfixa
    expect(r.getLista(l.id)?.pinned).toBe(false);
  });

  it("fixar bumpa updated_at (propaga cross-device via merge, AC 11)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    const antes = JSON.parse(storage.getItem("lembr8.data")!).lists[0].updatedAt;
    // avança o relógio: a próxima mutação pega um timestamp maior.
    r.togglePinLista(l.id);
    const depois = JSON.parse(storage.getItem("lembr8.data")!).lists[0].updatedAt;
    expect(depois > antes).toBe(true);
    // o novo updated_at vira pending da lista para o push propagar.
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.pending).toContainEqual({ kind: "list", id: l.id });
  });

  it("toggle de id inexistente é no-op", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    expect(() => r.togglePinLista("id-fantasma")).not.toThrow();
  });
});

describe("listIndex — seções Fixadas → Demais por updated_at desc (AC 5, 6, 7)", () => {
  let storage: StorageLike;
  let clock: () => string;

  beforeEach(() => {
    storage = memoryStorage();
    clock = tickClock();
  });

  it("fixadas aparecem sempre antes das não-fixadas (AC 5)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const antiga = r.createList("Antiga"); // updatedAt T0
    r.createList("Nova"); // updatedAt T1 (mais recente)
    // fixa a ANTIGA: mesmo sendo mais velha, vai ao topo por ser fixada.
    r.togglePinLista(antiga.id);

    const idx = r.listIndex();
    expect(idx.map((l) => l.nome)).toEqual(["Antiga", "Nova"]);
    expect(idx[0].pinned).toBe(true);
    expect(idx[1].pinned).toBe(false);
  });

  it("dentro de Fixadas, ordenação por updated_at desc (AC 6)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const a = r.createList("A"); // T0
    const b = r.createList("B"); // T1
    const c = r.createList("C"); // T2
    r.togglePinLista(a.id);
    r.togglePinLista(b.id);
    r.togglePinLista(c.id);
    // todas fixadas: por modificação desc → C, B, A (toggle bumpa updatedAt,
    // mas a ordem por updated_at desc dentro da seção é o contrato).
    const fixadas = r.listIndex().filter((l) => l.pinned);
    expect(fixadas.map((l) => l.nome)).toEqual(["C", "B", "A"]);
  });

  it("dentro de Demais, ordenação por updated_at desc (AC 7)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    r.createList("A"); // T0
    r.createList("B"); // T1
    r.createList("C"); // T2
    // nenhuma fixada: índice flat por modificação desc.
    expect(r.listIndex().map((l) => l.nome)).toEqual(["C", "B", "A"]);
  });

  it("empate de updated_at desempata por createdAt desc, depois id desc", () => {
    // Três listas com o MESMO updatedAt, createdAt distintos → createdAt desc.
    const base = tickClock();
    const storageEq = memoryStorage();
    const r = createLocalFirstRepository({ storage: storageEq, adapter: null, clock: base });
    r.createList("A"); // createdAt/updatedAt T0
    r.createList("B"); // createdAt/updatedAt T1
    // Força o mesmo updatedAt em ambas via storage direto (empate).
    const raw = JSON.parse(storageEq.getItem("lembr8.data")!);
    raw.lists = raw.lists.map((l: { id: string; updatedAt: string }) => ({
      ...l,
      updatedAt: T2,
    }));
    storageEq.setItem("lembr8.data", JSON.stringify(raw));
    // Recria para reler o storage alterado.
    const r2 = createLocalFirstRepository({ storage: storageEq, adapter: null, clock: base });
    const idx = r2.listIndex();
    // createdAt desc: B (T1) antes de A (T0).
    expect(idx.map((l) => l.nome)).toEqual(["B", "A"]);
  });

  it("índice entrega pinned por entrada (AC 3 — estado visível)", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const a = r.createList("A");
    const b = r.createList("B");
    r.togglePinLista(a.id);
    const idx = r.listIndex();
    const aEntry = idx.find((l) => l.id === a.id)!;
    const bEntry = idx.find((l) => l.id === b.id)!;
    expect(aEntry.pinned).toBe(true);
    expect(bEntry.pinned).toBe(false);
  });
});

describe("Mutação reposiciona por modificação dentro da seção (AC 8)", () => {
  let storage: StorageLike;
  let clock: () => string;

  beforeEach(() => {
    storage = memoryStorage();
    clock = tickClock();
  });

  it("renomear bumpa updated_at e reposiciona na seção Demais", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const a = r.createList("A"); // T0 (mais recente no início)
    r.createList("B"); // T1
    expect(r.listIndex().map((l) => l.nome)).toEqual(["B", "A"]);
    // renomeia A → seu updated_at passa a ser o maior → sobe ao topo.
    r.renameList(a.id, "A2");
    expect(r.listIndex().map((l) => l.nome)).toEqual(["A2", "B"]);
  });

  it("adicionar/marcar item bumpa updated_at da lista e a reposiciona", () => {
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const a = r.createList("A"); // T0
    r.createList("B"); // T1 — topo de Demais
    // adicionar item em A bumpa seu updated_at → A sobe.
    r.addItem(a.id, "arroz");
    expect(r.listIndex().map((l) => l.nome)).toEqual(["A", "B"]);
    // marcar o item bumpa de novo; A continua no topo (já é o mais recente).
    const arroz = r.listItems(a.id)[0];
    r.toggleItem(arroz.id);
    expect(r.listIndex()[0].nome).toBe("A");
  });
});

describe("Persistência e offline (AC 9, 10)", () => {
  it("pinned persiste entre sessões (fechar e reabrir, AC 10)", () => {
    const storage = memoryStorage();
    const clock = tickClock();
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const a = r.createList("A");
    const b = r.createList("B");
    r.togglePinLista(a.id);

    // reabre: nova instância lê do storage.
    const r2 = createLocalFirstRepository({ storage, adapter: null, clock });
    expect(r2.getLista(a.id)?.pinned).toBe(true);
    expect(r2.getLista(b.id)?.pinned).toBe(false);
    // a ordenação e a seção persistem.
    const idx = r2.listIndex();
    expect(idx[0].id).toBe(a.id);
    expect(idx[0].pinned).toBe(true);
  });

  it("toggle funciona offline (adapter null) e mantém pending para sync (AC 9)", () => {
    const storage = memoryStorage();
    const clock = tickClock();
    const r = createLocalFirstRepository({ storage, adapter: null, clock });
    const l = r.createList("Mercado");
    r.togglePinLista(l.id);
    // reflete no cache imediatamente.
    expect(r.getLista(l.id)?.pinned).toBe(true);
    // pending permanece para o push ao reconectar.
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.pending).toContainEqual({ kind: "list", id: l.id });
  });
});

describe("Sync cross-device do pinned via merge por updated_at (AC 11)", () => {
  let cloud: FakeCloudAdapter;
  let clock: () => string;

  beforeEach(() => {
    cloud = new FakeCloudAdapter();
    cloud.setUser("user-a");
    clock = tickClock();
  });

  it("fixar em um device propaga para o outro após sync (AC 11)", async () => {
    // device A cria e fixa.
    const ra = createLocalFirstRepository({
      storage: memoryStorage(),
      adapter: cloud,
      userId: "user-a",
      clock,
    });
    const l = ra.createList("Mercado");
    ra.togglePinLista(l.id);
    await ra.sync();
    expect((await cloud.pull()).lists[0].pinned).toBe(true);

    // device B puxa do mesmo cloud.
    const rb = createLocalFirstRepository({
      storage: memoryStorage(),
      adapter: cloud,
      userId: "user-a",
      clock: tickClock(100),
    });
    await rb.sync();
    expect(rb.getLista(l.id)?.pinned).toBe(true);
  });

  it("merge: cloud mais recente vence o pinned local; local mais recente vence e permanece pending", () => {
    // local não-fixada, cloud fixada e MAIS recente → cloud vence.
    const outCloudWin = mergeCache(
      {
        lists: [{ id: "l1", nome: "L", pinned: false, createdAt: T0, updatedAt: T0 }],
        items: [],
        pending: [],
      },
      {
        lists: [{ id: "l1", nome: "L", pinned: true, created_at: T0, updated_at: T2 }],
        items: [],
      },
    );
    expect(outCloudWin.lists[0].pinned).toBe(true);

    // local fixada e MAIS recente que o cloud → local vence e fica pending.
    const outLocalWin = mergeCache(
      {
        lists: [{ id: "l1", nome: "L", pinned: true, createdAt: T0, updatedAt: T2 }],
        items: [],
        pending: [],
      },
      {
        lists: [{ id: "l1", nome: "L", pinned: false, created_at: T0, updated_at: T1 }],
        items: [],
      },
    );
    expect(outLocalWin.lists[0].pinned).toBe(true);
    expect(outLocalWin.pending).toContainEqual({ kind: "list", id: "l1" });
  });

  it("lista só no cloud é importada com seu pinned", () => {
    const cloudList: ListRecord = {
      id: "l1",
      nome: "Cloud",
      pinned: true,
      created_at: T0,
      updated_at: T0,
    };
    const out = mergeCache(
      { lists: [], items: [], pending: [] },
      { lists: [cloudList], items: [] },
    );
    expect(out.lists[0].pinned).toBe(true);
  });
});

describe("Migração v4 → v5: pinned aditivo default false (AC 12)", () => {
  it("adiciona pinned=false a cada lista, preservando o resto", () => {
    const v4: CacheStateV4 = {
      version: 4,
      userId: "user-a",
      lists: [
        { id: "l1", nome: "Lista 1", createdAt: T0, updatedAt: T1 },
        { id: "l2", nome: "Compras", createdAt: T0, updatedAt: T2 },
      ],
      items: [],
      pending: [{ kind: "list", id: "l1" }],
      migrated: true,
      lastSyncAt: T0,
      deletedIds: { lists: [], items: [] },
    };
    const v5 = migrateV4toV5(v4);
    expect(v5.version).toBe(5);
    expect(v5.lists.every((l) => l.pinned === false)).toBe(true);
    // preserva identidade e demais campos.
    expect(v5.lists.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(v5.lists[0].nome).toBe("Lista 1");
    expect(v5.pending).toEqual([{ kind: "list", id: "l1" }]);
    expect(v5.deletedIds).toEqual({ lists: [], items: [] });
  });

  it("cache v4 legado é migrado para v5 ao carregar, sem fixar listas (AC 12)", () => {
    const storage = memoryStorage();
    storage.setItem(
      "lembr8.data",
      JSON.stringify({
        version: 4,
        userId: "user-a",
        lists: [
          { id: "l1", nome: "Lista 1", createdAt: T0, updatedAt: T1 },
          { id: "l2", nome: "Compras", createdAt: T0, updatedAt: T2 },
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
    // nenhuma lista fixada após o upgrade (a migração v4→v5 é lazy em memória).
    expect(r.listIndex().every((l) => l.pinned === false)).toBe(true);
    // uma mutação persiste o v5 no disco.
    r.renameList("l1", "Lista 1");
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.version).toBe(5);
    expect(raw.lists.every((l: { pinned: boolean }) => l.pinned === false)).toBe(true);
  });
});