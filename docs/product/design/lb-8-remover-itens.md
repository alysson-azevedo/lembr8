# Spec de design — LB-8: Remover itens e listas (exclusão)

**Issue:** [LB-8](https://linear.app/alysson-azevedo/issue/LB-8/nao-e-possivel-remover-itens-adicionados) · **State:** 📑 Spec → 🚧 Dev in progress · **Tipo:** 🛠️ Bug
**Base:** LB-6 (✅ Deployed v0.4.1) — listas/itens no Supabase (fonte de verdade) + cache localStorage (local-first), sync cross-device por `updated_at`.
**Spec de negócio:** `docs/product/lb-8-remover-itens.md` (AC + UX do usuário). **ADRs:** `docs/decisions.md` (2026-08-14 — hard delete sem tombstone no schema; tombstone local no cache para exclusão offline).

Arquivos atuais relevantes: `src/lib/todos/{types,repository,store,cloud-adapter}.ts`, `src/components/listas/{ListasIndex,ListaScreen}.tsx`, `src/lib/todos/gate.ts`, `supabase/migrations/20260810120000_lists_items.sql`.

Esta spec fixa **design técnico** (UX da exclusão + estrutura de código para o DEV implementar sem inventar). Decisões de negócio/AC não se reabrem. A UI continua consumindo só o `store`/repository — nunca `localStorage` ou Supabase direto.

---

## Princípios

1. **Reutilizar o padrão visual LB-2..LB-6**: paleta `--background/--foreground/--muted`, bordas `border-current/20`, `divide-current/10`, alvos `min-h-11` (44px, LB-4), dark mode por `prefers-color-scheme`. Sem novos tokens de cor; o vermelho de "destrutivo" usa `text-red-600 dark:text-red-400` (única adição pontual, sem novo token nomeado).
2. **Mínimo que entrega valor**: exclusão de item e de lista, um diálogo de confirmação reutilizável, sem undo, sem swipe/gesture, sem menu de contexto. Sem nova dependência (sem Radix/HeadlessUI).
3. **Deliberada e protegida**: a barreira contra perda acidental é a **confirmação prévia** (obrigatória); não há undo depois.
4. **UI isolada do storage**: a UI chama `deleteItem(id)` / `deleteLista(id)` no `store`; o repository cuida do cache local, do tombstone local (`deletedIds`) e do hard delete no cloud. A UI não conhece `deletedIds` nem Supabase.
5. **Hard delete, sem tombstone no schema do cloud** (ADR 2026-08-14): exclusão remove o registro do Supabase. A **limitação cross-device** (outro device pode não refletir a exclusão) é aceita e documentada.

---

## 1. Affordance de exclusão de item

Cada item — **a-fazer e concluídos** — expõe um botão **"×"** à direita da linha, alvo `min-h-11 min-w-11` (44px, LB-4). Aplicado nas duas seções da `ListaScreen`.

**Restruturar a linha** (hoje é `<label>` envolvendo checkbox + texto). O clique no "×" não pode acionar o toggle, então o "×" fica **fora** da `<label>`:

```
<li id={`item-${item.id}`} className="flex items-center gap-3 py-2">
  <label className="flex min-h-11 flex-1 items-center gap-3 cursor-pointer">
    <input type="checkbox" ... />                 {/* toggle, igual hoje */}
    <span>{item.texto}</span>                      {/* line-through + muted se concluído */}
  </label>
  <button
    type="button"
    onClick={() => abrirConfirmacaoItem(item)}
    className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-foreground"
    aria-label={`Excluir "${item.texto}"`}
    title="Excluir item"
  >
    ✕
  </button>
</li>
```

- `✕` é caractere Unicode (sem ícone/lib), `text-lg`.
- `aria-label` inclui o texto do item para leitores de tela.
- O highlight transitório de duplicado (atual) permanece na `<label>`/`<li>`; o "×" é ortogonal a ele.

**Comportamento:** clicar no "×" abre o `ConfirmDialog` (§3). Confirmar → `deleteItem(item.id)`; a UI re-renderiza sem o item (o `store` faz `bumpVersion` + `notify`). Cancelar/Esc → nada.

---

## 2. Affordance de exclusão de lista

Exclusão de lista exposta em **dois** lugares, ambos abrindo o mesmo `ConfirmDialog` de lista:

### 2.1 Índice (`/`) — `ListasIndex`
A linha da lista hoje é um `<Link>` que ocupa toda a largura. Adicionar o "×" **fora** do `<Link>` (clicar em "×" não navega):

```
<li className="flex items-center gap-4">
  <Link href={`/listas/${lista.id}`} className="flex min-h-11 flex-1 items-center justify-between gap-4 text-base">
    <span>{lista.nome}</span>
    <span className="text-muted text-base">{lista.aFazer} a fazer</span>
  </Link>
  <button
    type="button"
    onClick={() => abrirConfirmacaoLista(lista)}
    className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-foreground"
    aria-label={`Excluir lista "${lista.nome}"`}
    title="Excluir lista"
  >
    ✕
  </button>
</li>
```

### 2.2 Detalhe (`/listas/[id]`) — `ListaScreen`
Botão discreto no rodapé da tela da lista (o usuário pode estar dentro da lista obsoleta e querer descartá-la sem voltar ao índice):

```
<button
  type="button"
  onClick={() => abrirConfirmacaoLista(lista)}
  className="mt-8 min-h-11 w-full rounded border border-current/20 px-3 py-2 text-base text-red-600 dark:text-red-400"
>
  Excluir lista
</button>
```

- Renderizado só quando `lista` existe (após hidratação).
- **Trade-off (mínimo):** duas affordances (índice + detalhe) vs. uma só. Ambas atendem o AC 2; o caso de uso de referência cita o índice, mas o detalhe é onde o usuário está quando a lista está aberta e obsoleta. Mesmo diálogo, baixo custo. Se o humano preferir uma só, manter o "×" do índice (primário).

**Comportamento:** confirmar → `deleteLista(lista.id)`; **navegar para `/`** (índice) — a lista atual deixa de existir e o `useLista` retornaria `lista: null` (ver §4).

---

## 3. Diálogo de confirmação (`ConfirmDialog`)

**Componente novo e reutilizável:** `src/components/ui/ConfirmDialog.tsx` (`"use client"`). Sem dependência externa — inline com Tailwind, acessível.

**Props:**
```ts
type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;       // default "Cancelar"
  destructive?: boolean;      // confirm em vermelho
  onConfirm: () => void;
  onCancel: () => void;
};
```

**Acessibilidade e comportamento:**
- Overlay `fixed inset-0 z-50 bg-black/40` + card `w-full max-w-sm rounded border border-current/20 bg-background p-5` centralizado (`flex min-h-dvh items-center justify-center` no overlay).
- `role="dialog" aria-modal="true" aria-labelledby={titleId}`.
- **Foco inicial no botão Cancelar** (ação não-destrutiva) ao abrir; `Esc` = cancela; click no overlay (fora do card) = cancela.
- Focus trap simples: `onKeyDown` tab entre Cancelar↔Confirmar (2 botões); `Tab`/`Shift+Tab` não sai do diálogo.
- Botões lado a lado (`flex gap-3`), ambos `min-h-11`, `flex-1`. Confirm recebe `text-red-600 dark:text-red-400 border-current/20` quando `destructive`.

**Uso em `ListaScreen` (item e lista) e `ListasIndex` (lista):** estado local `confirmacao: { tipo: "item"|"lista"; alvo: ... } | null`. O componente `ListaScreen` guarda confirmação de item e de lista; `ListasIndex` guarda a de lista. `open = confirmacao !== null`.

**Textos (fixos nesta spec):**

| Caso         | title             | description                                                                 | confirmLabel     | destructive |
| ------------ | ----------------- | -------------------------------------------------------------------------- | ---------------- | ----------- |
| Excluir item | "Excluir item?"   | `Excluir "{texto}" da lista? Esta ação não pode ser desfeita.`             | "Excluir"        | true        |
| Excluir lista| "Excluir lista?"  | `Excluir "{nome}" e todos os seus itens? Esta ação não pode ser desfeita.` | "Excluir lista"  | true        |

A descrição de lista **deixa claro que os itens vão junto** (AC 3). Cancelar aborta e nada é removido (AC 3).

---

## 4. Estados vazios e navegação pós-exclusão

- **Excluir item:** o item some da seção correspondente. Se era o último item, a tela mostra o estado vazio existente ("Nenhum item ainda..."). Sem mudança.
- **Excluir lista (do detalhe):** após `deleteLista(id)`, `router.replace("/")` — o usuário volta ao índice; a lista some do índice. Se restar zero listas, o índice mostra o estado vazio existente ("Nenhuma lista ainda...").
- **Excluir lista (do índice):** a linha some; o usuário permanece no índice.
- **Deep-link para lista inexistente** (`/listas/[id]` de id que não existe / foi excluído): após hidratação, se `lista === null`, `ListaScreen` redireciona a `/` (`router.replace("/")`) em vez de renderizar só o input vazio (comportamento atual incompleto). Mínimo: um `useEffect` que, dado `hydrated && !lista`, faz `router.replace("/")`.

Estados de **carregamento/erro** não se aplicam: a exclusão é local-first e síncrona no cache — responde na hora, sem spinner, sem mensagem de erro (AC 4). Falha de rede no hard delete do cloud é silenciosa (retry no próximo sync).

---

## 5. Camada de dados — repository, store e adapter

### 5.1 Modelo (`types.ts`)
Adicionar ao `CacheState` a estrutura de **tombstone local** (não no schema do cloud):

```ts
export type DeletedIds = { lists: string[]; items: string[] };
```

Novas operações na interface `ListasRepository`:

```ts
/** Hard delete do item: remove do cache e marca o id como excluído (tombstone local). */
deleteItem(id: string): void;
/** Hard delete da lista em cascade: remove a lista e seus itens do cache e marca todos os ids. */
deleteLista(id: string): void;
```

### 5.2 Funções puras de domínio (`repository.ts`, testáveis em node sem DOM)
- `deleteItemFromLista(items: Item[], id: string): Item[]` — retorna array sem o item. Não muta.
- `deleteListaCascade(state, listId): { lists, items, deletedIds }` — remove a lista e todos os itens cujo `listId === id`; devolve os ids a marcar (`{ lists: [listId], items: [...itemIds] }`). Não muta.

### 5.3 Repository local-first (`createLocalFirstRepository`)
- **Formato do cache v3 → v4:** adicionar `deletedIds: { lists: string[]; items: string[] }` ao `CacheState`. Migração `migrateV3toV4`: preenche `deletedIds: { lists: [], items: [] }` preservando `lists/items/pending/migrated/lastSyncAt/userId`. (Não é mudança de schema do cloud — é o cache localStorage; o ADR proíbe tombstone no **schema do Supabase**, não no cache.)
- `deleteItem(id)`:
  1. `state.items = deleteItemFromLista(state.items, id)`;
  2. `state.deletedIds.items = dedup([...state.deletedIds.items, id])`;
  3. remove `id` de `pending` (não faz sentido push upsert de item excluído);
  4. `persist(state)` (UI responde na hora).
- `deleteLista(id)`:
  1. `deletedItemIds = state.items.filter(i => i.listId === id).map(i => i.id)`;
  2. `state.lists = state.lists.filter(l => l.id !== id)`; `state.items = state.items.filter(i => i.listId !== id)`;
  3. `state.deletedIds.lists = dedup([...state.deletedIds.lists, id])`; `state.deletedIds.items = dedup([...state.deletedIds.items, ...deletedItemIds])`;
  4. remove esses ids de `pending`;
  5. `persist(state)`.
- `resetForUser`: ao trocar de conta, `deletedIds` é zerado junto com o resto (já que o cache é descartado).

### 5.4 Sync — push com hard delete + pull upsert-only
- **`CloudAdapter`** ganha `delete(listIds: string[], itemIds: string[]): Promise<void>`. Implementação real (`createSupabaseCloudAdapter`):
  ```ts
  await supabase.from("lists").delete().in("id", listIds);
  await supabase.from("items").delete().in("id", itemIds);
  ```
  (RLS filtra por `auth.uid()` — §6.) O `FakeCloudAdapter` de teste ganha `delete()` em memória (remove por id, respeitando `offline`).
- **`sync()` (push):** além do upsert de `pending` (lists/items), chamar `adapter.delete(state.deletedIds.lists, state.deletedIds.items)` quando houver ids. Em **sucesso do push**, limpar `state.deletedIds = { lists: [], items: [] }` e persistir. (Se a rede falhar, manter os `deletedIds` para tentar no próximo sync — igual à fila `pending`.)
- **`sync()` (pull/merge):** `mergeCache` passa a ser **upsert-only** — **nunca remover** registro local porque sumiu do cloud. Concretamente, o merge atual já mantém registros só-locais; a mudança é **filtrar ids em `deletedIds`** ao reimportar do cloud:
  - em `mergeCache`, ao processar `cloud.lists`/`cloud.items`, **pular** qualquer id presente em `local.deletedIds` (não reimportar — evita ressuscitação no device que excluiu).
  - `mergeCache` recebe `local.deletedIds` (ou o `CacheState` completo) para o filtro.
- **Resultado:** no device que excluiu, o item não volta (está em `deletedIds` e foi deletado do cloud no push). Em outro device, o item permanece no cache até que ele mesmo o exclua — consistente com a limitação cross-device (ADR 2026-08-14).

### 5.5 Store (`store.ts`)
Novas funções espelhando o padrão de `toggleItem`:

```ts
export function deleteItem(id: string): void {
  repoInstance().deleteItem(id);
  bumpVersion();
  notify();
}
export function deleteLista(id: string): void {
  repoInstance().deleteLista(id);
  bumpVersion();
  notify();
}
```

A UI importa `deleteItem`/`deleteLista` do `store` — nada mais. Snapshots (`useListas`/`useLista`) já recalculam via `bumpVersion`.

---

## 6. Migration SQL e RLS (Supabase)

Nova migration `supabase/migrations/20260814120000_delete_lists_items.sql`:

- **Grants de delete** (hoje só há `select, insert, update` para `authenticated`):
  ```sql
  grant delete on public.lists to authenticated;
  grant delete on public.items to authenticated;
  ```
- **Policies de delete** (RLS — só o dono):
  ```sql
  create policy "lists_delete_own" on public.lists for delete to authenticated
    using ((select auth.uid()) = user_id);

  create policy "items_delete_own" on public.items for delete to authenticated
    using (exists (
      select 1 from public.lists l where l.id = items.list_id and l.user_id = (select auth.uid())
    ));
  ```
- A FK `items.list_id ... on delete cascade` **já existe** — deletar a lista no cloud derruba os itens em cascade. O delete explícito dos itens pelo adapter é redundante mas seguro (lida com itens órfãos e com o fake adapter de teste).

**AC 8:** a migration precisa estar aplicada em prod (`supabase db push` em 🚀 Ready for Deploy) **antes** de o preview depender dela. Nada destrutivo/em massa no preview (o QA não exclui em massa no preview).

---

## 7. Testes (notas para DEV/QA)

**Funções puras (node, sem DOM):**
- `deleteItemFromLista`: remove o item, preserva ordem dos demais, não muta a entrada.
- `deleteListaCascade`: remove lista + itens da lista, devolve ids corretos, preserva outras listas/itens.
- `mergeCache` upsert-only + filtro `deletedIds`: registro em `deletedIds` não é reimportado do cloud; registros só-locais nunca removidos pelo pull.

**Repository (jsdom/fake adapter):**
- `deleteItem`/`deleteLista` atualizam cache e `deletedIds`; persistem; removem ids de `pending`.
- `sync()` online: push executa `adapter.delete` com os `deletedIds` e os limpa em sucesso; pull não ressuscita item excluído (mesmo se o cloud ainda o tiver — simular fake cloud que ainda contém o id).
- `sync()` offline: `deleteIds` preservados para o próximo sync.

**RLS (Supabase local em Docker):**
- Usuário A não deleta item/lista do usuário B (delete rejeitado/0 linhas); A deleta os próprios.

**UI (jsdom):**
- "×" visível em a-fazer e concluídos; alvo ≥44px (`min-h-11 min-w-11`); `aria-label` correto.
- `ConfirmDialog`: confirmar executa a exclusão; Cancelar/Esc/overlay abortam sem excluir; foco inicial no Cancelar.
- Excluir lista do detalhe redireciona a `/`; excluir do índice remove a linha.
- UI continua isolada do storage: nenhum import de `supabase` ou `localStorage` nos componentes; só `store`.

**Sem regressão:** fluxos de criar/marcar/renomear (LB-6), múltiplas listas (LB-5) e UX mobile (LB-4) preservados em desktop e mobile (AC 7).

---

## 8. Limitação documentada (cross-device)

A **propagação cross-device da exclusão via sync não é garantida** (ADR 2026-08-14). O tombstone local (`deletedIds`) resolve **apenas o device de origem** (evita ressuscitação do item excluído no mesmo device após o próximo sync). Em outros devices, o item/lista permanecem no cache até serem excluídos lá — limitação aceita, não corrigir com tombstone no schema do cloud.

---

## 9. Resumo das decisões de design

| Decisão | Escolha |
| --- | --- |
| Affordance de excluir item | Botão "×" à direita de cada item (a-fazer + concluídos), fora da `<label>`, alvo 44px |
| Affordance de excluir lista | "×" na linha do índice + botão "Excluir lista" no detalhe (mesmo diálogo) |
| Confirmação | `ConfirmDialog` reutilizável, inline, foco no Cancelar, Esc/overlay cancelam; texto de lista avisa itens junto |
| Cascade | FK `on delete cascade` no cloud + remoção explícita local (lista + itens) |
| Hard delete no cloud | `adapter.delete(ids)` no push; grants + policies de delete (RLS por `auth.uid()`) |
| Ressuscitação offline | Tombstone **local** (`deletedIds` no cache v4, sem schema do cloud) + pull **upsert-only** (filtra `deletedIds`) |
| Pós-excluir lista do detalhe | `router.replace("/")` |
| Formato do cache | v3 → v4 (adiciona `deletedIds`), migração preservando dados |