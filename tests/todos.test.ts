import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addItemToLista,
  createLocalStorageRepository,
  migrateFromLegacy,
  nextListaName,
  toggleItemLista,
  type StorageLike,
} from "@/lib/todos/repository";
import { homeGate } from "@/lib/todos/gate";
import type { Item, Lista } from "@/lib/todos/types";

/** Storage em memória para injetar no repositório (node não tem localStorage). */
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

/** Cria itens a-fazer para uma lista a partir dos textos (ordem de inserção). */
function aFazer(listId: string, ...textos: string[]): Item[] {
  return textos.map((texto) => ({
    id: crypto.randomUUID(),
    listId,
    texto,
    concluido: false,
  }));
}

const LISTA = "lista-1";

describe("nextListaName — auto-incremento (CA 3)", () => {
  it("sem listas → 'Lista 1'", () => {
    expect(nextListaName([])).toBe("Lista 1");
  });

  it("com 'Lista 1' e 'Lista 2' → 'Lista 3'", () => {
    const listas: Lista[] = [
      { id: "1", nome: "Lista 1" },
      { id: "2", nome: "Lista 2" },
    ];
    expect(nextListaName(listas)).toBe("Lista 3");
  });

  it("renomeou 'Lista 1' → 'Compras'; existe 'Lista 2' → 'Lista 3'", () => {
    const listas: Lista[] = [
      { id: "1", nome: "Compras" },
      { id: "2", nome: "Lista 2" },
    ];
    expect(nextListaName(listas)).toBe("Lista 3");
  });

  it("buraco na numeração pega o maior + 1, não preenche", () => {
    const listas: Lista[] = [{ id: "1", nome: "Lista 5" }];
    expect(nextListaName(listas)).toBe("Lista 6");
  });

  it("ignora nomes que não casam ^Lista \\d+$", () => {
    const listas: Lista[] = [
      { id: "1", nome: "Lista 1" },
      { id: "2", nome: "Minha lista" },
    ];
    expect(nextListaName(listas)).toBe("Lista 2");
  });
});

describe("addItemToLista — reutilização/duplicado (CA 5, 6)", () => {
  it("texto novo cria a-fazer ao fim da seção a-fazer", () => {
    const before = aFazer(LISTA, "arroz", "feijão");
    const { items, outcome } = addItemToLista(before, LISTA, "pães");
    expect(outcome.kind).toBe("created");
    if (outcome.kind !== "created") return;
    expect(outcome.item.texto).toBe("pães");
    expect(outcome.item.concluido).toBe(false);
    expect(items.filter((i) => i.listId === LISTA).map((i) => i.texto)).toEqual([
      "arroz",
      "feijão",
      "pães",
    ]);
  });

  it("duplicado ativo não cria e devolve o id existente (CA 6)", () => {
    const before = aFazer(LISTA, "arroz", "feijão");
    const { items, outcome } = addItemToLista(before, LISTA, "feijão");
    expect(outcome.kind).toBe("duplicate");
    if (outcome.kind !== "duplicate") return;
    expect(outcome.existingId).toBe(before[1].id);
    expect(items).toBe(before); // mesma referência: nada mudou
  });

  it("match case-insensitive após trim: '  Arroz  ' duplica 'arroz'", () => {
    const before = aFazer(LISTA, "arroz");
    const { outcome } = addItemToLista(before, LISTA, "  Arroz  ");
    expect(outcome.kind).toBe("duplicate");
  });

  it("reativa concluído (desmarca, move ao fim dos a-fazer) sem duplicata (CA 5)", () => {
    const ativos = aFazer(LISTA, "arroz");
    const concluido: Item = {
      id: crypto.randomUUID(),
      listId: LISTA,
      texto: "feijão",
      concluido: true,
    };
    const before = [...ativos, concluido];
    const { items, outcome } = addItemToLista(before, LISTA, "feijão");
    expect(outcome.kind).toBe("reactivated");
    if (outcome.kind !== "reactivated") return;
    expect(outcome.item.concluido).toBe(false);
    const daLista = items.filter((i) => i.listId === LISTA);
    expect(daLista).toHaveLength(2); // sem duplicata
    expect(daLista.map((i) => i.texto)).toEqual(["arroz", "feijão"]);
    expect(daLista.every((i) => !i.concluido)).toBe(true); // todos a-fazer
  });

  it("reativação preserva o texto original (capitalização)", () => {
    const concluido: Item = {
      id: crypto.randomUUID(),
      listId: LISTA,
      texto: "Feijão",
      concluido: true,
    };
    const { outcome } = addItemToLista([concluido], LISTA, "feijão".toUpperCase());
    expect(outcome.kind).toBe("reactivated");
    if (outcome.kind !== "reactivated") return;
    expect(outcome.item.texto).toBe("Feijão");
  });

  it("precedência: duplicado ativo vence concluído com mesmo texto", () => {
    const ativo: Item = {
      id: crypto.randomUUID(),
      listId: LISTA,
      texto: "leite",
      concluido: false,
    };
    const concluido: Item = {
      id: crypto.randomUUID(),
      listId: LISTA,
      texto: "leite",
      concluido: true,
    };
    const { outcome } = addItemToLista([ativo, concluido], LISTA, "leite");
    expect(outcome.kind).toBe("duplicate");
  });

  it("texto vazio/whitespace é no-op", () => {
    const before = aFazer(LISTA, "arroz");
    const { items, outcome } = addItemToLista(before, LISTA, "   ");
    expect(items).toBe(before);
    expect(outcome.kind).toBe("duplicate");
  });
});

