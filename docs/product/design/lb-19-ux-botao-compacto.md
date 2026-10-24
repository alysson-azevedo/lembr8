# Spec de design — LB-19: UX mobile — botão "Nova lista" compacto na tela índice

**Issue:** [LB-19](https://linear.app/alysson-azevedo/issue/LB-19/ux-mobile-botao-nova-lista-compacto-na-tela-indice) · **State:** ✅ Deployed (v0.8.1) · **Tipo:** 🔍 Melhoria · **Prioridade:** medium
**Base:** LB-4 (UX mobile, alvos ≥44px), LB-5 (índice em `/` + "Nova lista" em 1 toque), LB-14 (fixadas primeiro + pin 📌 indicador na linha), LB-16 (link "Arquivadas"), LB-17 PR1 (filtro expansível 🔍 — o layout alvo do topo, `[＋ Nova lista] [🔍]`, já está esboçado na §1.1 daquela spec).
**Spec de negócio:** `docs/product/lb-19-ux-botao-compacto.md` (PO) + descrição da issue. **ADRs:** `docs/decisions.md` (sem conflito; nada de arquitetura/stack/custo aqui).

Frontend/UI apenas, restrito ao **botão "Nova lista" da tela índice** (`src/components/listas/ListasIndex.tsx`) e ao container da linha de controles do topo. Sem mudança de comportamento (1 toque cria `Lista N` e abre o detalhe — LB-5 intocada), sem mudança no `store`, sem nova dependência, sem novo token de cor, sem lib de animação. O botão "Nova lista" do detalhe (`ListaScreen`) **não é tocado** — hoje ele nem existe lá; se um dia existir, é outra issue.

---

## Princípios

1. **Reutilizar padrões existentes**: o preenchido primário `bg-foreground text-background` já é o padrão de CTA do projeto (login "Entrar" e `Toast`); alvos `min-h-11` (44px, LB-4); tokens `--background/--foreground/--muted` via Tailwind. Sem invenção de identidade visual.
2. **Compactar o visual, não o alvo**: a classe `min-h-11` permanece literalmente no botão em todas as variantes (alvo 44px garantido). A redução de footprint vem de **largura intrínseca** (fim do `w-full` quando há listas) + **merge das duas linhas de controle em uma**.
3. **A lista é o conteúdo prioritário** (feedback PO na LB-17): no estado default com listas, há exatamente **uma linha de 44px de controles** antes da primeira lista.
4. **Comportamento intocado**: `createList()` + `router.push()` no mesmo 1 toque; mesmo rótulo "Nova lista"; nenhuma mudança de navegação, dados ou teclado.

---

## 1. Diagnóstico — estado atual (`develop` @ `7f20642`)

```
Lembr8                      [Sair]
Suas listas
                             ← mt-6
[🔍]                         ← linha 1: 44px (renderizada só quando há listas)
                             ← mt-2
[Nova lista ———————————————] ← linha 2: 44px, w-full, bordado
                             ← mt-4
📌 Lista 2          3 a fazer
Lista 1             5 a fazer
```

- Botão atual: `mt-2 w-full min-h-11 rounded border border-current/20 px-3 py-2 text-base` — bordado, full-width.
- **Custo vertical**: 44 (🔍) + 8 (mt-2) + 44 (botão) = **96px de controles** antes da primeira lista.
- O botão `w-full` não pode dividir linha com o 🔍, por isso a LB-17 PR1 empilhou as duas linhas — a §1.1 da spec da LB-17 sempre desenhou o alvo como `[＋ Nova lista] [🔍]` em uma linha. LB-19 fecha esse layout.

## 2. Design — toolbar de uma linha + botão primário compacto

### 2.1 Estado fechado (default, com listas)

```
Lembr8                      [Sair]
Suas listas
                             ← mt-6
[＋ Nova lista]       [🔍]   ← UMA linha de 44px (toolbar)
                             ← mt-4
📌 Lista 2          3 a fazer
Lista 1             5 a fazer
```

- A linha atual só-🔍 vira a **toolbar** `flex items-center justify-between gap-2` com dois filhos: `BotaoNovaLista` (compacto, à esquerda) e o 🔍 (à direita, **classes da LB-17 intocadas**).
- Primária à esquerda, utilitária na borda direita — o 🔍 fica alinhado em baixo do "Sair" (coluna direita de utilidades; futuro LB-20 mantém esse alinhamento). É o layout esboçado em LB-17 §1.1.
- Alternativa equivalente (a critério do DEV): manter `justify-start` + spacer `<div className="flex-1" />` entre os dois — mesmo resultado visual.
- Larguras: botão ≈130px (`px-4` 32 + ＋ 16 + gap 8 + "Nova lista" ~74); em viewport 320px o conteúdo útil é 272px (336 − `px-6`) e a toolbar ocupa ~182px — **sem overflow** em telas pequenas.

### 2.2 O botão — uma base, três variantes por contexto

Base compartilhada (todas as variantes):

```
flex min-h-11 items-center justify-center gap-2 rounded bg-foreground px-4 py-2 text-base font-medium text-background hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground
```

| Contexto | Classes adicionais | Resultado |
| --- | --- | --- |
| Toolbar (fechado, com listas) | `shrink-0` | Compacto, largura intrínseca, à esquerda da toolbar |
| Filtro aberto (com listas) | `mt-2` | Compacto, **abaixo** da linha do input (posição atual preservada) |
| Índice vazio (`listas.length === 0`) | `w-full` | CTA full-width de onboarding (igual hoje, agora preenchido) |

- Conteúdo do botão (idem nas três variantes): `<span aria-hidden="true">＋</span> Nova lista`. O rótulo **permanece um text node direto** do `<button>` (não envolver em `<span>`) — ver §8 (testes).
- Altura visual = alvo = 44px em todas as variantes (`min-h-11` + `py-2` centra o conteúdo); a compactação é **horizontal + merge de linhas**, não vertical do alvo.

### 2.3 Por que preenchido (e não bordado compacto)

Um botão pequeno **bordado** lê como controle secundário (visualmente igual ao "Sair" do header), enfraquecendo a affordance primária — o AC pede "continua primária, só mais compacta". O preenchido `bg-foreground text-background` é o padrão de CTA primário **já existente** no projeto (login "Entrar": `w-full rounded bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50`; `Toast` idem) e num footprint pequeno continua gritando "ação principal". Dark mode funciona por inversão de tokens (claro no escuro), sem classe extra.

### 2.4 Estados do botão

| Estado | Especificação |
| --- | --- |
| Default | Preenchido `bg-foreground` + texto `text-background`, `font-medium`, `text-base` |
| Hover (pointer) | `hover:opacity-90` — feedback sutil; `opacity` já é o vocabulário do botão primário do login (`disabled:opacity-50`). Sem transition nova |
| Focus (teclado) | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground` — anel 2px na cor do foreground com offset 2px, visível nos dois temas (claro: anel escuro em volta do botão escuro sobre página branca; escuro: anel claro em volta do botão claro). Escopo: **só este botão** — nenhum outro botão do app muda |
| Active/pressed | Sem estado custom (fora do padrão atual do projeto; o toque navega imediatamente) |

### 2.5 Filtro aberto (transitório)

```
[Filtrar por nome____________] [✕]   ← input full-width, LB-17 §1.2 intocado
[＋ Nova lista]                     ← compacto abaixo, mt-2
```

- O input **continua full-width** (a tarefa ativa é digitar; espremer o botão na mesma linha reduziria o campo a ~156px num iPhone 14 e ~86px num 320px, truncando o placeholder).
- Estrutura idêntica à atual (input acima, botão abaixo) — muda só o estilo do botão. Estado transitório tolera a linha extra: o espaço extra é "gasto sob demanda" pelo usuário que abriu o filtro; o default (fechado) é o estado que prioriza a lista.
- Animação `transition-all duration-150` da LB-17 no container do input permanece como está; **sem animação nova** no botão (ele troca de linha abruptamente ao abrir/fechar o filtro — aceitável).

### 2.6 Índice vazio (`listas.length === 0`)

- O filtro já não rendera quando não há listas (LB-17 §1.4) — não há com quem parear o botão. O botão fica **full-width** como hoje: é o único CTA da tela, nada compete pelo espaço e a mensagem de onboarding abaixo ("Nenhuma lista ainda. Toque em 'Nova lista' para começar.") pede um alvo óbvio.
- Vale também para `listas.length === 0 && temArquivadas` (todas arquivadas): zero listas ativas → variante full-width, mesma condicional binária existente.
- O rótulo **não muda** ("Nova lista") — a mensagem do estado vazio o referencia literalmente.

## 3. Vizinhos — o que NÃO muda

| Vizinho | Status |
| --- | --- |
| 🔍, ✕ e input do filtro (LB-17) | Classes, aria, tamanho e animação **intactos** — só o container da linha passa a ser a toolbar (`justify-between`) |
| Header "Lembr8"/"Sair" | Intocado (LB-20 tratará "Sair" → `[...]`; o 🔍 à direita já fica alinhado com a futura coluna de utilidades) |
| Linhas do índice, pin 📌, ordenação LB-14 | Intactos |
| Link "Arquivadas" (LB-16) | Intacto |
| Rodapé Ambiente/Build (LB-11) | Intacto |
| `ListaScreen` (detalhe) | **Fora do escopo** — nenhum botão "Nova lista" existe lá hoje; se surgir, é outra issue |
| `store` / `listIndex()` | Nenhuma mudança — UI pura |
| Desktop (`max-w-[28rem]`) | Mesma toolbar; coluna centralizada, espaçamentos e cores como hoje |

## 4. Ganho vertical (AC 1 — métrica)

| | Antes | Depois |
| --- | --- | --- |
| Altura visível dos controles antes da primeira lista (default, com listas) | 96px (44 + mt-2 + 44) | **44px** (uma linha) |
| Redução | — | **−52px (−54%)** |

Em viewport 390×844 a primeira lista sobe ~52px — imediatamente abaixo da toolbar, sem rolagem.

## 5. JSX de referência (`ListasIndex.tsx`)

Somente a região dos controles muda; `visiveis`, `fecharFiltro`, linhas, estados vazios e link "Arquivadas" permanecem como estão.

```tsx
export function ListasIndex() {
  const listas = useListas();
  const temArquivadas = useTemArquivadas();
  const hydrated = useHydrated();
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [filtroNome, setFiltroNome] = useState("");

  // visiveis / fecharFiltro — inalterados (LB-17)

  return (
    <div className="mt-6">
      {listas.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          {filtroAberto ? (
            <div className="flex flex-1 items-center gap-2 overflow-hidden transition-all duration-150">
              {/* input + ✕ — LB-17, inalterados */}
            </div>
          ) : (
            <>
              <BotaoNovaLista className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded bg-foreground px-4 py-2 text-base font-medium text-background hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground" />
              {/* 🔍 — botão da LB-17, classes inalteradas */}
            </>
          )}
        </div>
      ) : null}

      {listas.length === 0 || filtroAberto ? (
        <BotaoNovaLista
          className={`${
            listas.length === 0 ? "w-full" : "mt-2 shrink-0"
          } flex min-h-11 items-center justify-center gap-2 rounded bg-foreground px-4 py-2 text-base font-medium text-background hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground`}
        />
      ) : null}

      {/* estado vazio, <ul> das listas, vazio do filtro, link Arquivadas — inalterados */}
    </div>
  );
}

