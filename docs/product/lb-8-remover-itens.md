# Spec LB-8 — Remover itens e listas (exclusão)

**Issue:** [LB-8](https://linear.app/alysson-azevedo/issue/LB-8/nao-e-possivel-remover-itens-adicionados) · **State:** ✅ Deployed (v0.5.0) · **Tipo:** 🔍 Melhoria
**Base:** LB-6 (✅ Deployed v0.4.1) — listas/itens no Supabase (fonte de verdade) + cache localStorage (local-first), sync cross-device por `updated_at`.

**Escopo desta spec:** negócio (critérios de aceite + UX do ponto de vista do usuário). A spec de **design** (estrutura de código, UI do controle de exclusão, affordance de confirmação, cascade no schema/repository) é trabalho do 🤖 PD em `design/lb-8-*.md`.

---

## Decisões de arquitetura (confirmadas — ADR 2026-08-14, não reabrir)

- **Estratégia:** **hard delete** direto — excluir remove o registro da fonte de verdade (Supabase). **Sem tombstone / soft-delete**; nenhuma mudança de schema para marcar deleção.
- **Escopo de exclusão:** **itens** e **listas** (cascade — excluir uma lista remove seus itens junto).
- **Propagação cross-device da exclusão via sync fica FORA de escopo** (limitação aceita — ver "Fora de escopo"). O mecanismo que tornaria a propagação confiável seria tombstone/soft-delete, adiado por esta decisão.
- **Confirmação obrigatória** antes de qualquer exclusão (item ou lista).

Stack e escolha de serviço: confirmadas — esta spec não propõe nem reabre alternativas.

---

## Problema

Após adicionar um item a uma lista (LB-3/LB-5), não há como removê-lo. Também não é possível excluir uma lista inteira. O usuário percebe a ausência como bug: erros de digitação, itens comprados/descartados e listas obsoletas ficam presos na tela sem como limpar. A edição/exclusão estava fora de escopo desde LB-5; agora a exclusão entra.

## Valor para o usuário

O usuário mantém suas listas enxutas e relevantes: remove um item adicionado por engano ou que não quer mais, e descarta uma lista inteira (com todos os seus itens) quando ela não faz mais sentido. A exclusão é local-first (funciona offline e responde na hora) e exige confirmação para evitar perda acidental. Cada conta continua isolada por RLS.

## Caso de uso de referência

Usuário monta a lista de compras e adiciona "chocolate" por impulso; decide remover: aciona o controle de exclusão do item, confirma, e o item some da lista. Mais tarde, uma lista "Churrasco final de semana" fica obsoleta; no índice de listas, aciona a exclusão da lista, confirma (sabendo que os itens vão junto), e a lista e seus itens somem do índice. Tudo isso offline, se preciso.

---

## Escopo de negócio

### Excluir item
- Usuário logado pode excluir qualquer item de uma lista — a-fazer ou concluído — através de um controle de exclusão por item.
- A exclusão remove o item da lista imediatamente (local-first, do cache) e da fonte de verdade (Supabase) quando online.

### Excluir lista (cascade)
- Usuário logado pode excluir uma lista inteira a partir do índice/detalhe da lista.
- Excluir a lista remove **a lista e todos os seus itens** (cascade); a lista some do índice.

### Confirmação antes de excluir
- Toda exclusão (item ou lista) exige confirmação explícita antes de ser efetivada.
- A confirmação deixa claro **o que será removido**: ao excluir uma lista, informa que seus itens também serão excluídos.
- Cancelar a confirmação aborta a exclusão; nada é removido.

### Local-first e isolamento (RLS)
- A exclusão funciona offline e responde imediatamente do cache; nenhuma ação do usuário fica bloqueada por falta de rede.
- A exclusão só afeta listas/itens da conta autenticada (RLS por `auth.uid()`); o cache local só contém dados da conta.

### Hard delete sem tombstone
- A exclusão remove o registro (item; ou lista + cascade de itens) — sem tombstone, sem soft-delete, sem mudança de schema para tal.
- Re-adicionar texto igual ao de um item excluído **cria um novo item distinto** (o item excluído não é "reativado").

---

## Fora de escopo (issues futuras — limitação aceita)

- **Propagação cross-device da exclusão via sync** (limitação aceita — ADR 2026-08-14): a exclusão é hard delete na fonte de verdade, mas esta spec **não** garante que outro dispositivo reflita a exclusão. O mecanismo confiável para isso (tombstone/soft-delete + resolução de "fantasmas" no pull) é adiado. O sync de criar/marcar/renomear (LB-6) não é afetado.
- **Tombstone / soft-delete** e qualquer schema de marcação de deleção.
- **Undo / desfazer exclusão** (além da confirmação prévia).
- **Reordenação** de itens ou listas.
- **Edição do texto** de um item (permanece fora de escopo desde LB-5).
- **Notificações / Web Push, e-mails** (outra issue).

---

## UX de produto (do ponto de vista do usuário)

Princípio: a exclusão é **deliberada e protegida**. Não há undo após confirmar, então a barreira é a confirmação prévia.

### Excluir item
Cada item (a-fazer ou concluído) expõe um controle de exclusão com alvo tocável ≥44px (LB-4). Ao acioná-lo, abre-se uma confirmação; confirmar remove o item da lista imediatamente. Cancelar mantém o item.

### Excluir lista
No índice (ou detalhe) da lista, há um controle para excluir a lista. Ao acioná-lo, a confirmação **deixa claro que os itens da lista também serão excluídos**; confirmar remove a lista e seus itens, e a lista some do índice. Cancelar mantém tudo.

### Offline
A exclusão responde na hora, do cache local, mesmo sem rede. Nenhuma mensagem de erro, nenhum botão desabilitado. O registro é removido do cloud quando houver conexão.

### RLS
A exclusão de uma conta nunca alcança listas/itens de outra conta; o cache local só contém dados da conta autenticada.

---

## Critérios de aceite (ponto de vista do usuário)

1. **Excluir item:** usuário logado, em uma lista, aciona o controle de exclusão de um item (a-fazer ou concluído), confirma, e o item some da lista imediatamente. (Verificável: o item não aparece mais após a ação.)
2. **Excluir lista com cascade:** usuário logado aciona a exclusão de uma lista, confirma, e a lista **e todos os seus itens** são removidos; a lista some do índice. (Verificável: a lista não aparece no índice e seus itens não aparecem em mais nenhum lugar.)
3. **Confirmação antes de excluir:** toda exclusão (item ou lista) exige confirmação explícita; cancelar aborta e nada é removido. A confirmação de exclusão de lista informa que os itens também serão excluídos. (Verificável: acionar o controle e cancelar preserva item/lista intactos.)
4. **Local-first / offline:** a exclusão funciona e responde imediatamente do cache mesmo sem rede; nenhuma ação fica bloqueada e nenhum erro é exibido ao usuário. (Verificável: offline, excluir item/lista responde na hora.)
5. **Hard delete sem tombstone:** a exclusão remove o registro da fonte de verdade (Supabase) — sem tombstone/soft-delete, sem mudança de schema para deleção. Re-adicionar texto igual ao de um item excluído cria um **novo item distinto** (não reativa o excluído). (Verificável: excluir, re-adicionar mesmo texto → novo id, item distinto; o excluído não volta.)
6. **RLS / isolamento:** a exclusão só afeta listas/itens da conta autenticada; o usuário A não exclui nem acessa itens do usuário B; o cache local só contém dados da conta. (Verificável: tentar excluir/acessar item de outra conta falha/é invisível — RLS.)
7. **Sem regressão:** UX mobile (LB-4), múltiplas listas (LB-5) e sync de criar/marcar/renomear (LB-6) funcionam como antes, em desktop e mobile. (Verificável: fluxos anteriores preservados.)
8. **Migration aplicada em prod** antes de o preview depender dela (se houver); preview funcional e sem operações destrutivas/em massa no preview (ADR 2026-08-05). Nada destrutivo no preview.
9. **Suite de testes automatizados passando:** lógica de exclusão (item, lista+cascade), confirmação, RLS (Supabase local em Docker); UI permanece isolada do storage (sem chamada direta ao Supabase na camada de UI).

---

## Notas para o 🤖 PD (design técnico)

- Esta spec fixa **negócio** (AC + UX). Decisões de implementação — affordance exata do controle de exclusão (botão "×", swipe, menu), formato do diálogo de confirmação, onde fica a exclusão de lista (índice vs detalhe), cascade no schema (FK `ON DELETE CASCADE` vs exclusão explícita no repository), tratamento do hard delete no sync local — são do escopo do PD, respeitando: (i) a UI não muda seu modo de consumo (continua só no `store`/repository); (ii) confirmação obrigatória; (iii) hard delete, sem tombstone; (iv) RLS obrigatória; (v) migration aplicada em prod antes do preview depender dela; (vi) testável em node/jsdom e Supabase local em Docker.
- **Limitação a documentar no design:** a propagação cross-device da exclusão não é garantida (ADR 2026-08-14). Se o PD concluir que o hard delete quebra de forma inaceitável o sync existente (LB-6), escala de volta ao humano — não introduza tombstone/soft-delete por conta própria (é decisão humana confirmada como fora de escopo).
- Reordenação e edição de texto permanecem fora de escopo.