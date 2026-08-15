# Spec de design — LB-12: Copiar link da lista no menu overflow

**Issue:** [LB-12](https://linear.app/alysson-azevedo/issue/LB-12/copiar-link-compartilhar-lista-no-menu-overflow) · **State:** 📑 Spec → 🚧 Dev in progress · **Tipo:** 🔍 Melhoria · **Prioridade:** baixa
**Base:** LB-8 (✅ Deployed v0.5.0) — menu overflow "⋮" no cabeçalho do detalhe (`/listas/[id]`) já expõe "🗑️ Excluir lista". LB-4 (alvos 44px), LB-6 (Supabase, RLS por `auth.uid()`).
**Spec de negócio:** `docs/product/lb-12-copiar-link-lista.md` (AC + UX do usuário). **ADRs:** `docs/decisions.md`.

Esta spec fixa **design técnico/visual** (item de menu, mecanismo de clipboard, componente de toast, estados de erro) para o DEV implementar sem inventar. Decisões de negócio/AC não se reabrem. **Sem** mudança em RLS/schema, **sem** nova dependência (sem Radix/HeadlessUI/sonner), **sem** novo token de cor.

Arquivos atuais relevantes: `src/components/listas/ListaScreen.tsx` (menu overflow + `ConfirmDialog`), `src/components/ui/ConfirmDialog.tsx`, `src/app/globals.css` (tokens `--background/--foreground/--muted`).

---

## Princípios

1. **Reutilizar o menu overflow existente (LB-8)**: a ação "Copiar link" é um novo `menuitem` dentro do mesmo menu "⋮" já renderizado em `ListaScreen`. Sem UI estrutural nova, sem novo componente de menu, sem nova dependência.
2. **Mínimo que entrega valor**: uma ação de menu, um helper de clipboard com fallback, um componente de toast reutilizável. Sem Web Share API (fora de escopo de negócio), sem dialog, sem confirmação (ação não destrutiva).
3. **Não destrutiva antes da destrutiva**: "Copiar link" vem **acima** de "🗑️ Excluir lista" no menu (mesmo princípio de ordenamento já adotado em LB-8 §2.2).
4. **Local e offline**: a cópia é puramente de clipboard — não chama o Supabase, não depende de conexão. Erro de permissão é tratado com toast, não com crash.
5. **Consistência visual LB-2..LB-8**: paleta `--background/--foreground/--muted`, bordas `border-current/20`, alvos `min-h-11` (44px, LB-4), dark mode por `prefers-color-scheme`. Sem novos tokens; o vermelho de "destrutivo" continua `text-red-600 dark:text-red-400` (LB-8), só no item de excluir.

---

## 1. Item de menu "Copiar link"

Dentro do menu overflow "⋮" existente em `ListaScreen` (`src/components/listas/ListaScreen.tsx`, bloco `{menuAberto ? (...)}`), adicionar um `menuitem` **acima** do `menuitem` "🗑️ Excluir lista" (já existente). Estrutura idêntica ao item existente, trocando só o ícone, o texto e a cor (não destrutiva = cor padrão, sem `text-red-...`):

```
<div role="menu" aria-label="Opções da lista"
  className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded border border-current/20 bg-background py-1">

  {/* NOVO — Copiar link (não destrutivo, vem primeiro) */}
  <button type="button" role="menuitem"
    onClick={onCopiarLink}
    className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-foreground hover:bg-current/5">
    <span aria-hidden="true">🔗</span> Copiar link
  </button>

  {/* EXISTENTE — Excluir lista (destrutivo, vermelho, mantido) */}
  <button type="button" role="menuitem"
    onClick={() => { setMenuAberto(false); setConfirmacao({ tipo: "lista", alvo: lista }); }}
    className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-red-600 dark:text-red-400">
    <span aria-hidden="true">🗑️</span> Excluir lista
  </button>
</div>
```

Detalhes:
- `onCopiarLink` fecha o menu **antes** de copiar (igual ao item de excluir, que fecha e abre o diálogo): `onClick={() => { setMenuAberto(false); copiarLink(); }}`. O fechamento é síncrono; o toast aparece sobre a tela de lista já sem o menu (AC 4).
- **Ícone:** `🔗` (emoji Unicode, sem lib) em `<span aria-hidden="true">` — meramente visual, não entra no nome acessível (leitor de tela anuncia "Copiar link"). `gap-2` separa ícone e texto, igual ao item de excluir.
- **Cor:** `text-foreground` (não destrutiva). Adiciona `hover:bg-current/5` ao item de copiar; **aplicar o mesmo `hover:bg-current/5` ao item de excluir** para consistência de affordance (ambos realçam ao passar o cursor). O `text-red-600 dark:text-red-400` do item de excluir permanece.
- **Alvo/touch:** `min-h-11 w-full` (44px de altura, LB-4). Sem mudança no botão "⋮" nem no backdrop.

**Ordenação no menu (AC 1 + princípio 3):**

| # | Item | Cor | Ação |
| - | ---- | --- | ---- |
| 1 | 🔗 Copiar link | `text-foreground` (padrão) | copia URL + fecha menu + toast |
| 2 | 🗑️ Excluir lista | `text-red-600 dark:text-red-400` | fecha menu + abre `ConfirmDialog` (existente) |

---

## 2. URL copiada (deep link)

- A URL copiada é a rota pública da lista: `${origin}/listas/${listId}` (ex.: `https://lembr8.app/listas/abc123`).
- **Origem:** `origin` = `typeof window !== "undefined" ? window.location.origin : ""`. Em SSR o botão não é renderizado (o menu só existe após hidratação, quando `lista` existe), então `window` está sempre disponível no clique — mas o helper guarda contra `undefined` (retorna `false` sem copiar se não houver `window`/`clipboard`).
- **`listId`** = `lista.id` (já disponível no escopo de `ListaScreen`). Não usa o id de rota (`params.id`) direto — usa o `lista.id` carregado/hidratado, coerente com o fluxo de deep-link já tratado em LB-8 §4 (lista inexistente/excluída → redireciona a `/`).

---

## 3. Mecanismo de clipboard (`copiarLinkLista`)

**Helper novo:** `src/lib/clipboard/copyLink.ts` (puro, testável em jsdom sem DOM real). Sem dependência externa.

```ts
/**
 * Copia `text` para a área de transferência.
 * Preferência: navigator.clipboard.writeText (async, contexto seguro).
 * Fallback: textarea temporária + document.execCommand("copy") (contexto não seguro / browser antigo / permissão negada).
 * @returns true se copiou, false caso contrário (caller decide o toast).
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

/** Monta o deep link da lista e copia. */
export function listaDeepLink(listId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/listas/${listId}`;
}
```

- **Por que dois caminhos:** `navigator.clipboard.writeText` é o padrão moderno, mas (a) exige contexto seguro (HTTPS ou `localhost`) e (b) pode ser bloqueado por permissão/falta de foco. O fallback `execCommand("copy")` (deprecated porém onipresente) cobre iOS Safari antigo, contextos não seguros e bloqueios de permissão. **Sem** Web Share API (fora de escopo).
- **Retorna boolean** — o caller decide o toast de sucesso vs. erro, centralizando a decisão de UI (§5).
- **Não lança** — todo erro vira `false`. Nenhum caminho rejeita a promise (o `catch` interno absorve).

---

## 4. Componente de toast (`Toast`)

**Componente novo e reutilizável:** `src/components/ui/Toast.tsx` (`"use client"`). Inline com Tailwind, acessível, sem dependência externa. Reutiliza os tokens existentes; o toast usa a paleta **invertida** (pill escura sobre o fundo claro, e clara sobre o fundo escuro) para contraste sem novo token.

**Props:**
```ts
type ToastProps = {
  open: boolean;
  message: string;
  /** Duração em ms até auto-fechar. Default 2500. */
  durationMs?: number;
  onClose: () => void;
};
```

**Estrutura:**
```
{open ? (
  <div role="status" aria-live="polite"
    className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
    <div className="pointer-events-auto max-w-sm rounded-full border border-current/10 bg-foreground px-4 py-2 text-center text-base text-background shadow-lg">
      {message}
    </div>
  </div>
) : null}
```

Detalhes:
- `role="status" aria-live="polite"` — leitor de tela anuncia a mensagem sem interromper; o toast não rouba o foco (ação confirmatória, não um diálogo).
- **Pill invertida:** `bg-foreground text-background` — texto legível em ambos os temas sem novo token (foreground/background são o par já definido). Borda `border-current/10` sutil. `rounded-full` para affordance efêmero/distinta de card.
- `bottom-6` (24px) — claro das barras de navegação inferior do navegador/mobile; centralizado (`inset-x-0 flex justify-center`).
- `pointer-events-none` no wrapper, `pointer-events-auto` na pill — o toast não bloqueia cliques na tela atrás dele.
- `max-w-sm` + `px-4` — mensagens curtas ("Link copiado", "Não foi possível copiar o link") cabem em uma linha; quebra em telas muito estreitas sem transbordar.
- **Auto-fechamento:** `useEffect` que, quando `open` vira `true`, arma um `setTimeout(onClose, durationMs)` e limpa no unmount/`open→false`. Default `2500ms` (AC 3 — desaparece sozinho). Sem animação de entrada/saída (mínimo que entrega valor; pode ser adicionada depois sem mudar a API).

**Uso em `ListaScreen`:** estado local `toast: { message: string } | null`. `open = toast !== null`. `onClose={() => setToast(null)}`. Um único `<Toast>` no rodapé do componente serve para sucesso e erro (só muda a `message`).

> Nota: o `ConfirmDialog` (LB-8) usa `z-50` no overlay; o toast também usa `z-50` mas é `pointer-events-none` e `bottom-6`, então não conflita com o diálogo (que está centralizado e fecha o menu antes de o toast aparecer — as duas nunca coexistem para LB-12).

---

## 5. Integração em `ListaScreen`

**Estado novo:**
```ts
const [toast, setToast] = useState<{ message: string } | null>(null);
```

**Handler de copiar:**
```ts
const onCopiarLink = async () => {
  setMenuAberto(false);                       // fecha o menu (AC 4)
  const ok = await copyToClipboard(listaDeepLink(lista.id));
  setToast({ message: ok ? "Link copiado" : "Não foi possível copiar o link" });
};
```

- O `await` é intencional: o toast aparece só depois de saber o resultado. Como `copyToClipboard` nunca rejeita, o `setToast` sempre roda (sem try/catch extra).
- **Menu fecha síncrono** (`setMenuAberto(false)` antes do `await`): o usuário vê o menu sumir imediatamente; o toast surge ~instantes depois (a cópia é local/sub-ms na maioria dos casos).

**Render:** `<Toast open={toast !== null} message={toast?.message ?? ""} onClose={() => setToast(null)} />` no fim do JSX de `ListaScreen`, após o `ConfirmDialog` existente.

**Imports novos em `ListaScreen`:** `copyToClipboard`, `listaDeepLink` de `src/lib/clipboard/copyLink`; `Toast` de `src/components/ui/Toast`. Nenhum import de `supabase`/`localStorage` (UI isolada do storage — LB-8 §5).

---

## 6. Estados

| Estado | Comportamento |
| ------ | ------------- |
| **Sucesso** | `copyToClipboard` → `true` → toast "Link copiado", some em ~2,5s. Menu já fechado (AC 2, 3, 4). |
| **Permissão de clipboard negada / contexto não seguro** | `navigator.clipboard.writeText` rejeita → fallback `execCommand` tenta. Se o fallback também falhar → `false` → toast "Não foi possível copiar o link" (AC não exige sucesso em todo contexto; erro é tratado, não crash). |
| **Browser sem clipboard nenhum (raro)** | ambos os caminhos retornam `false` → toast de erro. |
| **Offline** | a cópia funciona normalmente (clipboard é local, não chama o Supabase — AC 6). |
| **Lista inexistente/excluída** | o menu "⋮" não é renderizado (`lista` é `null` → cabeçalho/menu não aparecem, LB-8 §4 já redireciona a `/`). Logo o handler nunca roda sem `lista`. Sem guard extra. |
| **Loading** | não se aplica — ação síncrona/local, sem spinner. |

**Acessibilidade:** o item de menu segue o padrão `role="menuitem"` do menu existente; o toast usa `role="status" aria-live="polite"` (anúncio não intrusivo). O fluxo é operável por teclado pelo menu (foco já gerenciado pelo backdrop/`⋮` existente — sem mudança de foco nova).

---

## 7. Testes (notas para DEV/QA)

**Helper `copyToClipboard` (jsdom):**
- Com `navigator.clipboard.writeText` mockado resolvendo → retorna `true`, chama `writeText` uma vez com o texto correto.
- `writeText` rejeitando (permissão negada) → cai no fallback `execCommand("copy")` (mock `document.execCommand` → `true`) → retorna `true`.
- Sem `navigator.clipboard` e `execCommand` → `false` → `false` (sem throw).
- `listaDeepLink("abc")` em jsdom → `${origin}/listas/abc` (jsdom define `window.location.origin`).

**UI (jsdom/testing-library):**
- Menu "⋮" expõe "Copiar link" **acima** de "Excluir lista" (ordem no DOM: `menuitem` "Copiar link" antes do "Excluir lista").
- Clicar em "Copiar link": fecha o menu (`menuAberto` false), chama `copyToClipboard(listaDeepLink(id))`, renderiza `<Toast>` com "Link copiado".
- `copyToClipboard` retornando `false` → toast "Não foi possível copiar o link".
- Toast some após `durationMs` (avançar timer fake) → `onClose` → `toast === null`.
- Sem regressão: "🗑️ Excluir lista" continua abrindo o `ConfirmDialog` (LB-8).

**Sem regressão (AC 5/6/7/8):** fluxos de criar/marcar/renomear (LB-6), múltiplas listas (LB-5), UX mobile (LB-4) e exclusão (LB-8) preservados em desktop e mobile. Nenhum import de `supabase`/`localStorage` nos componentes; só `store` (e o novo `clipboard` helper). Nenhuma mudança em RLS/schema.

---

## 8. Resumo das decisões de design

| Decisão | Escolha |
| --- | --- |
| Onde entra a ação | Novo `menuitem` no menu overflow "⋮" existente (LB-8), acima de "🗑️ Excluir lista" |
| Item de menu | `🔗 Copiar link`, `role="menuitem"`, `min-h-11`, `gap-2`, cor `text-foreground`, `hover:bg-current/5` (aplicado aos dois itens) |
| URL copiada | `${origin}/listas/${lista.id}` (deep link, só dono logado — RLS unchanged) |
| Clipboard | `navigator.clipboard.writeText` com fallback `textarea + execCommand("copy")`; retorna boolean; sem Web Share |
| Feedback | `<Toast>` reutilizável inline, pill invertida `bg-foreground text-background`, `role="status" aria-live="polite"`, auto-fecha 2,5s |
| Estado de erro | toast "Não foi possível copiar o link" (permissão/contexto), sem crash |
| Menu após ação | fecha síncrono antes do toast (AC 4) |
| Dependências | nenhuma nova (sem Radix/HeadlessUI/sonner) |
| Tokens de cor | nenhum novo; reutiliza `--background/--foreground/--muted` + `text-red-600 dark:text-red-400` (existente) |
| Storage/RLS | sem mudança (UI não toca Supabase/schema) |