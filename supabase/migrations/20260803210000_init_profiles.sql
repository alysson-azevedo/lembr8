-- Migração inicial: perfil do usuário autenticado.
-- Toda tabela de dados de usuário nasce com RLS habilitada (docs/agents/dev.md).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- O usuário só enxerga e altera o próprio perfil.
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- A Data API não expõe entidades novas sem GRANT explícito (config.toml).
-- `anon` fica de fora de propósito: perfil só é acessível autenticado.
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Cria o perfil automaticamente no signup.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
