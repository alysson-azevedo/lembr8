import { createSupabaseCloudAdapter } from "./cloud-adapter";
import type {
  CloudAdapter,
  CloudState,
  ItemRecord,
  ListRecord,
} from "./cloud-adapter";
import type {
  AddOutcome,
  DeletedIds,
  Item,
  Lista,
  ListasRepository,
} from "./types";

/**
 * Camada única de acesso aos dados (LB-6): local-first sobre localStorage com
 * sync opcional ao Supabase. Evolução do adapter localStorage da LB-5.
 *
 * A UI continua consumindo só o `store` (via `useSyncExternalStore`); o store
 * troca a fábrica de `createLocalStorageRepository` para
 * `createLocalFirstRepository`. O **store não importa `supabase`** — só esta
 * fábrica resolve o adapter cloud (lazy, no client).
 *
 * Funções puras de domínio (abaixo) operam sobre arrays sem mutar a entrada e
 * sem tocar storage — testáveis isoladamente em node (sem DOM). A fábrica
 * encapsula storage + adapter (injetáveis, testáveis em node/jsdom sem
 * `localStorage`/Supabase reais).
 *
 * Formato do cache (v6): chave única `lembr8.data` com
 * `{ version:6, userId, lists, items, pending, migrated, lastSyncAt, deletedIds }`.
 * `lists` preserva a ordem de inserção no array (base do merge); a ordenação de
 * exibição do índice (Fixadas → Demais, `updated_at` desc) é computada em
 * `listIndex()`, não no array. `items` de cada lista em ordem de exibição —
 * a-fazer (inserção) ++ concluídos (conclusão) — então o array de itens já é a
 * ordem de renderização. Cada registro ganha `createdAt`/`updatedAt`
 * (timestamps do device; governam o merge cross-device por `updated_at`) e, no
 * caso de listas, `pinned` (LB-14, default `false`) e `archivedAt` (LB-16,
 * default `null` — nulo = ativa, preenchido = arquivada).
 *
 * Migrações de formato: MVP (`lembr8.todos`, lista única) → v2 (LB-5) → v3
 * (LB-6) → v4 (LB-8, `deletedIds`) → v5 (LB-14, `pinned`) → v6 (LB-16,
 * `archivedAt`), preservando ids/registros. `migrated=false` após v2→v3 garante
 * que dados pré-upgrade sobam ao cloud no 1º login (§4 da spec de design).
 */

const STORAGE_KEY = "lembr8.data";
const LEGACY_KEY = "lembr8.todos";
const V2 = 2;
const V3 = 3;
const V4 = 4;
const V5 = 5;
const V6 = 6;

/**
 * Registro de lista no cache local **antes** de `pinned`/`archivedAt` (v3/v4) —
 * timestamp para o merge, sem estado de fixação/arquivamento. Usado só pelos
 * parsers/migrações de versões antigas; o estado corrente (v6) usa
 * `ListRecordLocal` (com `pinned` e `archivedAt`).
 */
type ListRecordBase = Lista & { createdAt: string; updatedAt: string };
/** Registro de item no cache local (timestamp para o merge). */
type ItemRecordLocal = Item & { createdAt: string; updatedAt: string };

/** Registro de lista no cache local v5 (LB-14): adiciona `pinned` ao base. */
type ListRecordLocalV5 = ListRecordBase & { pinned: boolean };

/**
 * Registro de lista no cache local v6 (LB-16): adiciona `archivedAt` (string
 * ISO ou `null` — nulo = ativa, preenchido = arquivada). `pinned` permanece
 * (LB-14); ao arquivar, `pinned` é preservado (não limpo) — ao desarquivar, a
 * lista volta à seção Fixadas se estava fixada (PO (e), AC 12).
 */
type ListRecordLocal = ListRecordBase & {
  pinned: boolean;
  archivedAt: string | null;
};

/** Estado v2 legado (LB-5), sem timestamps. */
type AppStateV2 = { version: 2; lists: Lista[]; items: Item[] };

/** Operação pendente de push (upsert do registro id). */
export type PendingOp =
  | { kind: "list"; id: string }
  | { kind: "item"; id: string };

/** Estado do cache v3 (LB-6), sem tombstone local. */
export type CacheStateV3 = {
  version: 3;
  userId: string | null;
  lists: ListRecordBase[];
  items: ItemRecordLocal[];
  pending: PendingOp[];
  migrated: boolean;
  lastSyncAt: string | null;
};

/**
 * Estado do cache v4 (LB-8): adiciona `deletedIds` (tombstone local) ao v3,
 * sem mudança de schema do cloud. Ao excluir, remove do cache e adiciona o id
 * a `deletedIds`; no push do sync executa hard `DELETE` no cloud e os limpa; no
 * pull/merge (upsert-only) filtra esses ids ao reimportar do cloud.
 */
export type CacheStateV4 = {
  version: 4;
  userId: string | null;
  lists: ListRecordBase[];
  items: ItemRecordLocal[];
  pending: PendingOp[];
  migrated: boolean;
  lastSyncAt: string | null;
  deletedIds: DeletedIds;
};

/**
 * Estado do cache v5 (LB-14): adiciona `pinned` (booleano, default `false`) aos
 * registros de lista — campo aditivo, sem breaking change nos dados existentes
 * (a migration v4→v5 seta `pinned=false` em cada lista). Nenhuma mudança de
 * schema do cloud além da coluna aditiva `lists.pinned` (default `false`); a
 * RLS por `auth.uid()` existente continua cobrindo o campo (AC 13).
 */
export type CacheStateV5 = {
  version: 5;
  userId: string | null;
  lists: ListRecordLocalV5[];
  items: ItemRecordLocal[];
  pending: PendingOp[];
  migrated: boolean;
  lastSyncAt: string | null;
  deletedIds: DeletedIds;
};

