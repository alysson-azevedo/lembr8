# Spec de design — LB-21: Tema Mystical Blue (JuxTheme)

**Issue:** [LB-21](https://linear.app/alysson-azevedo/issue/LB-21/mudar-a-cor-do-tema-do-site) · **State:** 📑 Spec → 🚧 Dev in progress · **Tipo:** 🧹 Tarefa · **Prioridade:** medium
**Base:** tokens atuais (`globals.css`), Toast invertido (LB-12), CTA preenchido compacto (LB-19), filtro (LB-17), alvos ≥44px (LB-4). **Spec de negócio:** `docs/product/lb-21-tema-mystical-blue.md` (decisões dark-only + base `#1c1c23` confirmadas pelo humano). **ADRs:** sem conflito — sem mudança de arquitetura/stack/dependência.

Frontend/UI apenas: cores e estados visuais. Zero mudança de layout, comportamento, navegação, store/sync, schema. Sem nova dependência, sem lib de temas — o tema vive nos tokens CSS.

---

## Princípios

1. **Tokens carregam o tema**: componentes continuam usando classes semânticas (`bg-primary`, `text-danger`, `bg-surface`); **nenhuma cor fora de `globals.css`** (AC 1).
2. **Paleta de referência verbatim**; ajuste mínimo (e preservando o matiz) somente onde WCAG AA falha — pré-autorizado pela spec de negócio ("onde um par falhar, ajustar o token minimamente").
3. **Padrões estabelecidos preservados**: alvos `min-h-11` (LB-4), realces `bg-current/5`–`/10`, bordas `border-current/x`, pill invertida do `Toast` (LB-12), CTA preenchido (LB-19). Estrutura e textos intactos.
4. **Dark-only**: uma paleta, sem `@media (prefers-color-scheme)`, sem variantes `dark:`; `color-scheme: dark` para controles nativos (checkbox, autofill, scrollbar).

## 1. Diagnóstico — estado atual (`develop` @ `67d3635`)

- `src/app/globals.css`: 3 tokens (`--background` #ffffff/#0a0a0a, `--foreground` #171717/#ededed, `--muted` #6b7280/#9ca3af) trocados por media query; dark automático pelo SO.
- Componentes já usam classes semânticas (`text-muted`, `border-current/x`, `bg-current/x`, `bg-background`). Cores avulsas (violam AC 1): `text-red-600 dark:text-red-400` (menu "Excluir" ×2), `text-red-500` (erros do login ×3), `bg-black/40` (scrim do ConfirmDialog).
- CTA primário é invertido (`bg-foreground text-background`): "Nova lista" (`ListasIndex`), "Entrar" (login), Toast. Overlays (menus ⋮, autocomplete, ConfirmDialog) usam `bg-background` — mesma cor do body, sem elevação visível.

## 2. Tokens — `globals.css` alvo

```css
@import "tailwindcss";

:root {
  color-scheme: dark;

  --background: #1c1c23;      /* fundo base (View do Plasma) */
  --surface: #25272f;         /* camadas flutuantes (window/Ghostty) */
  --surface-raised: #2b2e38;  /* elevação futura — reservado (§3) */
  --foreground: #e3e3e3;
  --muted: #9092a2;           /* ajuste AA de #888a9a — §6 */
  --primary: #3e6fd9;
  --primary-hover: #5c8ae6;
  --selection: #474f71;
  --success: #27ae60;
  --danger: #e26875;          /* ajuste AA de #da4453 — §6 */
  --warning: #f67400;
  --overlay: rgb(0 0 0 / 0.4);
}

@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  --color-selection: var(--selection);
  --color-success: var(--success);
  --color-danger: var(--danger);
  --color-warning: var(--warning);
  --color-overlay: var(--overlay);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
  accent-color: var(--primary);   /* checkbox nativo */
}

::selection {
  background-color: var(--selection);
}
```

- A `@media (prefers-color-scheme: dark)` **some** (dark-only, AC 4).
- `--success`/`--warning` ficam definidos sem uso atual (paleta da issue; disponíveis para uso futuro) — idem `--surface-raised` (§3).

### 2.1 Desvios da paleta de referência (todos por AA, matiz preservado)

| Token | Referência | Design | Motivo |
| -- | -- | -- | -- |
| `--muted` | `#888a9a` | **`#9092a2`** | sobre `--surface` (#25272f): 4,4:1 ✗ → **4,8:1** ✓ (muted aparece em dialogs/menus) |
| `--danger` | `#da4453` | **`#e26875`** | todo uso atual é **texto** (menus, ConfirmDialog, erros): sobre surface 3,5:1 ✗ → **4,6:1** ✓; `#da4453` fica documentado como cor de *preenchimento* futuro |
| Links de texto | `#3e6fd9` | **`#5c8ae6`** (`--primary-hover`) | `#3e6fd9` como texto sobre `#1c1c23` = 3,6:1 ✗; `#5c8ae6` = 5,0:1 ✓. `#3e6fd9` segue em **fills/rings** (botão, foco — ≥3:1 como componente de UI) |

AC 2 ("links usam a azul") é satisfeito com a variante azul da própria paleta; nenhum tom de fora da referência é inventado.

## 3. Modelo de elevação

| Nível | Cor | Onde |
| -- | -- | -- |
| 0 — página | `--background` #1c1c23 | body, telas; inputs continuam transparentes (borda `border-current/20`) |
| 1 — camadas flutuantes | `--surface` #25272f | menus ⋮ (`IndexHeaderMenu`, `ListaScreen`), listbox do autocomplete (`ItemSuggestions`), `ConfirmDialog` — trocam `bg-background` → `bg-surface`; borda `border-current/20` existente preservada |
| 2 — reservado | `--surface-raised` #2b2e38 | definido, **sem uso nesta issue** (elevação interna futura) |

- **Toast permanece pill invertida** (`bg-foreground text-background`): é mensagem de status, não ação — padrão LB-12 intocado, contraste 13:1. Zero mudança de código.
- Realces de hover/ativo (`bg-current/5`, `bg-current/10`, `divide-current/10`, `border-t border-current/10`) **permanecem**: derivam de `--foreground` e migram sozinhos.
- Scrim do dialog: `bg-black/40` → `bg-overlay` (mesma sensação visual, agora tokenizado).

## 4. Mapeamento por componente (mudança exata)

| Arquivo | Hoje → Depois |
| -- | -- |
| `src/app/globals.css` | §2 (tokens; remove media query; `color-scheme`, `accent-color`, `::selection`) |
| `src/components/listas/ListasIndex.tsx` | CTA "Nova lista": `bg-foreground text-background hover:opacity-90 focus-visible:outline-foreground` → `bg-primary text-white hover:bg-primary-hover focus-visible:outline-primary`. Links de texto ("Arquivadas", "Remover filtro"): `text-muted hover:text-foreground hover:underline` → `text-primary-hover hover:underline` (cor fixa, hover revela o sublinhado; `underline-offset-4` mantido) |
| `src/app/login/page.tsx` | CTA "Entrar": `bg-foreground text-background` → `bg-primary text-white` **+ adiciona** `hover:bg-primary-hover` e `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary` (hoje o CTA do login não tem hover/focus custom — único botão primário sem os dois estados). Erros `text-red-500` (×3) → `text-danger`. Inputs: `focus:border-current/50` → `focus:border-primary` |
| `src/components/listas/IndexHeaderMenu.tsx` | Menu: `bg-background` → `bg-surface`. Item "Excluir…": `text-red-600 dark:text-red-400` → `text-danger`. Resto intacto |
| `src/components/listas/ListaScreen.tsx` | Menu overflow: `bg-background` → `bg-surface`; "Excluir lista"/"Excluir item": `text-red-600 dark:text-red-400` → `text-danger`. Inputs (título, novo item): `focus:border-current/50` → `focus:border-primary`. Checkbox: nada inline (via `accent-color` global). Divisores `border-current/10` intactos |
| `src/components/listas/ItemSuggestions.tsx` | Listbox: `bg-background` → `bg-surface`. Opção ativa `bg-current/10` / hover `bg-current/5` intactos |
| `src/components/ui/ConfirmDialog.tsx` | Scrim: `bg-black/40` → `bg-overlay`. Painel: `bg-background` → `bg-surface`. Botão destrutivo: `text-red-600 dark:text-red-400` → `text-danger`. Descrição `text-muted` adapta sozinha (token ajustado §2.1 cobre AA sobre surface) |
| `src/components/ui/Toast.tsx` | **Nenhuma mudança** (pill invertida preservada) |
| `src/app/(app)/*`, `src/app/error.tsx`, `src/app/not-found.tsx` | Sem mudanças: já usam tokens (`text-muted`, `border-current`); migram sozinhos |
| `src/app/manifest.ts`, `icon.tsx`, `apple-icon.tsx` | **Intocados** (fora de escopo) |

### 4.1 Vocabulário uniforme de foco

Todo controle interativo usa o mesmo par (cor muda, estrutura existente onde já existe):

- Botões/links/itens de menu: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary` — adicionado onde falta (menu items, botões bordados "← Listas", icon buttons ✕/🔍/⋮, botões do ConfirmDialog; hoje sem anel custom).
- Inputs: `focus:border-primary` (padrão existente, só a cor).

Isso fecha uma lacuna de teclado pré-existente com custo mínimo e dá cor de accent a todo o foco (AC 2).

## 5. Estados

| Elemento | Default | Hover | Focus | Outros |
| -- | -- | -- | -- | -- |
| CTA primário | `bg-primary text-white` | `bg-primary-hover` | anel `outline-primary` | disabled: `opacity-50` (login, existente) |
| Link de texto | `text-primary-hover` | `underline` | anel `outline-primary` | `underline-offset-4` |
| Input | transparente, `border-current/20` | — | `border-primary` | placeholder `text-muted` |
| Checkbox | `accent-color: var(--primary)` + `color-scheme: dark` | nativo | nativo | item concluído: `line-through text-muted` (intacto) |
| Item de menu / opção do autocomplete | `text-foreground` sobre `bg-surface` | `bg-current/5` | anel `outline-primary` | ativo do autocomplete: `bg-current/10` |
| Ação destrutiva | `text-danger` | `bg-current/5` (intacto) | anel `outline-primary` | |
| Seleção de texto | `::selection` #474f71 (texto claro por cima, 6,2:1) | | | |
| Toast | pill invertida | — | — | auto-fecha 2,5s (LB-12) |

## 6. Contraste WCAG (AA) — pares verificados no design

| Par | Razão | AA |
| -- | -- | -- |
| #e3e3e3 / #1c1c23 (texto/base) | ≈13,2:1 | ✓ |
| #e3e3e3 / #25272f (texto/surface) | ≈11,6:1 | ✓ |
| #9092a2 / #1c1c23 (muted/base) | ≈5,5:1 | ✓ |
| #9092a2 / #25272f (muted/surface) | ≈4,8:1 | ✓ |
| #ffffff / #3e6fd9 (texto do CTA) | ≈4,7:1 | ✓ |
| #3e6fd9 / #1c1c23 (fill/ring como UI) | ≈3,6:1 | ✓ (≥3:1) |
| #5c8ae6 / #1c1c23 (links) | ≈5,0:1 | ✓ |
| #e26875 / #1c1c23 e / #25272f (danger texto) | ≈5,2:1 / ≈4,6:1 | ✓ |
| #e3e3e3 / #474f71 (seleção) | ≈6,2:1 | ✓ |
| #1c1c23 / #e3e3e3 (Toast invertido) | ≈13,2:1 | ✓ |

Razões arredondadas (fórmula WCAG); o DEV confirma com ferramenta durante a implementação e o QA re-verifica no preview (AC 5).

## 7. Acessibilidade

- **Contraste AA** em todos os pares de texto (§6); foco e fills ≥3:1.
- **Foco visível** com anel accent em todo controle interativo (§4.1) — o outline default do browser contra o novo dark não é confiável.
- **`color-scheme: dark`**: controles nativos (checkbox, autofill do login, scrollbar, pickers) renderizam dark.
- Affordance não depende só de cor: danger segue com texto/emoji existentes ("🗑️ Excluir…"), links com sublinhado no hover.
- Sem mudança de roles/aria/alvos (LB-4 `min-h-11` intocado).

## 8. Testes (notas para DEV/QA)

**Unit/jsdom (atualizar asserts existentes):**
- `tests/mobile-ux.test.tsx:95-103`: CTA passa a casar `bg-primary`, `text-white`, `focus-visible:outline-primary` (hoje `bg-foreground`/`text-background`/`outline-foreground`).
- `tests/delete.ui.test.tsx:175`: destrutivo casa `text-danger` (hoje `text-red-600`).
- Nenhum outro teste referencia cores (grep confirmou); testes de comportamento (1-toque, filtro, delete, sync) seguem sem mudança — UI pura.

**Novos asserts sugeridos:**
- `globals.css`: contém os 12 tokens, `color-scheme: dark`, `::selection`; **não** contém `prefers-color-scheme` (AC 4).
- Grep de AC 1 (pode ser script/check no CI ou passo do QA): nenhum `red-`, `black/`, `bg-foreground text-background` fora de `globals.css`/CTAs mapeados; `text-red-*` zerado no `src/`.

**QA manual (preview, 390×844 + desktop):**
- Checklist visual das telas (AC 6): índice (toolbar, fixadas/demais, vazio, filtro aberto, link Arquivadas, rodapé), detalhe (título editável, autocomplete ativo, concluídos, menu ⋨, ConfirmDialog excluir lista), arquivadas, login (erros de validação em danger, CTA disabled), `not-found`/`error`.
- Dark-only: alternar `prefers-color-scheme` do SO não muda nada (AC 4); checkbox nativo azul; seleção de texto azul #474f71; foco por teclado com anel azul em menus/botões.
- Contraste spot-check com ferramenta nos pares do §6 (AC 5).
- PWA standalone: splash/status bar brancos são **esperados** nesta issue (follow-up registrado na spec de negócio).

## 9. Trade-offs (decisões de design)

1. **Toast invertido vs. accent-filled**: status ≠ ação; invertido é o padrão LB-12 com 13:1 e zero diff. Escolha: **permanece invertido**.
2. **Elevação real em overlays (`bg-surface`) vs. manter `bg-background`**: hoje overlay é indistinguível do fundo; #25272f dá a separação que a borda sozinha não dá, usando cor da própria referência. Escolha: **`bg-surface` nos flutuantes**.
3. **Links em `#5c8ae6` vs. `#3e6fd9`**: fidelidade literal custa AA (3,6:1). Escolha: **`#5c8ae6`** (variante da própria paleta; `#3e6fd9` segue nos fills).
4. **Ajustar `--muted`/`--danger` vs. manter referência literal**: AA é AC 5; ajustes de +5–8% de luminosidade preservam matiz e foram pré-autorizados. Escolha: **ajustar** (#9092a2, #e26875).
5. **Anel de foco uniforme em todos os controles vs. só onde já existia**: fecha lacuna de teclado com vocabulário único; sem impacto de layout. Escolha: **uniforme** (§4.1).
6. **`--surface-raised`/`--success`/`--warning` sem uso vs. omitir**: a issue pede a paleta completa como tokens; definir agora evita reabrir `globals.css` depois. Escolha: **definir e documentar como reservados**.

## 10. Resumo de decisões

| Decisão | Escolha |
| -- | -- |
| Tema | **Dark-only** Mystical Blue: base `#1c1c23`, superfícies `#25272f`, accent `#3e6fd9` — sem media query, `color-scheme: dark` |
| Tokens | 12 em `globals.css` (`@theme inline` → classes `bg-primary`, `text-danger`, `bg-surface`, `bg-overlay`…) — nenhuma cor fora deles |
| Ajustes AA | `--muted` #9092a2 · `--danger` #e26875 · links `--primary-hover` #5c8ae6 (matiz preservado) |
| CTA primário | `bg-primary text-white`, hover `bg-primary-hover`, anel `outline-primary` (padrão LB-19 mantido, só a cor muda) |
| Foco | anel `outline-primary` 2px/offset 2 em todo controle; inputs `focus:border-primary` |
| Overlays | menus, autocomplete e ConfirmDialog sobem para `bg-surface`; scrim tokenizado `bg-overlay` |
| Toast / padrões | pill invertida, realces `current/x`, alvos 44px, textos e aria — **intactos** |
| Arquivos alterados | `globals.css` + 5 componentes + `login/page.tsx` (+ asserts de cor em 2 arquivos de teste) |
| Dependências | nenhuma (sem lib de tema, sem toggle) |

## Out of scope (mesmos da issue + spec de negócio)

Fonte tipográfica, logotipo/ícones, tema do PWA (manifest/splash/meta `theme-color` — follow-up registrado), toggle de tema, redesign de layout, novos componentes. `Toast`, `store`, sync, schema, RLS: sem mudança.
