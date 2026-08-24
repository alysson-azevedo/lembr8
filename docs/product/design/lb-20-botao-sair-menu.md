# Spec de design/técnica — LB-20: Índice mobile — botão "Sair" → menu "⋮"

**Issue:** [LB-20](https://linear.app/alysson-azevedo/issue/LB-20/ux-mobile-botao-sair-botao-caminho-para-perfil-futuro) · **Tipo:** 🔍 Melhoria · **Prioridade:** nenhuma
**Base:** LB-4 (alvos ≥44px), LB-8 (menu overflow "⋮" + backdrop + roles), LB-12 ("Copiar link", ordenamento não-destrutivo→destrutivo), LB-14 ("Fixar lista"). Filtro da LB-17 vive dentro do `ListasIndex` — **não** no header desta issue.
**Spec de negócio:** `docs/product/lb-20-botao-sair-menu.md` (AC + UX do usuário). **ADRs:** `docs/decisions.md`.

Esta spec fixa **design técnico/visual** (componente client que encapsula o form de logout, acessibilidade completa, estrutura, testes) para o DEV implementar sem inventar. Decisões de negócio/AC não se reabrem. **Sem** mudança em schema/RLS, **sem** nova dependência (sem Radix/HeadlessUI), **sem** novo token de cor.

Arquivos relevantes: `src/app/(app)/page.tsx` (header server do índice), `src/app/(app)/listas/[id]/page.tsx` (header do detalhe — **inalterado**), `src/app/login/actions.ts` (`logout()` = `supabase.auth.signOut()` + `redirect("/login")`), `src/components/listas/ListaScreen.tsx` (padrão do overflow/backdrop).

---

## Princípios

1. **Reutilizar o padrão de overflow do `ListaScreen` (LB-8)**: backdrop invisível `fixed inset-0 z-10`, painel `role="menu"` absoluto `right-0 top-full z-20 mt-1`, itens `role="menuitem" min-h-11`. Cópia conceitual 1:1 em componente novo — não extraia abstração compartilhada agora (2 pontos de uso; 3º usa nasce com o perfil).
2. **Mínimo que entrega valor**: um componente client (`IndexHeaderMenu`) + um item "Sair". Sem refactor, sem unificar headers, sem mudar auth.
3. **Server action preservada bit a bit**: o logout continua `<form action={logout}>` com o `logout` importado de `@/app/login/actions` — o form apenas se muda do `page.tsx` para dentro do componente client.
4. **Touch targets ≥44px** (`min-h-11 min-w-11`) no trigger e no item.

---

## 1. Componente `IndexHeaderMenu` (novo)

**Arquivo:** `src/components/listas/IndexHeaderMenu.tsx` · `"use client"`.

Por que client: o menu precisa de estado (`open`), interação (backdrop, `Esc`) e listeners de teclado. O `page.tsx` do índice **permanece server component** — só troca o `<form>` pelo `<IndexHeaderMenu />`. O header do **detalhe** (`/listas/[id]/page.tsx`) **não muda**: "Sair" visível permanece lá (ver §4).

Razão do "por quê" aqui (vs. só no render): em server component, um form de server action era trivial; em client component continua legal — Next permite `action={serverAction}` em client components (a action é repassada por referência serializável). Nenhum código de auth muda.

### Estrutura

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/login/actions";

/** Trigger "⋮" + menu com "Sair" — header do índice (`/`). */
export function IndexHeaderMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Esc fecha; foco volta ao trigger.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mais opções"
        title="Mais opções"
        className="flex min-h-11 min-w-11 items-center justify-center text-2xl text-muted hover:text-foreground"
      >
        <span aria-hidden="true">⋮</span>
      </button>

      {open ? (
        <>
          {/* Backdrop invisível: clicar fora fecha (mesmo padrão do ListaScreen). */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="menu"
            aria-label="Opções"
            className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded border border-current/20 bg-background py-1"
          >
            {/* Único item (por ora): logout — destrutivo, form server action. */}
            <form action={logout}>
              <button
                type="submit"
                role="menuitem"
                className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-red-600 dark:text-red-400 hover:bg-current/5"
              >
                <span aria-hidden="true">🚪</span> Sair
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
```

### Decisões embutidas

- **Glyph "⋮"** (mesmo do `ListaScreen`) + `title`/`aria-label` **"Mais opções"** (em "Mais opções da lista" — aqui é o menu do índice/conta). O `span aria-hidden` no glyph garante que o nome acessível é só o `aria-label`.
- **Item "Sair" em vermelho** (`text-red-600 dark:text-red-400`): é a ação destrutiva (encerra a sessão). Ícone `🚪` em `span aria-hidden` (não entra no nome acessível — leitor anuncia "Sair").
- **`<form action={logout}>` dentro do menu**: a referência da server action é importada no client component. Funciona igual ao caso server (Next serializa a referência). Sem `useTransition`/pending state — submit redireciona (`/login`); se a rede falhar, o erro de form submission padrão do Next se aplica (não degradamos além do baseline atual, que também é um form submit sem pending UI).
- **Hover affordance**: `hover:bg-current/5` no item (mesma convenção de LB-12/LB-14).
- **`min-w-44` no painel**: largura mínima consistente com o overflow do `ListaScreen`.
- **z-index**: backdrop `z-10`, painel `z-20` (abaixo do `z-50` do `ConfirmDialog`/`Toast`, que não são usados no índice hoje — sem conflito).
- **Ponto de extensão p/ perfil** (fora de escopo agora): trocar o `span` do glyph por um avatar e/ou adicionar itens acima do "Sair" (não-destrutivo antes do destrutivo). Nenhum hook/placeholder de perfil é criado — comentário no código basta.

### Acessibilidade

- Trigger: `aria-haspopup="menu"`, `aria-expanded` refletindo o estado, nome acessível via `aria-label`.
- Menu: `role="menu"` + `aria-label`; item com `role="menuitem"`.
- Fechamento: backdrop (clique fora), `Esc` (listener com cleanup). Focus: `Esc` devolve foco ao trigger; backdrop/tab não são focáveis (`tabIndex={-1}` no backdrop).
- Touch: `min-h-11 min-w-11` no trigger, `min-h-11 w-full` no item → 44px (LB-4).

---

## 2. Mudança no `src/app/(app)/page.tsx`

Substituir o bloco `<form action={logout}>…</form>` por `<IndexHeaderMenu />` e remover o import de `logout`. Estrutura final:

```tsx
import { IndexHeaderMenu } from "@/components/listas/IndexHeaderMenu";
import { ListasIndex } from "@/components/listas/ListasIndex";

export default function IndexPage() {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Lembr8</h1>
          <p className="mt-2 text-muted">Suas listas</p>
        </div>
        <IndexHeaderMenu />
      </div>

      <ListasIndex />
    </>
  );
}
```

- O `div` de header (`flex items-start justify-between gap-4`) permanece — o trigger alinha à direita como o "Sair" alinhava.
- Comentário do cabeçalho do arquivo: atualizar para mencionar o menu "⋮" no lugar do "Sair" (header "Lembr8"/"⋮" (menu com "Sair")).

---

## 3. O que NÃO muda

- `src/app/login/actions.ts` — `logout()` idêntico (signOut + `redirect("/login")`).
- `src/app/(app)/listas/[id]/page.tsx` — header do detalhe com "Sair" visível permanece (AC 7). O overflow "⋮" do `ListaScreen` permanece exclusivo das ações de lista (Fixar/Copiar link/Excluir).
- Nenhum token de cor novo; paleta `--background/--foreground/--muted` + `text-red-600 dark:text-red-400` (existentes).
- Nenhuma dependência nova.

---

## 4. Por que sem confirmação de logout

AC 4 do negócio fixa: acionar "Sair" no menu executa o logout direto. Justificativa: mover a ação para dentro do menu já a transforma de "1 toque acidental em header" em "2 toques intencionais" (abrir menu → tocar "Sair"), o que é o padrão de apps mobile e adequado para uma ação raramente acionada. Adicionar `ConfirmDialog` seria um 3º passo redundante para uma ação reversível (login de novo é rápido) — se surgir feedback em QA/preview, `ConfirmDialog` já existe para reuso trivial, mas **não entra** nesta issue.

---

## 5. Estados

| Estado | Comportamento |
| --- | --- |
| **Menu fechado** | só o trigger "⋮" no canto superior direito. |
| **Menu aberto** | painel com "Sair" abaixo/alinhado à direita do trigger; backdrop cobre a tela; qualquer clique fora fecha. |
| **Acionar "Sair"** | submit do form → `logout()` → `redirect("/login")`. A transição de página é o único feedback (igual ao baseline atual). |
| **Esc** | fecha o menu e devolve o foco ao trigger. |
| **Mobile** | trigger `min-h-11 min-w-11`, item `min-h-44px`; painel `min-w-44` não transborda o container `max-w-[28rem]`. |
| **Desktop** | sem mudança visual além do header; hover affordance no trigger/item. |
| **Falha de rede no submit** | erro de form submission padrão do Next — idêntico ao baseline atual (que também não tem pending UI). Não tratamos nesta issue. |

---

## 6. Testes (notas para DEV/QA)

**Render/estrutura (jsdom/testing-library):**
- O header do índice **não** contém um botão "Sair" direto (AC 1): `queryByRole("button", { name: "Sair" })` é nulo até o menu abrir.
- Trigger "Mais opções" renderiza com `aria-haspopup="menu"` e `aria-expanded=false` (AC 2).

**Interação:**
- Clicar no trigger → menu aparece com item "Sair" (`role=menuitem`), `aria-expanded=true` (AC 2). O form do item aponta para a action de logout (mock: `logout` spy — assert que o form `action` está ligado à action importada; em teste, basta verificar que o submit é disparado).
- Clicar no backdrop → fecha (AC 4). Pressionar `Esc` → fecha e foco volta ao trigger (AC 4).
- Item "Sair" tem `min-h-11`; trigger tem `min-h-11 min-w-11` (AC 5).
- Ordem/único item: menu contém exatamente um `menuitem` ("Sair") (AC 6 — sem perfil).

**Não-regressão (AC 7):**
- `src/app/(app)/listas/[id]/page.tsx` ainda renderiza o botão "Sair" visível no header (teste existente que já cobria "Sair" no detalhe, se houver, deve permanecer verde; se a suíte tinha teste do "Sair" no índice, atualizar para o novo fluxo via menu).
- Fluxos de índice: criar lista (1 toque), filtro por nome (LB-17), pin (LB-14), "Arquivadas" (LB-16) — intactos (`ListasIndex` inalterado).

**Arquivo de teste sugerido:** `tests/index-header-menu.ui.test.tsx` (seguindo o padrão `tests/*.ui.test.tsx` do repo).

---

## 7. Resumo das decisões de design

| Decisão | Escolha |
| --- | --- |
| Onde fica o trigger | canto superior direito do header do índice (`/`), no lugar do "Sair" |
| Trigger | client component `IndexHeaderMenu`, glyph "⋮", `aria-haspopup`/`aria-expanded`, `min-h-11 min-w-11` |
| Menu | `role="menu"`, painel `absolute right-0 top-full z-20 mt-1 min-w-44`, backdrop `fixed inset-0 z-10` (clique fora fecha) |
| Item | "Sair" · `role="menuitem"` · vermelho destrutivo · `🚪` aria-hidden · `min-h-11 w-full` · `<form action={logout}>` |
| Logout | server action `logout()` **inalterada** (signOut + redirect `/login`) |
| Confirmação | não (2 toques intencionais; reversível) |
| Escopo de tela | apenas `/` (detalhe `/listas/[id]` inalterado) |
| Perfil | fora de escopo — trigger é o ponto de extensão apenas |
| Deps/tokens | nenhuma nova / nenhum novo token |
| Server vs client | `page.tsx` permanece server; `IndexHeaderMenu` é o único client novo |