/**
 * Botão "Nova lista" do índice (LB-19): compacto na toolbar / abaixo do filtro
 * aberto, full-width no índice vazio. 1 toque cria `Lista N` e abre o detalhe
 * (LB-5, intocado). Rótulo permanece text node direto (testes usam getByText).
 */
function BotaoNovaLista({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        const lista = createList();
        router.push(`/listas/${lista.id}`);
      }}
      className={className}
    >
      <span aria-hidden="true">＋</span> Nova lista
    </button>
  );
}
```

## 6. Estados

| Estado | Comportamento |
| ------ | ------------- |
| Default com listas (filtro fechado) | Toolbar de **uma** linha: `[＋ Nova lista] … [🔍]`; primeira lista logo abaixo (mt-4) |
| Filtro aberto | Input full-width (LB-17 intocado) + botão compacto abaixo (mt-2); botão continua funcional |
| Filtro aberto, sem resultados | "Nenhuma lista encontrada com esse nome." (LB-17) — botão permanece visível/ativo |
| Índice vazio | Botão full-width + "Nenhuma lista ainda. Toque em 'Nova lista' para começar." |
| Zero ativas + arquivadas | Variante full-width + link "Arquivadas" (sem filtro) |
| 1 toque no botão | Cria `Lista N` (auto-incremento LB-5) e navega para `/listas/[id]` — idêntico a hoje |
| Dark mode | Botão claro sobre página escura (inversão de tokens); hover e focus visíveis |
| Desktop (≥ sm) | Mesma toolbar dentro da coluna `max-w-[28rem]`; hover/focus aplicáveis |
| Teclado | Tab: Nova lista → 🔍 (fechado) / input → ✕ → Nova lista (aberto); anel de focus visível |

## 7. Acessibilidade

- **Alvo ≥44px**: `min-h-11` em todas as variantes (LB-4); largura intrínseca ≥ ~130px.
- **Nome acessível**: texto visível "Nova lista" (o `＋` é `aria-hidden`); sem `aria-label` redundante.
- **Focus visível**: `focus-visible` com anel `outline-foreground` + offset — confiável nos dois temas (o outline padrão do browser pode sumir contra o preenchido).
- Sem mudança em roles/aria da LB-17 (`aria-expanded` etc. permanecem como estão).

## 8. Testes (notas para DEV/QA)

**UI (testing-library/jsdom):**
- `getByText("Nova lista")` continua casando com o `<button>` (label é text node direto; `＋` está em span irmão) — **manter essa forma**, não envolver o rótulo em span.
- `tests/mobile-ux.test.tsx` ("botão 'Nova lista' tem min-h-11 e text-base") renderiza índice **vazio** → variante full-width → `w-full` continua presente, segue passando. **Adicionar** caso com ≥1 lista: botão sem `w-full`, com `min-h-11` + `text-base`, na mesma linha do 🔍 (ex.: `closest("div")` do botão contém o 🔍).
- `tests/filtro-listas.ui.test.tsx` ("permanece funcional e visível com filtro aberto") segue passando — botão abaixo do input, `getByText` + click.
- Comportamento 1-toque já coberto por `tests/listas.ui.test.tsx` — sem regressão esperada.
- Novos asserts sugeridos: toolbar `justify-between` com exatamente [botão, 🔍] no estado fechado; botão recebe `bg-foreground`/`text-background` (primária).

**QA manual (viewport 390×844 e desktop):**
- Altura dos controles antes da primeira lista = 44px (uma linha); primeira lista visível sem rolagem.
- Toque no botão cria `Lista N` e abre o detalhe; rótulo e comportamento idênticos.
- Índice vazio: CTA full-width + mensagem; filtro aberto: input full-width + botão compacto abaixo.
- Dark mode: botão claro, legível, hover/focus visíveis. Desktop: coluna `max-w-[28rem]` sem regressão.

## 9. Trade-offs (decisões de design)

1. **Toolbar de uma linha vs. duas linhas compactas.** Só a toolbar reduz a altura dos controles (96→44px) — manter duas linhas com botão estreito não muda a métrica do AC 1. Escolha: toolbar (é também o layout já esboçado em LB-17 §1.1).
2. **Preenchido vs. bordado compacto.** Bordado pequeno lê secundário (igual "Sair"); preenchido é o CTA primário existente (login/Toast) e preserva a affordance exigida. Escolha: preenchido.
3. **`＋` + rótulo vs. só-ícone vs. só-texto.** Só-ícone perde o rótulo que a mensagem do estado vazio referencia; só-texto perde affordance de criação. Escolha: `＋` (U+FF0B, aria-hidden) + "Nova lista" (sketch LB-17 §1.1).
4. **Filtro aberto: input full-width + botão abaixo vs. tudo numa linha.** Uma linha espremeria o input (~86px em 320px). Escolha: input full-width; o estado aberto é transitório e tolera a linha extra.
5. **Índice vazio full-width vs. compacto sempre.** Full-width maximiza o CTA de onboarding quando nada compete pelo espaço. Escolha: full-width no vazio, compacto com listas (a tela "vira" workspace ao ganhar conteúdo).
6. **Focus custom vs. outline default do browser.** O default do browser pode desaparecer contra o preenchido; anel `outline-foreground` com tokens existentes é previsível nos dois temas. Escopo: só este botão.

## 10. Resumo de decisões

| Decisão | Escolha |
| --- | --- |
| Estrutura do topo (default, com listas) | **Toolbar de uma linha** `[＋ Nova lista] … [🔍]` (`flex items-center justify-between gap-2`) — 96px → 44px antes da primeira lista |
| Estilo do botão | **Primário preenchido** `bg-foreground text-background font-medium rounded text-base` (padrão do login/Toast; bordado fica para secundárias) |
| Rótulo | "Nova lista" (inalterado) + `＋` U+FF0B em `<span aria-hidden>` |
| Alvo de toque | `min-h-11` (44px) mantido literalmente em todas as variantes; compactação é horizontal + merge de linhas |
| Variantes por contexto | com listas: compacto (`shrink-0`) na toolbar; filtro aberto: compacto `mt-2` abaixo do input; índice vazio: `w-full` |
| Estados | default preenchido · hover `hover:opacity-90` · focus `focus-visible:outline-2 outline-offset-2 outline-foreground` · sem active/transition novos |
| Filtro (LB-17) | input/✕/🔍 classes e aria **intactos**; só o container da linha muda |
| Comportamento | 1 toque → `createList()` → `router.push()` — zero mudança |
| Arquivo alterado | `src/components/listas/ListasIndex.tsx` (botão local `BotaoNovaLista`, sem novo arquivo) + testes |
| Dependências/tokens | nenhum novo (sem lib, sem token, sem animação) |

## Out of scope (mesmos da issue)

Filtro por nome (LB-17), botão "Sair"/header (LB-20), tipos de lista, ordenação, pin (LB-14), botão "Nova lista" do detalhe (`ListaScreen`), mudanças de store/sync, novo design system.
