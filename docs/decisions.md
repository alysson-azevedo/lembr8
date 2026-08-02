# Decisões (ADRs)

Formato: uma seção por decisão — contexto em 1-2 linhas, decisão, consequências. Mais recente no topo.

## 2026-08-02 — Modo de trabalho multi-agente
**Contexto:** o app será desenvolvido por agentes, com supervisão humana pontual.
**Decisão:** confirmação manual obrigatória apenas para (1) arquitetura/stack e (2) custos/credenciais. Deploy e merge na main são autônomos. Fluxo de sessão: diagnóstico → alinhamento → ações. Contexto persistido em `CLAUDE.md` + `docs/`.
**Consequências:** agentes devem consultar este log antes de propor mudanças; decisões críticas novas entram aqui.
