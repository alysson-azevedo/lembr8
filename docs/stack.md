# Stack técnica

## Visão geral
- **App**: PWA em Next.js + TypeScript, hospedado na Vercel.
- **Backend**: Supabase — Postgres (dados), Storage (arquivos), Auth.
- **Auth**: Supabase Auth com e-mail + senha.
- **Segurança de dados**: todo dado do app protegido por RLS do usuário autenticado. Nenhuma tabela de dados de usuário sem policy.
- **Tarefas agendadas**: cron da Vercel.
- **Notificações de lembrete**: Web Push (service worker + VAPID), disparadas pelo cron.
- **E-mails**: API do Brevo.

## Ambientes
- **Produção**: projeto Vercel (prod) → banco Supabase de **prod**.
- **Develop/Preview**: todos os demais ambientes Vercel compartilham o mesmo banco Supabase de **teste**. Viável porque migrações nunca contêm breaking changes (ver `docs/agents/dev.md`).
- Deploy de preview por PR (integração GitHub ↔ Vercel) — é o que o QA testa em 👀 Preview Review.

## Migrações de banco
- Versionadas no repo via Supabase CLI (SQL commitado), incluindo policies de RLS.
- Aplicadas primeiro no banco de teste; em prod durante o deploy (🚀 Ready for Deploy).
- Regras de segurança de schema/queries: seção "Banco de dados" em `docs/agents/dev.md`.

## Domínio
- Produção: `lembr8.alyssonazevedo.dev`. DNS de `alyssonazevedo.dev` gerenciado no Squarespace (apontamento é ação humana).

## Escala e custos
- Projeto pessoal, sem divulgação: pouquíssimos usuários. Free tiers são suficientes; não otimizar para escala.

## Pendências registradas (decidir quando necessário)
- Detalhes de Web Push (limitações de cron/permissões): decidir na issue da feature de notificações; desativável se virar problema.
- Painel admin com métricas de uso (exclusivo do dono): issue futura, criada pelo humano quando for o momento.
- Monitoramento/logs e analytics.