describe("toggleItemLista — mover entre seções (CA 6)", () => {
  it("marcar a-fazer → concluído move ao fim da seção concluídos", () => {
    const items = aFazer(LISTA, "a", "b");
    const next = toggleItemLista(items, items[0].id); // marca "a"
    const daLista = next.filter((i) => i.listId === LISTA);
    expect(daLista.map((i) => [i.texto, i.concluido])).toEqual([
      ["b", false],
      ["a", true],
    ]);
  });

  it("concluídos ficam em ordem de conclusão (mais recente no fim)", () => {
    let items = aFazer(LISTA, "a", "b");
    const a = items[0].id;
    const b = items[1].id;
    items = toggleItemLista(items, a); // conclui "a"
    items = toggleItemLista(items, b); // conclui "b"
    const daLista = items.filter((i) => i.listId === LISTA);
    expect(daLista.map((i) => [i.texto, i.concluido])).toEqual([
      ["a", true],
      ["b", true],
    ]);
  });

  it("desmarcar concluído → a-fazer move ao fim da seção a-fazer", () => {
    let items = aFazer(LISTA, "a", "b");
    const a = items[0].id;
    items = toggleItemLista(items, a); // "a" concluído
    items = toggleItemLista(items, a); // reativa "a"
    const daLista = items.filter((i) => i.listId === LISTA);
    expect(daLista.map((i) => [i.texto, i.concluido])).toEqual([
      ["b", false],
      ["a", false],
    ]);
  });

  it("no-op quando o id não existe", () => {
    const items = aFazer(LISTA, "a");
    expect(toggleItemLista(items, "id-inexistente")).toBe(items);
  });

  it("não muta a lista de entrada", () => {
    const items = aFazer(LISTA, "a");
    const snapshot = [...items];
    toggleItemLista(items, items[0].id);
    expect(items).toEqual(snapshot);
  });
});

describe("migrateFromLegacy — migração do MVP (CA 8)", () => {
  it("cria 'Lista 1' com os itens, a-fazer ++ concluídos, ordem preservada", () => {
    const legacy = [
      { id: "x1", texto: "arroz", concluido: false },
      { id: "x2", texto: "feijão", concluido: true },
      { id: "x3", texto: "pães", concluido: false },
      { id: "x4", texto: "leite", concluido: true },
    ];
    const state = migrateFromLegacy(legacy);
    expect(state.lists).toHaveLength(1);
    expect(state.lists[0].nome).toBe("Lista 1");
    const listaId = state.lists[0].id;
    expect(state.items.map((i) => i.listId)).toEqual(Array(4).fill(listaId));
    // a-fazer preserva ordem original (arroz, pães); concluídos (feijão, leite) sem inversão
    expect(state.items.map((i) => [i.texto, i.concluido])).toEqual([
      ["arroz", false],
      ["pães", false],
      ["feijão", true],
      ["leite", true],
    ]);
  });

  it("mantém os ids originais dos itens", () => {
    const legacy = [{ id: "abc", texto: "arroz", concluido: false }];
    const state = migrateFromLegacy(legacy);
    expect(state.items[0].id).toBe("abc");
  });

  it("lista vazia gera 'Lista 1' sem itens", () => {
    const state = migrateFromLegacy([]);
    expect(state.lists[0].nome).toBe("Lista 1");
    expect(state.items).toEqual([]);
  });
});

