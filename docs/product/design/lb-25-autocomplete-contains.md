# Spec de design — LB-25: Autocomplete casando por qualquer palavra do item (contains)

**Issue:** [LB-25](https://linear.app/alysson-azevedo/issue/LB-25/autocomplete-casar-por-qualquer-palavra-do-item-contains-nao-so) · **State:** 🚧 Dev in progress · **Tipo:** 🔍 Melhoria · **Prioridade:** média
**Base:** LB-13 (✅ Deployed v0.7.0) — esta spec é um **delta** sobre `design/lb-13-autocomplete-itens.md`: mudam só o **casamento** e a **ordenação** na camada de domínio (`repository.ts`). UI, store, tipos, acessibilidade e comportamento do combobox permanecem como na LB-13.
**Spec de negócio:** `docs/product/lb-25-autocomplete-contains.md` (ACs detalhados). **ADRs:** `docs/decisions.md` (nenhuma afetada).

Arquivos atuais relevantes: `src/lib/todos/repository.ts` (`normalizaTexto`, `prefixoCombina`, `sugestoesPara`), `src/lib/todos/{types,store}.ts` (doc-comments do contrato `listItemSuggestions`/`useItemSuggestions`), `tests/autocomplete.test.ts`, `tests/autocomplete.ui.test.tsx`.

---

## Princípios

1. **Delta mínimo:** o contains afeta só as funções puras de `repository.ts` + testes. Nenhum componente novo, nenhum hook novo, nenhum tipo novo, nenhuma mudança de contrato.
2. **Herdado da LB-13, sem reabrir:** sem dado novo, sem schema, sem RLS, sem chamada ao Supabase na UI, sem nova dependência. Local-first/offline idêntico.
3. **Padrão LB-13 preservado:** helper público puro especifica o critério de casamento (executável/testável); o hot path (`sugestoesPara`) usa a forma pré-computada inline — mesma estrutura que a LB-13 já usava (filtrava com `normalizaTexto(c.texto).startsWith(q)` inline, não via `prefixoCombina`).
4. **UI zero-mudança:** `ItemSuggestions`, combobox do `ListaScreen` (teclado, fechar, ARIA, `min-h-11`), memoização `useItemSuggestions` por `(version, query, limit)` — tudo intocado. A única diferença visível é **qual** conjunto de sugestões aparece e em **que ordem**.

---

## 1. Funções puras de domínio (`repository.ts`)

### 1.1 `prefixoCombina` → `textoCombina` (rename + contains)

O nome atual ficaria mentiroso com semântica de contains; `prefixoCombina` não é importado fora de `repository.ts`/testes (verificado), então o rename é local. Semântica "query vazia não casa nada" é preservada (AC 8 da spec).

```ts
/**
 * Casamento por substring (contains), insensível a acento/caixa (LB-25):
 * `normalizaTexto(texto)` **contém** `normalizaTexto(query)` em qualquer
 * posição — prefixo ou mid-word ("laminado" casa "Papel Laminado";
 * "aminado" também — substring crua, sem tokenização por palavra).
 * Query vazia → false (não casa nada). Substitui o `prefixoCombina`
 * (startsWith) da LB-13 — o prefixo continua casando, agora via contains.
 */
export function textoCombina(query: string, texto: string): boolean {
  const q = normalizaTexto(query);
  if (!q) return false;
  return normalizaTexto(texto).includes(q);
}
```

### 1.2 `sugestoesPara` — filtro contains + ordenação em duas chaves

Três mudanças internas, mesmo pipeline (dedup → filtro → sort → slice):

1. **Dedup (a):** semântica idêntica (por `normalizaTexto(texto)`, mantendo o de maior `updatedAt`); o valor do `Map` passa a guardar também **`norm`** (o texto normalizado já computado no loop) — evita re-normalizar no filtro e na chave de ordenação: `{ texto, norm, updatedAt }`.
2. **Filtro (b):** `c.norm.includes(q)` — mesmo critério de `textoCombina`, na forma pré-computada (padrão do princípio 3).
3. **Ordenação (c):** chave nova **antes** da recência — casamento por prefixo (`c.norm.startsWith(q)`) ranqueia `0`, mid-word `1`; dentro de cada grupo, `updatedAt` desc (comparador existente). `slice(0, limit)` continua **após** o sort completo → com ≤6 prefixos, nenhum é cortado por mid-words recentes (AC 5/6).

```ts
export function sugestoesPara(
  items: { texto: string; updatedAt: string }[],
  query: string,
  limit: number,
): string[] {
  const q = normalizaTexto(query);
  if (!q) return [];
  // (a) dedup por texto normalizado, mantendo o de maior updatedAt (norm guardada).
  const best = new Map<string, { texto: string; norm: string; updatedAt: string }>();
  for (const it of items) {
    const norm = normalizaTexto(it.texto);
    if (!norm) continue;
    const ex = best.get(norm);
    if (!ex || it.updatedAt > ex.updatedAt) {
      best.set(norm, { texto: it.texto, norm, updatedAt: it.updatedAt });
    }
  }
  // (b)(c)(d) filtra contains (norm pré-computada — mesmo critério de
  // textoCombina), ordena prefixo > mid-word e updatedAt desc, limita após.
  return [...best.values()]
    .filter((c) => c.norm.includes(q))
    .sort(
      (a, b) =>
        (a.norm.startsWith(q) ? 0 : 1) - (b.norm.startsWith(q) ? 0 : 1) ||
        (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0),
    )
    .slice(0, limit)
    .map((c) => c.texto);
}
```

- **Doc-comment de `sugestoesPara`** atualizado: "(b) filtra por contains (`textoCombina`); (c) ordena por prefixo > mid-word, depois `updatedAt` desc; (d) limita a `limit` após a ordenação".
- **Empate de `updatedAt`** continua resolvido pelo `sort` estável (ordem de inserção no `Map`) — determinístico, igual LB-13.
- **Custo:** `includes` é O(m) por candidato vs `startsWith` O(1) no pior caso — irrelevante na escala do app (dezenas a poucas centenas de itens por conta; docs/stack.md manda não otimizar para escala). A guarda de `norm` reduz de 3 para 1 normalização por candidato.

### 1.3 Contrato `listItemSuggestions` (`types.ts`) e hook (`store.ts`)

Comportamento derivado — **zero mudança de código**, só os doc-comments que hoje dizem "prefixo":

- `types.ts` (contrato): "casamento por **contains** em qualquer posição do texto (insensível a acento/caixa), casamentos por prefixo antes de mid-word, ordenados por `updatedAt` desc dentro do grupo".
- `store.ts` (`useItemSuggestions`): idem, uma linha.
- `repository.ts` (`listItemSuggestions` no factory): comentário sinalizando a leitura de todas as listas permanece; nada mais.

---

## 2. UI — zero mudanças

- `ItemSuggestions` (listbox), combobox em `ListaScreen` (`↓`/`↑`/`Enter`/`Esc`, blur+120ms, `aria-*`, alvos `min-h-11`), `max-h-72 overflow-y-auto`: idênticos à LB-13 — o dropdown apenas pode conter sugestões que antes não apareciam (mid-word) e as ordena prefixo primeiro.
- Sem highlight do trecho casado (continua fora de escopo, como na LB-13).

---

## 3. Testes

**`tests/autocomplete.test.ts` (node puro — casos novos e invertidos):**

- `normalizaTexto`: inalterado.
- `textoCombina` (describe renomeado de `prefixoCombina`; **expectativas de contains invertidas** — os casos que hoje assertam `false`):
  - prefixo continua casando: `("cafe","Café")` true; `("ARROZ","Arroz")` true; `("ar","Arroz integral")` true.
  - mid-word agora casa (LB-25): `("rr","Arroz")` true; `("rroz","Arroz")` true (era `false` na LB-13).
  - qualquer palavra + substring parcial: `("laminado","Papel Laminado")` true; `("aminado","Papel Laminado")` true.
  - sem casamento: `("xyz","Arroz")` false; query vazia: `("","Arroz")` e `("   ","Arroz")` false.
- `sugestoesPara`:
  - **AC 1/2 (contains):** `"laminado"` → `["Papel Laminado"]`; `"aminado"` → `["Papel Laminado"]` (substring parcial).
  - **AC 3 (acento+contains, explícito):** `"cao"` → `["Ação"]` (mid-word com acento no texto); `"acao"` → `["Ação"]`; `"cafe"` → `["Café"]`; `"papel laminado"` → `["Papel Laminado"]` (multi-palavra contíguo, ambos os lados normalizados).
  - **AC 5 (ordenação):** query `"lam"`, candidatos `Lâmpada` (prefixo, `2026-01-01`) e `Papel Laminado` (mid-word, `2026-03-01`) → `["Lâmpada","Papel Laminado"]` — prefixo antigo antes do mid-word recente.
  - **AC 6 (limite pós-ordenação):** 3 prefixos antigos + 5 mid-words recentes (query `"a"`), `limit 6` → os 3 prefixos (ordenados por recência) + os 3 mid-words mais recentes; nenhum prefixo cortado.
  - **Invertido:** `"rroz"` → `["Arroz"]` (hoje espera `[]`).
  - **Mantidos (sem regressão LB-13):** acento/caixa por prefixo (`"cafe"`/`"ARROZ"`), dedup mais recente, limite 6 com 8 prefixos, ordenação `updatedAt` desc (só prefixos), query vazia → `[]`, não muta a entrada, empate estável.
- `tests/autocomplete.ui.test.tsx`: **sem mudança de expectativa** — seeds `"Arroz"/"Leite"/"Café"` com query `"ar"` continuam casando só "Arroz" sob contains ("Leite"/"Café" não contêm "ar"). Rodar para confirmar.
- **Suite completa verde** (`npm test` — vitest) + `npm run typecheck` + `npm run lint`.

---

## 4. Documentação que acompanha o código

- **No PR da LB-25:** doc-comments de `repository.ts`/`types.ts`/`store.ts` que hoje negam o contains (ex.: "NÃO casa 'contém' (mid-word) — fora de escopo") são atualizados junto com o código.
- **No deploy (🚀 Ready for Deploy, fluxo dev.md):** `docs/product/README.md` — a entrada da LB-13 diz "não 'contém'"; atualizar a frase do casamento e registrar a entrada da LB-25 (MINOR bump).
- **Specs da LB-13 permanecem históricas** — não editar specs de issues já deployadas; a LB-25 é o registro da mudança.

---

## 5. Resumo de decisões de design

| Decisão | Escolha |
| --- | --- |
| Helper | `prefixoCombina` → **`textoCombina`** (rename; contains via `includes`; query vazia continua não casando) |
| Hot path | `sugestoesPara` guarda `norm` no dedup e filtra/ordena sobre ela (1 normalização por item; padrão LB-13 de helper público + forma pré-computada) |
| Ordenação | `(prefixo? 0 : 1, updatedAt desc)`; `slice` após o sort completo; sort estável no empate |
| Dedup/recência/limite | Semântica inalterada da LB-13 |
| UI/store/tipos | Zero mudança de comportamento; só doc-comments |
| Schema/RLS/rede/deps | Nenhuma (herdado LB-13) |
| Bump de versão | **MINOR** na promoção para `main` (extensão retrocompatível; não é bugfix) |

---

## 6. Trade-offs

1. **Contains cru, sem tokenização por palavra** ("aminado" casa "Papel Laminado") — decisão de negócio do PO (spec, não reabrir); ruído aceito em troca de simplicidade.
2. **Rename do helper vs. manter `prefixoCombina` com semântica nova** — rename escolhido: nome honesto, custo local (uso verificado), testes renomeados junto.

Nenhum trade-off toca arquitetura/stack, custos/credenciais ou schema/RLS — autonomia do PD. Nota: a spec de negócio teve correção no exemplo do AC 5 na mesma branch ("Papel Laminado" também casa por prefixo "pa"; exemplo trocado para "Lâmpada" vs "Papel Laminado" na query "lam").
