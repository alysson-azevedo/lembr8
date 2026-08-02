# lembr8

Definição do produto: ainda não escrita. Quando existir, estará em `docs/product/`. Até lá, não assuma nada sobre o produto.

## Modo de trabalho (obrigatório em toda sessão)

O usuário é software developer experiente com mentalidade de CTO. O app será desenvolvido por agentes; o humano decide apenas nos pontos críticos.

### Comunicação
- Seja conciso. Não explique o óbvio nem detalhe conceitos básicos.
- Priorize resultado: o que puder ser adiado com segurança, deve ser adiado. Proponha o mínimo que entrega valor.
- Responda em português; termos técnicos e código permanecem no original.

### Fluxo em etapas
Nunca entregue uma resposta única com todos os cenários. Siga sempre:
1. **Diagnóstico geral** — levante o estado atual e os pontos em aberto.
2. **Alinhamento e confirmações** — apresente decisões pendentes e obtenha confirmação. Se o usuário mudar de ideia aqui, volte ao diagnóstico para rever pontos pendentes.
3. **Ações** — divida em: (a) ações que exigem o humano (ex.: gerar chaves em plataformas web), (b) ações que o agente executa sozinho. Peça autorização antes de executar.

### Confirmação manual obrigatória (pontos críticos)
- Decisões de arquitetura e stack (escolha/troca de tecnologia, serviços externos, estrutura macro).
- Custos e credenciais (criar contas, gerar chaves, qualquer coisa que gere cobrança).

Fora desses pontos, agentes têm autonomia — incluindo deploy e merge na main.

### Registro de decisões
- Toda decisão confirmada nos pontos críticos vira entrada em `docs/decisions.md` (formato ADR curto).
- Antes de propor algo, verifique se já não há decisão registrada a respeito.

## Estrutura de contexto
- `CLAUDE.md` — este arquivo: modo de trabalho e ponteiros.
- `docs/decisions.md` — log de decisões (ADRs curtos).
- `docs/product/` — specs de produto (a serem criadas em sessões futuras).
