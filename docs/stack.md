# Stack técnica

## Visão geral
- **App**: PWA em Next.js + TypeScript, hospedado na Vercel.
- **Backend**: Supabase — Postgres (dados), Storage (arquivos), Auth.
- **Auth**: Supabase Auth com e-mail + senha.
- **Segurança de dados**: todo dado do app protegido por RLS do usuário autenticado. Nenhuma tabela de dados de usuário sem policy.
- **Tarefas agendadas**: cron da Vercel. O plano Hobby só aceita **cron diário** (`0 9 * * *` em `vercel.json`); frequência menor exige plano pago — ver pendência abaixo.
- **Notificações de lembrete**: Web Push (service worker + VAPID), disparadas pelo cron.
- **E-mails**: API do Brevo.

## Ambientes
- **Produção**: projeto Vercel (prod) → projeto Supabase na nuvem `tfgbkyjwzqvvklutmeln`.
- **Desenvolvimento, teste e testes unitários**: Supabase **local em Docker** (`supabase start`). Não existe projeto Supabase de teste na nuvem.
- **Preview (deploys por PR)**: banco **pendente de decisão** — um preview hospedado na nuvem não alcança o Supabase em Docker da máquina do dev. Ver `docs/decisions.md`. Enquanto não decidido, os previews sobem sem env vars de Supabase; só páginas que não tocam o banco são confiáveis no QA.
- Deploy de preview por PR (integração GitHub ↔ Vercel) — é o que o QA testa em 👀 Preview Review.

## Chaves do Supabase
- Usar o formato novo: **publishable key** (cliente, sujeita a RLS) e **secret key** (servidor, ignora RLS), no lugar de `anon` / `service_role`.
- A Data API não expõe entidades novas sem `GRANT` explícito — toda migração que cria tabela precisa conceder os privilégios aos papéis que devem enxergá-la.

## Migrações de banco
- Versionadas no repo via Supabase CLI (SQL commitado), incluindo policies de RLS.
- Aplicadas primeiro no banco de teste; em prod durante o deploy (🚀 Ready for Deploy).
- Regras de segurança de schema/queries: seção "Banco de dados" em `docs/agents/dev.md`.

## Domínio
- Produção: `lembr8.alyssonazevedo.dev`. DNS de `alyssonazevedo.dev` gerenciado no Squarespace (apontamento é ação humana).

## Escala e custos
- Projeto pessoal, sem divulgação: pouquíssimos usuários. Free tiers são suficientes; não otimizar para escala.

## Pendências registradas (decidir quando necessário)
- **Banco dos Preview Deploys** (bloqueia o QA em 👀 Preview Review): usar o banco de prod (A) ou criar um 2º projeto Supabase cloud dedicado a preview (B). Decisão do humano — ver `docs/decisions.md`.
- **Frequência do cron** (custo): o plano Hobby da Vercel limita o cron a uma execução diária, o que não sustenta lembretes em horário arbitrário. Alternativas: plano pago (custo — decisão humana) ou um agendador externo. Decidir na issue da feature de notificações.
- Detalhes de Web Push (limitações de cron/permissões): decidir na issue da feature de notificações; desativável se virar problema.
- Painel admin com métricas de uso (exclusivo do dono): issue futura, criada pelo humano quando for o momento.
- Monitoramento/logs e analytics.
