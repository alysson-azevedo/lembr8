# Spec de design — LB-16: Arquivar listas (submenu: listas arquivadas somem da tela inicial)

**Issue:** [LB-16](https://linear.app/alysson-azevedo/issue/LB-16/arquivar-listas-submenu-listas-arquivadas-somem-da-tela-inicial) · **State:** 📑 Spec → 🚧 Dev in progress · **Tipo:** 🧹 Tarefa
**Base:** LB-5 (índice em `/`), LB-6 (Supabase + cache local-first, sync por `updated_at`), LB-7 (sync pós-mutação), LB-8 (menu overflow "⋮" no detalhe + `ConfirmDialog` + rework "ações de lista só no detalhe" + `deletedIds`), LB-12 (item "Copiar link" no menu), LB-14 (item "Fixar/Desfixar lista" no menu + índice em seções Fixadas/Demais + `pinned`).
**Spec de negócio:** issue LB-16 (AC + decisões de produto do PO). **ADRs:** `docs/decisions.md`.

Esta spec fixa **design de UI/UX** (affordance de arquivar/desarquivar, localização da entrada "Arquivadas", confirmação prévia, estados visuais, textos) para o DEV implementar sem inventar. Decisões de negócio/AC não se reabrem. **Forma do campo `archived_at` no schema** (timestamp puro vs. booleano derivado), **migration**, **RLS** e **sync/merge** são do 🤖 DEV — esta spec define apenas o **contrato de leitura da UI** (o que a UI lê/chama) e o **comportamento visual**. **Sem** nova dependência (sem Radix/HeadlessUI), **sem** novo token de cor.

Arquivos atuais relevantes: `src/components/listas/ListasIndex.tsx` (índice), `src/components/listas/ListaScreen.tsx` (menu overflow "⋮" + `ConfirmDialog`), `src/components/ui/ConfirmDialog.tsx` (reutilizável), `src/app/(app)/page.tsx` (header "Lembr8"/"Sair"), `src/app/(app)/listas/[id]/page.tsx` (header "← Listas"/"Sair"), `src/lib/todos/{types,store,repository}.ts`, `src/app/globals.css` (tokens `--background/--foreground/--muted`).

---

## Princípios

1. **Reutilizar o padrão visual LB-2..LB-14**: paleta `--background/--foreground/--muted`, bordas `border-current/20`, `divide-current/10`, alvos `min-h-11` (44px, LB-4), dark mode por `prefers-color-scheme`. Sem novos tokens de cor; o vermelho de "destrutivo" continua `text-red-600 dark:text-red-400` (LB-8), só no item de excluir.
2. **Mínimo que entrega valor**: um toggle de arquivar/desarquivar por lista no menu overflow existente (LB-8/LB-12/LB-14), um `ConfirmDialog` reutilizado para a confirmação prévia ao arquivar (PO decisão (a) — apenas aviso, não gate destrutivo), e uma rota/entrada "Arquivadas" alcançável a partir do índice. Sem undo-toast, sem animação, sem drag, sem nova dependência.
3. **Arquivar é não destrutivo, mas pede confirmação prévia** (PO decisão (a)): diferentemente de fixar (LB-14, sem confirmação), arquivar faz a lista **sumir da tela inicial** — o usuário pode não querer isso por acidente. A confirmação é um **aviso** ("Esta lista sairá da tela inicial e ficará em Arquivadas"), não um gate destrutivo. **Desarquivar não pede confirmação** (a lista volta à tela inicial — reversão trivial, mesmo princípio de fixar).
4. **Ações de lista no detalhe, estado no índice**: o overflow "⋮" do detalhe continua sendo o lar das ações de lista (LB-8 rework, LB-12, LB-14). O toggle de arquivar/desarquivar vive **no menu overflow do detalhe** — nunca no índice (o índice é navegação pura + indicadores de estado, rework LB-8). A lista arquivada some do índice, então o toggle de desarquivar vive no menu overflow do detalhe da lista arquivada, acessível pela rota "Arquivadas".
5. **UI isolada do storage**: a UI chama `archiveLista(id)` / `unarchiveLista(id)` no `store` e lê `archived` (ou `archivedAt`) via `useListas`/`useLista` — nunca `localStorage`/Supabase direto. O índice filtra arquivadas via `listIndex()` (que já particiona por `pinned`; agora também exclui arquivadas). A lista de arquivadas vem de uma nova leitura `listArchived()` no store.

---

## 1. Affordance no detalhe (`/listas/[id]`) — `ListaScreen`

### 1.1 Item de menu "Arquivar lista" / "Desarquivar lista"
Dentro do menu overflow "⋮" existente em `ListaScreen`, adicionar um `menuitem` **abaixo de "Fixar/Desfixar" e "Copiar link"** e **acima de "🗑️ Excluir lista"** (não destrutivo antes do destrutivo — mesmo princípio de ordenamento de LB-8/LB-12/LB-14). O texto alterna conforme o estado (AC 5):

```
<div role="menu" aria-label="Opções da lista"
  className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded border border-current/20 bg-background py-1">

  {/* LB-14 — Fixar/Desfixar (existente, mantido) */}
  <button type="button" role="menuitem"
    onClick={() => { setMenuAberto(false); togglePinLista(lista.id); }}
    className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-foreground hover:bg-current/5">
    <span aria-hidden="true">📌</span> {lista.pinned ? "Desfixar lista" : "Fixar lista"}
  </button>

  {/* LB-12 — Copiar link (existente, mantido) */}
  <button type="button" role="menuitem" onClick={onCopiarLink}
    className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-foreground hover:bg-current/5">
    <span aria-hidden="true">🔗</span> Copiar link
  </button>

  {/* NOVO — LB-16 — Arquivar/Desarquivar (não destrutivo, toggle — texto reflete o estado). */}
  <button type="button" role="menuitem"
    onClick={() => {
      setMenuAberto(false);
      if (lista.archived) {
        unarchiveLista(lista.id);          // desarquivar: sem confirmação (reversão trivial)
      } else {
        setConfirmacao({ tipo: "archive", alvo: lista }); // arquivar: abre ConfirmDialog de aviso
      }
    }}
    className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-foreground hover:bg-current/5">
    <span aria-hidden="true">🗃️</span> {lista.archived ? "Desarquivar lista" : "Arquivar lista"}
  </button>

  {/* LB-8 — Excluir lista (destrutivo, vermelho, mantido) */}
  <button type="button" role="menuitem"
    onClick={() => { setMenuAberto(false); setConfirmacao({ tipo: "lista", alvo: lista }); }}
    className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-red-600 dark:text-red-400 hover:bg-current/5">
    <span aria-hidden="true">🗑️</span> Excluir lista
  </button>
</div>
```

Detalhes:
- **Texto reflete o estado (AC 5):** `lista.archived ? "Desarquivar lista" : "Arquivar lista"`. O `🗃️` é o mesmo nos dois estados (emoji sem variante confiável); o estado vem do texto + da localização da lista (índice vs "Arquivadas").
- **Sem confirmação para desarquivar (PO (a), AC 5):** `onClick` fecha o menu e chama `unarchiveLista(lista.id)` direto. A lista volta à tela inicial imediatamente — reversão trivial, mesmo padrão de fixar (LB-14).
- **Confirmação só para arquivar (PO (a), AC 1):** `onClick` fecha o menu e abre o `ConfirmDialog` com texto de aviso (§2). Confirmar → `archiveLista(lista.id)`; a lista some do índice.
- **Cor:** `text-foreground` (não destrutiva, mesmo com confirmação prévia — o `destructive` do `ConfirmDialog` fica `false`).
- **Alvo/touch:** `min-h-11 w-full`, `gap-2` (igual aos itens existentes).
- **Menu fecha síncrono** antes da mutação/diálogo (`setMenuAberto(false)` primeiro).
- **Sem mudança no botão "⋮", no backdrop nem nos itens existentes** (LB-8/LB-12/LB-14 intactos).

### 1.2 Ordenação do menu (resultado)

| # | Item | Cor | Ação |
| - | ---- | --- | ---- |
| 1 | 📌 Fixar lista / Desfixar lista (LB-14) | `text-foreground` | toggle `pinned` + fecha menu |
| 2 | 🔗 Copiar link (LB-12) | `text-foreground` | copia URL + fecha menu + toast |
| 3 | 🗃️ Arquivar lista / Desarquivar lista (NOVO) | `text-foreground` | arquivar: abre `ConfirmDialog` (aviso); desarquivar: `unarchiveLista` + fecha menu |
| 4 | 🗑️ Excluir lista (LB-8) | `text-red-600 dark:text-red-400` | abre `ConfirmDialog` destrutivo |

> **Invariante de ordem:** não destrutivos acima do destrutivo; dentro dos não destrutivos, a ordem segue a cronologia de introdução (Fixar → Copiar → Arquivar) por consistência histórica.

---

## 2. Confirmação prévia ao arquivar (`ConfirmDialog` reutilizado)

Reutilizar o `ConfirmDialog` existente (`src/components/ui/ConfirmDialog.tsx`, LB-8). **Sem novo componente.** A confirmação de arquivar é um **aviso** (não destrutiva), então `destructive={false}` — o botão de confirmar fica na cor padrão (`text-foreground`), não vermelho.

### 2.1 Estado de confirmação em `ListaScreen`
Estender o tipo `Confirmacao` existente para incluir "archive":

```ts
type Confirmacao =
  | { tipo: "item"; alvo: Item }
  | { tipo: "lista"; alvo: Lista }
  | { tipo: "archive"; alvo: Lista };   // NOVO — arquivar (aviso, não destrutivo)
```

### 2.2 Textos do diálogo (fixos nesta spec)

| Caso | title | description | confirmLabel | destructive |
| ---- | ----- | ----------- | ------------ | ----------- |
| Arquivar lista | "Arquivar lista?" | `Arquivar "{nome}"? Ela sairá da tela inicial e ficará em Arquivadas. Você pode desarquivar a qualquer momento.` | "Arquivar" | false |
| Excluir item (LB-8) | "Excluir item?" | `Excluir "{texto}" da lista? Esta ação não pode ser desfeita.` | "Excluir" | true |
| Excluir lista (LB-8) | "Excluir lista?" | `Excluir "{nome}" e todos os seus itens? Esta ação não pode ser desfeita.` | "Excluir lista" | true |

A descrição de arquivar **deixa claro que é reversível** ("Você pode desarquivar a qualquer momento") — reforça que não é destrutivo, alinhado ao PO (a). Cancelar/Esc/overlay abortam e nada muda (AC 1).

### 2.3 Handler de confirmar
Estender `confirmarExclusao` existente (ou criar `confirmarAcao` que cubra os três tipos):

```ts
function confirmarAcao() {
  if (!confirmacao) return;
  if (confirmacao.tipo === "item") {
    deleteItem(confirmacao.alvo.id);
  } else if (confirmacao.tipo === "lista") {
    deleteLista(confirmacao.alvo.id);
    router.replace("/");
  } else if (confirmacao.tipo === "archive") {
    archiveLista(confirmacao.alvo.id);
    // Se estiver na tela da lista arquivada, o usuário permanece na tela;
    // o menu agora lê "Desarquivar lista" e o índice (ao voltar) não a mostra.
  }
  setConfirmacao(null);
}
```

- **Após arquivar, o usuário permanece na tela da lista** (não redireciona). A lista agora está arquivada; o menu "⋮" passa a ler "Desarquivar lista"; ao voltar ao índice (`/`), a lista não aparece. O usuário pode desarquivar imediatamente no mesmo menu se mudou de ideia — reversão sem fricção (PO (a)).
- **Não há redirect para "Arquivadas"** após arquivar — o usuário estava numa lista ativa e o contexto da tela é preservado.

### 2.4 Cálculo dos textos no render
Estender o bloco existente de `tituloConfirmacao`/`descricaoConfirmacao`/`labelConfirmacao` para cobrir `tipo: "archive"` (tabela acima). O `destructive` do `ConfirmDialog` deve ser `true` só para "item" e "lista", `false` para "archive":

```ts
const destructive = confirmacao?.tipo === "item" || confirmacao?.tipo === "lista";
```

---

## 3. Acesso a listas arquivadas — entrada "Arquivadas" no índice

PO decisão (b): a lista arquivada some da tela inicial mas permanece acessível por uma **entrada "Arquivadas"** alcançável a partir da tela inicial. Esta seção define onde ela vive.

### 3.1 Localização: rodapé do índice, discreta
A entrada "Arquivadas" é um **link textual discreto** no rodapé do índice (`ListasIndex`), **abaixo** da lista de listas e **acima** do estado vazio quando não há listas ativas. Aparece **só quando há listas arquivadas** (AC 3 — não mostrar entrada vazia). É um `<Link>` para a rota `/arquivadas` (§4).

```
{/* Rodapé do índice — entrada "Arquivadas" só aparece se houver arquivadas (AC 3). */}
{hydrated && temArquivadas ? (
  <p className="mt-6 text-base">
    <Link
      href="/arquivadas"
      className="text-muted underline-offset-4 hover:text-foreground hover:underline"
    >
      Arquivadas
    </Link>
  </p>
) : null}
```

Detalhes:
- **Discreto:** `text-muted` (mesmo tom do "N a fazer"), sublinhado só no hover (`underline-offset-4 hover:underline`), sem ícone, sem botão. A entrada não compete com as listas ativas — é um "submenu" textual.
- **Condicional (AC 3):** só renderiza quando `temArquivadas === true` (novo seletor `useTemArquivadas()` ou campo derivado de `useListas` — ver §6). Sem arquivadas → sem entrada (evita link para página vazia).
- **Posição:** após a `<ul>` do índice (Fixadas/Demais), antes do estado vazio "Nenhuma lista ainda...". `mt-6` separa das listas.
- **Acessibilidade:** `<Link>` com `href="/arquivadas"` — leitor de tela anuncia "Arquivadas, link". Sem `aria-label` extra (o texto é autoexplicativo). Alvo de toque: o `<Link>` ocupa a linha (padding natural do `<p>`), alvo ≥44px via line-height + padding; se o DEV precisar, envolver em `min-h-11` para garantir o alvo (LB-4).

### 3.2 Rota `/arquivadas` — lista de listas arquivadas
Nova rota `src/app/(app)/arquivadas/page.tsx` (server, mesmo padrão de `/` e `/listas/[id]` — header server + componente client). O header é mínimo: "← Listas" (volta ao índice) + "Sair" (já existente no layout compartilhado).

```
// src/app/(app)/arquivadas/page.tsx
import Link from "next/link";
import { logout } from "@/app/login/actions";
import { ListasArquivadas } from "@/components/listas/ListasArquivadas";

export default function ArquivadasPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex min-h-11 items-center text-base"
          aria-label="Voltar para o índice de listas"
        >
          ← Listas
        </Link>
        <form action={logout}>
          <button type="submit" className="rounded border border-current px-4 py-2 text-sm min-h-11">
            Sair
          </button>
        </form>
      </div>

      <ListasArquivadas />
    </>
  );
}
```

### 3.3 Componente `ListasArquivadas` (client)
Novo componente `src/components/listas/ListasArquivadas.tsx` ("use client"), espelhando `ListasIndex` mas lendo `useListasArquivadas()` (§6) e sem botão "Nova lista" (a rota é de gestão de arquivadas, não de criação). Cada linha é um `<Link>` para o detalhe da lista (`/listas/[id]`), onde o menu "⋮" permite desarquivar (AC 4):

```
"use client";

import Link from "next/link";
import { useHydrated, useListasArquivadas } from "@/lib/todos/store";
import type { ListaIndex } from "@/lib/todos/types";

/**
 * Tela de listas arquivadas (`/arquivadas`) — listas com `archived_at` preenchido,
 * ordenadas por modificação (`updated_at` desc). Cada linha navega ao detalhe
 * da lista, onde o menu "⋮" permite desarquivar. Sem botão "Nova lista".
 */
export function ListasArquivadas() {
  const listas = useListasArquivadas();
  const hydrated = useHydrated();

  return (
    <div className="mt-6">
      <h1 className="text-3xl font-semibold">Arquivadas</h1>

      {hydrated && listas.length === 0 ? (
        <p className="mt-4 text-base text-muted">
          Nenhuma lista arquivada. Arquive uma lista pelo menu &ldquo;⋮&rdquo; na tela dela.
        </p>
      ) : null}

      {listas.length > 0 ? (
        <ul className="mt-4 divide-y divide-current/10">
          {listas.map((lista) => (
            <li key={lista.id} className="flex items-center gap-2">
              <Link
                href={`/listas/${lista.id}`}
                className="flex min-h-11 flex-1 items-center justify-between gap-4 text-base"
              >
                <span className="flex items-center gap-1">
                  {lista.nome}
                  {lista.pinned ? (
                    <span aria-label={`Fixada: "${lista.nome}"`} className="text-sm">
                      <span aria-hidden="true">📌</span>
                    </span>
                  ) : null}
                </span>
                <span className="text-muted text-base">{lista.aFazer} a fazer</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

Detalhes:
- **Ordenação:** `useListasArquivadas()` entrega as listas já ordenadas por `updated_at` desc (mesma regra do índice, ver §6). A UI não ordena.
- **Indicador de fixação preservado (PO (e), AC 12):** o `📌` ao lado do nome segue o mesmo padrão do índice (LB-14) — uma lista arquivada que estava fixada ainda mostra o pin (o `pinned` é preservado ao arquivar). Ao desarquivar, ela volta à seção Fixadas do índice.
- **Estado vazio (AC 3):** "Nenhuma lista arquivada. Arquive uma lista pelo menu '⋮' na tela dela." — instrui como arquivar (a entrada não é óbvia sem o menu).
- **Sem botão "Nova lista":** a rota é de gestão, não de criação. Criar lista é no índice (`/`).
- **Acesso ao detalhe:** clicar na linha navega a `/listas/[id]` — o detalhe da lista arquivada funciona igual ao da ativa (itens, ordem, fixação intactos — AC 13); só o menu "⋮" lê "Desarquivar lista" (AC 4/5).

---

## 4. Estados

| Estado | Comportamento |
| ------ | ------------- |
| **Arquivar (de ativa → arquivada)** | `archiveLista(id)` seta `archived_at` (now), bumpa versão, notifica; a lista some do índice imediatamente (AC 2, 9). No detalhe, o item do menu passa a ler "Desarquivar lista" (AC 5). A entrada "Arquivadas" aparece no índice (se não havia arquivadas antes). |
| **Desarquivar (arquivada → ativa)** | `unarchiveLista(id)` limpa `archived_at` (null), bumpa versão, notifica; a lista volta à tela inicial imediatamente (AC 4). No detalhe, o item lê "Arquivar lista". A entrada "Arquivadas" some se era a última arquivada. |
| **Sem listas arquivadas** | entrada "Arquivadas" não renderizada no índice (AC 3); rota `/arquivadas` mostra estado vazio. |
| **Com listas arquivadas** | entrada "Arquivadas" renderizada no rodapé do índice; rota `/arquivadas` lista as arquivadas. |
| **Índice vazio (zero listas ativas, mas há arquivadas)** | o estado vazio "Nenhuma lista ainda..." **não** aparece (há arquivadas → o usuário pode desarquivar); a entrada "Arquivadas" aparece abaixo do botão "Nova lista". Detalhe: o estado vazio do índice é condicional a `listas.length === 0` onde `listas` são só as **ativas** — se há arquivadas, `listas` (ativas) é vazio mas a entrada "Arquivadas" mostra o caminho. O texto "Nenhuma lista ainda..." deve ser ajustado para considerar arquivadas: se `hydrated && ativas.length === 0 && arquivadas.length === 0` → mostra "Nenhuma lista ainda..."; se `ativas.length === 0 && arquivadas.length > 0` → não mostra (a entrada "Arquivadas" cumpre o papel). |
| **Offline** | arquivar/desarquivar respondem do cache local, refletem no índice na hora; sync ao reconectar (LB-6/LB-7) — a UI não muda (AC 8). |
| **Loading/erro** | não se aplicam — toggle é local-first e síncrono no cache, sem spinner, sem toast de erro (AC 5). Falha de rede no push do `archived_at` é silenciosa (retry no próximo sync, igual às demais mutações). |
| **Pós-upgrade** | nenhuma lista arquivada (default `archived_at = null`) — entrada "Arquivadas" não aparece (AC 10); a UI trata igual a "sem arquivadas". |
| **Interação com fixação (PO (e), AC 12)** | arquivar uma lista fixada remove a lista do índice (incl. da seção Fixadas); o `pinned` é **preservado** no campo. Ao desarquivar, a lista volta à tela inicial e, se `pinned = true`, volta à seção Fixadas. O indicador 📌 na rota `/arquivadas` reflete o `pinned` preservado. |
| **Deep-link para lista arquivada** (`/listas/[id]` de id arquivado) | o detalhe funciona normalmente (a lista existe, `archived=true`); o menu "⋮" lê "Desarquivar lista"; o usuário pode desarquivar dali. Sem redirect — a lista existe, só está arquivada. |

**Acessibilidade:** item de menu com `role="menuitem"`, `<span aria-hidden>` no emoji (leitor de tela anuncia "Arquivar lista"/"Desarquivar lista"); entrada "Arquivadas" como `<Link>` (anúncio "Arquivadas, link"); `ConfirmDialog` já acessível (LB-8). Alvos `min-h-11` (LB-4) em todos os itens de menu e no link "Arquivadas".

---

## 5. Contrato da UI com o `store` (leitura/escrita)

A UI consome só o `store` — **nunca** storage/Supabase. Esta seção fixa o **contrato de leitura/escrita** que o DEV deve prover; a **forma do campo, migration, RLS e sync** são do DEV (fora de escopo desta spec).

### 5.1 Leitura
- `useListas()` (`ListasIndex`) retorna `ListaIndex[]` com **apenas listas ativas** (`archived_at IS NULL`) — ou o `listIndex()` filtra arquivadas, ou `ListaIndex` ganha `archived: boolean` e a UI filtra. **Decisão desta spec:** o `listIndex()` filtra arquivadas (a UI do índice não precisa saber de `archived` — ela só recebe ativas). Contrato: `listIndex(): ListaIndex[]` retorna **apenas ativas**, ordenadas Fixadas→Demais por `updated_at` desc (LB-14, sem mudança).
- `useListasArquivadas()` (NOVO, `ListasArquivadas`) retorna `ListaIndex[]` com **apenas arquivadas** (`archived_at IS NOT NULL`), ordenadas por `updated_at` desc. Mesmo tipo `ListaIndex` (id, nome, aFazer, pinned) — a UI não precisa de `archivedAt`.
- `useTemArquivadas()` (NOVO, `ListasIndex`) retorna `boolean` — `true` se há ≥1 lista arquivada. Usado para renderizar a entrada "Arquivadas". Pode ser derivado de `useListasArquivadas().length > 0` ou um seletor dedicado (mais barato se o store já sabe o total).
- `useLista(listId)` (`ListaScreen`) expõe `archived` no objeto da lista:
  ```ts
  export type ListaDetalhe = Lista & { pinned: boolean; archived: boolean };  // NOVO: archived
  ```
  A UI lê `lista.archived` para o texto do menu (§1.1) e para a decisão de abrir `ConfirmDialog` (arquivar) ou chamar `unarchiveLista` direto (desarquivar).

### 5.2 Escrita
Novas funções no `store`, espelhando o padrão de `togglePinLista` (LB-14):

```ts
export function archiveLista(id: string): void {
  repoInstance().archiveLista(id);
  bumpVersion();
  notify();
  notifyMutations(); // dispara o trigger de sync pós-mutação (LB-7)
}

export function unarchiveLista(id: string): void {
  repoInstance().unarchiveLista(id);
  bumpVersion();
  notify();
  notifyMutations();
}
```

- Ambas são **mutações** (geram `pending` + disparam `notifyMutations` → sync debounced, LB-7), igual a criar/renomear/marcar/fixar. O `archived_at` segue o fluxo local-first (cache → push ao reconectar) e o merge por `updated_at` (AC 6/7).
- A UI importa `archiveLista`/`unarchiveLista` de `@/lib/todos/store` — nada mais.

### 5.3 Novas operações no `ListasRepository`
```ts
/** Índice de listas arquivadas (archived_at IS NOT NULL), ordenadas por updated_at desc. */
listArchivedIndex(): ListaIndex[];
/** Arquiva a lista (seta archived_at = now, bumpa updated_at, enfileira pending). Mutação. */
archiveLista(id: string): void;
/** Desarquiva a lista (limpa archived_at = null, bumpa updated_at, enfileira pending). Mutação. */
unarchiveLista(id: string): void;
```

### 5.4 O que **não** é desta spec (decisão do 🤖 DEV)
- Forma do campo `archived_at` no schema do cloud (timestamp `timestamptz` vs. booleano derivado `archived`) e na `ListRecordLocal`. O contrato da UI só exige `ListaDetalhe.archived: boolean` (derivado de `archived_at IS NOT NULL`).
- Migration SQL aditiva (`archived_at timestamptz default null`) e migração do cache localStorage (v5 → v6, se necessária).
- RLS (nenhuma mudança esperada — `archived_at` fica na linha da lista, já coberta pela policy por `auth.uid()`; AC 11).
- Sync/merge do `archived_at` (segue o merge por `updated_at` do LB-6) e empate de `updated_at` (desempate determinístico por `created_at`/`id`, já estabelecido em LB-14).
- O filtro `WHERE archived_at IS NULL` na query do índice — detalhe de implementação (pode ser no `listIndex()` ou no adapter); o AC valida só que arquivadas não aparecem.
- A query do índice de arquivadas (`listArchivedIndex()`) — espelha `listIndex()` filtrando `archived_at IS NOT NULL`.

---

## 6. Seletores do store (contrato de leitura para a UI)

Resumo dos seletores/funcs que o DEV deve expor no `store`:

| Seletor/func | Retorna | Usado por | Observação |
| --- | --- | --- | --- |
| `useListas()` | `ListaIndex[]` (ativas, Fixadas→Demais, `updated_at` desc) | `ListasIndex` | **Sem mudança** — já filtra arquivadas após o DEV implementar `listIndex()` com filtro `archived_at IS NULL`. |
| `useListasArquivadas()` (NOVO) | `ListaIndex[]` (arquivadas, `updated_at` desc) | `ListasArquivadas` | Espelha `useListas` mas lê `listArchivedIndex()`. |
| `useTemArquivadas()` (NOVO) | `boolean` | `ListasIndex` | `true` se `listArchivedIndex().length > 0`. Pode ser derivado de `useListasArquivadas` ou otimizado no store. |
| `useLista(id)` | `ListaDetalhe` (com `pinned` e `archived`) | `ListaScreen` | **Adicionar `archived: boolean`** ao `ListaDetalhe`. |
| `archiveLista(id)` (NOVO) | `void` | `ListaScreen` | Mutação: seta `archived_at`, bumpa `updated_at`, pending, notify. |
| `unarchiveLista(id)` (NOVO) | `void` | `ListaScreen` | Mutação: limpa `archived_at`, bumpa `updated_at`, pending, notify. |

---

## 7. Testes (notas para DEV/QA)

**UI (jsdom/testing-library):**
- Detalhe: menu "⋮" expõe "Arquivar lista" quando `archived=false` e "Desarquivar lista" quando `archived=true` (AC 5).
- Clicar em "Arquivar lista": fecha o menu, abre `ConfirmDialog` com título "Arquivar lista?" e descrição mencionando "sairá da tela inicial" e "pode desarquivar" (AC 1). Confirmar → chama `archiveLista(id)`; cancelar/Esc/overlay → nada muda.
- Clicar em "Desarquivar lista": fecha o menu e chama `unarchiveLista(id)` direto, **sem** `ConfirmDialog` (AC 4/5).
- Após arquivar, a lista **não aparece** no índice (`useListas()` não a retorna) (AC 2); a entrada "Arquivadas" aparece no índice (se não havia arquivadas) (AC 3).
- Após desarquivar, a lista volta ao índice (AC 4); a entrada "Arquivadas" some se era a última.
- Rota `/arquivadas`: renderiza `ListasArquivadas`; lista as arquivadas; clicar numa linha navega a `/listas/[id]` (AC 4); estado vazio quando não há arquivadas.
- Entrada "Arquivadas" no índice: só renderiza quando `useTemArquivadas() === true` (AC 3); link para `/arquivadas`.
- Interação com fixação (AC 12): arquivar uma lista `pinned=true` remove do índice (incl. seção Fixadas); `pinned` permanece `true` no registro; ao desarquivar, a lista volta à seção Fixadas do índice; a rota `/arquivadas` mostra o 📌 ao lado do nome.
- Sem regressão: "📌 Fixar/Desfixar" (LB-14), "🔗 Copiar link" (LB-12) e "🗑️ Excluir lista" (LB-8) permanecem funcionais; `ConfirmDialog` de excluir ainda é `destructive=true` (vermelho); fluxos de criar/marcar/renomear (LB-6), múltiplas listas (LB-5) e UX mobile (LB-4) preservados.

**Store/repository (node/jsdom):**
- `archiveLista` seta `archived_at` (now), bumpa `updated_at`, enfileira pending, notifica listeners e mutationListeners (trigger de sync).
- `unarchiveLista` limpa `archived_at` (null), bumpa `updated_at`, enfileira pending, notifica.
- `listIndex()` retorna **apenas ativas** (filtra `archived_at IS NOT NULL`), ordenadas Fixadas→Demais por `updated_at` desc.
- `listArchivedIndex()` retorna **apenas arquivadas**, ordenadas por `updated_at` desc.
- `ListaDetalhe.archived` reflete `archived_at IS NOT NULL`.
- `archived_at` default `null` (lista criada não nasce arquivada); persiste entre sessões; vira `pending` para o sync.

**Sem regressão de storage/RLS (AC 11):** nenhuma mudança em policies; `archived_at` protegido pela RLS por `auth.uid()` existente.

---

## 8. Resumo das decisões de design

| Decisão | Escolha |
| --- | --- |
| Onde fica o toggle de arquivar/desarquivar | Item "🗃️ Arquivar lista"/"Desarquivar lista" no menu overflow "⋮" do detalhe (LB-8/LB-12/LB-14) — nunca no índice (rework LB-8). |
| Confirmação prévia | `ConfirmDialog` reutilizado (LB-8), `destructive=false` (aviso, não destrutivo); só ao **arquivar**. **Desarquivar sem confirmação** (reversão trivial, padrão de fixar LB-14). |
| Texto do diálogo de arquivar | "Arquivar lista?" / `Arquivar "{nome}"? Ela sairá da tela inicial e ficará em Arquivadas. Você pode desarquivar a qualquer momento.` / "Arquivar". |
| Texto do menu (toggle) | `lista.archived ? "Desarquivar lista" : "Arquivar lista"` (AC 5). |
| Após arquivar no detalhe | permanece na tela da lista (sem redirect); o menu agora lê "Desarquivar lista". |
| Entrada "Arquivadas" no índice | link textual discreto no rodapé do índice, `text-muted hover:text-foreground hover:underline`, só quando há arquivadas (AC 3). |
| Rota `/arquivadas` | nova rota server + componente client `ListasArquivadas`; lista arquivadas por `updated_at` desc; cada linha → `/listas/[id]` (menu permite desarquivar). |
| Indicador de fixação na rota `/arquivadas` | 📌 ao lado do nome se `pinned=true` (preservado ao arquivar, PO (e), AC 12). |
| Estado vazio da rota `/arquivadas` | "Nenhuma lista arquivada. Arquive uma lista pelo menu '⋮' na tela dela." |
| Estado vazio do índice | se `ativas.length === 0 && arquivadas.length === 0` → "Nenhuma lista ainda..."; se `ativas.length === 0 && arquivadas.length > 0` → sem texto vazio (entrada "Arquivadas" cumpre o papel). |
| Ícone | 🗃️ (emoji Unicode, `aria-hidden`), `gap-2` no menu. |
| Alvo/touch | `min-h-11` (44px, LB-4) nos `menuitem`s e no link "Arquivadas". |
| Contrato UI↔store | `archiveLista(id)`, `unarchiveLista(id)`; `useListasArquivadas()`, `useTemArquivadas()`; `ListaDetalhe.archived`; `listIndex()` filtra arquivadas; `listArchivedIndex()` lista arquivadas. |
| Forma do campo/migration/RLS/sync | 🤖 DEV (fora de escopo) |
| Dependências/tokens | nenhum novo (sem Radix/HeadlessUI, sem novo token de cor). |