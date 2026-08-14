/**
 * Modelo de dados e contrato da camada única de acesso aos dados (LB-5).
 * Evolução do MVP de lista única (LB-3) para múltiplas listas: `Lista` + `Item`.
 * A UI consome apenas `ListasRepository` (via `store`) — nunca o storage direto.
 * Trocar localStorage por Supabase é um novo adapter implementando esta
 * interface, sem tocar a UI.
 */

export type Lista = {
  id: string;
  nome: string;
};

export type Item = {
  id: string;
  listId: string;
  texto: string;
  concluido: boolean;
};

/** Resultado de adicionar um texto a uma lista (reutilização/duplicado). */
export type AddOutcome =
  | { kind: "created"; item: Item }
  | { kind: "reactivated"; item: Item }
  | { kind: "duplicate"; existingId: string };

/** Entrada do índice de listas com a contagem de a-fazer. */
export type ListaIndex = {
  id: string;
  nome: string;
  aFazer: number;
};

/**
 * Tombstone local de exclusão (LB-8, ADR 2026-08-14): ids excluídos no cache
 * local para evitar ressuscitação no device de origem após o sync. **Não** é
 * schema do cloud — vive só no cache localStorage (formato v4). No push do sync
 * executa hard `DELETE` no cloud para esses ids; no pull/merge (upsert-only),
 * ids aqui são filtrados ao reimportar do cloud.
 */
export type DeletedIds = { lists: string[]; items: string[] };

/** Contrato da camada de acesso aos dados. */
export interface ListasRepository {
  /** Listas em ordem de criação. */
  listListas(): Lista[];
  /** Índice de listas com contagem de a-fazer (para a tela `/`). */
  listIndex(): ListaIndex[];
  /** Lista pelo id, ou `null` se não existir. */
  getLista(id: string): Lista | null;
  /** Itens da lista em ordem de exibição: a-fazer (inserção) ++ concluídos (conclusão). */
  listItems(listId: string): Item[];
  /** Cria uma lista com o nome dado e a retorna. */
  createList(nome: string): Lista;
  /** Renomeia a lista; no-op se não existir. */
  renameList(id: string, nome: string): void;
  /** Adiciona um texto à lista aplicando reutilização/duplicado (§7 da spec). */
  addItem(listId: string, texto: string): AddOutcome;
  /** Alterna concluído / a fazer do item, movendo entre as seções. */
  toggleItem(id: string): void;
  /** Hard delete do item: remove do cache e marca o id como excluído (tombstone local). */
  deleteItem(id: string): void;
  /** Hard delete da lista em cascade: remove a lista e seus itens do cache e marca os ids. */
  deleteLista(id: string): void;
  /** Sincroniza com o cloud (push dos pendentes + pull/merge por `updated_at`). */
  sync(): Promise<{ pushed: number; pulled: number }>;
  /** Reinicia o cache para outra conta (isolamento no login/logout). */
  resetForUser(userId: string | null): void;
}