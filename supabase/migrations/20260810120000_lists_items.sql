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
-- cross-device). O trigger só preenche now() quando a coluna vem igual
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