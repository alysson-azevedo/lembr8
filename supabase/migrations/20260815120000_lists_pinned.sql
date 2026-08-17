-- Migração: fixar (favoritar) listas (LB-14). Campo aditivo `pinned` em
-- `public.lists`, default `false` — lista existente não nasce fixada (AC 12),
-- sem breaking change nos dados (additive: nova coluna, nenhum rename/remove).
--
-- RLS sem mudança (AC 13): `pinned` pertence à linha da lista, já coberta pela
-- policy por `auth.uid()` existente (lists_*_own). Nenhuma policy nova.

alter table public.lists
  add column pinned boolean not null default false;

-- Recria a RPC `sync_push` para upsertar `pinned` junto a `nome`/`updated_at`.
-- Mesmo merge por `updated_at` (estritamente maior vence; empate mantém o
-- atual). `pinned` ausente no payload (client antigo) cai em `false` via
-- coalesce — compatível com dispositivos ainda não atualizados. A assinatura
-- (jsonb, jsonb) é inalterada, preservando o `grant execute` existente.
create or replace function public.sync_push(
  p_lists jsonb default '[]'::jsonb,
  p_items jsonb default '[]'::jsonb
) returns void language plpgsql as $$
declare rec jsonb;
begin
  for rec in select * from jsonb_array_elements(p_lists)
  loop
    insert into public.lists (id, user_id, nome, pinned, created_at, updated_at)
    values ((rec->>'id')::uuid, auth.uid(), rec->>'nome',
            coalesce((rec->>'pinned')::boolean, false),
            coalesce((rec->>'created_at')::timestamptz, now()),
            coalesce((rec->>'updated_at')::timestamptz, now()))
    on conflict (id) do update
      set nome = excluded.nome, pinned = excluded.pinned, updated_at = excluded.updated_at
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