/**
 * Estado do cache v6 (LB-16): adiciona `archivedAt` (string ISO ou `null`,
 * default `null` — nulo = ativa, preenchido = arquivada) aos registros de lista
 * — campo aditivo, sem breaking change (a migration v5→v6 seta
 * `archivedAt=null` em cada lista). Nenhuma mudança de schema do cloud além da
 * coluna aditiva `lists.archived_at` (default `null`); a RLS por `auth.uid()`
 * existente continua cobrindo o campo (AC 11). `pinned` é preservado ao
 * arquivar (PO (e), AC 12).
 */
export type CacheState = {
  version: 6;
  userId: string | null;
  lists: ListRecordLocal[];
  items: ItemRecordLocal[];
  pending: PendingOp[];
  migrated: boolean;
  lastSyncAt: string | null;
  deletedIds: DeletedIds;
};

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
 * Normaliza texto para casamento de sugestão (LB-13): trim + NFD (decompõe
 * acentos) + remove diacríticos + lowercase. Ex.: "Café" → "cafe",
 * "  Arroz " → "arroz". Usa `\p{Diacritic}` (Unicode property escape) — cobre
 * acentos do PT-BR e outros; suportado em engines modernas (target do projeto).
 * Própria do autocomplete: **não** reutiliza `mesmoTexto` (que é só case, sem
 * remover acento) — critério diferente (insensível a acento) e propósito
 * diferente (sugestão vs. detecção de duplicado), para não regressar `addItem`.
 */
export function normalizaTexto(s: string): string {
  return s
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Casamento por prefixo, insensível a acento/caixa (LB-13): `normalizaTexto(texto)`
 * começa com `normalizaTexto(prefix)`. Prefixo vazio → false (não casa nada).
 * **Não** casa "contém" (mid-word) — fora de escopo.
 */
export function prefixoCombina(prefix: string, texto: string): boolean {
  const p = normalizaTexto(prefix);
  if (!p) return false;
  return normalizaTexto(texto).startsWith(p);
}

/**
 * Sugestões de itens para o autocomplete (LB-13 AC 1/2/3/4/6).
 * `items`: registros `{ texto, updatedAt }` (lê-se do cache; `updatedAt` é o
 * critério de recência já existente — sem dado novo).
 * Regras:
 *  (a) dedup por `normalizaTexto(texto)`, mantendo a ocorrência de **maior
 *      `updatedAt`** (AC "todas as listas" — textos iguais em listas diferentes
 *      viram uma sugestão; mostra o texto da ocorrência mais recente, preser-
 *      vando capitalização/acentos daquela ocorrência);
 *  (b) filtra por `prefixoCombina(query, texto)` (só prefixo);
 *  (c) ordena por `updatedAt` **desc** (mais recente primeiro);
 *  (d) limita a `limit` (AC = 6).
 * Retorna `string[]` (os textos sugeridos). Não muta a entrada.
 */
export function sugestoesPara(
  items: { texto: string; updatedAt: string }[],
  query: string,
  limit: number,
): string[] {
  const q = normalizaTexto(query);
  if (!q) return [];
  // (a) dedup por texto normalizado, mantendo o de maior updatedAt.
  const best = new Map<string, { texto: string; updatedAt: string }>();
  for (const it of items) {
    const norm = normalizaTexto(it.texto);
    if (!norm) continue;
    const ex = best.get(norm);
    if (!ex || it.updatedAt > ex.updatedAt) {
      best.set(norm, { texto: it.texto, updatedAt: it.updatedAt });
    }
  }
  // (b)(c)(d) filtra prefixo, ordena updatedAt desc, limita.
  return [...best.values()]
    .filter((c) => normalizaTexto(c.texto).startsWith(q))
    .sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    )
    .slice(0, limit)
    .map((c) => c.texto);
}

