import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AddOutcome,
  Item,
  Lista,
  ListaDetalhe,
  ListasRepository,
} from "@/lib/todos/types";

/**
 * Store — mutation listeners (LB-7, AC 1): `subscribeToMutations` dispara em
 * create/rename/add/toggle, mas NÃO em `sync()`/`resetForUser()` (evita loop
 * sync→notify→trigger). O repositório é mockado (in-memory, adapter null) para
 * determinismo: o teste cobre a sinalização store→controller, não o sync.
 */

// Repo em memória, sem cloud. `sync`/`resetForUser` são no-ops espiados.
function fakeRepo(): ListasRepository {
  let lists: ListaDetalhe[] = [];
  let items: Item[] = [];
  return {
    listListas: () => [...lists],
    listIndex: () =>
      lists.map((l) => ({
        id: l.id,
        nome: l.nome,
        pinned: l.pinned,
        aFazer: items.filter((i) => i.listId === l.id && !i.concluido).length,
      })),
    getLista: (id) => lists.find((l) => l.id === id) ?? null,
    listItems: (listId) => items.filter((i) => i.listId === listId),
    listItemSuggestions: () => [],
    createList: (nome) => {
      const l: ListaDetalhe = { id: crypto.randomUUID(), nome, pinned: false, archived: false };
      lists = [...lists, l];
      return l;
    },
    renameList: (id, nome) => {
      lists = lists.map((l) => (l.id === id ? { ...l, nome } : l));
    },
    togglePinLista: (id) => {
      lists = lists.map((l) => (l.id === id ? { ...l, pinned: !l.pinned } : l));
    },
    listArchivedIndex: () =>
      lists
        .filter((l) => l.archived)
        .map((l) => ({
          id: l.id,
          nome: l.nome,
          pinned: l.pinned,
          aFazer: items.filter((i) => i.listId === l.id && !i.concluido).length,
        })),
    archiveLista: (id) => {
      lists = lists.map((l) => (l.id === id ? { ...l, archived: true } : l));
    },
    unarchiveLista: (id) => {
      lists = lists.map((l) => (l.id === id ? { ...l, archived: false } : l));
    },
    addItem: (listId, texto) => {
      const it: Item = {
        id: crypto.randomUUID(),
        listId,
        texto,
        concluido: false,
      };
      items = [...items, it];
      return { kind: "created", item: it } as AddOutcome;
    },
    toggleItem: (id) => {
      items = items.map((i) =>
        i.id === id ? { ...i, concluido: !i.concluido } : i,
      );
    },
    deleteItem: (id) => {
      items = items.filter((i) => i.id !== id);
    },
    deleteLista: (id) => {
      lists = lists.filter((l) => l.id !== id);
      items = items.filter((i) => i.listId !== id);
    },
    sync: vi.fn(async () => ({ pushed: 0, pulled: 0 })),
    resetForUser: vi.fn(),
  };
}

vi.mock("@/lib/todos/repository", () => ({
  createLocalFirstRepository: () => fakeRepo(),
  nextListaName: (listas: Lista[]) => {
    const nums = listas
      .map((l) => l.nome.match(/^Lista (\d+)$/)?.[1])
      .filter(Boolean)
      .map(Number);
    const n = nums.length ? Math.max(...nums) + 1 : 1;
    return `Lista ${n}`;
  },
}));

// Importado APÓS o vi.mock para que a store use o repositório mockado.
import {
  __resetListasStoreForTests,
  addItemToLista,
  createList,
  renameList,
  resetForUser,
  subscribeToMutations,
  sync,
  toggleItem,
  togglePinLista,
} from "@/lib/todos/store";

beforeEach(() => {
  __resetListasStoreForTests();
});

describe("subscribeToMutations — dispara em mutações (AC 1)", () => {
  it("createList notifica o listener", () => {
    let calls = 0;
    subscribeToMutations(() => calls++);
    createList();
    expect(calls).toBe(1);
  });

  it("renameList notifica o listener", () => {
    let calls = 0;
    subscribeToMutations(() => calls++);
    const l = createList();
    calls = 0;
    renameList(l.id, "Mercado");
    expect(calls).toBe(1);
  });

  it("addItemToLista notifica o listener", () => {
    let calls = 0;
    subscribeToMutations(() => calls++);
    const l = createList();
    calls = 0;
    addItemToLista(l.id, "arroz");
    expect(calls).toBe(1);
  });

  it("toggleItem notifica o listener", () => {
    let calls = 0;
    subscribeToMutations(() => calls++);
    const l = createList();
    const { item } = addItemToLista(l.id, "arroz") as {
      kind: string;
      item: Item;
    };
    calls = 0;
    toggleItem(item.id);
    expect(calls).toBe(1);
  });

  it("togglePinLista notifica o listener (LB-14 — mutação dispara sync)", () => {
    let calls = 0;
    subscribeToMutations(() => calls++);
    const l = createList();
    calls = 0;
    togglePinLista(l.id);
    expect(calls).toBe(1);
  });
});

describe("subscribeToMutations — NÃO dispara em sync/reset (evita loop)", () => {
  it("sync() não notifica mutation listeners", async () => {
    let calls = 0;
    subscribeToMutations(() => calls++);
    await sync();
    expect(calls).toBe(0);
  });

  it("resetForUser() não notifica mutation listeners", () => {
    let calls = 0;
    subscribeToMutations(() => calls++);
    resetForUser("user-a");
    expect(calls).toBe(0);
  });
});

describe("subscribeToMutations — lifecycle", () => {
  it("dessubinscrição para as notificações", () => {
    let calls = 0;
    const unsub = subscribeToMutations(() => calls++);
    createList();
    expect(calls).toBe(1);
    unsub();
    createList();
    expect(calls).toBe(1); // não recebe mais
  });

  it("__resetListasStoreForTests limpa os mutation listeners", () => {
    let calls = 0;
    subscribeToMutations(() => calls++);
    __resetListasStoreForTests();
    createList();
    expect(calls).toBe(0); // listener descartado
  });

  it("múltiplos listeners são todos notificados", () => {
    let a = 0;
    let b = 0;
    subscribeToMutations(() => a++);
    subscribeToMutations(() => b++);
    createList();
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});