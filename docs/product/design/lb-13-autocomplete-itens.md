# Spec de design — LB-13: Autocomplete de itens previamente adicionados (desktop e mobile)

**Issue:** [LB-13](https://linear.app/alysson-azevedo/issue/LB-13/autocomplete-de-itens-previamente-adicionados-desktop-e-mobile) · **State:** 📑 Spec → 🚧 Dev in progress · **Tipo:** 🔍 Melhoria · **Prioridade:** baixa
**Base:** LB-3 (✅ Deployed) — entrada inline (campo + Enter); LB-4 (✅ Deployed) — UX mobile (alvos `min-h-11`/44px); LB-5 (✅ Deployed) — `Lista` + `Item`, reutilização/duplicado ao adicionar; LB-6 (✅ Deployed) — cache local-first com `createdAt`/`updatedAt` por registro, merge cross-device por `updated_at`, RLS por `auth.uid()`; LB-8 (✅ Deployed) — menu overflow "⋮" + `ConfirmDialog`.
**Spec de negócio:** `docs/product/lb-13-autocomplete-itens.md` (AC + UX do usuário). **ADRs:** `docs/decisions.md`.

Esta spec fixa **design técnico/visual** (componente combobox/listbox, normalização de texto, leitura só do cache, gestão de foco/scroll no mobile) para o DEV implementar sem inventar. Decisões de negócio/AC não se reabrem. **Sem** mudança de schema, **sem** mudança de RLS, **sem** chamada ao Supabase na UI, **sem** nova dependência (sem Radix/HeadlessUI/Combobox lib), **sem** novo token de cor.

Arquivos atuais relevantes: `src/components/listas/ListaScreen.tsx` (campo de entrada inline + menu overflow + `ConfirmDialog`), `src/lib/todos/{types,repository,store}.ts` (camada de dados: `Item` público sem timestamps; `ItemRecordLocal` interno com `createdAt`/`updatedAt`; `useLista` lê só uma lista), `src/app/globals.css` (tokens `--background/--foreground/--muted`).

---

## Princípios

1. **Reutilizar o padrão visual LB-2..LB-8**: paleta `--background/--foreground/--muted`, bordas `border-current/20`, alvos `min-h-11` (44px, LB-4), dark mode por `prefers-color-scheme`. Sem novos tokens de cor; sem novos componentes estruturais além do listbox de sugestões.
2. **Mínimo que entrega valor**: autocomplete = atalho de digitação. Um listbox de sugestões preso ao campo existente, funções puras de normalização/casamento, uma nova função de leitura no repositório/store. Sem debounce complexo, sem animação, sem highlight de match dentro da option, sem agrupamento, sem footer "Criar novo…".
3. **Autocomplete não cria item**: selecionar uma sugestão só **preenche o campo e fecha o dropdown**; o item só nasce no Enter, pela lógica de `addItemToLista` já existente (LB-5). Zero mudança na lógica de criar/reutilizar/duplicado — o autocomplete é ortogonal a ela.
4. **UI isolada do storage**: a UI consome só o `store` (`useItemSuggestions`); o `store` consome só o repository; o repository lê o cache (local-first). Nenhum import de `supabase` ou `localStorage` nos componentes. Nenhuma chamada de rede.
5. **Sem dado novo, sem schema novo**: a ordenação "mais recente primeiro" usa `updatedAt` **já presente** no registro do cache (`ItemRecordLocal`, desde LB-6) e no cloud (`items.updated_at`). Nenhuma migration, nenhuma policy nova, nenhum rastreamento de frequência.
6. **Local-first/offline**: funciona sem rede (lê do cache); nenhum erro, nenhum botão desabilitado, nenhum spinner.

---

## 1. Camada de dados — leitura só do cache (sem schema/RLS)

### 1.1 Por que uma função nova
O `store` hoje expõe `useListas()` (índice com contagens) e `useLista(listId)` (itens de **uma** lista). O autocomplete precisa de itens de **todas** as listas, ordenados por `updatedAt` desc. O `Item` público (`types.ts`) **não** expõe `updatedAt` — mas o registro interno do cache (`ItemRecordLocal = Item & { createdAt; updatedAt }`, em `repository.ts`) tem. A solução: uma função de leitura que resolve tudo dentro do repository (que enxerga `ItemRecordLocal`) e devolve `string[]` (os textos sugeridos) — **sem vazar `updatedAt`/`ItemRecordLocal` para a UI**, sem alterar o tipo `Item` existente, sem mudar a interface dos métodos atuais.

### 1.2 Funções puras de domínio (`repository.ts`, testáveis em node sem DOM)

```ts
/**
 * Normaliza texto para casamento de sugestão: trim + NFD (decompõe acentos) +
 * remove diacríticos + lowercase. Ex.: "Café" → "cafe", "  Arroz " → "arroz".
 * Usa `\p{Diacritic}` (Unicode property escape) — cobre acentos do PT-BR e
 * outros; suportado em engines modernas (target do projeto).
 */
export function normalizaTexto(s: string): string {
  return s
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Casamento por prefixo, insensível a acento/caixa: `normalizaTexto(texto)`
 * começa com `normalizaTexto(prefix)`. Prefixo vazio → false (não casa nada).
 * NÃO casa "contém" (mid-word) — fora de escopo.
 */
export function prefixoCombina(prefix: string, texto: string): boolean {
  const p = normalizaTexto(prefix);
  if (!p) return false;
  return normalizaTexto(texto).startsWith(p);
}

/**
 * Sugestões de itens para o autocomplete (AC 1/2/3/4/6).
 * `items`: registros com `{ texto, updatedAt }` (lê-se do cache; `updatedAt`
 * é o critério de recência já existente — sem dado novo).
 * Regras:
 *  (a) dedup por `normalizaTexto(texto)`, mantendo a ocorrência de **maior
 *      `updatedAt`** (AC "todas as listas" — textos iguais em listas diferentes
 *      viram uma sugestão; mostra o texto da ocorrência mais recente, preser-
 *      vando capitalização/acentos daquela ocorrência);
 *  (b) filtra por `prefixoCombina(query, texto)` (só prefixo);
 *  (c) ordena por `updatedAt` **desc** (mais recente primeiro);
 *  (d) limita a `limit` (default/AC = 6).
 * Retorna `string[]` (os textos sugeridos). Não muta a entrada.
 */
export function sugestoesPara(
  items: { texto: string; updatedAt: string }[],
  query: string,
  limit: number,
): string[] {
  const q = normalizaTexto(query);
  if (!q) return [];
  // (a) dedup por texto normalizado, mantendo o de maior updatedAt.
  const best = new Map<string, { texto: string; updatedAt: string }>();
  for (const it of items) {
    const norm = normalizaTexto(it.texto);
    if (!norm) continue;
    const ex = best.get(norm);
    if (!ex || it.updatedAt > ex.updatedAt) {
      best.set(norm, { texto: it.texto, updatedAt: it.updatedAt });
    }
  }
  // (b)(c)(d) filtra prefixo, ordena updatedAt desc, limita.
  return [...best.values()]
    .filter((c) => normalizaTexto(c.texto).startsWith(q))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, limit)
    .map((c) => c.texto);
}
```

- **Por que dedup antes do filtro de prefixo:** o conjunto canônico (um texto por normalização) é pequeno (limitado aos textos distintos já usados), e o passo é O(n) simples; filtrar depois reduz o `sort`. A ordem (dedup → filtro → sort → slice) não altera o resultado (interseção é comutativa) e mantém o código legível.
- **Não reutiliza `mesmoTexto`** (LB-5, que é só `trim().toLowerCase()`, sem remover acento): o autocomplete tem critério **diferente** (insensível a acento, AC 2) e propósito diferente (sugestão vs. detecção de duplicado). Função própria evita regressar a lógica de `addItemToLista`.
- **Empate de `updatedAt`** (itens com mesmo timestamp, ex.: migrados juntos): `sort` estável preserva a ordem de inserção no `Map` (ordem de primeiro aparecimento no cache) — determinístico.
- **Textos só de itens (não de nomes de lista)** — fora de escopo sugerir listas.

### 1.3 Método no repositório (`ListasRepository`, `types.ts`)

Acrescentar ao contrato `ListasRepository` em `src/lib/todos/types.ts`:

```ts
/** Textos sugeridos para autocomplete ao digitar (itens de TODAS as listas,
 *  dedup por texto normalizado mantendo o mais recente, prefixo insensível a
 *  acento/caixa, ordenados por `updatedAt` desc, limitado a `limit`). Lê do
 *  cache; sem chamada ao Supabase. */
listItemSuggestions(query: string, limit: number): string[];
```

Implementação em `createLocalFirstRepository` (`repository.ts`):

```ts
listItemSuggestions(query, limit) {
  return sugestoesPara(
    read().items.map((i) => ({ texto: i.texto, updatedAt: i.updatedAt })),
    query,
    limit,
  );
},
```

- Mapeia `ItemRecordLocal[]` → `{ texto, updatedAt }[]` (shape estreito), sem expor `ItemRecordLocal` para fora. `updatedAt` é campo já existente do cache (LB-6) — **sem mudança de schema/RLS**.
- Lê `read().items` (todos os itens de todas as listas da conta, já isolados por `userId` no cache — RLS por `auth.uid()` no cloud garante que só dados da própria conta chegaram ao cache; §5).

### 1.4 Hook no store (`store.ts`)

```ts
const EMPTY_STRINGS: string[] = [];
let suggestionsCache: { version: number; query: string; limit: number; data: string[] } | null = null;

/** Sugestões de autocomplete para o campo de novo item (itens de todas as
 *  listas, mais recente primeiro, prefixo insensível a acento/caixa, ≤6). */
export function useItemSuggestions(query: string, limit = 6): string[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (
        suggestionsCache &&
        suggestionsCache.version === version &&
        suggestionsCache.query === query &&
        suggestionsCache.limit === limit
      ) {
        return suggestionsCache.data;
      }
      const data = repoInstance().listItemSuggestions(query, limit);
      suggestionsCache = { version, query, limit, data };
      return data;
    },
    () => EMPTY_STRINGS,
  );
}
```

- `bumpVersion()` deve invalidar este cache: acrescentar `suggestionsCache = null;` ao lado de `indexCache = null; screenCache = null;` (assim, criar/toggle/sync reflete nas sugestões sem recomputar a cada render).
- Memoização por `(version, query, limit)` mantém referência estável entre renders com a mesma entrada (requisito do `useSyncExternalStore`) — só recomputa quando o estado do repo muda **ou** o `query`/`limit` muda.
- **Sem debounce:** a leitura é síncrona, local e barata (escala esperada: dezenas a poucas centenas de itens por conta). Recomputar por keystroke é aceitável. Se profiling em dataset grande mostrar jank, pode-se adicionar debounce trailing curto depois sem mudar a API — **não** introduzir agora (mínimo que entrega valor).

---

## 2. Componente `ItemSuggestions` (listbox, novo)

**Componente novo e reaproveitável:** `src/components/listas/ItemSuggestions.tsx` (`"use client"`). Inline com Tailwind, acessível, sem dependência externa. É **presentacional**: recebe as sugestões e o índice ativo; o teclado é tratado no `ListaScreen` (§3).

```ts
type ItemSuggestionsProps = {
  listboxId: string;
  suggestions: string[];
  activeIndex: number | null;
  onSelect: (texto: string) => void;
  onHover: (index: number) => void;
};
```

```tsx
export function ItemSuggestions({ listboxId, suggestions, activeIndex, onSelect, onHover }: ItemSuggestionsProps) {
  return (
    <div
      role="listbox"
      id={listboxId}
      aria-label="Itens sugeridos"
      className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded border border-current/20 bg-background py-1"
    >
      {suggestions.map((texto, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={`${listboxId}-${i}`}
            type="button"
            role="option"
            id={`${listboxId}-opt-${i}`}
            aria-selected={active}
            // mouseDown preventDefault mantém o foco no input (não dispara blur
            // antes do click registrar) — padrão combobox, funciona em toque.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(texto)}
            onMouseMove={() => onHover(i)}
            className={`flex min-h-11 w-full items-center px-3 text-left text-base text-foreground ${
              active ? "bg-current/10" : "hover:bg-current/5"
            }`}
          >
            {texto}
          </button>
        );
      })}
    </div>
  );
}
```

Detalhes:
- **Listbox absoluto, largura do input:** `absolute left-0 right-0 top-full` dentro de um wrapper `relative` que envolve `<input>` + `<ItemSuggestions>` (§3). Fica colado abaixo do campo, mesma largura.
- **`z-30`:** acima das linhas da lista (z auto) e do menu "⋮" (z-20); abaixo de `ConfirmDialog`/`Toast` (z-50). O menu "⋮" e o dropdown nunca coexistem (clicar em "⋮" tira o foco do input → blur fecha o dropdown, §3).
- **Alvo/touch (LB-4):** cada option é `min-h-11 w-full` (44px de altura, área total da linha é tocável). Com ≤6 options, a lista tem no máximo ~6×44 = 264px; `max-h-72` (288px) + `overflow-y-auto` rola só se ultrapassar (raro com 6, mas protege viewport estreita no mobile — AC 8).
- **Destaque do item ativo:** `bg-current/10` (mesmo realce do highlight de duplicado em `ListaScreen`); hover `bg-current/5` (mesmo affordance dos itens de menu do overflow, LB-12). Sem ícone, sem marcador "✓" — o destaque por cor basta.
- **Sem highlight do trecho casado dentro do texto** (mínimo que entrega valor; pode ser adicionado depois sem mudar a API).
- **`onMouseMove`** (não `onMouseEnter`) seta o índice ativo ao passar o cursor — evita flakiness e reseta só quando o mouse realmente move de option. Em toque não dispara (não atrapalha o mobile).
- **Texto da option = texto original** da ocorrência mais recente (preserva capitalização/acentos — ex.: digita "cafe", vê "Café").

---

## 3. Integração em `ListaScreen` (combobox)

O campo de entrada inline existente vira um **combobox** (input + listbox). A lógica de `addItem` (LB-3/LB-5) **não muda** — só o campo ganha sugestões.

### 3.1 Estado novo

```ts
const [query, setQuery] = useState("");           // espelha o valor do input p/ matching
const [aberto, setAberto] = useState(false);      // visibilidade do dropdown
const [ativoIdx, setAtivoIdx] = useState<number | null>(null); // destaque (↓/↑)
const listboxId = "sugestoes-novo-item";
const sugestoes = useItemSuggestions(query, 6);   // ≤6, mais recente primeiro
const mostrar = aberto && sugestoes.length > 0;   // dropdown só com sugestões
```

- `query` espelha o input para o hook; **o input permanece não-controlado** (`inputRef.current.value` continua sendo a fonte para `addItem`) — só acrescentamos `onChange` para manter `query` sincrônico. Isso evita converter o input existente em controlado e reduz o risco de regressão no fluxo de adicionar (LB-3/LB-5).
- `mostrar` deriva de `aberto && sugestoes.length > 0`: se as sugestões acabam (ex.: usuário apagou até não casar nada), o dropdown fecha sozinho.

### 3.2 Wrapper + render

Envolver o `<input>` existente num `relative` e renderizar o listbox logo após:

```tsx
<div className="relative mt-4">
  <input
    ref={inputRef}
    type="text"
    placeholder="Adicione um item e pressione Enter"
    enterKeyHint="enter"
    aria-label="Novo item"
    role="combobox"
    aria-expanded={mostrar}
    aria-controls={listboxId}
    aria-autocomplete="list"
    aria-activedescendant={ativoIdx !== null && mostrar ? `${listboxId}-opt-${ativoIdx}` : undefined}
    onChange={(e) => {
      setQuery(e.target.value);
      setAtivoIdx(null);
      setAberto(e.target.value.trim().length > 0);
    }}
    onBlur={() => {
      // fecha após um tick para o click da option registrar antes do blur.
      setTimeout(() => { setAberto(false); setAtivoIdx(null); }, 120);
    }}
    onKeyDown={(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (mostrar && ativoIdx !== null) {
          selecionar(sugestoes[ativoIdx]);  // preenche + fecha (NÃO cria item)
        } else {
          addItem();                       // comportamento LB-3/LB-5 intacto
        }
        return;
      }
      if (!mostrar) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setAtivoIdx((i) => (i === null ? 0 : Math.min(i + 1, sugestoes.length - 1)));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setAtivoIdx((i) => (i === null ? sugestoes.length - 1 : Math.max(i - 1, 0)));
      } else if (event.key === "Escape") {
        event.preventDefault();
        setAberto(false);
        setAtivoIdx(null);
      }
    }}
    className="w-full rounded border border-current/20 px-3 py-3 text-base outline-none focus:border-current/50"
  />
  {mostrar ? (
    <ItemSuggestions
      listboxId={listboxId}
      suggestions={sugestoes}
      activeIndex={ativoIdx}
      onSelect={selecionar}
      onHover={setAtivoIdx}
    />
  ) : null}
</div>
```

- O `mt-4` que estava no `<input>` migra para o wrapper `relative` (mantém o espaçamento ao subtítulo).
- `className` do input **idêntico** ao atual (`rounded border border-current/20 px-3 py-3 text-base outline-none focus:border-current/50`) — sem regressão visual.

### 3.3 Selecionar uma sugestão

```ts
function selecionar(texto: string) {
  const input = inputRef.current;
  if (input) {
    input.value = texto;
    input.focus();
  }
  setQuery(texto);      // mantém query sincrônico com o campo preenchido
  setAberto(false);     // AC 4: fecha ao selecionar
  setAtivoIdx(null);
}
```

- **Preenche o campo e fecha** (AC 4). **Não cria item** — o usuário confirma com Enter, que dispara `addItem()` (pois `aberto === false` → `mostrar === false` → cai no else de `onKeyDown` Enter). `addItem` roda `addItemToLista(listId, texto)` → lógica de criar/reutilizar/duplicado da LB-5, intocada.
- **Cria novo item distinto (AC 5):** como o texto veio de **outra** lista, `addItemToLista` filtra duplicados só na lista atual (`daLista`); se a atual não tem o texto → cria. Se a atual já tem o texto a-fazer → `duplicate` (foca o existente, como hoje); se tem concluído → reativa. Tudo consistente com LB-5/LB-8 — o autocomplete é só preenchimento de texto.
- `input.focus()` mantém o cursor no campo para o Enter imediato (desktop) ou ajuste manual (mobile).

### 3.4 Sem auto-highlight da primeira option

`ativoIdx` começa `null` em cada digitação. **Não** auto-selecionamos a primeira sugestão. Motivo: o caso comum é "digito e dou Enter para criar o texto que escrevi"; auto-highlight faria o Enter selecionar a sugestão indevidamente. Para usar uma sugestão, o usuário pressiona ↓ (AC 7) e então Enter. Decisão de UX — sinalizada como ponto passível de confirmação (trade-off 1 em §8).

### 3.5 Fechar (AC 9)

O dropdown fecha ao:
1. **Selecionar** uma sugestão (`selecionar` seta `aberto=false`).
2. **Esc** (`onKeyDown`).
3. **Clicar/focar fora** (`onBlur` + timeout 120ms; o `onMouseDown preventDefault` da option impede o blur de disparar antes do click na option).
4. **Esvaziar o campo** (`onChange` seta `aberto=false` quando `value.trim()` é vazio; e `mostrar` cai a `false` quando `sugestoes` fica vazio).

Sem backdrop de tela cheia (diferente do menu overflow "⋮"): o combobox fica aberto durante a digitação; um backdrop fixo interceptaria o primeiro toque fora como "fechar" em vez de ativar o elemento alvo. O padrão blur+timeout é mais leve e suficiente.

---

## 4. Estados

| Estado | Comportamento |
| ------ | ------------- |
| **Digitando com matches** | `onChange` → `aberto=true`; listbox com ≤6 sugestões (mais recente primeiro). |
| **Digitando sem matches** | `sugestoes=[]` → `mostrar=false` → dropdown oculto (continua digitando normalmente; Enter cria o texto digitado). |
| **Campo vazio** | `onChange` com `""` → `aberto=false` (sem sugestão para vazio — AC "a partir do primeiro caractere"). |
| **Selecionou sugestão** | campo preenchido, dropdown fechado; Enter cria item distinto (AC 4/5). |
| **Navegando (↓/↑)** | `ativoIdx` move destaque; `aria-activedescendant` atualiza; Enter seleciona o destacado. |
| **Esc** | fecha dropdown; **não** limpa o campo (só fecha — AC 9). |
| **Clicar fora** | `onBlur` → fecha após 120ms. |
| **Offline** | funciona normalmente (lê do cache; sem Supabase — AC 11). |
| **Usuário sem itens (nova conta)** | cache vazio → `sugestoes=[]` sempre → dropdown nunca abre; fluxo LB-3 intacto. |
| **Carregamento/erro** | não se aplicam — leitura síncrona do cache, sem rede, sem spinner. |

**Sem regressão (AC 14):** entrada inline (LB-3), reutilização/duplicado (LB-5), mobile (LB-4), exclusão (LB-8) e sync (LB-6) preservados. O `addItem`, `toggleItem`, `deleteItem`, o menu "⋮" e o `ConfirmDialog` não mudam.

---

## 5. Local-first, RLS e isolamento

- **Lê só do cache:** `listItemSuggestions` lê `read().items` (cache localStorage). Nenhuma chamada ao Supabase na UI (AC 13). O cache só contém dados da conta autenticada — o `SyncController`/`resetForUser` (LB-6/LB-8) descarta o cache ao trocar de conta, e o cloud é protegido por RLS `auth.uid()` (LB-6), então itens de outra conta nunca chegam ao cache (AC 12). O autocomplete herda esse isolamento sem nenhuma policy nova.
- **Funciona offline (AC 11):** sem rede, `read().items` ainda serve; nenhum erro, nenhum botão desabilitado.
- **Sem mudança de schema/RLS (AC 13):** `updatedAt` já existe em `ItemRecordLocal` (cache, LB-6) e em `items.updated_at` (cloud, LB-6). O diff de migrations é vazio. O novo método/hook são leitura sobre dado existente.

---

## 6. Acessibilidade (AC 10)

- **Combobox pattern (WAI-ARIA Authoring Practices):** input `role="combobox"`, `aria-expanded={mostrar}`, `aria-controls={listboxId}`, `aria-autocomplete="list"`, `aria-activedescendant` apontando para a option ativa. Listbox `role="listbox"`; options `role="option"` com `aria-selected`.
- **Foco no input:** o foco **nunca** sai do input durante a navegação (↓/↑ usam `aria-activedescendant`, não `focus()` nas options) — o campo permanece editável (AC 10) e o leitor de tela anuncia a option destacada sem mudar o contexto de foco.
- **Enter/Esc operáveis por teclado** (AC 7/9); mobile usa toque/scroll (AC 8).
- **Rótulos:** `aria-label="Novo item"` no input (mantém); `aria-label="Itens sugeridos"` no listbox. O `aria-activedescendant` + `role="option"` faz o leitor anunciar o texto destacado.
- **Contraste:** textos em `text-foreground` sobre `bg-background` (tokens existentes); destaque `bg-current/10` / hover `bg-current/5` — mesmos realces já usados no app.

---

## 7. Testes (notas para DEV/QA)

**Funções puras (`tests/autocomplete.test.ts`, node sem DOM):**
- `normalizaTexto`: "Café" → "cafe"; "  Arroz " → "arroz"; "ARROZ" → "arroz"; "" → "".
- `prefixoCombina`: `("cafe","Café")` true; `("ar","Arroz integral")` true; `("rr","Arroz")` false (não é prefixo — AC "só prefixo, não contém"); `("","Arroz")` false.
- `sugestoesPara`:
  - **Acento/caixa (AC 2):** itens `["Café","Arroz"]`, query `"cafe"` → `["Café"]`; query `"ARROZ"` → `["Arroz"]`.
  - **Todas as listas (AC 3):** itens com `listId` diferentes mesmas strings de teste — não filtra por lista (recebe só `{texto, updatedAt}`).
  - **Dedup mais recente (AC 6):** `[{t:"Arroz",u:"2026-01-01"},{t:"arroz",u:"2026-02-01"}]`, query `"ar"` → `["arroz"]` (mostra o texto da ocorrência de maior `updatedAt`).
  - **Limite 6 (AC 6):** 8 candidatos prefixo "a" → só 6.
  - **Ordenação `updatedAt` desc (AC 6):** candidatos com timestamps variados → primeiro é o de maior `updatedAt`.
  - **Query vazia** → `[]`.
  - **Sem "contém"** (fora de escopo): `"rroz"` não casa "Arroz".

**Repository (jsdom/fake storage):**
- `listItemSuggestions("ar", 6)` lê `items` do cache (todos, qualquer `listId`) e devolve `string[]`; não chama adapter; offline idêntico ao online.
- Após `addItem`/`toggleItem` (bumpVersion), `useItemSuggestions` reflete a mudança na próxima renderização (suggestionsCache invalidado).

**UI (`tests/autocomplete.ui.test.tsx`, jsdom/testing-library):**
- Digitar "ar" no campo abre o listbox com sugestões (pré-popular o store/fake cache com itens prefixo "ar").
- `↓` destaca a primeira option (`aria-activedescendant` aponta `...-opt-0`); `↓` novamente avança; `↑` recua.
- `Enter` com destaque ativo **preenche o campo** com o texto e **fecha** o listbox (não chama `addItemToLista` neste Enter).
- `Enter` sem destaque chama `addItemToLista` (comportamento LB-3 preservado).
- `Esc` fecha o listbox sem limpar o campo.
- Click numa option preenche o campo e fecha (simular `mouseDown`+`click`; `onMouseDown preventDefault` não desfoca o input antes do click).
- Click fora (`blur`) fecha o listbox.
- Cada option tem altura ≥44px (`min-h-11`); `role="option"`; `aria-selected` na ativa.
- Campo vazio não abre listbox.
- Sem regressão: fluxos de `addItem`/`toggleItem`/excluir/renomear/menu overflow (LB-3..LB-8) preservados; nenhum import de `supabase`/`localStorage` nos componentes (só `store`).

**Sem regressão (AC 14):** suite existente (`todos`, `delete`, `listas.ui`, `mobile-ux`, `sync`, `store-mutations`) permanece verde.

---

## 8. Resumo das decisões de design

| Decisão | Escolha |
| --- | --- |
| Onde lê as sugestões | Nova função de leitura `listItemSuggestions` no repository + hook `useItemSuggestions` no store (lê cache; sem Supabase) |
| Ordenação/recência | `updatedAt` desc (campo **já existente** em `ItemRecordLocal`/`items.updated_at`, LB-6) — sem dado novo, sem schema novo |
| Escopo das sugestões | Itens de **todas** as listas da conta (lê `read().items`); dedup por texto normalizado, mantendo o de maior `updatedAt` |
| Normalização | `normalizaTexto`: trim + NFD + remove `\p{Diacritic}` + lowercase — própria (não reutiliza `mesmoTexto`, que é só case) |
| Casamento | Prefixo insensível a acento/caixa (`startsWith`); não "contém" |
| Componente | `ItemSuggestions` (listbox presentacional, novo), preso ao input existente via wrapper `relative`; sem lib |
| Input | Permanece **não-controlado** (`inputRef`); `onChange` espelha `query` para o hook — sem regressão no fluxo `addItem` |
| Selecionar | Preenche o campo + fecha dropdown; **não** cria item (Enter confirma via `addItemToLista` LB-5) |
| Auto-highlight | **Não** (Enter sem ↓ cria o texto digitado; para sugerir, ↓ depois Enter). *Passível de confirmação.* |
| Teclado | `↓`/`↑` movem destaque (`aria-activedescendant`, foco no input); `Enter` seleciona destaque **ou** cria; `Esc` fecha |
| Fechar | selecionar / `Esc` / `blur`+timeout 120ms / campo vazio — sem backdrop de tela cheia |
| Mobile | options `min-h-11` (44px, LB-4); listbox `max-h-72 overflow-y-auto`; toque seleciona |
| Debounce | Nenhum (leitura local síncrona barata); opcional só se profiling mostrar jank |
| Acessibilidade | combobox + listbox + option (`aria-expanded`/`aria-autocomplete`/`aria-activedescendant`); foco no input |
| Tokens/cores | nenhum novo; `--background/--foreground/--muted` + `border-current/20` + realces `bg-current/10`/`bg-current/5` (existentes) |
| Dependências | nenhuma nova (sem Radix/HeadlessUI) |
| Schema/RLS | sem mudança (UI não toca Supabase/schema); RLS por `auth.uid()` herdada do cache |
| Arquivos | `repository.ts` (funções puras + método), `types.ts` (contrato), `store.ts` (hook + cache), `ItemSuggestions.tsx` (novo), `ListaScreen.tsx` (combobox), `tests/autocomplete.{test.ts,ui.test.tsx}` |

---

## 9. Trade-offs (pontos passíveis de confirmação)

1. **Auto-highlight da primeira sugestão (não → rec.) vs. sim.** Não auto-highlight mantém o Enter "cria o que digitei" como padrão seguro; exige ↓ explícito para sugerir. Auto-highlight agiliza quem quer a primeira sugestão, mas pode induzir seleção indesejada ao confirmar. **Recomendação: não.** Se o humano preferir agilidade, ativar auto-highlight na primeira option (Enter sem ↓ selecionaria a primeira) — não é bloqueio.
2. **Debounce (nenhum → rec.) vs. trailing curto.** Leitura local síncrona é barata na escala esperada; debounce adiciona estado/complexidade sem valor hoje. **Recomendação: nenhum** (adicionar depois só se profiling justificar).

Nenhum trade-off toca arquitetura/stack, custos/credenciais ou schema/RLS — todos no escopo de autonomia do PD. Se a leitura de "todas as listas" mostrar inviabilidade de performance na prática (não esperado), escalar ao PO/humano (a spec de negócio proíbe reduzir a "mesma lista" por conta própria — decisão de produto confirmada).