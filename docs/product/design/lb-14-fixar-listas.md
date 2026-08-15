# Spec de design — LB-14: Fixar (favoritar) listas — fixas aparecem primeiro, demais por modificação

**Issue:** [LB-14](https://linear.app/alysson-azevedo/issue/LB-14/fixar-favoritar-listas-fixas-aparecem-primeiro-demais-por-modificacao) · **State:** 📑 Spec → 🚧 Dev in progress · **Tipo:** 🔍 Melhoria · **Prioridade:** baixa
**Base:** LB-5 (índice em `/`), LB-6 (Supabase + cache local-first, sync por `updated_at`), LB-7 (sync pós-mutação), LB-8 (menu overflow "⋮" no detalhe + rework "ações de lista só no detalhe"), LB-12 (item "Copiar link" no menu overflow).
**Spec de negócio:** `docs/product/lb-14-fixar-listas.md` (AC + decisões de produto). **ADRs:** `docs/decisions.md`.

Esta spec fixa **design de UI/UX** (affordance de fixar/desfixar, posição, ícone, seções do índice, textos, estados) para o DEV implementar sem inventar. Decisões de negócio/AC não se reabrem. **Forma do campo `pinned` no schema** (booleano vs. timestamp), **migration**, **RLS** e **sync/merge** são do 🤖 DEV — esta spec define apenas o **contrato de leitura da UI** (o que a UI lê/chama) e o **comportamento visual**. **Sem** nova dependência (sem Radix/HeadlessUI), **sem** novo token de cor, **sem** confirmação/undo-toast (ação não destrutiva).

Arquivos atuais relevantes: `src/components/listas/ListasIndex.tsx` (índice), `src/components/listas/ListaScreen.tsx` (menu overflow "⋮" + `ConfirmDialog`), `src/lib/todos/{types,store,repository}.ts`, `src/app/globals.css` (tokens `--background/--foreground/--muted`).

---

## Princípios

1. **Reutilizar o padrão visual LB-2..LB-12**: paleta `--background/--foreground/--muted`, bordas `border-current/20`, `divide-current/10`, alvos `min-h-11` (44px, LB-4), dark mode por `prefers-color-scheme`. Sem novos tokens de cor; o vermelho de "destrutivo" continua `text-red-600 dark:text-red-400` (LB-8), só no item de excluir.
2. **Mínimo que entrega valor**: um toggle de fixar por lista, visível no índice (estado + ação) e no menu overflow do detalhe (consistência com LB-8/LB-12). Sem drag-and-drop, sem limite, sem confirmação, sem toast, sem animação.
3. **Não destrutivo, reversível**: fixar/desfixar é toggle instantâneo (PO decisão (b)); sem `ConfirmDialog`, sem undo. Diferente de "🗑️ Excluir lista" (LB-8, destrutiva → confirmação).
4. **Ações de lista no detalhe, estado no índice**: o overflow "⋮" do detalhe continua sendo o lar das ações de lista (LB-8 rework, LB-12). O **toggle** também vive no índice porque o caso de uso de referência fixa a partir do índice ("abre o índice, fixa a 'Mercado'") e a ação é não destrutiva (a ratione do rework LB-8 — manter o índice como navegação pura — vale para exclusão, não para fixar).
5. **UI isolada do storage**: a UI chama `togglePinLista(id)` no `store` e lê `pinned` via `useListas`/`useLista` — nunca `localStorage`/Supabase direto. A ordenação (Fixadas → Demais, `updated_at` desc) é entregue pronta pelo `listIndex()`; a UI só particiona por `pinned`.

---

## 1. Affordance no índice (`/`) — `ListasIndex`

### 1.1 Botão de fixar na linha
Cada linha do índice ganha um botão **📌** à direita, **fora** do `<Link>` (igual ao "✕" do item fora da `<label>` em LB-8 §1 — clicar no pin não pode disparar navegação). O `<Link>` passa a `flex-1`; o botão de pin é o sibling fixo à direita.

```
<li className="flex items-center gap-2">
  <Link
    href={`/listas/${lista.id}`}
    className="flex min-h-11 flex-1 items-center justify-between gap-4 text-base"
  >
    <span>{lista.nome}</span>
    <span className="text-muted text-base">{lista.aFazer} a fazer</span>
  </Link>
  <button
    type="button"
    onClick={() => togglePinLista(lista.id)}
    aria-label={lista.pinned ? `Desfixar "${lista.nome}"` : `Fixar "${lista.nome}"`}
    title={lista.pinned ? "Desfixar lista" : "Fixar lista"}
    className={`flex min-h-11 min-w-11 items-center justify-center text-lg ${
      lista.pinned ? "text-foreground" : "text-muted hover:text-foreground"
    }`}
  >
    <span aria-hidden="true">📌</span>
  </button>
</li>
```

Detalhes:
- **Estado refletido no botão (AC 3):** fixada → `text-foreground` (pin "aceso") + `aria-label` "Desfixar"; não-fixada → `text-muted` (pin "apagado") + `aria-label` "Fixar". O contraste muted⇄foreground + a seção em que a linha aparece + o `aria-label` comunicam o estado (cor não é o único sinal).
- **Ícone:** `📌` (emoji Unicode, sem lib) em `<span aria-hidden="true">` — meramente visual; o nome acessível vem do `aria-label` do botão (leitor de tela anuncia "Fixar 'Mercado'" / "Desfixar 'Mercado'").
- **Alvo/touch:** `min-h-11 min-w-11` (44px, LB-4). `text-lg` (mesmo tamanho do "✕" de excluir item).
- **Sem confirmação (AC 4):** o `onClick` chama `togglePinLista` direto; o índice re-renderiza e a linha move de seção imediatamente (AC 1/2, ver §3).
- O `<Link>` continua ocupando o resto da linha (nome + contagem) — navegação intacta, sem regressão LB-5.

### 1.2 Seções do índice (Fixadas / Demais)
O `<ul>` único atual vira **duas seções**, particionadas por `lista.pinned`:

```
const pinned = listas.filter((l) => l.pinned);
const demais = listas.filter((l) => !l.pinned);
```

Renderização (header aparece **só quando ambas as seções têm conteúdo** — AC 14):

```
{pinned.length > 0 ? (
  <section className="mt-4">
    <p className="text-muted text-base">Fixadas</p>
    <ul className="mt-2 divide-y divide-current/10">
      {pinned.map((lista) => <Linha key={lista.id} lista={lista} />)}
    </ul>
  </section>
) : null}

{demais.length > 0 ? (
  <section className={pinned.length > 0 ? "mt-6" : "mt-4"}>
    {pinned.length > 0 ? <p className="text-muted text-base">Demais</p> : null}
    <ul className={`divide-y divide-current/10 ${pinned.length > 0 ? "mt-2" : ""}`}>
      {demais.map((lista) => <Linha key={lista.id} lista={lista} />)}
    </ul>
  </section>
) : null}
```

- **Ordem vertical (AC 5):** Fixadas sempre acima de Demais.
- **Headers condicionais (AC 14):** sem fixadas → só Demais, **sem header** (índice flat como hoje); todas fixadas → só Fixadas, sem header "Demais"; só há header quando as duas seções coexistem. Evita um header "Demais" órfão e preserva o look atual quando a feature está "inativa".
- **Header:** `<p className="text-muted text-base">` — mesmo padrão do "Concluídos" em `ListaScreen` (sem `<h2>`, sem novo estilo).
- **Divisor:** `divide-y divide-current/10` dentro de cada `<ul>` (igual ao índice atual); `mt-6` separa as seções quando ambas existem.
- **Ordenação intra-seção (AC 6/7):** a UI **não** ordena — ela confia que `listIndex()` entrega as listas já ordenadas por `updated_at` desc dentro de cada seção (ver §4). A UI só particiona por `pinned` (estável).
- **Estado vazio do índice** (zero listas): inalterado — "Nenhuma lista ainda. Toque em 'Nova lista' para começar." As duas seções ficam vazias e nada é renderizado além do botão "Nova lista" e do estado vazio.

> `Linha` é a `<li>` de §1.1; extraída como componente local (ou bloco repetido) só para legibilidade — sem novo arquivo.

---

## 2. Affordance no detalhe (`/listas/[id]`) — `ListaScreen`

### 2.1 Item de menu "Fixar/Desfixar"
Dentro do menu overflow "⋮" existente em `ListaScreen`, adicionar um `menuitem` **acima** dos demais (não destrutivo vem primeiro — mesmo princípio de ordenamento de LB-8 §2.2 / LB-12 §1). O texto alterna conforme o estado (AC 3):

```
<div role="menu" aria-label="Opções da lista"
  className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded border border-current/20 bg-background py-1">

  {/* LB-14 — Fixar/Desfixar (não destrutivo, toggle — texto reflete o estado) */}
  <button type="button" role="menuitem"
    onClick={() => { setMenuAberto(false); togglePinLista(lista.id); }}
    className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-foreground hover:bg-current/5">
    <span aria-hidden="true">📌</span> {lista.pinned ? "Desfixar lista" : "Fixar lista"}
  </button>

  {/* LB-12 — Copiar link (não destrutivo) — se já implementado */}
  <button type="button" role="menuitem" onClick={onCopiarLink}
    className="flex min-h-11 w-full items-center gap-2 px-3 text-base text-foreground hover:bg-current/5">
    <span aria-hidden="true">🔗</span> Copiar link
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
- **Texto reflete o estado (AC 3):** `lista.pinned ? "Desfixar lista" : "Fixar lista"`. O `📌` é o mesmo nos dois estados (emoji não tem variante outline confiável); o estado vem do texto + da posição da linha no índice ao voltar.
- **Sem confirmação (AC 4):** `onClick` fecha o menu e chama `togglePinLista(lista.id)` direto. Sem `ConfirmDialog`, sem toast — a reversão é um toque no mesmo item (que agora lê "Desfixar lista").
- **Cor:** `text-foreground` (não destrutiva). `hover:bg-current/5` (consistência com LB-12, aplicado a todos os itens).
- **Alvo/touch:** `min-h-11 w-full`, `gap-2` (igual aos itens existentes).
- **Menu fecha síncrono** antes da mutação (`setMenuAberto(false)` antes de `togglePinLista`) — o usuário vê o menu sumir; o estado de fixação é confirmado ao reabrir o menu (texto trocado) ou ao voltar ao índice (linha na seção correta).
- **Sem mudança no botão "⋮", no backdrop nem no `ConfirmDialog`** (LB-8/LB-12 intactos).

### 2.2 Ordenação do menu (resultado)

| # | Item | Cor | Ação |
| - | ---- | --- | ---- |
| 1 | 📌 Fixar lista / Desfixar lista | `text-foreground` (padrão) | toggle `pinned` + fecha menu |
| 2 | 🔗 Copiar link (LB-12) | `text-foreground` | copia URL + fecha menu + toast |
| 3 | 🗑️ Excluir lista (LB-8) | `text-red-600 dark:text-red-400` | fecha menu + abre `ConfirmDialog` |

> **Dependência de ordem:** se LB-12 ainda não estiver mergeado em `develop`, o item "Copiar link" não existe ainda — o DEV posiciona "Fixar/Desfixar" **acima** de "🗑️ Excluir lista" e o item da LB-12 entra no meio quando a LB-12 landar. A ordem final (não destrutivos acima do destrutivo) é a invariante.

---

## 3. Estados

| Estado | Comportamento |
| ------ | ------------- |
| **Fixar (de não-fixada → fixada)** | `togglePinLista(id)` muda `pinned=true`, bumpa versão, notifica; a linha move da seção Demais para a seção Fixadas (topo) imediatamente, sem recarregar (AC 1). No detalhe, o item do menu passa a ler "Desfixar lista" (AC 3). |
| **Desfixar (fixada → não-fixada)** | `togglePinLista(id)` muda `pinned=false`; a linha volta à seção Demais imediatamente (AC 2). No detalhe, o item lê "Fixar lista". |
| **Sem listas fixadas** | seção Fixadas não renderizada; índice flat só com Demais, sem header (AC 14). |
| **Todas fixadas** | seção Demais não renderizada; só Fixadas, sem header "Demais" (AC 14). |
| **Fixadas e não-fixadas coexistem** | ambas as seções com headers "Fixadas"/"Demais". |
| **Índice vazio (zero listas)** | estado vazio existente ("Nenhuma lista ainda..."); nenhuma seção renderizada. |
| **Offline** | toggle responde do cache local, reflete no índice na hora; sync ao reconectar (LB-6/LB-7) — a UI não muda (AC 9). |
| **Loading/erro** | não se aplica — toggle é local-first e síncrono no cache, sem spinner, sem toast de erro (AC 4). Falha de rede no push do `pinned` é silenciosa (retry no próximo sync, igual às demais mutações). |
| **Mutação em uma lista** (marcar/renomear/adicionar item) | atualiza `updated_at` e reposiciona a lista dentro de sua seção (AC 8) — automático: a mutação já bumpa versão e `listIndex()` reordena por `updated_at` desc. A UI não precisa de lógica extra. |
| **Pós-upgrade** | nenhuma lista fixada (default `pinned=false`) — seção Fixadas não aparece (AC 12); a UI trata igual a "sem fixadas". |

**Acessibilidade:** botão de pin com `aria-label` contextual (inclui o nome da lista + a ação), `min-h-11 min-w-11` (LB-4); `menuitem` no detalhe com `<span aria-hidden>` no emoji (leitor de tela anuncia "Fixar lista"/"Desfixar lista"); seções como `<p>` (`text-muted`), mesmo padrão do "Concluídos". O fluxo é operável por teclado (botão de pin é focável; menu via "⋮" existente).

---

## 4. Contrato da UI com o `store` (leitura/escrita)

A UI consome só o `store` — **nunca** storage/Supabase. Esta seção fixa o **contrato de leitura/escrita** que o DEV deve prover; a **forma do campo, migration, RLS e sync** são do DEV (fora de escopo desta spec).

### 4.1 Leitura
- `useListas()` (`ListasIndex`) retorna `ListaIndex[]` onde cada entrada ganha **`pinned: boolean`**:
  ```ts
  type ListaIndex = { id: string; nome: string; aFazer: number; pinned: boolean };
  ```
- `listIndex()` entrega as entradas **já ordenadas**: seção **Fixadas** (`pinned=true`) primeiro, **Demais** (`pinned=false`) depois, ambas por **`updated_at` descendente** dentro da seção (AC 5/6/7). A UI **não** ordena — só particiona por `pinned` (§1.2).
- `useLista(listId)` (`ListaScreen`) expõe `pinned` no objeto da lista (a UI lê `lista.pinned` para o texto do menu — §2.1). Se o DEV preferir não adicionar `pinned` ao tipo `Lista`, expor `pinned` no snapshot da tela é equivalente — o contrato é "a UI consegue ler o estado de fixação da lista corrente".

### 4.2 Escrita
- Nova função no `store`, espelhando o padrão de `toggleItem`/`renameList`:
  ```ts
  export function togglePinLista(id: string): void {
    repoInstance().togglePinLista(id);
    bumpVersion();
    notify();
    notifyMutations(); // dispara o trigger de sync pós-mutação (LB-7)
  }
  ```
- `togglePinLista` é **mutação** (gera `pending` + dispara `notifyMutations` → sync debounced, LB-7), igual a criar/renomear/marcar. O `pinned` segue o fluxo local-first (cache → push ao reconectar) e o merge por `updated_at` (AC 10/11).
- A UI importa `togglePinLista` de `@/lib/todos/store` — nada mais.

### 4.3 O que **não** é desta spec (decisão do 🤖 DEV)
- Forma do campo `pinned` no schema do cloud (booleano puro vs. timestamp de fixação) e na `ListRecordLocal`.
- Migration SQL aditiva (`pinned` default `false`) e migração do cache localStorage (v4 → v5, se necessária).
- RLS (nenhuma mudança esperada — `pinned` fica na linha da lista, já coberta pela policy por `auth.uid()`; AC 13).
- Sync/merge do `pinned` (segue o merge por `updated_at` do LB-6) e empate de `updated_at` (desempate determinístico por `created_at`/`id`).
- A ordenação por `updated_at` desc é uma **mudança de comportamento** do `listIndex()` (hoje é ordem de criação) — implementação do DEV, mas o **contrato** (ordem entregue) é desta spec.

---

## 5. Testes (notas para DEV/QA)

**UI (jsdom/testing-library):**
- Índice: linha com `<Link>` (nome + contagem) + botão "📌" fora do link; alvo ≥44px (`min-h-11 min-w-11`); `aria-label` correto por estado ("Fixar 'X'" / "Desfixar 'X'").
- Clicar no pin de uma não-fixada → chama `togglePinLista(id)`; a linha aparece na seção Fixadas (AC 1). Clicar no pin de uma fixada → volta à seção Demais (AC 2).
- Sem fixadas → só uma seção (Demais), **sem** header "Fixadas"/"Demais" (AC 14). Todas fixadas → só Fixadas, sem "Demais". Coexistem → dois headers, Fixadas acima (AC 5).
- Detalhe: menu "⋮" expõe "Fixar lista" quando `pinned=false` e "Desfixar lista" quando `pinned=true` (AC 3); clicar fecha o menu e chama `togglePinLista` (AC 4, sem `ConfirmDialog`).
- Ordenação: Fixadas e Demais por `updated_at` desc (validar com timestamps distintos — AC 6/7); mutação que bumpa `updated_at` reposiciona a lista na seção (AC 8).
- Sem regressão: "🔗 Copiar link" (LB-12) e "🗑️ Excluir lista" (LB-8) permanecem funcionais; o item de excluir continua abrindo o `ConfirmDialog`. Fluxos de criar/marcar/renomear (LB-6), múltiplas listas (LB-5) e UX mobile (LB-4) preservados.

**Store/repository (node/jsdom):**
- `togglePinLista` alterna `pinned`, bumpa versão, notifica listeners e mutationListeners (trigger de sync).
- `listIndex()` retorna `pinned` por entrada e ordena Fixadas→Demais, `updated_at` desc dentro de cada seção.
- `pinned` default `false` (lista criada não nasce fixada); persiste entre sessões; vira `pending` para o sync.

**Sem regressão de storage/RLS (AC 13):** nenhuma mudança em policies; `pinned` protegido pela RLS por `auth.uid()` existente.

---

## 6. Resumo das decisões de design

| Decisão | Escolha |
| --- | --- |
| Onde fica o toggle | **Índice** (botão 📌 na linha, fora do `<Link>`) **e** **detalhe** (item "Fixar/Desfixar lista" no menu overflow "⋮") — mesmo `togglePinLista` |
| Estado visível no índice | cor do pin (`text-muted` não-fixada / `text-foreground` fixada) + seção em que aparece + `aria-label` contextual |
| Estado visível no detalhe | texto do `menuitem` alterna "Fixar lista" ⇄ "Desfixar lista" |
| Seções do índice | Fixadas (topo) → Demais; headers "Fixadas"/"Demais" só quando ambas coexistem (AC 14) |
| Ordenação intra-seção | `updated_at` desc, entregue pronta pelo `listIndex()` (mudança de criação → modificação) |
| Confirmação | nenhuma (toggle não destrutivo, reversível — PO (b)) |
| Feedback | nenhum toast/diálogo; o reorder e o flip de texto são o feedback |
| Ícone | 📌 (emoji Unicode, `aria-hidden`), `text-lg` no índice, `gap-2` no menu |
| Alvo/touch | `min-h-11` (44px, LB-4) no botão do índice e nos `menuitem`s |
| Contrato UI↔store | `togglePinLista(id)`; `ListaIndex.pinned`; `lista.pinned` no detalhe; `listIndex()` ordena Fixadas→Demais por `updated_at` desc |
| Forma do campo/migration/RLS/sync | 🤖 DEV (fora de escopo) |
| Dependências/tokens | nenhum novo (sem Radix/HeadlessUI, sem novo token de cor) |