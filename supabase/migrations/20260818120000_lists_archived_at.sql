-- Migração: arquivar listas (LB-16). Campo aditivo `archived_at` em
-- `public.lists`, default `null` — lista existente não nasce arquivada (AC 10),
-- sem breaking change nos dados (additive: nova coluna, nenhum rename/remove).
-- `archived_at` nulo = ativa (aparece na tela inicial); preenchido = arquivada
-- (não aparece). Semáforo no formato timestamp (não booleano) para, no futuro,
-- permitir derivar "arquivada há X tempo" (retenção — fora de escopo agora).
--
-- RLS sem mudança (AC 11): `archived_at` pertence à linha da lista, já coberta
-- pela policy por `auth.uid()` existente (lists_*_own). Nenhuma policy nova.

alter table public.lists
  add column if not exists archived_at timestamptz;

-- Recria a RPC `sync_push` para upsertar `archived_at` junto a `nome`/`pinned`/
-- `updated_at`. Mesmo merge por `updated_at` (estritamente maior vence; empate
-- mantém o atual). `archived_at` ausente no payload (client antigo) cai em
-- `null` via coalesce — compatível com dispositivos ainda não atualizados. A
-- assinatura (jsonb, jsonb) é inalterada, preservando o `grant execute` existente.
create or replace function public.sync_push(
  p_lists jsonb default '[]'::jsonb,
  p_items jsonb default '[]'::jsonb
) returns void language plpgsql as $$
declare rec jsonb;
begin
  for rec in select * from jsonb_array_elements(p_lists)
  loop
    insert into public.lists (id, user_id, nome, pinned, archived_at, created_at, updated_at)
    values ((rec->>'id')::uuid, auth.uid(), rec->>'nome',
            coalesce((rec->>'pinned')::boolean, false),
            nullif(rec->>'archived_at', '')::timestamptz,
            coalesce((rec->>'created_at')::timestamptz, now()),
            coalesce((rec->>'updated_at')::timestamptz, now()))
    on conflict (id) do update
      set nome = excluded.nome, pinned = excluded.pinned,
          archived_at = excluded.archived_at, updated_at = excluded.updated_at
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