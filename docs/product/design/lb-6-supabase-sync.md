# Spec de design técnico — LB-6: Persistência local-first no Supabase (sync cross-device)

**Issue:** [LB-6](https://linear.app/alysson-azevedo/issue/LB-6/persistencia-local-first-das-listas-no-supabase-sync-cross-device) · **State:** ✅ Deployed (v0.4.0) · **Tipo:** 🧹 Tarefa
**Base:** LB-5 (✅ Deployed v0.3.0)

Spec de **negócio** (critérios de aceite + UX): [`docs/product/lb-6-supabase-sync.md`](../lb-6-supabase-sync.md). ADRs: 2026-08-10 (arquitetura), 2026-08-05 (preview→banco de prod), 2026-08-03 (chaves publishable/secret, Supabase local em Docker).

Este documento define as decisões de **implementação** (schema, formato do cache, fila de mudanças, triggers de sync, mapeamento de ids, migração, testes) suficientes para o 🤖 DEV implementar sem inventar. **Não reabre** decisões de arquitetura/produto já confirmadas.

---

## Princípios orientadores

1. **A UI não muda** — `ListasIndex.tsx`, `ListaScreen.tsx` e a API pública do `store` (`useListas`, `useLista`, `createList`, `renameList`, `addItemToLista`, `toggleItem`, `useHydrated`) continuam idênticas em assinatura e comportamento. A UI nunca chama o Supabase diretamente.
2. **Local-first** — toda leitura é atendida pelo cache localStorage (instantânea, pós-hidratação); toda escrita atualiza o cache imediatamente e enfileira a mudança. Nenhuma ação do usuário aguarda rede.
3. **Nenhum dado perdido** — fila de pending ops persistida; sync push+pull com merge por `updated_at`; migração idempotente.
4. **RLS é a única barreira entre contas** — cache local só contém dados da conta autenticada.
5. **Sem delete, sem realtime, sem reordenação** — escopo da LB-6 cobre apenas criar/marcar/renomear já suportados pela LB-5.

---

## 1. Schema SQL (nova migration)

Arquivo: `supabase/migrations/20260810120000_lists_items.sql` (timestamp posterior ao `20260803210000_init_profiles.sql`). Segue o padrão da `init_profiles.sql`: tabela → `enable row level security` → policies → `grant` explícito a `authenticated` e `service_role`.

```sql
-- Migração: listas e itens do usuário (LB-6). Fonte de verdade cross-device.
-- RLS habilitada; usuário só acessa suas listas/itens. Sem delete em escopo.

create table public.lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists (id) on delete cascade,
  texto      text not null,
  concluido  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lists enable row level security;
alter table public.items enable row level security;

-- Índices de acesso por conta e por lista.
create index idx_lists_user_id  on public.lists (user_id);
create index idx_items_list_id  on public.items (list_id);

-- RLS de lists: só o dono (auth.uid() = user_id).
create policy "lists_select_own" on public.lists for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "lists_insert_own" on public.lists for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "lists_update_own" on public.lists for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- RLS de items: isolamento via join em list_id (items não tem user_id direto).
create policy "items_select_own" on public.items for select to authenticated
  using (exists (
    select 1 from public.lists l where l.id = items.list_id and l.user_id = (select auth.uid())
  ));
create policy "items_insert_own" on public.items for insert to authenticated
  with check (exists (
    select 1 from public.lists l where l.id = items.list_id and l.user_id = (select auth.uid())
  ));
create policy "items_update_own" on public.items for update to authenticated
  using (exists (
    select 1 from public.lists l where l.id = items.list_id and l.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.lists l where l.id = items.list_id and l.user_id = (select auth.uid())
  ));

-- Grants: authenticated seleciona/insere/atualiza; service_role tudo. Sem delete na UI.
grant select, insert, update on public.lists to authenticated;
grant all on public.lists to service_role;
grant select, insert, update on public.items to authenticated;
grant all on public.items to service_role;

-- updated_at automática APENAS quando a aplicação não fornece o valor.
-- O sync envia updated_at = timestamp da edição no device (governa o merge
-- cross-device). O trigger só preenche now() quando a coluna vem ausente/igual
-- (escritas server-side futuras), preservando o timestamp do client.
create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  if NEW.updated_at is not distinct from OLD.updated_at then
    NEW.updated_at = now();
  end if;
  return NEW;
end;
$$;

create trigger trg_lists_updated_at before update on public.lists
  for each row execute function public.set_updated_at();

create trigger trg_items_updated_at before update on public.items
  for each row execute function public.set_updated_at();
```

### Decisões do schema (justificadas)

- **`user_id uuid not null default auth.uid()`** — o client não precisa enviar (nem deve) `user_id`; o default preenche com o dono da sessão e a policy `with check` rejeita qualquer valor forjado que divirja. Mais robusto que confiar no client.
- **`items` sem `user_id`** — isolamento via join em `list_id` (a lista é a unidade de propriedade). Mantém o modelo da LB-5 (`Item { listId }`) e evita coluna redundante.
- **Trigger `set_updated_at` condicional** (`is not distinct from OLD.updated_at`) — decisiva para o merge: `updated_at` no cloud reflete **quando a edição ocorreu no device**, não quando o servidor a recebeu. Assim dois devices com clocks desalinhados ainda respeitam "última escrita vence" pelo timestamp da edição. Em INSERT sem `updated_at` (escrita server-side), preenche `now()`; em INSERT/UPDATE do client, o timestamp enviado é preservado.
- **Sem policy/rota de delete** — fora de escopo (a migration não cria `delete` policy nem grant de delete a `authenticated`; `service_role` mantém `all` apenas para operações admin/migrações).
- **`auth.uid()` envolvido em `(select auth.uid())`** — segue o padrão da `init_profiles.sql` (evita problemas de parsing em algumas versões do PostgREST).

### RPC de push (merge server-side)

O `supabase-js` `.upsert()` não permite cláusula `WHERE` no `ON CONFLICT DO UPDATE`, e o merge "última escrita vence / primeiro que chega vence" exige comparação de `updated_at`. Por isso, o push usa uma **RPC** (invoker, sujeita a RLS) que aplica o upsert condicional em lote:

```sql
-- Upsert de listas/itens enviados pelo sync. Só sobrescreve se a versão
-- recebida for ESTRITAMENTE mais recente (updated_at > atual) — empate de
-- updated_at não sobrescreve (primeiro que chega ao cloud vence). Invoker:
-- roda como o usuário autenticado, respeitando RLS.
create or replace function public.sync_push(
  p_lists jsonb default '[]'::jsonb,
  p_items jsonb default '[]'::jsonb
) returns void language plpgsql as $$
declare rec jsonb;
begin
  for rec in select * from jsonb_array_elements(p_lists)
  loop
    insert into public.lists (id, user_id, nome, created_at, updated_at)
    values ((rec->>'id')::uuid, auth.uid(), rec->>'nome',
            coalesce((rec->>'created_at')::timestamptz, now()),
            coalesce((rec->>'updated_at')::timestamptz, now()))
    on conflict (id) do update
      set nome = excluded.nome, updated_at = excluded.updated_at
      where excluded.updated_at > public.lists.updated_at;
  end loop;

  for rec in select * from jsonb_array_elements(p_items)
  loop
    insert into public.items (id, list_id, texto, concluido, created_at, updated_at)
    values ((rec->>'id')::uuid, (rec->>'list_id')::uuid, rec->>'texto',
            coalesce((rec->>'concluido')::boolean, false),
            coalesce((rec->>'created_at')::timestamptz, now()),
            coalesce((rec->>'updated_at')::timestamptz, now()))
    on conflict (id) do update
      set texto = excluded.texto, concluido = excluded.concluido,
          updated_at = excluded.updated_at
      where excluded.updated_at > public.items.updated_at;
  end loop;
end;
$$;

grant execute on function public.sync_push(jsonb, jsonb) to authenticated;
```

> Nota para o DEV: a cláusula `where excluded.updated_at > ... ` materializa "empate → primeiro que chega vence" (estritamente maior). A função roda como invoker, então RLS filtra `user_id`/`list_id` por conta — um `p_items` com `list_id` alheio é rejeitado pela policy `items_insert_own`/`items_update_own`.

---

## 2. Evolução do repository (local-first)

A UI continua consumindo só o `store` via `useSyncExternalStore`. O `store` mantém a mesma API pública; apenas a fábrica do repositório muda e ganha dois ganchos de sync (`sync()` e `resetForUser()`). **A store não importa `supabase`** — só a fábrica do repo.

### Contrato do adapter (injetável)

Novo arquivo `src/lib/todos/cloud-adapter.ts`:

```ts
/** Registro no formato do cloud (com timestamps para o merge). */
export type ListRecord = { id: string; nome: string; created_at: string; updated_at: string };
export type ItemRecord = {
  id: string; list_id: string; texto: string; concluido: boolean;
  created_at: string; updated_at: string;
};

/** Adapter do cloud — injetável para testes (fake em node/jsdom sem Supabase real). */
export interface CloudAdapter {
  /** Push em lote com merge por updated_at (RPC `sync_push`). */
  push(lists: ListRecord[], items: ItemRecord[]): Promise<void>;
  /** Pull de todas as listas/itens do usuário autenticado. */
  pull(): Promise<{ lists: ListRecord[]; items: ItemRecord[] }>;
}
```

Implementação real (`createSupabaseCloudAdapter()`): usa `getBrowserSupabase()` e chama `supabase.rpc('sync_push', { p_lists, p_items })` e `select` em `lists`/`items`. Em testes, injeta um `FakeCloudAdapter` em memória.

### Fábrica do repositório

`createLocalFirstRepository({ storage, adapter, userId, clock })` (em `repository.ts`, substituindo `createLocalStorageRepository` na store):

- `storage: StorageLike` — cache localStorage (default `globalThis.localStorage`).
- `adapter: CloudAdapter | null` — se `null`, resolve `createSupabaseCloudAdapter()` lazy (só no client). Em testes, injeta fake ou `null` para desabilitar cloud.
- `userId: string | null` — id da conta autenticada (para isolamento do cache).
- `clock: () => string` — timestamp (default `() => new Date().toISOString()`); injetável em testes.

Mantém a interface `ListasRepository` intacta e adiciona **métodos de sync**:

```ts
export interface ListasRepository {
  // ... (inalterados: listListas, listIndex, getLista, listItems,
  //      createList, renameList, addItem, toggleItem)
  /** Sincroniza com o cloud (push dos pendentes + pull/merge). Retorna resumo. */
  sync(): Promise<{ pushed: number; pulled: number }>;
  /** Reinicia o cache para outra conta (isolamento no login/logout). */
  resetForUser(userId: string): void;
}
```

### Formato e versionamento do cache (v3)

Chave única `lembr8.data` (mantida). Evoluir `VERSION` de 2 → 3:

```ts
const VERSION = 3;

type ListRecordLocal = Lista & { createdAt: string; updatedAt: string };
type ItemRecordLocal = Item & { createdAt: string; updatedAt: string };

type PendingOp =
  | { kind: "list"; id: string }   // upsert da lista id
  | { kind: "item"; id: string };  // upsert do item id

type CacheState = {
  version: 3;
  userId: string | null;          // isolamento entre contas
  lists: ListRecordLocal[];
  items: ItemRecordLocal[];
  pending: PendingOp[];           // fila de mudanças locais a fazer push
  migrated: boolean;              // migração cloud do 1º login já ocorreu?
  lastSyncAt: string | null;
};
```

**Migração de formato v2 → v3** (ao ler cache legado da LB-5): normaliza para v3 adicionando `userId = null`, `createdAt = updatedAt = now()` em cada registro, `pending = []`, `migrated = false`, `lastSyncAt = null`. Preserva todos os `lists`/`items` e seus ids — sem perda. Roda uma vez por cache.

> `migrated = false` após a migração de formato garante que dados pré-upgrade sobam ao cloud no 1º login (ver §4).

### Escrita local (mutação)

Cada mutação (`createList`, `renameList`, `addItem`, `toggleItem`):
1. Aplica a lógica de domínio existente (ordem das seções, reutilização/duplicado) — **funções puras atuais reutilizadas sem mudança de assinatura**.
2. Seta `updatedAt = clock()` no registro afetado (e `createdAt = clock()` em criações).
3. `write(next)` grava o cache imediatamente (UI responde na hora).
4. Enfileira `{ kind, id }` em `pending` (dedup por `(kind, id)` mantendo a entrada mais à frente — o estado final do registro já é o atual).

### Leitura local

Atendida só pelo cache (`read()`), instantânea e pós-hidratação — como hoje. **A leitura nunca aguarda o cloud.** O `store` continua usando `useSyncExternalStore` com snapshot server vazio (`EMPTY_INDEX`/`EMPTY_SCREEN`).

### Isolamento entre contas

- Ao `read()`: se `cache.userId` existir e **divergir** do `userId` atual (outra conta), **descarta o cache** (`removeItem` + estado vazio) antes de usar. O cache nunca serve dados de outra conta.
- `resetForUser(userId)`: chamado pelo SyncController no login/logout (ver §5), limpa o cache e reinicia o estado in-memory para a nova conta. Para usuário novo (cache vazio), apenas seta `userId`.

> Os dados da conta anterior permanecem fisicamente no `localStorage` até serem sobrescritos pela nova conta (não há chave por usuário), mas **nunca são lidos/servidos** a outra conta — a leitura divergente é descartada. Atende o AC de RLS no cache.

---

## 3. Sync (algoritmo)

### Mapeamento de ids — **id local = id do cloud** (sem tabela de mapeamento)

Os ids são UUIDs v4 gerados no client (`crypto.randomUUID()`). O `id` do registro no cloud é o mesmo id local. A migration permite `id uuid pk default gen_random_uuid()` (INSERT com id explícito ou gerado). **Justificativa:** UUIDs v4 são únicos por device e a colisão entre devices é estatisticamente desprezível; o upsert por `id` é idempotêntico; o pull traz registros com o mesmo id que já está no cache — merge natural. Multi-device: cada device gera ids próprios → **união por id, sem colisão, sem perda**. Evita uma tabela de mapeamento extra e sua própria sincronização.

### Momentos do trigger

Disparado pelo `SyncController` (§5), sempre que logado e online:
1. **Ao montar o app autenticado** (app shell carrega no client) — se `navigator.onLine`, roda `sync()`.
2. **Ao evento `online`** (reconexão) — roda `sync()`.
3. **Ao `SIGNED_IN`** (`onAuthStateChange`) — roda `resetForUser(uid)` (se trocou de conta) seguido de `sync()` (cobre login novo e sessão persistente ativa).
4. **Ao `SIGNED_OUT`** — roda `resetForUser(null)` (limpa o cache).

O evento `offline` não dispara nada (continua no cache). **Sem indicador de UI** (padrão da spec de negócio).

### Algoritmo `sync()`

```
async sync():
  if !navigator.onLine or adapter == null: return {pushed:0, pulled:0}
  try:
    // 1. Migração do 1º login (se pendente) — §4
    if !state.migrated:
      enfileirar TODAS as listas/items como pending (além dos dirty normais)
    // 2. PUSH — aplica a fila ao cloud
    if pending não vazio:
      dedup pending por (kind,id) → listas[]/items[] únicos (lê estado atual do cache)
      await adapter.push(listas, items)
      limpar pending (sucesso); em falha, manter pending (retry no próximo sync)
    // 3. PULL — lê o cloud e merge com o cache por updated_at
    cloud = await adapter.pull()
    merge(cloud)   // por registro, última escrita vence
    state.migrated = true
    state.lastSyncAt = clock()
    write(state); bumpVersion + notify (UI reflete mudanças vindas do cloud)
    return {pushed, pulled}
  catch:
    // rede falhou no meio — manter pending; não marcar migrated se não completou
    return {pushed, pulled}
```

### Merge por `updated_at` (pull)

Para cada registro vindo do cloud, comparar `updated_at` com o local (por `id`):
- **cloud.updated_at > local.updated_at** → sobrescreve o local (última escrita vence).
- **cloud.updated_at < local.updated_at** → mantém o local (e o registro permanece em `pending` para o push — a versão local mais recente sobe).
- **cloud.updated_at == local.updated_at** → mantém o local (idempotente).
- **registro só no cloud** (id não existe local) → adiciona ao cache (segundo device).
- **registro só local** (id não existe no cloud) → mantém; será pushado (está em `pending` ou foi criado offline).

`created_at` é preservado do cloud quando o registro vem de lá (estabilidade cross-device). Ordem de exibição (a-fazer ++ concluídos) é **derivada** do estado `concluido` no cache após o merge — como hoje, o array de itens mantém a ordem de renderização; registros vindos do pull são inseridos respeitando a ordenação da LB-5.

> **Sem duplicata indevida:** o merge opera por `id` (upsert no cache), nunca insere um segundo registro para o mesmo id. O `addItem` com texto igual já evita duplicata pelo critério de reutilização/duplicado da LB-5 — que continua valendo localmente.

---

## 4. Migração no 1º login pós-upgrade

### Detecção

Flag `migrated` no cache (boolean). Após a migração de formato v2→v3, `migrated = false`. O `sync()` enxerga `migrated === false` e enfileira **todos** os registros locais como `pending` (push inicial completo), além dos dirty normais. Após o push+pull terminar com sucesso, `migrated = true` — **não re-migra**.

### Upsert

Reusa o `sync_push` (RPC §1): envia todas as listas/items do cache (upsert por `id`, merge por `updated_at`). Em cache vazio (usuário novo sem dados legados), `pending` fica vazio, o push não envia nada e `migrated = true` é marcado — não re-tenta.

### Multi-device (união por item, sem perda)

- Device A (1º login) sobe seus dados (ids próprios). Device B (1º login depois) sobe seus dados (ids próprios, diferentes de A). O `sync_push` faz insert de cada id (sem colisão de id entre devices) → **união**. O pull em seguida funde o estado consolidado em ambos.
- **Empate de `updated_at`** (mesma lista/item editada em dois devices com timestamps iguais): o `where excluded.updated_at > target.updated_at` (estritamente maior) no `sync_push` faz o **primeiro que chega ao cloud prevalecer**; o segundo (com `updated_at` igual) não sobrescreve. Sem perda de dados distintos (ids diferentes); só o estado de um mesmo id empatado segue "primeiro que chega".
- Dados legados (`lembr8.todos` do MVP) já foram migrados para `lembr8.data` v2 pela LB-5; a v2→v3 preserva os ids originais dos itens, que sobem ao cloud como `id` — consistência com a LB-5.

---

## 5. Detecção de online/reconexão + SyncController

Novo componente **plumbing** (sem UI visível, sem dependências novas): `src/components/sync/SyncController.tsx` (`"use client"`), montado uma vez no `AppLayout` (`src/app/(app)/layout.tsx`). Responsabilidades:

- `navigator.onLine` + `addEventListener('online'/'offline')`: ao `online`, chama `store.sync()`.
- `supabase.auth.onAuthStateChange`: ao `SIGNED_IN`, `store.resetForUser(uid)` (se conta divergente) + `store.sync()`; ao `SIGNED_OUT`, `store.resetForUser(null)`. Usa o browser client (`getBrowserSupabase`) — não há nova dependência (`@supabase/supabase-js`/`@supabase/ssr` já no projeto).
- Ao montar: se `navigator.onLine`, chama `store.sync()`.

> O `AppLayout` é server component; `SyncController` é o único filho client necessário e **não renderiza nada** (`return null`). Não é um componente de UI de produto — é wiring de lifecycle. A UI de produto (`ListasIndex`, `ListaScreen`) permanece inalterada.

### Adaptações no `store.ts`

- Trocar `createLocalStorageRepository()` por `createLocalFirstRepository({ adapter: undefined, userId })` (o `userId` vem do sync controller ou é resolvido lazy pelo adapter via sessão). A store continua **sem importar `supabase`** — só a fábrica do repo resolve o adapter.
- Expor `sync()` e `resetForUser(userId)` (chamam o repo e, ao final do pull, `bumpVersion()` + `notify()` para a UI refletir mudanças do cloud).
- Manter `__resetListasStoreForTests()` cobrindo os novos campos.

### Indicador de status na UI

**Padrão: nenhum indicador** (transparência total, alinhado à spec de negócio e a "a UI não muda"). O `SyncController` é invisível. Se o uso real mostrar fricção (usuário incerto se salvou), um badge "offline" discreto pode ser proposto como trade-off **em issue futura**, passível de confirmação — **não implementar nesta issue**.

---

## 6. Testes

`npm test` = `vitest run` (config em `vitest.config.ts`, env `node`, setup em `tests/setup.ts` que sobe chaves do Supabase local). Cobertura:

### Lógica pura (node, sem DOM/Supabase) — `tests/sync.test.ts` (novo)
- **Merge por `updated_at`**: cloud > local sobrescreve; cloud < local mantém (+ permanece pending); igual mantém; só-cloud adiciona; só-local mantém. (Função `mergeCache(local, cloud)` extraída pura e testável.)
- **Fila de pending ops**: mutação enfileira op; dedup por `(kind,id)`; push limpa pending em sucesso; push mantém pending em falha (fake adapter que rejeita) → retry.
- **Migração v2→v3**: cache v2 (sem `userId`/`pending`/`migrated`/timestamps) normaliza para v3 preservando `lists`/`items`/ids; `migrated=false`.
- **Isolamento entre contas**: `read()` com `userId` divergente descarta o cache; `resetForUser` limpa estado.
- **Mapeamento id local = cloud**: upsert por id idempotente; pull com mesmo id funde sem duplicata.

### Repository local-first (jsdom com `StorageLike` fake + `FakeCloudAdapter`) — estende `tests/todos.test.ts`
- Mutação grava cache imediatamente + enfileira pending; leitura só do cache.
- `sync()` push→pull→merge com `FakeCloudAdapter` (controla estado do "cloud"); sem rede (`adapter null` ou offline) → no-op, cache intacto.
- Migração do 1º login: `migrated=false` → sync enfileira tudo → push → `migrated=true`; segundo sync não re-enfileira.
- Reaproveitar `memoryStorage` e os asserts de persistência existentes.

### RLS (Supabase local em Docker) — estende `tests/rls.test.ts`
- **lists**: usuário só vê/seleciona/insere/atualiza suas listas; tentativa de insert/update com `user_id` alheio rejeitada pela policy; `default auth.uid()` preenche o dono.
- **items**: usuário só vê/items das suas listas (via join); insert de item com `list_id` alheio rejeitado; update de item alheio rejeitado.
- **`sync_push` RPC**: push só grava nas próprias listas; `where excluded.updated_at > target.updated_at` — empate não sobrescreve (assert: duas chamadas com mesmo `updated_at`, a primeira prevalece).
- **anon** não tem acesso (sem grant) — reutilizar o padrão de `profiles`.

### UI isolada do storage — estende `tests/todos.test.ts` (bloco "Isolamento da camada de dados")
- Manter: `ListasIndex`/`ListaScreen` sem `localStorage` e sem `supabase`.
- Atualizar a asserção da store: `store.ts` **não** referencia `supabase` (só a fábrica do repo resolve o adapter); `repository.ts` referencia `localStorage` (cache) e, opcionalmente, `@/lib/supabase/client` (adapter default) — permitido no repo, proibido na UI/store.
- Novo: `SyncController` é o único componente autorizado a importar `supabase` (plumbing); `ListasIndex`/`ListaScreen` continuam sem.

### Onde cada teste vive
- `tests/sync.test.ts` (novo) — merge/fila/migração/isolamento (lógica pura).
- `tests/todos.test.ts` (estendido) — repository local-first com fakes + isolamento UI/store.
- `tests/rls.test.ts` (estendido) — RLS de `lists`/`items` + RPC `sync_push` (Supabase local em Docker).

---

## 7. Ergonomia mobile/desktop + dependências

- **Sem regressão LB-4/LB-5**: o shell (`min-h-dvh`, safe-area, `max-w-[28rem]`), o índice, a tela da lista, a entrada inline, as seções a-fazer/concluídos, a reutilização de concluído e o foco de duplicado permanecem **inalterados** — a camada de sync não toca na UI de produto.
- **Dependências**: `@supabase/supabase-js` (`^2.60.0`) e `@supabase/ssr` (`^0.12.4`) **já estão no `package.json`** — confirmado, nenhuma dependência nova. `crypto.randomUUID()` (já usado pela LB-5) cobre a geração de ids no client.
- **Sem novos componentes de UI de produto** — apenas `SyncController` (plumbing, `return null`).

---

## 8. Implantação (instruções ao DEV — cloud em prod)

Conforme ADR 2026-08-05, o preview aponta para o banco de **prod** (`tfgbkyjwzqvvklutmeln`). A migration precisa estar aplicada em prod **antes** de o preview depender dela; nada destrutivo/em massa no preview; RLS é a única barreira entre contas.

1. Local: `supabase db reset` (aplica a nova migration + `init_profiles` no Docker) e roda os testes.
2. Prod (estágio DEV — access token em `/tmp/lb6-supabase-token`, modo 600, fora do repo):
   ```bash
   SUPABASE_ACCESS_TOKEN="$(cat /tmp/lb6-supabase-token)" supabase link --project-ref tfgbkyjwzqvvklutmeln
   SUPABASE_ACCESS_TOKEN="$(cat /tmp/lb6-supabase-token)" supabase db push
   ```
3. Confirmar em prod que `lists`/`items` e a RPC `sync_push` existem antes de abrir o preview.
4. PR referencia LB-6; anexar PR na issue (`orca linear attach`).

> RLS já isola contas; o preview escreve em dados reais — validar apenas com fluxos não-destrutivos (criar/marcar/renomear listas e itens da própria conta de teste), nunca operações em massa ou delete.

---

## 9. Checklist de implementação (para o DEV)

- [ ] Migration `20260810120000_lists_items.sql` (tabelas, RLS, índices, grants, trigger, RPC `sync_push`).
- [ ] `cloud-adapter.ts` (`CloudAdapter`, `createSupabaseCloudAdapter`) + `FakeCloudAdapter` para testes.
- [ ] `repository.ts`: `createLocalFirstRepository` (cache v3, pending, `sync()`, `resetForUser`), migração v2→v3, mutações com `updatedAt`+pending.
- [ ] `store.ts`: nova fábrica + `sync()`/`resetForUser` expostos; store sem importar `supabase`.
- [ ] `SyncController.tsx` (plumbing) montado no `AppLayout` (online/offline + `onAuthStateChange`).
- [ ] Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` já cobertas pelo `.env.example`/setup — confirmar no preview.
- [ ] Testes: `tests/sync.test.ts`, estender `tests/todos.test.ts` e `tests/rls.test.ts`.
- [ ] Migration aplicada em prod antes do preview; PR anexado à issue.