# Spec LB-13 — Autocomplete de itens previamente adicionados (desktop e mobile)

**Issue:** [LB-13](https://linear.app/alysson-azevedo/issue/LB-13/autocomplete-de-itens-previamente-adicionados-desktop-e-mobile) · **State:** 📑 Spec · **Tipo:** 🔍 Melhoria · **Prioridade:** baixa
**Base:** LB-3 (✅ Deployed) — entrada inline de item (campo + Enter); LB-5 (✅ Deployed) — múltiplas listas; LB-6 (✅ Deployed) — listas/itens no Supabase (fonte de verdade) + cache localStorage (local-first), sync cross-device por `updated_at`, RLS por `auth.uid()`; LB-4 (✅ Deployed) — UX mobile (alvo ≥44px).

**Escopo desta spec:** negócio (critérios de aceite + UX do ponto de vista do usuário). A spec de **design** (componente de autocomplete/combobox, estrutura de código, normalização de texto, tratamento de focus/scroll no mobile) é trabalho do 🤖 PD em `design/lb-13-*.md`.

---

## Decisões de escopo (resolvidas pelo PO — não reabrir)

As pendências abertas na issue original ("pontos para o PO definir") são decisões de produto, sem impacto em arquitetura/stack/custo/schema; portanto dentro da autonomia do PO (não escaladas ao humano).

1. **Escopo da sugestão — todas as listas do usuário.** As sugestões vêm de itens previamente adicionados pelo usuário **em qualquer uma das suas listas** (lidos do cache local-first). Motivo: o valor está em acelerar entradas recorrentes reaproveitando textos já digitados em qualquer contexto (ex.: "arroz" digitado em "Compras" deve sugerir ao montar "Churrasco"). Isolado por RLS — só itens da própria conta.
2. **Casamento — prefixo, insensível a acento e caixa.** `cafe` → "Café", `ARROZ` → "Arroz". Motivo: prefixo é previsível enquanto se digita (comportamento padrão de autocomplete); ignorar acento/caixa é essencial em PT-BR. **Não** casamento por "contém" (mid-word) — fora de escopo (barulho/imprevisibilidade).
3. **Selecionar uma sugestão — cria um novo item distinto.** Selecionar uma sugestão **preenche o campo de texto**; confirmar (Enter) cria um **novo item distinto** na lista atual. O autocomplete é **atalho de digitação**, não reuso: não move nem reabre o item existente; não cria vínculo entre listas. Consistente com LB-8 (re-adicionar texto igual ao de um item excluído cria novo item distinto).
4. **Limite e ordenação — 6 sugestões, mais recente primeiro.** Ordenação por `updated_at` **desc** (zero custo — campo existente; não rastreia frequência). Limite de **6 sugestões** exibidas para manter o dropdown compacto no mobile.
5. **Sem mudança de schema, sem mudança de RLS.** Lê itens existentes no cache (local-first); nenhuma migration, nenhuma policy nova, nenhuma chamada ao Supabase na camada de UI.

## Fora de escopo (issues futuras — limitação aceita)

- **Casamento por "contém"** (substring em qualquer posição) — só prefixo.
- **Reusar / mover o item existente** em vez de criar um novo (autocomplete é só atalho de digitação).
- **Ordenação por frequência de uso** — exigiria rastrear contagem de uso (dado novo / mudança de schema), adiada.
- **Sugestões de outras contas** (RLS impede) ou de **catálogo/dicionário externo** ou global do sistema.
- **Sugestão de nomes de lista** — autocomplete é só de itens.
- **Editar o texto** de um item (permanece fora de escopo desde LB-5).
- **Notificações / Web Push, e-mails** (outra issue).

---

## Problema

Ao adicionar um novo item a uma lista, não há sugestão de itens já cadastrados. O usuário redigita textos recorrentes (ex.: "arroz", "leite", "pão"), sujeito a variações ortográficas e duplicatas involuntárias — trabalho repetitivo que o app poderia eliminar.

## Valor para o usuário

Enquanto digita um novo item, o usuário vê sugestões de textos que já adicionou antes (em qualquer lista) e pode selecionar uma para preencher o campo, confirmando com Enter. É um atalho de digitação que acelera entradas recorrentes e reduz variações/duplicatas — especialmente útil no mobile, onde digitar é mais custoso.

## Caso de uso de referência

Usuário monta a lista de "Churrasco" e digita "ar". Aparecem sugestões de itens que ele já adicionou antes em outras listas (ex.: "Arroz", "Arroz integral"). Ele seleciona "Arroz" (preenche o campo) e dá Enter — o item entra na lista de Churrasco como um novo item. Em seguida digita "car" e vê "Carne"; seleciona e confirma. No celular, rola as sugestões com o dedo e toca na desejada.

---

## Escopo de negócio

### Autocomplete no campo de adicionar item
- No campo de entrada inline de item (LB-3), enquanto o usuário digita, exibe-se um **dropdown de sugestões** com textos de itens previamente adicionados pelo usuário **em qualquer uma das suas listas**.
- As sugestões são lidas do **cache local** (local-first); a UI não chama o Supabase.

### Casamento
- Casamento por **prefixo**, **insensível a acento e caixa** (`cafe` → "Café", `ARROZ` → "Arroz").
- As sugestões aparecem a partir do **primeiro caractere** digitado; somem quando o campo é esvaziado ou o dropdown é fechado.

### Selecionar uma sugestão
- Selecionar uma sugestão (teclado: Enter; mobile: toque) **preenche o campo de texto** com o texto sugerido e **fecha o dropdown**.
- Confirmar (Enter) cria um **novo item distinto** na lista atual — o autocomplete é atalho de digitação; não reusa, move nem reabre o item existente, e não cria vínculo entre listas.

### Limite e ordenação
- No máximo **6 sugestões** exibidas.
- Ordenação **mais recente primeiro** (`updated_at` desc).

### Compatibilidade desktop e mobile
- **Desktop:** navegação por teclado no dropdown — `↓`/`↑` move o destaque, `Enter` seleciona, `Esc` fecha.
- **Mobile:** toque/scroll no dropdown; **alvo de toque ≥44px** (LB-4) por sugestão.
- Funciona em viewport estreita sem quebrar o layout.

### Acessibilidade
- Semântica ARIA apropriada (combobox + listbox + option), `aria-expanded`, destaque focado anunciável.
- O dropdown **fecha** ao: selecionar uma sugestão, pressionar `Esc`, ou clicar/ focar fora.
- Não captura o foco de forma que impeça o leitor de tela; o campo continua editável.

### Local-first e isolamento (RLS)
- Funciona **offline** (lê do cache); nenhuma ação bloqueada por rede, nenhum erro exibido.
- Só sugere itens da conta autenticada (RLS por `auth.uid()`); o cache só contém dados da conta.

### Sem mudança de schema / RLS
- Nenhuma migration, nenhuma policy nova, nenhuma chamada ao Supabase na UI. Reaproveita os dados já em cache.

---

## Critérios de aceite (testáveis)

1. **Sugestões ao digitar:** usuário logado, em uma lista, digita no campo de adicionar item e vê um dropdown com textos de itens que já adicionou antes (em qualquer lista), casando por **prefixo**. (Verificável: digitar "ar" e ver "Arroz" entre as sugestões se já o adicionou antes.)
2. **Insensível a acento/caixa:** `cafe` sugere "Café"; `ARROZ` sugere "Arroz". (Verificável: digitar em caixa baixa/sem acento e receber sugestão com acento/maiúscula.)
3. **Todas as listas:** um item adicionado numa lista A aparece como sugestão ao digitar numa lista B (mesma conta). (Verificável: adicionar "Leite" em lista A; em lista B, digitar "lei" e ver "Leite".)
4. **Selecionar preenche e fecha:** selecionar uma sugestão (Enter no desktop / toque no mobile) preenche o campo com o texto e fecha o dropdown. (Verificável: campo recebe o texto; dropdown some.)
5. **Cria novo item distinto:** após selecionar "Arroz" e confirmar, entra um **novo item** na lista atual; o item original (em outra lista) permanece inalterado e sem vínculo. (Verificável: nova id; o item de origem não é movido/removido.)
6. **Limite e ordenação:** no máximo **6 sugestões**, ordenadas **mais recente primeiro**. (Verificável: com >6 candidatos, só 6 aparecem; a primeira é a de `updated_at` mais recente.)
7. **Desktop — teclado:** `↓`/`↑` move o destaque, `Enter` seleciona, `Esc` fecha o dropdown. (Verificável: navegação por teclado funciona sem mouse.)
8. **Mobile — toque:** sugestões roláveis com **alvo ≥44px** cada; toque seleciona. (Verificável: rolar e tocar no viewport estreito; alvo mensurável.)
9. **Fechar:** o dropdown fecha ao selecionar, ao `Esc`, e ao clicar/focar fora. (Verificável: clicar fora fecha; Esc fecha.)
10. **Acessibilidade:** semântica combobox/listbox/option com `aria-expanded` e destaque anunciável; o campo permanece editável. (Verificável: inspeção ARIA / leitor de tela.)
11. **Offline / local-first:** funciona sem rede, lendo do cache; nenhum erro, nenhum botão desabilitado. (Verificável: offline, digitar e ver sugestões.)
12. **RLS / isolamento:** só sugere itens da conta autenticada; itens de outra conta nunca aparecem. (Verificável: conta B não vê itens da conta A.)
13. **Sem mudança de schema/RLS:** nenhuma migration nova, nenhuma policy nova, nenhuma chamada ao Supabase na camada de UI. (Verificável: diff de migrations vazio; UI só consome o store/repository.)
14. **Sem regressão:** entrada inline (LB-3), múltiplas listas (LB-5), mobile (LB-4) e sync (LB-6) funcionam como antes. (Verificável: fluxos anteriores preservados.)
15. **Suite de testes automatizados passando:** lógica de sugestão (casamento prefixo insensível a acento/caixa, escopo todas as listas, limite 6, ordenação por `updated_at` desc, criar-novo-distinto, fechar) testável em node/jsdom; UI isolada do storage.

---

## Notas para o 🤖 PD (design técnico)

- Esta spec fixa **negócio** (AC + UX). Decisões de implementação — componente de autocomplete/combobox (próprio vs lib), normalização de texto (remover acentos → `String.normalize('NFD')` + regex), debounce, posicionamento/scroll do dropdown no mobile, gestão de focus, reuso de componentes existentes em `src/components/ui/` — são do escopo do PD, respeitando: (i) a UI continua consumindo só o `store`/repository (sem chamada direta ao Supabase); (ii) sem mudança de schema/RLS; (iii) RLS obrigatória; (iv) alvo ≥44px e navegação por teclado; (v) testável em node/jsdom.
- **Sem dado novo:** a ordenação por `updated_at` desc usa campo já existente (LB-6). Não introduzir rastreamento de frequência (fora de escopo).
- **Sugestões de todas as listas:** ler do cache os itens de todas as listas da conta; dedup de textos iguais fica a critério do PD (ex.: manter a ocorrência mais recente por `updated_at`).
- Se o PD concluir que "todas as listas" quebra desempenho ou a separação de contextos de forma inaceitável, escalar de volta ao PO/humano — não reduzir o escopo a "mesma lista" por conta própria (é decisão de produto confirmada).