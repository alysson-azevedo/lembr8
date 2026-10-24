# Spec LB-21 — Tema Mystical Blue (JuxTheme) para o app

**Issue:** [LB-21](https://linear.app/alysson-azevedo/issue/LB-21/mudar-a-cor-do-tema-do-site) · **State:** 📑 Spec (autorado pelo PO) · **Tipo:** 🧹 Tarefa · **Prioridade:** medium

## Problema
O tema atual do site é o default neutro do template (branco / `#0a0a0a` automático via `prefers-color-scheme`), sem identidade visual. O dono quer o app alinhado ao seu tema de desktop pessoal **Mystical Blue (JuxTheme)** — dark azul-plasma com accent azul vibrante.

## Valor para o usuário
Identidade visual coerente com o gosto do dono (usuário principal do app): dark confortável, accent azul plasma nos CTAs e foco, texto claro legível — sem a superfície de manutenção de um segundo tema.

## Decisões de produto (confirmadas pelo humano, 2026-10-24)
1. **Dark-only**: o modo claro é **removido**. O tema de referência é dark-only e manter light exigiria inventar uma paleta clara sem referência (projeto pessoal, pouquíssimos usuários). `prefers-color-scheme` deixa de governar as cores do app.
2. **Fundo base `#1c1c23`** (View BackgroundNormal do Plasma): com ele a paleta de referência passa em WCAG AA sem ajustes (muted `#888a9a` ≈ 5:1; links `#5c8ae6` ≈ 5:1). Superfícies sobem para `#25272f` e raised `#2b2e38`/`#333744` (hierarquia de elevação). A alternativa `#25272f` como base exigiria clarear muted/links e foi descartada.

## Paleta (tokens, tema de referência Mystical Blue)

| Token | Hex | Papel |
| -- | -- | -- |
| `--background` | `#1c1c23` | Fundo base do app (body, telas) |
| `--surface` | `#25272f` | Superfícies sobre o fundo: menus, dialogs, autocomplete |
| `--surface-raised` | `#2b2e38` | Elevação/hover de superfície (`#333744` como reforço, a critério do design) |
| `--foreground` | `#e3e3e3` | Texto base |
| `--muted` | `#888a9a` | Texto secundário |
| `--primary` | `#3e6fd9` | Accent: botão primário, links, foco |
| `--primary-hover` | `#5c8ae6` | Hover/active do accent |
| `--selection` | `#474f71` | Seleção / estados de escolha |
| `--success` | `#27ae60` | Sucesso |
| `--danger` | `#da4453` | Destrutivo / erros |
| `--warning` | `#f67400` | Aviso |
| `--overlay` | a definir no design | Scrim do dialog (hoje `bg-black/40`) |

Padrões existentes que continuam: bordas por transparência do texto (`border-current/10`–`/50`) e realces `bg-current/5`–`/10` — derivam de `--foreground` e migram junto com os tokens. Texto sobre botão primário: **branco** (`#ffffff` ≈ 4,7:1 sobre `#3e6fd9`; `#e3e3e3` falharia AA).

## Escopo
- Expandir os tokens de cor em `src/app/globals.css` (dark-only, sem media query) e mapear em `@theme inline` (Tailwind v4).
- Declarar `color-scheme: dark` para controles nativos (checkbox, autofill, scrollbar) renderizarem dark.
- Mapear componentes para os novos tokens:
  - CTA primário (`bg-foreground text-background` hoje: "Nova lista" compacto, login, Toast) → `bg-primary text-white` com hover `--primary-hover`.
  - Destrutivo (`text-red-600 dark:text-red-400` nos menus "Excluir", botão do ConfirmDialog) e erros de validação (`text-red-500` no login) → token `--danger`.
  - Scrim do ConfirmDialog (`bg-black/40`) → token `--overlay`.
  - Toast: decidir no design se acompanha o CTA accent ou permanece pill invertida.
- Estados hover/active/focus com as variações da paleta (hover `#5c8ae6`, seleção `#474f71`, focus ring accent).
- Verificação de contraste WCAG AA com ferramenta na implementação; onde um par falhar, ajustar o token minimamente mantendo o matiz azulado (não trocar por cinza puro).

## Fora de escopo
- Fonte tipográfica (JetBrains Mono fica no desktop; o app mantém a stack própria).
- Logotipo/ícones (`icon.tsx`, `apple-icon.tsx`).
- Tema do PWA: `manifest.ts` (`theme_color`/`background_color` `#ffffff`) e meta `theme-color` — ficam brancos nesta issue. **Follow-up registrado** (splash/status bar brancos sobre app dark): criar issue futura se incomodar.
- Toggle de tema / preferência de modo claro no app (dark-only por decisão acima).
- Redesign de layout: só cores e estados visuais mudam.

## Dependências
Nenhuma. Independente de outras issues em andamento.

## Critérios de aceite
1. Todas as telas usam apenas os tokens da paleta JuxTheme: busca por cores avulsas fora de `globals.css` (hex em componentes, classes `red-*`/`black/*` etc.) não retorna nada.
2. Botão primário, links e foco usam `#3e6fd9` (hover/active `#5c8ae6`); texto do botão primário é branco.
3. Backgrounds derivam de `#1c1c23` (base) com superfícies `#25272f` e raised `#2b2e38`+.
4. Dark-only: nenhuma regra `prefers-color-scheme` ou variante `dark:` restante no app; `color-scheme: dark` declarado.
5. Contraste WCAG AA verificado com ferramenta nos pares principais: `--foreground`/`--muted` × `--background`/`--surface`, branco × `--primary`, `--danger` × `--background` (4,5:1 texto normal; 3:1 texto grande/componente).
6. Sem regressão: checklist visual das telas principais (índice, detalhe da lista, login) revisado no preview, incluindo menu overflow, ConfirmDialog, Toast e autocomplete.

## Origem
Pedido do humano (dono do produto). Tema de referência: `~/.oh-my-custom-zsh/mystical-blue-plasma` (README, `color-schemes/JuxTheme.colors`, `ghostty/config`, `opencode/jux.json`). Decisões dark-only e fundo `#1c1c23` confirmadas pelo humano na sessão PO de 2026-10-24.
