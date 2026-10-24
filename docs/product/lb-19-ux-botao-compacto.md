# Spec LB-19 — UX mobile: botão "Nova lista" compacto na tela índice

**Issue:** [LB-19](https://linear.app/alysson-azevedo/issue/LB-19/ux-mobile-botao-nova-lista-compacto-na-tela-indice) · **State:** 📑 Spec · **Tipo:** 🔍 Melhoria · **Prioridade:** medium

## Problema
Na tela índice (`/`), o botão "Nova lista" ocupa espaço vertical excessivo no mobile — é full-width com `min-h-11` e borda, competindo com a lista de listas que é o conteúdo prioritário. Em telas pequenas, o botão empurra o conteúdo principal para baixo.

## Valor para o usuário
O usuário vê suas listas mais cedo na tela, sem precisar rolar para ultrapassar um botão grande. A criação de lista continua acessível em 1 toque, só com footprint visual menor.

## Escopo
- Reduzir o footprint visual do botão "Nova lista" na tela índice (`/`): ex. ícone + texto curto, botão menor alinhado à direita, ou entrada compacta.
- Preservar affordance clara de criação (continua primária, só mais compacta).
- Comportamento inalterado: 1 toque cria `Lista N` (auto-incremento) e abre o detalhe.
- Sem mudança no botão "Nova lista" do detalhe da lista (`ListaScreen`).

## Fora de escopo
- Filtro por nome (LB-17).
- Botão "Sair"/header — issue paralela.
- Tipos de lista, ordenação, pin (LB-14).

## Dependências
Nenhuma. Independente de LB-16/LB-17.

## Critérios de aceite
1. Botão "Nova lista" na tela índice ocupa menos espaço vertical que hoje (medida: altura visível do controle antes da primeira lista).
2. Continua criando uma lista em 1 toque e abre o detalhe (`/listas/[id]`).
3. Touch target mantém `min-h-11` (44px, LB-4) — compactar o visual, não o alvo.
4. Sem regressão visual no desktop (`max-w-[28rem]`).

## Origem
Feedback do PO durante 👀 Preview Review da LB-17 (PR1 filtro por nome). Decomposição: pontos 2 e 3 do feedback — ver comentário na LB-17.