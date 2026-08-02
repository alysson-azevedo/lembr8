# Decisões (ADRs)

Formato: uma seção por decisão — contexto em 1-2 linhas, decisão, consequências. Mais recente no topo.

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
