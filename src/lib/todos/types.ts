/**
 * Modelo de dados e contrato da camada única de acesso aos dados do todo
 * (LB-3). A UI consome apenas `TodoRepository` — nunca o storage diretamente.
 * Trocar localStorage por Supabase é um novo adapter implementando esta
 * interface, sem tocar a UI (critério de aceite 6).
 */

export type TodoItem = {
  id: string;
  texto: string;
  concluido: boolean;
};

/** Contrato da camada de acesso aos dados. */
export interface TodoRepository {
  /** Itens em ordem de inserção. */
  list(): TodoItem[];
  /** Adiciona um item ao final da lista e o retorna; `null` se o texto for vazio. */
  add(texto: string): TodoItem | null;
  /** Alterna concluído / a fazer do item com o id dado. */
  toggle(id: string): void;
}