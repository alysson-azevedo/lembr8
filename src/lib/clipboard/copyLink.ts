/**
 * Clipboard + deep link da lista (LB-12).
 *
 * Helper puro, testável em jsdom sem DOM real. Sem dependência externa.
 * Preferência: `navigator.clipboard.writeText` (async, contexto seguro).
 * Fallback: `textarea` temporária + `document.execCommand("copy")` (contexto
 * não seguro / browser antigo / permissão negada).
 *
 * Nunca lança: todo erro vira `false` — o caller decide o toast (sucesso/erro).
 */

/**
 * Copia `text` para a área de transferência.
 * @returns `true` se copiou, `false` caso contrário.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Caminho preferencial — Clipboard API (requer contexto seguro).
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permissão negada ou contexto não seguro — cai no fallback.
    }
  }
  // Fallback — textarea + execCommand.
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Monta o deep link da lista: `${origin}/listas/${listId}`.
 * Só dono logado abre (RLS por `auth.uid()` — sem mudança, LB-12).
 */
export function listaDeepLink(listId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/listas/${listId}`;
}