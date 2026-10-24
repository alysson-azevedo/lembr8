# Spec LB-25 — Autocomplete: casar por qualquer palavra do item (contains), não só prefixo

**Issue:** [LB-25](https://linear.app/alysson-azevedo/issue/LB-25/autocomplete-casar-por-qualquer-palavra-do-item-contains-nao-so) · **State:** 📑 Spec · **Tipo:** 🔍 Melhoria · **Prioridade:** média
**Base:** LB-13 (✅ Deployed v0.7.0) — autocomplete de itens por **prefixo** (spec `lb-13-autocomplete-itens.md`, design `design/lb-13-autocomplete-itens.md`). A LB-13 registrou contains como "fora de escopo (limitação aceita)"; esta issue a revoga com base em feedback do dono do produto. Nenhuma decisão em `docs/decisions.md` é afetada (sem arquitetura/stack/custo/schema).

**Escopo desta spec:** negócio (critérios de aceite + comportamento do casamento do ponto de vista do usuário). A spec de **design** (funções afetadas em `repository.ts`, shape dos testes, atualização de comentários/docs) é trabalho do 🤖 PD em `design/lb-25-*.md`.

---

## Decisões de escopo (resolvidas pelo PO — não reabrir)

A pendência da issue original ("ordenação a definir na spec") é decisão de produto, sem impacto em arquitetura/stack/custo/schema — dentro da autonomia do PO; confirmada com o dono do produto (2026-10-24).

1. **Casamento — substring (contains), em qualquer posição do texto.** A normalização existente (`normalizaTexto`: trim + NFD + remoção de diacríticos + lowercase) é mantida; o casamento passa de `startsWith` para `includes`, sobre query e texto **ambos normalizados**. Digitar qualquer palavra do texto encontra o item ("laminado" → "Papel Laminado") — e também substrings parciais ("aminado" → "Papel Laminado"). **Sem tokenização por palavra** (casar só início de palavra): contains de substring crua é mais simples e cobre o caso de uso inteiro; o ruído extra é irrelevante no volume de dados do app (docs/stack.md — não otimizar para escala).
2. **Ordenação — casamento por prefixo antes de mid-word.** Candidatos que casam por prefixo (texto normalizado **começa com** a query) têm precedência sobre casamentos mid-word; dentro de cada grupo, `updatedAt` **desc** (recência, sem dado novo); o **limite de 6 é aplicado após a ordenação** — quando há ≤6 casamentos por prefixo, nenhum deles é empurrado para fora do top-6 por mid-words mais recentes. Preserva a previsibilidade da LB-13 ("o que você começa digitando vem primeiro") que o contains puro perderia.
3. **Sem dado novo, sem mudança de schema, sem mudança de RLS.** Dedup por texto normalizado (ocorrência de maior `updatedAt`), recência e limite 6 preservados exatamente como na LB-13.
4. **Testes atualizados, não apenas adicionados.** Os testes que hoje **afirmam** que contains não casa (ex.: `'rroz'` → `[]`, `'aminado'` → nada) invertem a expectativa; a cobertura explícita de **acento + contains juntos** (hoje inexistente) passa a ser exigida.
5. **Tipo e prioridade:** 🔍 Melhoria, prioridade **média** (feedback direto do dono do produto, esforço pequeno).

## Fora de escopo (issues futuras — limitação aceita)

- **Fuzzy matching** (Levenshtein, tolerância a erro de digitação).
- **Ranking por frequência de uso** (exigiria dado novo; adiada desde a LB-13).
- **Tokenização por palavra** (casar só início de palavra) — contains de substring cobre o caso de uso.
- **Highlight do trecho casado** dentro da option (permanece fora, como na LB-13).
- **Qualquer mudança de UX do dropdown** — abrir/fechar, navegação por teclado, alvo ≥44px, ARIA, blur+120ms: comportamento visual da LB-13 intocado.

---

## Problema

O autocomplete da LB-13 casa apenas por **prefixo**: `prefixoCombina` em `src/lib/todos/repository.ts` usa `normalizaTexto(texto).startsWith(q)`. Itens multi-palavra são acháveis só pela primeira palavra — com "Papel Laminado", digitar "laminado" não traz a sugestão. Quanto mais compostos os itens ("Leite condensado", "Carne moída"), menos útil fica o atalho de digitação.

## Valor para o usuário

Digitar **qualquer palavra** do item — não só a primeira — encontra a sugestão. O autocomplete volta a acelerar entradas recorrentes de itens com nomes compostos, reduzindo redigitação e duplicatas involuntárias (o mesmo valor da LB-13, agora sem a restrição de prefixo).

## Caso de uso de referência

O usuário já adicionou "Papel Laminado" numa lista. Na lista atual, digita "lam" e vê "Papel Laminado" na sugestão; seleciona e confirma com Enter. Digitar "papel" também traz (prefixo); e quando existem candidatos dos dois tipos, os que casam por prefixo aparecem **antes** dos mid-word.

---

## Escopo de negócio

### Casamento
- Sugestões casam por **substring** (contains) do texto normalizado, em **qualquer posição** — não só prefixo.
- **Insensível a acento/caixa em ambos os lados** (query e texto), via `normalizaTexto` existente: "cafe" → "Café", "acao" → "Ação", "papel laminado" → "Papel Laminado".
- Query multi-palavra casa por substring **contígua**: "papel lam" casa "Papel Laminado".
- Sugestões continuam a partir do **primeiro caractere**; query vazia → nenhuma sugestão (comportamento atual).

### Ordenação e limite
- Ordenação em dois níveis: (1) casamentos por **prefixo** antes de casamentos mid-word; (2) dentro de cada grupo, `updatedAt` desc (mais recente primeiro).
- Limite de **6 sugestões** aplicado **após** a ordenação completa.
- Dedup por texto normalizado (mantém a ocorrência de maior `updatedAt`) e recência preservados da LB-13.

### Compatibilidade (sem regressão)
- Todos os ACs da LB-13 permanecem valendo: casamento por prefixo, insensibilidade a acento/caixa, escopo todas as listas, selecionar preenche e fecha, criar novo item distinto, limite 6, teclado/toque/fechar, offline local-first, isolamento RLS, sem mudança de schema.
- O dropdown e toda a UI do autocomplete ficam **inalterados** — muda só o conjunto e a ordem das sugestões.

---

## Critérios de aceite (testáveis)

1. **Contains (qualquer palavra):** digitar uma palavra **não-inicial** do texto traz a sugestão — "laminado" → "Papel Laminado". (Verificável: item existente em qualquer lista; digitar "lam" vê a sugestão.)
2. **Substring parcial também casa:** "aminado" → "Papel Laminado" — contains de substring crua, sem tokenização por palavra. (Verificável em teste unitário.)
3. **Acento + contains juntos (teste explícito):** "cafe" → "Café", "acao" → "Ação", "papel laminado" → "Papel Laminado" — normalização aplicada a ambos os lados, com caso antes sem cobertura dedicada. (Verificável em teste unitário dedicado.)
4. **Prefixo sem regressão:** os ACs da LB-13 continuam valendo — "ar" → "Arroz integral", "ARROZ" → "Arroz", "cafe" → "Café" por prefixo. (Verificável: suite existente da LB-13 passando.)
5. **Ordenação prefixo > mid-word:** com candidatos dos dois tipos, **todos** os casamentos por prefixo precedem os mid-word; dentro de cada grupo, mais recente primeiro. (Verificável: para query "pa", o candidato que casa por prefixo "Paçoca" (antigo) aparece antes do mid-word "Papel Laminado" (recente).)
6. **Limite 6 após a ordenação:** com >6 candidatos, só 6 aparecem; casamentos por prefixo existentes (≤6) nunca são empurrados para fora do limite por mid-words recentes. (Verificável: teste com 7+ candidatos mistos.)
7. **Dedup e recência preservados:** textos iguais após normalização em listas diferentes viram uma sugestão (a ocorrência mais recente); dentro do grupo, `updatedAt` desc. (Verificável: testes atuais da LB-13 continuam passando.)
8. **Query vazia → sem sugestões**; sugestões a partir do 1º caractere. (Verificável: teste existente.)
9. **Sem mudança de schema/RLS/rede:** nenhuma migration/policy nova; nenhuma chamada ao Supabase na UI; UI do dropdown inalterada. (Verificável: diff de migrations vazio; suite de UI sem mudança de expectativa.)
10. **Suite de testes automatizados passando:** casos de contains/ordenação/limite/dedup em node puro; testes que hoje **negam** o contains atualizados para a nova expectativa; suite completa verde.

---

## Notas para o 🤖 PD (design técnico)

- Touch points prováveis: `src/lib/todos/repository.ts` (`normalizaTexto` mantida; `prefixoCombina`/`sugestoesPara` — casamento `startsWith` → `includes` + chave de ordenação prefixo), `tests/autocomplete.test.ts` (expectativas invertidas + casos novos), `tests/autocomplete.ui.test.tsx` (sem mudança de comportamento de UI), comentários de código e `docs/product/README.md` (entrada da LB-13 hoje nega o contains — atualizar no deploy).
- `prefixoCombina` pode virar um helper contains (ex.: `textoCombina`) mantendo a semântica de "query vazia não casa nada"; a noção de prefixo continua necessária **para a chave de ordenação** (decisão do PD como estruturar).
- Ordenação em duas chaves `(prefixo? 0 : 1, updatedAt desc)`; sort estável (empate preserva primeira ocorrência) continua desejável para determinismo. Sem dado novo, sem debounce, sem mudança de leitura (dedup antes do filtro, O(n) como hoje).
- **Versionamento:** MINOR bump na promoção para `main` (extensão retrocompatível de funcionalidade existente; não é bugfix).