describe("createLocalStorageRepository — persistência (CA 2, 7)", () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("usuário novo começa com índice vazio (sem storage antigo)", () => {
    const repo = createLocalStorageRepository(storage);
    expect(repo.listListas()).toEqual([]);
    expect(repo.listIndex()).toEqual([]);
    expect(storage.getItem("lembr8.data")).toBeNull();
  });

  it("createList cria 'Lista N' e aparece no índice (CA 2, 3)", () => {
    const repo = createLocalStorageRepository(storage);
    const l1 = repo.createList(nextListaName(repo.listListas()));
    const l2 = repo.createList(nextListaName(repo.listListas()));
    expect(l1.nome).toBe("Lista 1");
    expect(l2.nome).toBe("Lista 2");
    expect(repo.listIndex().map((l) => l.nome)).toEqual(["Lista 1", "Lista 2"]);
  });

  it("createList persiste no storage", () => {
    const repo = createLocalStorageRepository(storage);
    repo.createList("Compras");
    const raw = JSON.parse(storage.getItem("lembr8.data")!);
    expect(raw.lists[0].nome).toBe("Compras");
  });

  it("renameList altera o nome e persiste (CA 7)", () => {
    const repo = createLocalStorageRepository(storage);
    const l = repo.createList("Lista 1");
    repo.renameList(l.id, "Mercado");
    expect(repo.getLista(l.id)?.nome).toBe("Mercado");
    expect(JSON.parse(storage.getItem("lembr8.data")!).lists[0].nome).toBe(
      "Mercado",
    );
  });

  it("renameList com nome vazio é no-op", () => {
    const repo = createLocalStorageRepository(storage);
    const l = repo.createList("Lista 1");
    repo.renameList(l.id, "   ");
    expect(repo.getLista(l.id)?.nome).toBe("Lista 1");
  });

  it("addItem created persiste e aparece como a-fazer (CA 5)", () => {
    const repo = createLocalStorageRepository(storage);
    const l = repo.createList("Lista 1");
    const outcome = repo.addItem(l.id, "arroz");
    expect(outcome.kind).toBe("created");
    expect(repo.listItems(l.id).map((i) => i.texto)).toEqual(["arroz"]);
  });

  it("addItem duplicate não cria e persiste inalterado (CA 6)", () => {
    const repo = createLocalStorageRepository(storage);
    const l = repo.createList("Lista 1");
    repo.addItem(l.id, "arroz");
    const outcome = repo.addItem(l.id, "arroz");
    expect(outcome.kind).toBe("duplicate");
    expect(repo.listItems(l.id)).toHaveLength(1);
  });

  it("addItem reactivated desmarca concluído e persiste (CA 5)", () => {
    const repo = createLocalStorageRepository(storage);
    const l = repo.createList("Lista 1");
    repo.addItem(l.id, "arroz");
    const arroz = repo.listItems(l.id)[0];
    repo.toggleItem(arroz.id); // conclui
    expect(repo.listItems(l.id)[0].concluido).toBe(true);

    const outcome = repo.addItem(l.id, "arroz");
    expect(outcome.kind).toBe("reactivated");
    expect(repo.listItems(l.id)).toHaveLength(1); // sem duplicata
    expect(repo.listItems(l.id)[0].concluido).toBe(false);
  });

  it("toggleItem move entre seções e persiste (CA 6)", () => {
    const repo = createLocalStorageRepository(storage);
    const l = repo.createList("Lista 1");
    repo.addItem(l.id, "arroz");
    const arroz = repo.listItems(l.id)[0];
    repo.toggleItem(arroz.id);
    expect(repo.listItems(l.id)[0].concluido).toBe(true);
    expect(
      JSON.parse(storage.getItem("lembr8.data")!).items[0].concluido,
    ).toBe(true);
  });

  it("contagem a-fazer no índice reflete itens", () => {
    const repo = createLocalStorageRepository(storage);
    const l = repo.createList("Lista 1");
    repo.addItem(l.id, "arroz");
    repo.addItem(l.id, "feijão");
    const feijao = repo.listItems(l.id).find((i) => i.texto === "feijão")!;
    repo.toggleItem(feijao.id); // feijão concluído
    expect(repo.listIndex()[0].aFazer).toBe(1);
  });

  it("sobrevive a fechar e reabrir: nova instância lê do storage (CA 2)", () => {
    const repoA = createLocalStorageRepository(storage);
    const l = repoA.createList("Lista 1");
    repoA.addItem(l.id, "arroz");
    repoA.addItem(l.id, "feijão");
    const arroz = repoA.listItems(l.id).find((i) => i.texto === "arroz")!;
    repoA.toggleItem(arroz.id);

    const repoB = createLocalStorageRepository(storage);
    expect(repoB.listIndex().map((x) => x.nome)).toEqual(["Lista 1"]);
    const items = repoB.listItems(l.id);
    expect(items.map((i) => [i.texto, i.concluido])).toEqual([
      ["feijão", false],
      ["arroz", true],
    ]);
  });

  it("migra storage do MVP uma vez para 'Lista 1' (CA 8)", () => {
    storage.setItem(
      "lembr8.todos",
      JSON.stringify([
        { id: "x1", texto: "arroz", concluido: false },
        { id: "x2", texto: "leite", concluido: true },
      ]),
    );
    const repo = createLocalStorageRepository(storage);
    expect(repo.listIndex().map((l) => l.nome)).toEqual(["Lista 1"]);
    const listaId = repo.listListas()[0].id;
    expect(repo.listItems(listaId).map((i) => [i.texto, i.concluido])).toEqual([
      ["arroz", false],
      ["leite", true],
    ]);
    // novo formato gravado, antigo removido (não re-migra)
    expect(storage.getItem("lembr8.data")).not.toBeNull();
    expect(storage.getItem("lembr8.todos")).toBeNull();
  });

  it("não re-migra: segunda instância respeita o novo formato", () => {
    storage.setItem(
      "lembr8.todos",
      JSON.stringify([{ id: "x1", texto: "arroz", concluido: false }]),
    );
    const repoA = createLocalStorageRepository(storage);
    const idA = repoA.listListas()[0].id;
    // remove a lista criada pela migração — índice fica vazio, mas não re-migra
    storage.setItem(
      "lembr8.data",
      JSON.stringify({ version: 2, lists: [], items: [] }),
    );
    const repoB = createLocalStorageRepository(storage);
    expect(repoB.listListas()).toEqual([]);
    expect(repoB.getLista(idA)).toBeNull();
  });

  it("ignora payload corrompido no storage", () => {
    storage.setItem("lembr8.data", "não é json");
    const repo = createLocalStorageRepository(storage);
    expect(repo.listListas()).toEqual([]);
  });
});