/**
 * Adiciona um texto a uma lista aplicando a precedência da spec (§7):
 * (1) duplicado ativo → não cria, devolve `duplicate` com o id existente;
 * (2) concluído igual → reativa (`concluido=false`), move ao fim dos a-fazer;
 * (3) texto novo → cria a-fazer ao fim dos a-fazer.
 * Não muta a entrada. Texto vazio é no-op (devolve `duplicate` sentinela).
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

/** Remove duplicatas preservando a ordem da primeira ocorrência. */
function dedup(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) if (!seen.has(id)) {
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Hard delete de um item: devolve o array sem o item (por id), preservando a
 * ordem dos demais. Não muta a entrada. (LB-8, §5.2.)
 */
export function deleteItemFromLista<T extends Item>(items: T[], id: string): T[] {
  if (!items.some((i) => i.id === id)) return items; // no-op: mesma referência.
  return items.filter((i) => i.id !== id);
}

/**
 * Hard delete de uma lista em cascade: remove a lista e todos os itens cujo
 * `listId === listId`, preservando as demais listas/itens. Devolve os ids a
 * marcar no tombstone local (`{ lists: [listId], items: [...itemIds] }`). Não
 * muta a entrada. (LB-8, §5.2.)
 */
export function deleteListaCascade(
  state: { lists: ListRecordLocal[]; items: ItemRecordLocal[] },
  listId: string,
): {
  lists: ListRecordLocal[];
  items: ItemRecordLocal[];
  deletedIds: DeletedIds;
} {
  const deletedItemIds = state.items
    .filter((i) => i.listId === listId)
    .map((i) => i.id);
  return {
    lists: state.lists.filter((l) => l.id !== listId),
    items: state.items.filter((i) => i.listId !== listId),
    deletedIds: { lists: [listId], items: deletedItemIds },
  };
}

/**
 * Migra o storage do MVP (`lembr8.todos`, `[{id,texto,concluido}]`) para o
 * formato v2: cria `Lista 1` com os itens existentes, preservando `concluido` e
 * a ordem relativa original dentro de cada seção (a-fazer ++ concluídos, sem
 * inversão). Nenhum dado perdido. (A subida para v3 é feita por
 * `migrateV2toV3`, que adiciona timestamps.)
 */
export function migrateFromLegacy(
  legacy: { id: string; texto: string; concluido: boolean }[],
): AppStateV2 {
  const lista: Lista = { id: crypto.randomUUID(), nome: "Lista 1" };
  const aFazer = legacy
    .filter((t) => !t.concluido)
    .map<Item>((t) => ({ id: t.id, listId: lista.id, texto: t.texto, concluido: false }));
  const concluidos = legacy
    .filter((t) => t.concluido)
    .map<Item>((t) => ({ id: t.id, listId: lista.id, texto: t.texto, concluido: true }));
  return { version: V2, lists: [lista], items: [...aFazer, ...concluidos] };
}

/** Subset do `Storage` do browser que a camada precisa. Permite injetar um
 * fake nos testes (node/jsdom sem `localStorage` real controlado). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// --- validadores de formato (não mutam; `unknown` → tipado) ---

function isLista(value: unknown): value is Lista {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.nome === "string";
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

function isListRecordBase(value: unknown): value is ListRecordBase {
  if (!isLista(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.createdAt === "string" && typeof v.updatedAt === "string";
}

function isListRecordLocalV5(value: unknown): value is ListRecordLocalV5 {
  if (!isListRecordBase(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.pinned === "boolean";
}

function isListRecordLocal(value: unknown): value is ListRecordLocal {
  if (!isListRecordLocalV5(value)) return false;
  const v = value as Record<string, unknown>;
  // archivedAt pode ser string ISO ou null; ausência/undefined vira null na carga.
  return v.archivedAt === null || typeof v.archivedAt === "string";
}

function isItemRecordLocal(value: unknown): value is ItemRecordLocal {
  if (!isItem(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.createdAt === "string" && typeof v.updatedAt === "string";
}

function isPendingOp(value: unknown): value is PendingOp {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.kind === "list" || v.kind === "item") && typeof v.id === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}

function isDeletedIds(value: unknown): value is DeletedIds {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isStringArray(v.lists) && isStringArray(v.items);
}

// --- parsing / migração de formato ---

function parseV2(raw: string | null): AppStateV2 | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null || data.version !== V2)
      return null;
    const lists = Array.isArray(data.lists) ? data.lists.filter(isLista) : [];
    const items = Array.isArray(data.items) ? data.items.filter(isItem) : [];
    return { version: V2, lists, items };
  } catch {
    return null;
  }
}

function parseV3(raw: string | null): CacheStateV3 | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null || data.version !== V3)
      return null;
    return {
      version: V3,
      userId: typeof data.userId === "string" ? data.userId : null,
      lists: Array.isArray(data.lists) ? data.lists.filter(isListRecordBase) : [],
      items: Array.isArray(data.items) ? data.items.filter(isItemRecordLocal) : [],
      pending: Array.isArray(data.pending) ? data.pending.filter(isPendingOp) : [],
      migrated: data.migrated === true,
      lastSyncAt: typeof data.lastSyncAt === "string" ? data.lastSyncAt : null,
    };
  } catch {
    return null;
  }
}

function parseV4(raw: string | null): CacheStateV4 | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null || data.version !== V4)
      return null;
    return {
      version: V4,
      userId: typeof data.userId === "string" ? data.userId : null,
      lists: Array.isArray(data.lists) ? data.lists.filter(isListRecordBase) : [],
      items: Array.isArray(data.items) ? data.items.filter(isItemRecordLocal) : [],
      pending: Array.isArray(data.pending) ? data.pending.filter(isPendingOp) : [],
      migrated: data.migrated === true,
      lastSyncAt: typeof data.lastSyncAt === "string" ? data.lastSyncAt : null,
      deletedIds: isDeletedIds(data.deletedIds) ? data.deletedIds : { lists: [], items: [] },
    };
  } catch {
    return null;
  }
}

function parseV5(raw: string | null): CacheStateV5 | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null || data.version !== V5)
      return null;
    return {
      version: V5,
      userId: typeof data.userId === "string" ? data.userId : null,
      lists: Array.isArray(data.lists) ? data.lists.filter(isListRecordLocalV5) : [],
      items: Array.isArray(data.items) ? data.items.filter(isItemRecordLocal) : [],
      pending: Array.isArray(data.pending) ? data.pending.filter(isPendingOp) : [],
      migrated: data.migrated === true,
      lastSyncAt: typeof data.lastSyncAt === "string" ? data.lastSyncAt : null,
      deletedIds: isDeletedIds(data.deletedIds) ? data.deletedIds : { lists: [], items: [] },
    };
  } catch {
    return null;
  }
}

function parseV6(raw: string | null): CacheState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null || data.version !== V6)
      return null;
    return {
      version: V6,
      userId: typeof data.userId === "string" ? data.userId : null,
      lists: Array.isArray(data.lists)
        ? data.lists
            .filter(isListRecordLocal)
            // garante archivedAt: null quando ausente (compat retroativa).
            .map((l: ListRecordLocal) => ({ ...l, archivedAt: l.archivedAt ?? null }))
        : [],
      items: Array.isArray(data.items) ? data.items.filter(isItemRecordLocal) : [],
      pending: Array.isArray(data.pending) ? data.pending.filter(isPendingOp) : [],
      migrated: data.migrated === true,
      lastSyncAt: typeof data.lastSyncAt === "string" ? data.lastSyncAt : null,
      deletedIds: isDeletedIds(data.deletedIds) ? data.deletedIds : { lists: [], items: [] },
    };
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

/** Normaliza um estado v2 (LB-5) para v3, preservando ids/registros. */
export function migrateV2toV3(v2: AppStateV2, now: string): CacheStateV3 {
  return {
    version: V3,
    userId: null,
    lists: v2.lists.map((l) => ({ ...l, createdAt: now, updatedAt: now })),
    items: v2.items.map((i) => ({ ...i, createdAt: now, updatedAt: now })),
    pending: [],
    migrated: false,
    lastSyncAt: null,
  };
}

/**
 * Migra o cache v3 (LB-6) para v4 (LB-8): adiciona `deletedIds` vazio,
 * preservando lists/items/pending/migrated/lastSyncAt/userId. Não é mudança de
 * schema do cloud — é o cache localStorage (o ADR proíbe tombstone no schema do
 * Supabase, não no cache).
 */
export function migrateV3toV4(v3: CacheStateV3): CacheStateV4 {
  return { ...v3, version: V4, deletedIds: { lists: [], items: [] } };
}

/**
 * Migra o cache v4 (LB-8) para v5 (LB-14): adiciona `pinned: false` a cada
 * lista (campo aditivo, default `false` — lista existente não nasce fixada,
 * AC 12), preservando lists/items/pending/migrated/lastSyncAt/userId/deletedIds.
 * Sem breaking change nos dados; nenhuma lista fica fixada após o upgrade.
 */
export function migrateV4toV5(v4: CacheStateV4): CacheStateV5 {
  return {
    ...v4,
    version: V5,
    lists: v4.lists.map((l) => ({ ...l, pinned: false })),
  };
}

/**
 * Migra o cache v5 (LB-14) para v6 (LB-16): adiciona `archivedAt: null` a cada
 * lista (campo aditivo, default `null` — lista existente não nasce arquivada,
 * AC 10), preservando lists (incl. `pinned`)/items/pending/migrated/lastSyncAt/
 * userId/deletedIds. Sem breaking change; nenhuma lista fica arquivada após o
 * upgrade. `pinned` é preservado (não limpo) — ao arquivar uma lista fixada, o
 * `pinned` permanece para ao desarquivar voltar à seção Fixadas (PO (e), AC 12).
 */
export function migrateV5toV6(v5: CacheStateV5): CacheState {
  return {
    ...v5,
    version: V6,
    lists: v5.lists.map((l) => ({ ...l, archivedAt: null })),
  };
}

// --- merge por updated_at (lógica pura, testável) ---

/**
 * Funde o cache local com o estado vindo do cloud, por `id`, última escrita
 * vence (`updated_at` estritamente maior sobrescreve; empate mantém o local).
 * **Upsert-only (LB-8):** nunca remove registro local porque sumiu do cloud —
 * registros só locais são mantidos. Registros só no cloud são adicionados,
 * **exceto** ids presentes em `local.deletedIds` (tombstone local): esses não
 * são reimportados, evitando ressuscitação do item excluído no device de
 * origem (ADR 2026-08-14). Mantém a ordenação da LB-5 (por lista: a-fazer ++
 * concluídos). Recomputa `pending` com os registros locais ainda mais recentes
 * que o cloud (ou ausentes no cloud) — a versão local mais recente sobe no
 * próximo push.
 */
export function mergeCache(
  local: {
    lists: ListRecordLocal[];
    items: ItemRecordLocal[];
    pending: PendingOp[];
    deletedIds?: DeletedIds;
  },
  cloud: CloudState,
): { lists: ListRecordLocal[]; items: ItemRecordLocal[]; pending: PendingOp[] } {
  const cloudListById = new Map(cloud.lists.map((c) => [c.id, c]));
  const cloudItemById = new Map(cloud.items.map((c) => [c.id, c]));
  // Tombstone local: ids excluídos neste device não voltam do cloud.
  const deletedLists = new Set(local.deletedIds?.lists ?? []);
  const deletedItems = new Set(local.deletedIds?.items ?? []);

  // --- lists: local primeiro (ordem preservada), fundindo cloud mais recente;
  //     listas só no cloud (e não excluídas) vão ao fim. ---
  const mergedLists: ListRecordLocal[] = [];
  const seenListIds = new Set<string>();
  for (const l of local.lists) {
    seenListIds.add(l.id);
    const cl = cloudListById.get(l.id);
    if (cl && cl.updated_at > l.updatedAt) {
      mergedLists.push({
        ...l,
        nome: cl.nome,
        pinned: cl.pinned,
        archivedAt: cl.archived_at ?? null,
        createdAt: cl.created_at,
        updatedAt: cl.updated_at,
      });
    } else {
      mergedLists.push(l);
    }
  }
  for (const cl of cloud.lists) {
    if (!seenListIds.has(cl.id) && !deletedLists.has(cl.id)) {
      seenListIds.add(cl.id);
      mergedLists.push({
        id: cl.id,
        nome: cl.nome,
        pinned: cl.pinned,
        archivedAt: cl.archived_at ?? null,
        createdAt: cl.created_at,
        updatedAt: cl.updated_at,
      });
    }
  }

  // --- items: por id, mesma regra de merge; só-cloud em deletedIds são pulados. ---
  const localItemById = new Map(local.items.map((i) => [i.id, i]));
  const mergedItemById = new Map<string, ItemRecordLocal>();
  for (const i of local.items) mergedItemById.set(i.id, i);
  for (const ci of cloud.items) {
    if (deletedItems.has(ci.id)) continue; // tombstone: não reimporta.
    const ex = localItemById.get(ci.id);
    if (!ex) {
      mergedItemById.set(ci.id, {
        id: ci.id,
        listId: ci.list_id,
        texto: ci.texto,
        concluido: ci.concluido,
        createdAt: ci.created_at,
        updatedAt: ci.updated_at,
      });
    } else if (ci.updated_at > ex.updatedAt) {
      mergedItemById.set(ex.id, {
        ...ex,
        texto: ci.texto,
        concluido: ci.concluido,
        createdAt: ci.created_at,
        updatedAt: ci.updated_at,
      });
    }
  }

  // --- ordenação: por lista (ordem de mergedLists), a-fazer ++ concluídos;
  //     itens locais preservam ordem relativa; só-cloud entram ao fim da
  //     seção. Pula itens de listas excluídas (órfãos no cloud). ---
  const mergedItems: ItemRecordLocal[] = [];
  for (const l of mergedLists) {
    const localListItems = local.items.filter((i) => i.listId === l.id);
    const localIds = new Set(localListItems.map((i) => i.id));
    const cloudOnly = cloud.items
      .filter(
        (ci) =>
          ci.list_id === l.id &&
          !localIds.has(ci.id) &&
          !deletedItems.has(ci.id),
      )
      .map((ci) => mergedItemById.get(ci.id)!)
      .filter((i) => i !== undefined);
    const all = [
      ...localListItems.map((i) => mergedItemById.get(i.id)!),
      ...cloudOnly,
    ];
    mergedItems.push(...all.filter((i) => !i.concluido));
    mergedItems.push(...all.filter((i) => i.concluido));
  }

  // --- pending: mantém os existentes + adiciona registros locais mais
  //     recentes que o cloud (ou ausentes no cloud) para o próximo push. ---
  const pendingSet = new Set<string>();
  const pending: PendingOp[] = [];
  const add = (op: PendingOp) => {
    const k = `${op.kind}:${op.id}`;
    if (!pendingSet.has(k)) {
      pendingSet.add(k);
      pending.push(op);
    }
  };
  for (const op of local.pending) add(op);
  for (const l of mergedLists) {
    const cl = cloudListById.get(l.id);
    if (!cl || l.updatedAt > cl.updated_at) add({ kind: "list", id: l.id });
  }
  for (const it of mergedItems) {
    const ci = cloudItemById.get(it.id);
    if (!ci || it.updatedAt > ci.updated_at) add({ kind: "item", id: it.id });
  }

  return { lists: mergedLists, items: mergedItems, pending };
}

// --- fábrica do repositório local-first ---

export type LocalFirstRepositoryOptions = {
  /** Cache localStorage (default `globalThis.localStorage`). */
  storage?: StorageLike;
  /**
   * Adapter cloud: instância injetada (real/fake) executa push/pull; `null`
   * desabilita o cloud (sync = no-op); omitido resolve `createSupabaseCloudAdapter()`
   * lazy (só no client).
   */
  adapter?: CloudAdapter | null;
  /** Id da conta autenticada (isolamento do cache). `null` antes do login. */
  userId?: string | null;
  /** Fonte de timestamps (default `() => new Date().toISOString()`); injetável. */
  clock?: () => string;
};

function isOnline(): boolean {
  // No browser, `navigator.onLine` governa. Em node/jsdom sem `onLine`
  // (node 22 expõe `navigator` mas sem `onLine`), assume online para a lógica
  // de sync ser testável com FakeCloudAdapter.
  if (typeof navigator === "undefined") return true;
  if (typeof navigator.onLine === "undefined") return true;
  return navigator.onLine;
}

/**
 * Adapter localStorage + cloud (local-first). Persistência imediata a cada
 * mutação (UI responde na hora); leitura só do cache; sync push+pull+merge
 * acionado pelo `SyncController` ao montar/reconectar/logar.
 */
export function createLocalFirstRepository(
  options: LocalFirstRepositoryOptions = {},
): ListasRepository {
  const storage: StorageLike = options.storage ?? globalThis.localStorage;
  const clock: () => string = options.clock ?? (() => new Date().toISOString());
  const adapterOption = options.adapter;

  let currentUserId: string | null = options.userId ?? null;
  let state: CacheState | null = null;

  // Adapter lazy: `null` = desabilitado; instância = injetada; omitido = real.
  let lazyAdapter: CloudAdapter | null = null;
  let adapterResolved = false;
  function getAdapter(): CloudAdapter | null {
    if (adapterOption === null) return null;
    if (adapterOption !== undefined) return adapterOption;
    if (!adapterResolved) {
      adapterResolved = true;
      lazyAdapter = createSupabaseCloudAdapter();
    }
    return lazyAdapter;
  }

  function emptyState(userId: string | null): CacheState {
    return {
      version: V6,
      userId,
      lists: [],
      items: [],
      pending: [],
      migrated: false,
      lastSyncAt: null,
      deletedIds: { lists: [], items: [] },
    };
  }

  function persist(next: CacheState): void {
    const withUser =
      currentUserId !== null ? { ...next, userId: currentUserId } : next;
    state = withUser;
    storage.setItem(STORAGE_KEY, JSON.stringify(withUser));
  }

  /** Lê o `userId` do cache persistido (sem hidratar o estado), qualquer versão. */
  function peekPersistedUserId(): string | null {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as { userId?: unknown };
      return typeof data.userId === "string" ? data.userId : null;
    } catch {
      return null;
    }
  }

  function loadFromStorage(): CacheState {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const v6 = parseV6(raw);
      if (v6) return v6;
      const v5 = parseV5(raw);
      if (v5) return migrateV5toV6(v5);
      const v4 = parseV4(raw);
      if (v4) return migrateV5toV6(migrateV4toV5(v4));
      const v3 = parseV3(raw);
      if (v3) return migrateV5toV6(migrateV4toV5(migrateV3toV4(v3)));
      const v2 = parseV2(raw);
      if (v2)
        return migrateV5toV6(
          migrateV4toV5(migrateV3toV4(migrateV2toV3(v2, clock()))),
        );
      // payload corrompido: ignora e cai no vazio (não re-migra legacy).
    }
    const legacy = parseLegacy(storage.getItem(LEGACY_KEY));
    if (legacy && legacy.length > 0) {
      const v6 = migrateV5toV6(
        migrateV4toV5(
          migrateV3toV4(migrateV2toV3(migrateFromLegacy(legacy), clock())),
        ),
      );
      persist(v6);
      storage.removeItem(LEGACY_KEY); // marcado como migrado: não re-migra.
      return v6;
    }
    return emptyState(currentUserId);
  }

  function read(): CacheState {
    if (state === null) state = loadFromStorage();
    // Isolamento entre contas: se o cache pertence a outra conta (e a conta
    // atual é conhecida), descarta antes de servir.
    if (
      currentUserId !== null &&
      state.userId !== null &&
      state.userId !== currentUserId
    ) {
      storage.removeItem(STORAGE_KEY);
      state = emptyState(currentUserId);
    }
    return state;
  }

  /** Adiciona `op` à fila, dedup por `(kind, id)`. */
  function withPending(s: CacheState, op: PendingOp): CacheState {
    const pending = s.pending.filter(
      (p) => !(p.kind === op.kind && p.id === op.id),
    );
    pending.push(op);
    return { ...s, pending };
  }

  /**
   * Bumpa o `updated_at` da lista `listId` (LB-14, AC 8): atividade na lista
   * (adicionar/marcar item) a reposiciona no índice por modificação. Devolve o
   * novo array de listas e o timestamp usado. Não muta a entrada.
   */
  function bumpList(
    s: CacheState,
    listId: string,
  ): { lists: ListRecordLocal[]; now: string } {
    const now = clock();
    return {
      lists: s.lists.map((l) =>
        l.id === listId ? { ...l, updatedAt: now } : l,
      ),
      now,
    };
  }

  /** Migração do 1º login: enfileira TODOS os registros como pending. */
  function enqueueAllAsPending(s: CacheState): CacheState {
    const seen = new Set<string>();
    const pending: PendingOp[] = [];
    const add = (op: PendingOp) => {
      const k = `${op.kind}:${op.id}`;
      if (!seen.has(k)) {
        seen.add(k);
        pending.push(op);
      }
    };
    for (const op of s.pending) add(op);
    for (const l of s.lists) add({ kind: "list", id: l.id });
    for (const i of s.items) add({ kind: "item", id: i.id });
    return { ...s, pending };
  }

  /** Extrai os registros únicos da fila no formato do cloud. */
  function pendingRecords(s: CacheState): {
    lists: ListRecord[];
    items: ItemRecord[];
  } {
    const listsById = new Map(s.lists.map((l) => [l.id, l]));
    const itemsById = new Map(s.items.map((i) => [i.id, i]));
    const pushLists: ListRecord[] = [];
    const pushItems: ItemRecord[] = [];
    const seenList = new Set<string>();
    const seenItem = new Set<string>();
    for (const op of s.pending) {
      if (op.kind === "list" && !seenList.has(op.id)) {
        seenList.add(op.id);
        const l = listsById.get(op.id);
        if (l)
          pushLists.push({
            id: l.id,
            nome: l.nome,
            pinned: l.pinned,
            archived_at: l.archivedAt,
            created_at: l.createdAt,
            updated_at: l.updatedAt,
          });
      } else if (op.kind === "item" && !seenItem.has(op.id)) {
        seenItem.add(op.id);
        const it = itemsById.get(op.id);
        if (it)
          pushItems.push({
            id: it.id,
            list_id: it.listId,
            texto: it.texto,
            concluido: it.concluido,
            created_at: it.createdAt,
            updated_at: it.updatedAt,
          });
      }
    }
    return { lists: pushLists, items: pushItems };
  }

  /**
   * Reconstrói `nextItems` (saída das funções puras, que podem vir sem
   * timestamps) preservando timestamps dos registros inalterados e setando
   * `updatedAt`/`createdAt` no registro afetado (`affectedId`).
   */
  function reapplyTimestamps(
    prev: ItemRecordLocal[],
    next: Item[],
    affectedId: string | null,
  ): ItemRecordLocal[] {
    const prevById = new Map(prev.map((i) => [i.id, i]));
    const now = clock();
    return next.map((i) => {
      const ex = prevById.get(i.id);
      const changed = i.id === affectedId;
      return {
        id: i.id,
        listId: i.listId,
        texto: i.texto,
        concluido: i.concluido,
        createdAt: ex?.createdAt ?? now,
        updatedAt: changed ? now : (ex?.updatedAt ?? now),
      };
    });
  }

  return {
    listListas() {
      return read().lists;
    },
    listIndex() {
      const s = read();
      // Índice em duas seções (LB-14): Fixadas (pinned=true) no topo, Demais
      // (pinned=false) abaixo; ambas por `updated_at` descendente (modificação
      // mais recente primeiro). Empate de `updated_at`: desempate determinístico
      // por `createdAt` desc, depois `id` desc. Mudança de comportamento: o
      // índice ordenava por criação; agora ordena por modificação (AC 5/6/7).
      // (LB-16) listas arquivadas (archivedAt !== null) NÃO aparecem no índice
      // (AC 2/9) — só ativas (archivedAt === null) entram nas seções.
      const active = s.lists.filter((l) => l.archivedAt === null);
      const entries = active.map((lista) => ({
        id: lista.id,
        nome: lista.nome,
        pinned: lista.pinned,
        aFazer: s.items.filter((i) => i.listId === lista.id && !i.concluido)
          .length,
        updatedAt: lista.updatedAt,
        createdAt: lista.createdAt,
      }));
      const byRecency = (a: typeof entries[number], b: typeof entries[number]) =>
        a.updatedAt > b.updatedAt
          ? -1
          : a.updatedAt < b.updatedAt
            ? 1
            : a.createdAt > b.createdAt
              ? -1
              : a.createdAt < b.createdAt
                ? 1
                : a.id > b.id
                  ? -1
                  : 1;
      const pinned = entries.filter((e) => e.pinned).sort(byRecency);
      const demais = entries.filter((e) => !e.pinned).sort(byRecency);
      // O contrato entrega só {id,nome,aFazer,pinned}; os campos auxiliares de
      // ordenação não vazam para a UI.
      const toIndex = (e: typeof entries[number]) => ({
        id: e.id,
        nome: e.nome,
        aFazer: e.aFazer,
        pinned: e.pinned,
      });
      return [...pinned.map(toIndex), ...demais.map(toIndex)];
    },
    listArchivedIndex() {
      const s = read();
      // Índice de listas arquivadas (LB-16): archivedAt !== null, ordenadas por
      // `updated_at` desc (mesmo desempate de listIndex). Shape igual ao
      // listIndex (id, nome, aFazer, pinned) — a UI não precisa de archivedAt.
      const archived = s.lists.filter((l) => l.archivedAt !== null);
      const entries = archived.map((lista) => ({
        id: lista.id,
        nome: lista.nome,
        pinned: lista.pinned,
        aFazer: s.items.filter((i) => i.listId === lista.id && !i.concluido)
          .length,
        updatedAt: lista.updatedAt,
        createdAt: lista.createdAt,
      }));
      const byRecency = (a: typeof entries[number], b: typeof entries[number]) =>
        a.updatedAt > b.updatedAt
          ? -1
          : a.updatedAt < b.updatedAt
            ? 1
            : a.createdAt > b.createdAt
              ? -1
              : a.createdAt < b.createdAt
                ? 1
                : a.id > b.id
                  ? -1
                  : 1;
      return entries.sort(byRecency).map((e) => ({
        id: e.id,
        nome: e.nome,
        aFazer: e.aFazer,
        pinned: e.pinned,
      }));
    },
    getLista(id) {
      // ListaDetalhe exige `archived` (derivado de archivedAt !== null, LB-16).
      const l = read().lists.find((x) => x.id === id);
      if (!l) return null;
      return { id: l.id, nome: l.nome, pinned: l.pinned, archived: l.archivedAt !== null };
    },
    listItems(listId) {
      return read().items.filter((i) => i.listId === listId);
    },
    listItemSuggestions(query, limit) {
      // Lê TODOS os itens do cache (de todas as listas da conta, isoladas por
      // userId/RLS) e devolve textos sugeridos — sem expor ItemRecordLocal/updatedAt
      // para fora (mapeia para o shape estreito). Sem chamada ao Supabase.
      return sugestoesPara(
        read().items.map((i) => ({ texto: i.texto, updatedAt: i.updatedAt })),
        query,
        limit,
      );
    },
    createList(nome) {
      const s = read();
      const now = clock();
      const lista: ListRecordLocal = {
        id: crypto.randomUUID(),
        nome,
        pinned: false,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      persist(withPending({ ...s, lists: [...s.lists, lista] }, { kind: "list", id: lista.id }));
      return lista;
    },
    renameList(id, nome) {
      const s = read();
      const limpo = nome.trim();
      if (!limpo) return;
      if (!s.lists.some((l) => l.id === id)) return;
      const now = clock();
      const lists = s.lists.map((l) =>
        l.id === id ? { ...l, nome: limpo, updatedAt: now } : l,
      );
      persist(withPending({ ...s, lists }, { kind: "list", id }));
    },
    togglePinLista(id) {
      const s = read();
      if (!s.lists.some((l) => l.id === id)) return;
      const now = clock();
      // Toggle não destrutivo (LB-14, PO (b)): inverte `pinned` e bumpa
      // `updated_at` para o cambio propagar cross-device via merge por
      // `updated_at` (AC 11) e reposicionar a lista em sua seção por
      // modificação. Enfileira pending para o push (AC 9/10).
      const lists = s.lists.map((l) =>
        l.id === id ? { ...l, pinned: !l.pinned, updatedAt: now } : l,
      );
      persist(withPending({ ...s, lists }, { kind: "list", id }));
    },
    archiveLista(id) {
      const s = read();
      const alvo = s.lists.find((l) => l.id === id);
      if (!alvo) return;
      // Arquivar não destrutivo (LB-16, PO (a)): seta `archivedAt = now` (a lista
      // some do índice) e bumpa `updated_at` para propagar cross-device via
      // merge (AC 7) e enfileira pending para o push (AC 6/8). `pinned` é
      // preservado (não limpo) — ao desarquivar, a lista volta à seção Fixadas
      // se estava fixada (PO (e), AC 12). No-op se já arquivada.
      if (alvo.archivedAt !== null) return;
      const now = clock();
      const lists = s.lists.map((l) =>
        l.id === id ? { ...l, archivedAt: now, updatedAt: now } : l,
      );
      persist(withPending({ ...s, lists }, { kind: "list", id }));
    },
    unarchiveLista(id) {
      const s = read();
      const alvo = s.lists.find((l) => l.id === id);
      if (!alvo) return;
      // Desarquivar (LB-16, PO (a)): limpa `archivedAt = null` (a lista volta à
      // tela inicial) e bumpa `updated_at` para propagar cross-device (AC 7) e
      // enfileira pending (AC 6/8). No-op se já ativa. `pinned` é preservado —
      // se estava fixada, volta à seção Fixadas (PO (e), AC 12).
      if (alvo.archivedAt === null) return;
      const now = clock();
      const lists = s.lists.map((l) =>
        l.id === id ? { ...l, archivedAt: null, updatedAt: now } : l,
      );
      persist(withPending({ ...s, lists }, { kind: "list", id }));
    },
    addItem(listId, texto) {
      const s = read();
      const { items, outcome } = addItemToLista(s.items, listId, texto);
      if (outcome.kind === "duplicate" && outcome.existingId === "") {
        // texto vazio: no-op
        return outcome;
      }
      const affectedId =
        outcome.kind === "created" || outcome.kind === "reactivated"
          ? outcome.item.id
          : null;
      const normItems = reapplyTimestamps(s.items, items, affectedId);
      if (affectedId) {
        // LB-14 (AC 8): atividade na lista bumpa seu `updated_at` (a
        // reposiciona no índice por modificação) e enfileira a lista para o
        // sync propagar o novo timestamp (junto ao item).
        const { lists } = bumpList(s, listId);
        const withItem = withPending(
          { ...s, lists, items: normItems },
          { kind: "item", id: affectedId },
        );
        persist(withPending(withItem, { kind: "list", id: listId }));
      } else {
        // duplicado ativo: sem mudança real, sem pending.
        persist({ ...s, items: normItems });
      }
      return outcome;
    },
    toggleItem(id) {
      const s = read();
      const alvo = s.items.find((i) => i.id === id);
      if (!alvo) return;
      const next = toggleItemLista(s.items, id);
      const normItems = reapplyTimestamps(s.items, next, id);
      // LB-14 (AC 8): marcar/desmarcar item bumpa o `updated_at` da lista dona
      // (reposiciona no índice) e enfileira a lista para o sync.
      const { lists } = bumpList(s, alvo.listId);
      const withItem = withPending(
        { ...s, lists, items: normItems },
        { kind: "item", id },
      );
      persist(withPending(withItem, { kind: "list", id: alvo.listId }));
    },
    deleteItem(id) {
      const s = read();
      if (!s.items.some((i) => i.id === id)) return;
      const items = deleteItemFromLista(s.items, id);
      const deletedIds: DeletedIds = {
        lists: s.deletedIds.lists,
        items: dedup([...s.deletedIds.items, id]),
      };
      // Item excluído não faz sentido no push de upsert: tira da fila.
      const pending = s.pending.filter((p) => p.id !== id);
      persist({ ...s, items, deletedIds, pending });
    },
    deleteLista(id) {
      const s = read();
      if (!s.lists.some((l) => l.id === id)) return;
      const cascaded = deleteListaCascade(s, id);
      const removedIds = new Set([id, ...cascaded.deletedIds.items]);
      const deletedIds: DeletedIds = {
        lists: dedup([...s.deletedIds.lists, ...cascaded.deletedIds.lists]),
        items: dedup([...s.deletedIds.items, ...cascaded.deletedIds.items]),
      };
      // Lista/itens excluídos saem da fila de upsert.
      const pending = s.pending.filter((p) => !removedIds.has(p.id));
      persist({ ...s, lists: cascaded.lists, items: cascaded.items, deletedIds, pending });
    },

    async sync() {
      const adapter = getAdapter();
      if (!adapter || !isOnline()) return { pushed: 0, pulled: 0 };
      let s = read();
      let pushed = 0;
      try {
        // 1. Migração do 1º login (se pendente).
        if (!s.migrated) s = enqueueAllAsPending(s);

        // 2. PUSH upserts — aplica a fila ao cloud; limpa pending em sucesso.
        if (s.pending.length > 0) {
          const { lists, items } = pendingRecords(s);
          if (lists.length > 0 || items.length > 0) {
            await adapter.push(lists, items);
            pushed = lists.length + items.length;
          }
          s = { ...s, pending: [] };
        }

        // 3. PUSH hard deletes — exclui no cloud os ids do tombstone local;
        //    limpa deletedIds em sucesso (se a rede falhar, mantém para retry).
        if (s.deletedIds.lists.length > 0 || s.deletedIds.items.length > 0) {
          await adapter.delete(s.deletedIds.lists, s.deletedIds.items);
          s = { ...s, deletedIds: { lists: [], items: [] } };
        }

        // 4. PULL — lê o cloud e merge upsert-only (filtra deletedIds).
        const cloud = await adapter.pull();
        const merged = mergeCache(
          { lists: s.lists, items: s.items, pending: s.pending, deletedIds: s.deletedIds },
          cloud,
        );
        s = {
          ...s,
          lists: merged.lists,
          items: merged.items,
          pending: merged.pending,
          migrated: true,
          lastSyncAt: clock(),
        };
        persist(s);
        return { pushed, pulled: cloud.lists.length + cloud.items.length };
      } catch {
        // Rede falhou no meio: mantém pending + deletedIds; não marca migrated.
        return { pushed, pulled: 0 };
      }
    },

    resetForUser(userId) {
      if (userId === currentUserId) return; // mesma conta: no-op
      // Troca de conta (ou login/logout): descarta o cache da conta anterior
      // apenas se pertencia a outra conta; recarrega do storage no resto.
      const persistedUserId = peekPersistedUserId();
      if (persistedUserId !== null && persistedUserId !== userId) {
        storage.removeItem(STORAGE_KEY);
        state = emptyState(userId);
      } else {
        state = null; // recarrega (mesma conta após reload, ou sem cache).
      }
      currentUserId = userId;
    },
  };
}