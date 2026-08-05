# Decisões (ADRs)

Formato: uma seção por decisão — contexto em 1-2 linhas, decisão, consequências. Mais recente no topo.

## 2026-08-03 — Repositório público
**Contexto:** o projeto não é produto comercial.
**Decisão:** `alysson-azevedo/lembr8` permanece público.
**Consequências:** nenhum segredo pode entrar no repo — `.gitignore` cobre `.env`, `.env.*` e `*.env`; credenciais vivem apenas em arquivos locais e nas env vars da Vercel.

## 2026-08-03 — Ambiente de teste local em Docker (substitui o banco de teste na nuvem)
**Contexto:** a stack original previa um projeto Supabase de teste na nuvem compartilhado por develop/preview. Manter um projeto cloud só para teste não se paga num projeto pessoal.
**Decisão:** desenvolvimento, ambiente de teste e testes unitários rodam no **Supabase local em Docker** (`supabase start`); produção fica no projeto cloud `tfgbkyjwzqvvklutmeln`. O projeto `lembr8-test` não será criado.
**Consequências:** CI roda o Supabase local em Docker, sem dependência de nuvem. Abre a pendência do banco dos Preview Deploys (abaixo). `docs/stack.md` atualizado.

## 2026-08-03 — Chaves publishable/secret do Supabase
**Contexto:** o Supabase substituiu `anon key` / `service_role key` pelo par publishable/secret ([discussão 29260](https://github.com/orgs/supabase/discussions/29260)).
**Decisão:** usar o formato novo em todos os ambientes.
**Consequências:** env vars são `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`.

## PENDENTE — Banco dos Preview Deploys da Vercel
**Contexto:** com o ambiente de teste agora local em Docker, um preview hospedado na Vercel não alcança o banco na máquina do dev.
**Opções:** (A) preview aponta para o banco de **prod** — custo e setup zero, risco de poluir dados reais durante o QA; (B) 2º projeto Supabase **cloud** dedicado a preview — free tier permite 2 projetos (custo zero), exige aplicar migrações nos dois.
**Status:** escalado ao humano (ponto crítico de arquitetura, `CLAUDE.md`). Enquanto não decidido, os previews sobem **sem** env vars de Supabase e o QA só pode validar o que não toca o banco.

## 2026-08-02 — Stack do Lembr8
**Contexto:** Lembr8 é um PWA de lembretes/tarefas. Prioridade: resultado rápido com custo mínimo.
**Decisão:** Next.js + TypeScript na Vercel; Supabase (Postgres + Storage + Auth e-mail/senha); RLS obrigatória em todos os dados de usuário; cron na Vercel; lembretes via Web Push; e-mails via API Brevo; migrações versionadas com Supabase CLI. Prod usa banco próprio; develop/preview compartilham um único banco de teste (sem breaking changes garante compatibilidade).
**Consequências:** detalhes em `docs/stack.md`; regras de banco em `docs/agents/dev.md`. Mudanças nesta stack exigem confirmação humana.

## 2026-08-02 — Workflow de agentes no Linear (time LB)
**Contexto:** desenvolvimento por agentes com papéis distintos, orquestrado pelos states do Linear.
**Decisão:** Backlog→PO, Spec→PO+PD, Dev in progress→DEV, Preview Review→QA, Ready for Deploy→DEV. Labels 🤖 indicam o responsável atual; `🚫 Sem automação` bloqueia agentes. Sem gates humanos nas transições — só nos pontos críticos do CLAUDE.md. Detalhes em `docs/workflow.md`.
**Consequências:** cada agente segue seu doc em `docs/agents/`; mudanças no processo passam por aqui.

## 2026-08-02 — Modo de trabalho multi-agente
**Contexto:** o app será desenvolvido por agentes, com supervisão humana pontual.
**Decisão:** confirmação manual obrigatória apenas para (1) arquitetura/stack e (2) custos/credenciais. Deploy e merge na main são autônomos. Fluxo de sessão: diagnóstico → alinhamento → ações. Contexto persistido em `CLAUDE.md` + `docs/`.
**Consequências:** agentes devem consultar este log antes de propor mudanças; decisões críticas novas entram aqui.