describe("homeGate — redirecionamento (CA 1)", () => {
  it("usuário sem sessão redireciona ao login", () => {
    expect(homeGate(null)).toBe("redirect-login");
  });

  it("usuário autenticado vê o índice", () => {
    expect(homeGate({ id: "user-1" })).toBe("show-list");
  });
});

describe("Isolamento da camada de dados (CA 11)", () => {
  /** Remove comentários (// e /* *​/) para casar só código, não prosa. */
  function codeOnly(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\/[^\n]*/g, "");
  }

  const indexCode = codeOnly(
    readFileSync(resolve("src/components/listas/ListasIndex.tsx"), "utf8"),
  );
  const screenCode = codeOnly(
    readFileSync(resolve("src/components/listas/ListaScreen.tsx"), "utf8"),
  );
  const storeCode = codeOnly(
    readFileSync(resolve("src/lib/todos/store.ts"), "utf8"),
  );
  const repoCode = codeOnly(
    readFileSync(resolve("src/lib/todos/repository.ts"), "utf8"),
  );

  it("a UI não acessa localStorage nem Supabase diretamente", () => {
    expect(indexCode).not.toMatch(/\blocalStorage\b/);
    expect(screenCode).not.toMatch(/\blocalStorage\b/);
    expect(indexCode).not.toMatch(/supabase/i);
    expect(screenCode).not.toMatch(/supabase/i);
  });

  it("a UI consome apenas a camada única de acesso aos dados (store)", () => {
    expect(indexCode).toMatch(/@\/lib\/todos\/store/);
    expect(screenCode).toMatch(/@\/lib\/todos\/store/);
  });

  it("o storage é tocado apenas pela camada de acesso, não pela UI/store", () => {
    expect(repoCode).toMatch(/\blocalStorage\b/); // o repositório é dono do storage
    expect(storeCode).not.toMatch(/\blocalStorage\b/); // a store consome o repositório
    expect(storeCode).toMatch(/createLocalStorageRepository/);
  });
});