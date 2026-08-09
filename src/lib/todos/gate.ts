/**
 * Gate de acesso à home (`/`). Pure — testável sem DOM nem Supabase.
 * Deslogado é redirecionado ao login; logado vê a lista de tarefas
 * (critério de aceite 1).
 */
export type HomeGate = "redirect-login" | "show-list";

export function homeGate(user: { id: string } | null): HomeGate {
  return user ? "show-list" : "redirect-login";
}