-- Migração: exclusão (hard delete) de listas e itens (LB-8).
-- Sem tombstone/soft-delete no schema: a exclusão remove o registro da fonte de
-- verdade. A ressuscitação offline é tratada no cache local (deletedIds), não
-- aqui. RLS continua garantindo que só o dono deleta seus próprios registros.
-- A FK items.list_id ... on delete cascade já existe; deletar a lista derruba os
-- itens em cascade (o adapter também deleta os itens explicitamente — lida com
-- órfãos e com o fake adapter de teste, que não tem cascade).

-- Grants de delete para authenticated (hoje só select/insert/update).
grant delete on public.lists to authenticated;
grant delete on public.items to authenticated;

-- RLS de delete: só o dono (auth.uid() = user_id).
create policy "lists_delete_own" on public.lists for delete to authenticated
  using ((select auth.uid()) = user_id);

-- items: isolamento via join em list_id (items não tem user_id direto).
create policy "items_delete_own" on public.items for delete to authenticated
  using (exists (
    select 1 from public.lists l where l.id = items.list_id and l.user_id = (select auth.uid())
  ));