import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addTodo,
  createLocalStorageRepository,
  toggleTodo,
  type StorageLike,
} from "@/lib/todos/repository";
import { homeGate } from "@/lib/todos/gate";
import type { TodoItem } from "@/lib/todos/types";

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
  };
}

describe("addTodo — função pura", () => {
  it("adiciona item ao final com id, texto e concluído=false (CA 3)", () => {
    const items = addTodo([], "arroz");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ texto: "arroz", concluido: false });
    expect(typeof items[0].id).toBe("string");
    expect(items[0].id).toHaveLength(36); // UUID
  });

  it("mantém a ordem de inserção", () => {
    let items: TodoItem[] = [];
    items = addTodo(items, "arroz");
    items = addTodo(items, "feijão");
    items = addTodo(items, "pães");
    expect(items.map((i) => i.texto)).toEqual(["arroz", "feijão", "pães"]);
  });

  it("não adiciona texto vazio/whitespace", () => {
    expect(addTodo([], "")).toEqual([]);
    expect(addTodo([], "   ")).toEqual([]);
    const base = addTodo([], "x");
    expect(addTodo(base, "")).toBe(base); // mesma referência: nada mudou
  });

  it("faz trim do texto", () => {
    const items = addTodo([], "  arroz  ");
    expect(items[0].texto).toBe("arroz");
  });

  it("não muta a lista de entrada", () => {
    const base = addTodo([], "a");
    const snapshot = [...base];
    addTodo(base, "b");
    expect(base).toEqual(snapshot);
  });
});

describe("toggleTodo — função pura", () => {
  it("alterna concluído do item com o id (CA 4)", () => {
    const items = addTodo(addTodo([], "a"), "b");
    const toggled = toggleTodo(items, items[0].id);
    expect(toggled[0].concluido).toBe(true);
    expect(toggled[1].concluido).toBe(false);
    // alterna de volta
    expect(toggleTodo(toggled, items[0].id)[0].concluido).toBe(false);
  });

  it("no-op quando o id não existe", () => {
    const items = addTodo([], "a");
    expect(toggleTodo(items, "id-inexistente")).toEqual(items);
  });

  it("não muta a lista de entrada", () => {
    const items = addTodo([], "a");
    const snapshot = [...items];
    toggleTodo(items, items[0].id);
    expect(items).toEqual(snapshot);
  });
});

describe("createLocalStorageRepository — persistência (CA 5)", () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("lista vazia quando não há dados", () => {
    const repo = createLocalStorageRepository(storage);
    expect(repo.list()).toEqual([]);
  });

  it("add persiste e retorna o item adicionado (CA 3)", () => {
    const repo = createLocalStorageRepository(storage);
    const added = repo.add("arroz");
    expect(added?.texto).toBe("arroz");
    expect(repo.list().map((i) => i.texto)).toEqual(["arroz"]);
    // grava no storage subjacente
    expect(JSON.parse(storage.getItem("lembr8.todos")!)[0].texto).toBe("arroz");
  });

  it("add de texto vazio não persiste nada e retorna null", () => {
    const repo = createLocalStorageRepository(storage);
    expect(repo.add("   ")).toBeNull();
    expect(repo.list()).toEqual([]);
    expect(storage.getItem("lembr8.todos")).toBeNull();
  });

  it("toggle persiste no ato (CA 4)", () => {
    const repo = createLocalStorageRepository(storage);
    const added = repo.add("arroz")!;
    repo.toggle(added.id);
    expect(repo.list()[0].concluido).toBe(true);
    expect(JSON.parse(storage.getItem("lembr8.todos")!)[0].concluido).toBe(true);
  });

  it("sobrevive a fechar e reabrir: nova instância lê do storage (CA 5)", () => {
    const repoA = createLocalStorageRepository(storage);
    const arroz = repoA.add("arroz")!;
    const feijao = repoA.add("feijão")!;
    repoA.toggle(arroz.id); // arroz concluído, feijão a fazer

    // "reabrir": novo repositório lê do mesmo storage (cache zerado).
    const repoB = createLocalStorageRepository(storage);
    const restored = repoB.list();
    expect(restored.map((i) => i.texto)).toEqual(["arroz", "feijão"]);
    expect(restored.map((i) => i.concluido)).toEqual([true, false]);
    expect(feijao.id).toBe(restored[1].id);
  });

  it("ignora payload corrompido/incompleto no storage", () => {
    storage.setItem("lembr8.todos", "não é json");
    expect(createLocalStorageRepository(storage).list()).toEqual([]);
    storage.setItem(
      "lembr8.todos",
      JSON.stringify([{ id: 1, texto: "x" }]), // sem concluído
    );
    expect(createLocalStorageRepository(storage).list()).toEqual([]);
  });
});

describe("homeGate — redirecionamento (CA 1)", () => {
  it("usuário sem sessão redireciona ao login", () => {
    expect(homeGate(null)).toBe("redirect-login");
  });

  it("usuário autenticado vê a lista", () => {
    expect(homeGate({ id: "user-1" })).toBe("show-list");
  });
});

describe("Isolamento da camada de dados (CA 6)", () => {
  /** Remove comentários (// e /* *​/) para casar só código, não prosa. */
  function codeOnly(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\/[^\n]*/g, "");
  }

  const uiCode = codeOnly(
    readFileSync(resolve("src/components/todos/TodoList.tsx"), "utf8"),
  );
  const storeCode = codeOnly(
    readFileSync(resolve("src/lib/todos/store.ts"), "utf8"),
  );
  const repoCode = codeOnly(
    readFileSync(resolve("src/lib/todos/repository.ts"), "utf8"),
  );

  it("a UI não acessa localStorage nem Supabase diretamente", () => {
    // `\blocalStorage\b` casa só a global isolada — não o nome da factory da
    // camada (`createLocalStorageRepository`), que não aparece como palavra na UI.
    expect(uiCode).not.toMatch(/\blocalStorage\b/);
    expect(uiCode).not.toMatch(/supabase/i);
  });

  it("a UI consome apenas a camada única de acesso aos dados", () => {
    expect(uiCode).toMatch(/@\/lib\/todos\/store/);
  });

  it("o storage é tocado apenas pela camada de acesso, não pela UI", () => {
    expect(repoCode).toMatch(/\blocalStorage\b/); // o repositório é dono do storage
    // a store consome o repositório; a UI, a store — nenhuma toca storage direto
    expect(storeCode).toMatch(/createLocalStorageRepository/);
  });
});