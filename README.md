# Lembr8

PWA de lembretes: registre suas tarefas e seja lembrado na hora certa.

Stack em [`docs/stack.md`](docs/stack.md), processo em [`docs/workflow.md`](docs/workflow.md),
decisões em [`docs/decisions.md`](docs/decisions.md).

## Requisitos

- Node 24+, pnpm 11+
- Docker (para o Supabase local)

## Setup

```bash
pnpm install
cp .env.example .env.local   # os defaults já apontam para o Supabase local
pnpm db:start                # sobe o Supabase em Docker
pnpm dev                     # http://localhost:3000
```

O Studio local fica em http://127.0.0.1:54323 e os e-mails de teste do Auth
caem no Mailpit em http://127.0.0.1:54324.

## Banco

Ambiente de desenvolvimento, teste e testes unitários rodam **sempre** no
Supabase local em Docker — nenhum serviço na nuvem é necessário. Produção é o
projeto `tfgbkyjwzqvvklutmeln`.

```bash
pnpm db:reset                # recria o banco e aplica todas as migrações
pnpm exec supabase migration new <nome>
pnpm exec supabase db push   # aplica em produção (state 🚀 Ready for Deploy)
```

Migrações são aditivas — sem breaking changes (ver `docs/agents/dev.md`).
Toda tabela de dados de usuário nasce com RLS habilitada.

## Testes

```bash
pnpm lint
pnpm typecheck
pnpm test        # roda contra o Supabase local; exige `pnpm db:start` antes
```

## Notas de ambiente

- **SELinux (`/mnt/data/work`)**: os bind mounts do Docker exigem o contexto
  `container_file_t`, senão o `supabase start` entra em restart loop. Corrija com:

  ```bash
  sudo semanage fcontext -a -t container_file_t '/mnt/data/work(/.*)?'
  sudo restorecon -Rv /mnt/data/work
  ```

- **Depois de `pnpm db:reset`**, o Kong pode continuar apontando para o IP
  antigo do container de Auth e devolver `502` em `/auth/v1/*`. Resolve com:

  ```bash
  docker restart supabase_kong_lembr8
  ```

## Segredos

Nenhum arquivo de env é versionado (o repositório é público). `.env.example`
lista as variáveis necessárias; os valores reais ficam no `.env.local` local e
nas env vars da Vercel.
