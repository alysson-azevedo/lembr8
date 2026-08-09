# Spec de design — LB-4: UX mobile da lista de tarefas

**Issue:** [LB-4](https://linear.app/alysson-azevedo/issue/LB-4/melhorar-a-experiencia-mobile-da-lista-de-tarefas-mvp) · **State:** ✅ Deployed (v0.2.1) · **Tipo:** 🔍 Melhoria
**Base:** LB-3 (✅ Deployed), desktop-first. Arquivos: `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/todos/TodoList.tsx`.

Frontend/UI apenas. Sem mudança do modelo de dados (`{id, texto, concluído}`), da camada de persistência (localStorage) nem da lógica de negócio. Sem novas funcionalidades. Sem regressão em desktop.

## Diagnóstico do estado atual (gaps mobile)

- `layout.tsx` **não exporta `viewport`** → sem `viewportFit: 'cover'`; safe areas (notch / home indicator) não são respeitadas.
- Input com `text-sm` (14px) → **iOS Safari aplica zoom automático ao focar** inputs com fonte < 16px.
- Checkbox `size-4` (16px) e botão "Sair" (~36px de altura) → **abaixo do alvo de toque mínimo** (44px).
- `main` usa `min-h-screen` + `items-center` → centro vertical; com o teclado virtual aberto, o card centralizado desloca e pode ocultar o input.
- Lista em fluxo normal sem altura dinâmica → rolagem compete com o card centralizado.

## Princípios

1. **Mobile-first, sem regressão em desktop**: usar unidades responsivas que valem 0/auto em telas grandes; o card `max-w-[28rem]` centralizado de desktop permanece.
2. **Reutilizar o padrão visual LB-2/LB-3**: paleta `--background/--foreground/--muted`, bordas `border-current/20`, `divide-current/10`, fontes Geist, dark mode por `prefers-color-scheme`. Sem novos tokens de cor nem componentes.
3. **Mínimo que entrega valor**: nada de animações, gestures, sticky composer ou novas estruturas que não sejam necessárias ao critério de aceite.

## Especificação

### 1. Viewport e safe areas (raiz — `src/app/layout.tsx`)

- Exportar `viewport` (Next.js App Router) em `layout.tsx`:
  ```ts
  export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover", // habilita env(safe-area-inset-*) em iOS
  };
  ```
- `viewportFit: "cover"` é o que permite as `env(safe-area-inset-*)` terem efeito. Sem isso, o notch/home indicator não são cobertos.
- **Não** adicionar `user-scalable=no` (acessibilidade — permite zoom do usuário).

### 2. Layout do container (`src/app/page.tsx`)

- Trocar `min-h-screen` por **`min-h-dvh`** (dynamic viewport height) — adapta-se à altura quando o teclado abre/fecha.
- Trocar `items-center` por **`items-start sm:items-center`** — no mobile o conteúdo alinha ao topo (input fica previsível/acessível); em ≥`sm` (640px) volta a centralizar como hoje.
- Adicionar safe-area no container: `p-6` vira **`px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]`** (em desktop `env()` = 0, então equivale a `p-6`; no mobile adiciona o inset do notch/topo e do home indicator/base).
- Manter `max-w-[28rem]` e `w-full`.

### 3. Entrada inline com teclado mobile (`src/components/todos/TodoList.tsx`)

- **Fonte ≥ 16px** para evitar zoom do iOS: `text-sm` → **`text-base`**.
- Adicionar `enterKeyHint="enter"` (mantém tecla Return, permitindo digitar vários itens seguidos; "go/done" sugeriria encerrar). `inputMode="text"` (opcional).
- **Não** adicionar `autoFocus` (abriria o teclado ao carregar a tela — ruim).
- Comportamento já correto: `onKeyDown` Enter → `addItem()` (limpa e mantém foco). Manter. No mobile, a tecla Enter/Return do teclado dispara o mesmo `keydown` `Enter`, então o item é adicionado sem código extra.
- O input fica no **topo** do `TodoList`, acima da lista → com o layout alinhado ao topo (`items-start`) e `min-h-dvh`, permanece visível/acessível acima do teclado sem sticky.

### 4. Alvos de toque (checkbox e ações)

Padrão de referência: **mínimo 44×44px** (Apple HIG 44pt / Material 48dp; WCAG 2.5.8 pede ≥24px, mas 44 é o alvo confortável adotado).

- **Checkbox**: `size-4` (16px) → **`size-5` (20px)** visual; envolver em área clicável de **mín. 44px de altura**. Concretamente, tornar cada `<li>` um `<label>` que contém o checkbox + texto (clicar em qualquer ponto da linha alterna), com `min-h-11` (44px) e `py-2` (já que o row centraliza verticalmente). O checkbox nativo recebe `className="size-5"` e o `<label>` provê a área de toque estendida. Alternativa (se o DEV preferir não toggle ao clicar no texto): manter `<li>` não-`label` e dar ao checkbox `size-5` + `min-w-11 min-h-11` via wrapper `<span class="inline-flex min-h-11 items-center">`. **Recomendado: `<label>`** (área de toque máxima, acessível, alinhado ao padrão de form nativo).
- **Botão "Sair"** (`page.tsx`): `px-4 py-2 text-sm` → adicionar **`min-h-11`** (44px) e manter `text-sm`. Centraliza verticalmente o rótulo.
- Linhas da lista (`<ul divide-y>`): garantir `min-h-11` por `<li>` (já coberto pelo `<label>` acima).

### 5. Estado vazio (mobile)

- Atual: `mt-4 text-sm text-muted`. Mudar para **`text-base`** (legibilidade mobile) e manter `text-muted` e o texto existente ("Nenhum item ainda. Digite acima e pressione Enter para começar."). Sem ícone (fora do padrão atual; evitar invenção).
- Garantir que o estado vazio aparece abaixo do input e rola junto com a lista.

### 6. Rolagem da lista

- Com `min-h-dvh` + `items-start`, a página inteira rola naturalmente; a lista cresce para baixo e o usuário rola dentro do viewport disponível (acima do teclado). Sem container de scroll interno (evita scroll aninhado e mantém simples).
- O rodapé "Ambiente/Build" permanece ao final do fluxo (fora da área de toque principal); sem mudança.

### 7. Tipografia e espaçamento (resumo)

| Elemento        | Atual            | Mobile                            | Desktop (≥ sm)        |
|-----------------|------------------|-----------------------------------|-----------------------|
| Título Lembr8   | `text-3xl`       | `text-3xl` (manter)               | idem                  |
| Subtítulo       | `text-muted`     | `text-muted` (manter)             | idem                  |
| Input           | `text-sm px-3 py-2` | **`text-base`**, `px-3 py-3` (44px) | idem (sem regressão) |
| Itens da lista  | `text-sm`(span) | **`text-base`**                   | idem                  |
| Checkbox        | `size-4`         | **`size-5`** + área 44px           | idem                  |
| Botão Sair      | `px-4 py-2`      | **`min-h-11`**                     | idem                  |
| Estado vazio    | `text-sm`        | **`text-base`**                   | idem                  |

- `text-base` em itens e input melhora legibilidade mobile sem impactar desktop (16px é confortável em ambos).

## Trade-offs (decisões de design, não arquitetura)

1. **Posição do input — topo inline (A, recomendado) vs. composer fixo no rodapé (B).**
   - **A (topo, padrão atual):** input no topo, lista cresce abaixo, página rola. Mínimo, zero risco de regressão em desktop, reusa o padrão LB-3. Quando o teclado abre, o input no topo permanece visível.
   - **B (sticky bottom acima do teclado, estilo chat):** item aparece acima do input; melhor para adicionar muitos itens enquanto rola a lista. Mais complexo (posicionamento `fixed`/`sticky` + safe area + lidar com `visualViewport`), risco de regressão em desktop.
   - **Recomendação: A** para esta issue. B fica como evolução futura se o uso real mostrar fricção.

2. **Área de toque do checkbox — `<label>` envolvendo a linha (A, recomendado) vs. só aumentar o checkbox (B).**
   - **A:** clicar em qualquer ponto da linha de 44px alterna o item. Área de toque máxima, acessível, padrão HTML nativo.
   - **B:** só `size-5`, área de toque ~20px (abaixo de 44) — não atende o critério sem wrapper.
   - **Recomendação: A.** (Observação: clicar no texto para toggle é o comportamento esperado de `<label>` e não conflita com "editar item", que está fora de escopo.)

## Critérios de aceite (sugeridos para o DEV/QA)

1. Em viewport mobile (ex.: 390×844, iPhone 14), a tela é utilizável confortavelmente; conteúdo não colide com notch nem home indicator.
2. Alvos de toque do checkbox e do botão "Sair" têm ≥44px de altura.
3. Focar o input no iOS **não** aplica zoom automático (fonte ≥16px); a tecla Enter/Return do teclado mobile adiciona o item e o campo permanece visível/acessível acima do teclado.
4. Estado vazio é legível no mobile (≥16px).
5. Sem regressão em desktop: card `max-w-[28rem]` centralizado, mesmo layout e cores da LB-3.
6. Suite de testes automatizados passando (sem mudança de lógica; ajustar testes de renderização se necessário).

## Out of scope (mesmos da issue)

Editar/excluir item, múltiplas listas, busca/filtros, categorias, persistência remota, notificações/Web Push, mudança do modelo de dados.