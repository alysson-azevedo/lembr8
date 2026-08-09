import type {
  AddOutcome,
  Item,
  Lista,
  ListasRepository,
} from "./types";

/**
 * Camada única de acesso aos dados (LB-5): múltiplas listas sobre localStorage.
 *
 * Funções puras de domínio (abaixo) operam sobre arrays sem mutar a entrada e
 * sem tocar storage — testáveis isoladamente em node (sem DOM). O adapter
 * `createLocalStorageRepository` encapsula o storage (adapter injetável, testável
 * em node/jsdom sem `localStorage` real).
 *
 * Formato interno (decisão do DEV): chave única `lembr8.data` com
 * `{ version, lists, items }`. `lists` em ordem de criação; `items` de cada
 * lista em ordem de exibição — a-fazer (inserção) ++ concluídos (conclusão) —
 * então o array de itens já é a ordem de renderização. A migração do MVP
 * (`lembr8.todos`, lista única) roda uma vez quando o novo formato está ausente.
 */

const STORAGE_KEY = "lembr8.data";
const LEGACY_KEY = "lembr8.todos";
const VERSION = 2;

type AppState = { version: number; lists: Lista[]; items: Item[] };

const EMPTY_STATE: AppState = { version: VERSION, lists: [], items: [] };

/** Próximo nome padrão `Lista N`: maior `^Lista (\d+)$` + 1, mínimo 1. */
export function nextListaName(listas: Lista[]): string {
  let max = 0;
  for (const lista of listas) {
    const m = /^Lista (\d+)$/.exec(lista.nome.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Lista ${max + 1}`;
}

/** Compara texto normalizado (trim + lowercase) — match case-insensitive. */
function mesmoTexto(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Adiciona um texto a uma lista aplicando a precedência da spec (§7):
 * (1) duplicado ativo → não cria, devolve `duplicate` com o id existente;
 * (2) concluído igual → reativa (`concluido=false`), move ao fim dos a-fazer;
 * (3) texto novo → cria a-fazer ao fim dos a-fazer.
 * Não muta a entrada. Texto vazio é no-op (devolve `duplicate` sentinela? não —
 * a UI não chama com vazio; tratado aqui como no-op retornando o próprio array).
 */
export function addItemToLista(
  items: Item[],
  listId: string,
  texto: string,
): { items: Item[]; outcome: AddOutcome } {
  const limpo = texto.trim();
  if (!limpo) return { items, outcome: { kind: "duplicate", existingId: "" } };

  const daLista = items.filter((i) => i.listId === listId);

  // (1) duplicado ativo
  const ativo = daLista.find((i) => !i.concluido && mesmoTexto(i.texto, limpo));
  if (ativo) {
    return { items, outcome: { kind: "duplicate", existingId: ativo.id } };
  }

  // (2) reutilizar concluído
  const concluido = daLista.find(
    (i) => i.concluido && mesmoTexto(i.texto, limpo),
  );
  if (concluido) {
    const reativado: Item = { ...concluido, concluido: false };
    const next = moveParaFimDeAFazer(items, reativado);
    return { items: next, outcome: { kind: "reactivated", item: reativado } };
  }

  // (3) novo item
  const item: Item = {
    id: crypto.randomUUID(),
    listId,
    texto: limpo,
    concluido: false,
  };
  const outras = items.filter((i) => i.listId !== listId);
  return {
    items: [...outras, ...insereNoFimDeAFazer(daLista, item)],
    outcome: { kind: "created", item },
  };
}

/**
 * Insere `novo` no fim da seção a-fazer (antes do primeiro concluído da lista).
 */
function insereNoFimDeAFazer(daLista: Item[], novo: Item): Item[] {
  const primeiroConcluido = daLista.findIndex((i) => i.concluido);
  if (primeiroConcluido === -1) return [...daLista, novo];
  return [
    ...daLista.slice(0, primeiroConcluido),
    novo,
    ...daLista.slice(primeiroConcluido),
  ];
}

/**
 * Coloca `item` (já com o estado atualizado) no fim da seção a-fazer da lista,
 * removendo-o da posição anterior. Usado ao reativar.
 */
function moveParaFimDeAFazer(items: Item[], item: Item): Item[] {
  const semEle = items.filter((i) => i.id !== item.id);
  const daLista = semEle.filter((i) => i.listId === item.listId);
  const outras = semEle.filter((i) => i.listId !== item.listId);
  return [...outras, ...insereNoFimDeAFazer(daLista, item)];
}

/**
 * Alterna conclusão e move o item entre as seções: a-fazer→concluído vai ao fim
 * dos concluídos; concluído→a-fazer vai ao fim dos a-fazer. Não muta a entrada.
 */
export function toggleItemLista(items: Item[], id: string): Item[] {
  const alvo = items.find((i) => i.id === id);
  if (!alvo) return items;
  const atualizado: Item = { ...alvo, concluido: !alvo.concluido };
  const semEle = items.filter((i) => i.id !== id);
  const daLista = semEle.filter((i) => i.listId === alvo.listId);
  const outras = semEle.filter((i) => i.listId !== alvo.listId);
  if (atualizado.concluido) {
    // fim dos concluídos = fim da lista daquela lista
    return [...outras, ...daLista, atualizado];
  }
  return [...outras, ...insereNoFimDeAFazer(daLista, atualizado)];
}

/**
 * Migra o storage do MVP (`lembr8.todos`, `[{id,texto,concluido}]`) para o novo
 * formato: cria `Lista 1` com os itens existentes, preservando `concluido` e a
 * ordem relativa original dentro de cada seção (a-fazer ++ concluídos, sem
 * inversão). Nenhum dado perdido.
 */
export function migrateFromLegacy(
  legacy: { id: string; texto: string; concluido: boolean }[],
): AppState {
  const lista: Lista = { id: crypto.randomUUID(), nome: "Lista 1" };
  const aFazer = legacy
    .filter((t) => !t.concluido)
    .map<Item>((t) => ({ id: t.id, listId: lista.id, texto: t.texto, concluido: false }));
  const concluidos = legacy
    .filter((t) => t.concluido)
    .map<Item>((t) => ({ id: t.id, listId: lista.id, texto: t.texto, concluido: true }));
  return { version: VERSION, lists: [lista], items: [...aFazer, ...concluidos] };
}

/** Subset do `Storage` do browser que a camada precisa. Permite injetar um
 * fake nos testes (node/jsdom sem `localStorage` real controlado). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isItem(value: unknown): value is Item {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.listId === "string" &&
    typeof v.texto === "string" &&
    typeof v.concluido === "boolean"
  );
}

function isLista(value: unknown): value is Lista {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.nome === "string";
}

function parseState(raw: string | null): AppState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    const lists = Array.isArray(data.lists) ? data.lists.filter(isLista) : [];
    const items = Array.isArray(data.items) ? data.items.filter(isItem) : [];
    return { version: VERSION, lists, items };
  } catch {
    return null;
  }
}

function parseLegacy(raw: string | null): {
  id: string;
  texto: string;
  concluido: boolean;
}[] | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return data.filter((v): v is { id: string; texto: string; concluido: boolean } => {
      if (typeof v !== "object" || v === null) return false;
      const x = v as Record<string, unknown>;
      return (
        typeof x.id === "string" &&
        typeof x.texto === "string" &&
        typeof x.concluido === "boolean"
      );
    });
  } catch {
    return null;
  }
}

/**
 * Adapter localStorage da camada de acesso aos dados. Persistência imediata a
 * cada operação. `storage` é injetável para testes; em produção usa o
 * `localStorage` do browser. Roda a migração do MVP na primeira leitura.
 */
export function createLocalStorageRepository(
  storage: StorageLike = globalThis.localStorage,
  key: string = STORAGE_KEY,
): ListasRepository {
  let state: AppState | null = null;

  function read(): AppState {
    if (state === null) {
      const parsed = parseState(storage.getItem(key));
      if (parsed) {
        state = parsed;
      } else {
        // Migração do MVP (roda uma vez): novo formato ausente + storage antigo.
        const legacy = parseLegacy(storage.getItem(LEGACY_KEY));
        state = legacy && legacy.length > 0 ? migrateFromLegacy(legacy) : { ...EMPTY_STATE };
        if (legacy && legacy.length > 0) {
          storage.setItem(key, JSON.stringify(state));
          storage.removeItem(LEGACY_KEY); // marcado como migrado: não re-migra.
        }
      }
    }
    return state;
  }

  function write(next: AppState): void {
    state = next;
    storage.setItem(key, JSON.stringify(next));
  }

  return {
    listListas() {
      return read().lists;
    },
    listIndex() {
      const s = read();
      return s.lists.map((lista) => ({
        id: lista.id,
        nome: lista.nome,
        aFazer: s.items.filter((i) => i.listId === lista.id && !i.concluido)
          .length,
      }));
    },
    getLista(id) {
      return read().lists.find((l) => l.id === id) ?? null;
    },
    listItems(listId) {
      return read().items.filter((i) => i.listId === listId);
    },
    createList(nome) {
      const s = read();
      const lista: Lista = { id: crypto.randomUUID(), nome };
      write({ ...s, lists: [...s.lists, lista] });
      return lista;
    },
    renameList(id, nome) {
      const s = read();
      const limpo = nome.trim();
      if (!limpo) return;
      write({
        ...s,
        lists: s.lists.map((l) => (l.id === id ? { ...l, nome: limpo } : l)),
      });
    },
    addItem(listId, texto) {
      const s = read();
      const { items, outcome } = addItemToLista(s.items, listId, texto);
      if (outcome.kind === "duplicate" && outcome.existingId === "") {
        // texto vazio: no-op
        return outcome;
      }
      write({ ...s, items });
      return outcome;
    },
    toggleItem(id) {
      const s = read();
      write({ ...s, items: toggleItemLista(s.items, id) });
    },
  };
}