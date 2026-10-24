# Spec LB-20 — Índice mobile: botão "Sair" → menu "⋮"

**Issue:** [LB-20](https://linear.app/alysson-azevedo/issue/LB-20/ux-mobile-botao-sair-botao-caminho-para-perfil-futuro) · **State:** 📑 Spec · **Tipo:** 🔍 Melhoria · **Prioridade:** nenhuma
**Base:** LB-4 (alvos ≥44px), LB-8 (menu overflow "⋮" + backdrop + `ConfirmDialog`), LB-12 ("Copiar link" no overflow), LB-14 ("Fixar lista" no overflow). Origem: feedback do PO no 👀 Preview Review da LB-17 (comentário na LB-17, pontos 2 e 3).

**Escopo desta spec:** negócio (critérios de aceite + UX do ponto de vista do usuário). A spec de **design/técnica** (componente client, acessibilidade, estrutura de código, testes) está em `design/lb-20-botao-sair-menu.md` — **já entregue junto ao refinamento** (o padrão de referência está consolidado e deployed; nada aqui é decisão estruturante de design).

---

## Problema

O índice (`/`) mostra o botão **"Sair"** sempre visível no header. Logout é ação rara; exibi-la em permanência gasta espaço horizontal em mobile, compete visualmente com o conteúdo (criação de listas) e é um desastre esperando acontecer: um toque acidental em "Sair" encerra a sessão imediatamente, pois a ação é destrutiva **sem confirmação** e está a 1 toque.

## Valor para o usuário

Header do índice limpo e focado nas listas; ações de conta/especiais escondidas num menu padrão. Menos chance de logout acidental. A affordance ("⋮") prepara o caminho para **perfil** — padrão mobile: o mesmo botão evolui depois para avatar/menu de conta, sem retrabalho no header.

## Caso de uso de referência

No celular, o usuário abre o app para marcar compras. Decide sair da conta (raro): toca no "⋮" no canto superior direito, escolhe "Sair", e está de volta à tela de login. O índice que ele usa todo dia não desperdiça espaço nem expõe uma ação destrutiva a 1 toque.

---

## Escopo de negócio

- O botão "Sair" **sai do header** do índice (`/`); no lugar, um botão de **menu overflow** (kebab "⋮") no canto superior direito.
- Ao abrir, o menu exibe a ação **"Sair"** (única ação por ora). Acioná-la executa o logout e redireciona para `/login` (sem diálogo de confirmação: o gesto passa a ser intencional em 2 toques; ver decisão de design §4).
- O menu fecha ao acionar o item e ao tocar fora; alvos ≥44px (LB-4).
- **Apenas o índice (`/`).** A tela de detalhe (`/listas/[id]`) **mantém o "Sair" como está** — esta issue não unifica headers; alinhar o detalhe pode vir depois, mas não é requisito.
- **Só a affordance** evolui para perfil (ponto de extensão — ex.: trocar o glyph por avatar quando existir). Nenhuma UI de perfil é implementada agora.

### Fora de escopo

- Perfil de usuário (foto, nome, edição) — issue futura.
- Unificar o header da tela de detalhe com o do índice (o overflow do detalhe é do `ListaScreen`; "Sair" permanece nele).
- Botão "Nova lista" compacto — issue paralela.
- Qualquer mudança no fluxo de auth (server action, sessão, cookies) — só a UI muda.

---

## Critérios de aceite (testáveis)

1. O header do índice (`/`) **não renderiza mais** o botão "Sair" diretamente visível.
2. Um botão de overflow no canto superior direito do índice abre um menu com a ação "Sair".
3. Acionar "Sair" no menu encerra a sessão e leva a `/login` (fluxo de logout existente, preservado).
4. O menu fecha após acionar o item e ao tocar/clicar fora; `Esc` fecha.
5. Botão de overflow e item "Sair" têm alvos de toque ≥44px (`min-h-11`).
6. Sem funcionalidade de perfil implementada — o overflow existe como **ponto de extensão** apenas.
7. (Não-regressão) O header do detalhe (`/listas/[id]`) e seu overflow "⋮" não mudam: "Sair" visível no header do detalhe permanece.

---

## Notas para o 🤖 PD / DEV

- Padrão de referência: menu overflow de **`ListaScreen`** (backdrop `fixed inset-0 z-10`, `role="menu"`/`menuitem`, `absolute right-0 top-full z-20`, `min-h-11` nos itens, não-destrutivo antes do destrutivo com "destrutivo" em vermelho). Ver `design/lb-20-botao-sair-menu.md` para o componente client que encapsula o form de logout, acessibilidade completa e testes.
