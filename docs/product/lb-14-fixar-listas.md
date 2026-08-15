# Spec LB-14 — Fixar (favoritar) listas — fixas aparecem primeiro, demais por modificação

**Issue:** [LB-14](https://linear.app/alysson-azevedo/issue/LB-14/fixar-favoritar-listas-fixas-aparecem-primeiro-demais-por-modificacao) · **State:** 📑 Spec · **Tipo:** 🔍 Melhoria · **Prioridade:** baixa
**Base:** LB-5 (múltiplas listas, índice em `/`) · LB-6 (Supabase, RLS por `auth.uid()`, sync por `updated_at`) · LB-7 (sync pós-mutação/foco) · LB-8 (menu overflow "⋮" na tela da lista + `deletedIds`).

**Escopo desta spec:** negócio (problema, valor, comportamento de produto e critérios de aceite do ponto de vista do usuário). A spec de **design** (controle de UI, affordance/ícone, seção visual do índice, headers/divisores) é trabalho do 🤖 PD. Decisões de schema/migration (forma do campo `pinned`), RLS e sync são do 🤖 DEV — esta spec define apenas o **comportamento de produto** e os **AC**.

---

## Decisões de produto (PO — não reabrir sem nova direção)

### (a) Ordenação entre as listas fixadas
**Decisão:** listas fixadas são ordenadas por **modificação mais recente** (`updated_at` descendente) — a **mesma regra** das não-fixadas. Fixar controla apenas **qual seção** a lista ocupa (fixadas no topo), não a ordem dentro da seção.

**Racional:** uma regra única e consistente para todo o índice (recência de modificação), com as fixadas forçadas ao topo. Reusa o `updated_at` já existente no schema — **não implica** criar um novo campo de timestamp de fixação (decisão de schema é do DEV). Evita o affordance oculto "re-fixar para reordenar".

### (b) Undo / alternativa ao fixar
**Decisão:** fixar é um **toggle** (fixar ⇄ desfixar), **não destrutivo** e instantaneamente reversível. **Desfixar é o próprio "undo"** — sem diálogo de confirmação, sem undo-toast, sem ação separada de desfazer.

**Racional:** diferentemente da exclusão (LB-8, destrutiva → exige confirmação), fixar/desfixar não perde dado nenhum. O estado anterior é restaurado com um toque (desfixar devolve a lista à seção não-fixada, ordenada por modificação). Não há "alternativa" a prover além do próprio toggle.

### Ordenação completa do índice (comportamento resultante)
O índice de listas (`/`) passa a ter **duas seções**, nesta ordem vertical:

1. **Fixadas** — listas com `pinned = true`, ordenadas por `updated_at` descendente (mais recentemente modificada no topo).
2. **Demais** — listas com `pinned = false`, ordenadas por `updated_at` descendente (mais recentemente modificada no topo).

**Mudança de comportamento atual:** hoje o índice ordena por **criação** (`lists` em ordem de criação, sem sort no componente — ver `src/lib/todos/repository.ts`/`ListasIndex.tsx`). Esta feature troca a ordenação do índice para **modificação** (mais recentes primeiro), com a seção fixada acima. É uma mudança intencional: listas mais usadas sobem.

**Empate de `updated_at`:** ordenação determinística e estável (desempate por `created_at`, depois por `id`) — detalhe de implementação do DEV; o AC valida apenas a regra primária (modificação decrescente) com listas de timestamps distintos.

### Limite
Não há limite de quantas listas podem ser fixadas (todas podem ser fixadas; se todas forem fixadas, a seção "Demais" fica vazia).

---

## Problema

Não há como destacar listas importantes. Listas que o usuário usa com frequência (ex.: a de compras semanal) ficam misturadas com as demais no índice, ordenadas por criação — o usuário precisa rolar/procurar para alcançar as que mais usa.

## Valor para o usuário

O usuário fixa as listas que usa com frequência e elas passam a aparecer no topo do índice, sempre acessíveis em 1 toque. As demais continuam acessíveis logo abaixo, ordenadas por uso recente. Transforma o índice num atalho pessoal: as listas importantes ficam à mão, sem navegação.

## Caso de uso de referência

O usuário tem 6 listas. Abre o índice, fixa a "Mercado" (que usa toda semana) e a "Casa". Ambas sobem para o topo, acima das outras 4. Na semana seguinte, abre o app e acha a "Mercado" no topo do índice — 1 toque, sem rolar. Quando uma lista fixada deixa de ser relevante, desfixa (mesmo controle) e ela volta à seção "Demais".

---

## Escopo de negócio

### Ação Fixar/Desfixar (toggle)
- O usuário pode **fixar** uma lista e **desfixar** uma lista fixada, pelo mesmo controle (toggle). O controle exibe o estado atual (fixada ⇄ não-fixada).
- Fixar/desfixar é **não destrutivo**: não pede confirmação, não perde dados, é instantaneamente reversível.
- Disponibilidade do controle (índice e/ou detalhe da lista, ícone/affordance) é **decisão do 🤖 PD**. Esta spec exige apenas: existe um controle alcançável para fixar/desfixar, e o estado de fixação é visível.

### Reflexo no índice
- Ao **fixar**, a lista move-se imediatamente para a seção **Fixadas** (topo do índice).
- Ao **desfixar**, a lista move-se imediatamente para a seção **Demais**.
- A reordenação é **imediata** (o índice reflete o novo estado sem recarregar).

### Persistência e sync (local-first)
- `pinned` é um campo **aditivo** novo, com **default `false`** — lista existente não nasce fixada (migration aditiva, sem breaking change; detalhe de schema/migration é do DEV).
- Fixar/desfixar responde do **cache local** e funciona **offline** (local-first), seguindo o mesmo fluxo das demais mutações (LB-6/LB-7): grava no cache, dispara `sync()` pós-mutação, sincroniza com o cloud ao reconectar.
- O estado `pinned` **persiste entre sessões** e **sincroniza cross-device** (faz parte da lista; segue o merge por `updated_at` do LB-6).
- **RLS sem mudança:** `pinned` pertence à linha da lista, já coberta pela RLS por `auth.uid()` existente (mesma barreira entre contas). Nenhuma policy nova de leitura pública/compartilhada.

### Estado vazio
- Se não houver listas fixadas, a seção **Fixadas** não aparece (o índice mostra só "Demais", como hoje).
- Se **todas** as listas forem fixadas, a seção "Demais" não aparece.

---

## Fora de escopo (issue futura / limitação aceita)

- **Reordenar manualmente** (arrastar/soltar) listas dentro de uma seção ou entre seções. A ordem é automática (modificação); controle manual de ordem fica para issue futura se o produto pedir.
- **Fixar itens** dentro de uma lista — só **listas** no índice são fixáveis.
- **Limite máximo** de listas fixadas — não há limite.
- **Compartilhamento cross-conta** do estado fixado ou de listas — continua sob RLS do dono (não afetado; ver LB-12 fora de escopo).
- **Forma do campo no schema** (booleano `pinned` puro vs. timestamp de fixação) e detalhes da migration/RLS/sync — decisão do 🤖 DEV.
- **Affordance de UI** (ícone 📌 on/off, localização no índice e/ou no menu overflow "⋮", headers/divisores da seção) — decisão do 🤖 PD.

---

## Critérios de aceite (testáveis)

1. Existe um controle alcançável pelo qual o usuário **fixa** uma lista não-fixada; a lista passa a ser exibida na seção **Fixadas** (topo do índice) imediatamente, sem recarregar.
2. Existe um controle alcançável pelo qual o usuário **desfixa** uma lista fixada; a lista volta à seção **Demais** imediatamente.
3. O controle **alterna** entre fixar e desfixar (toggle) e reflete o estado atual da lista (fixada ⇄ não-fixada).
4. Fixar e desfixar **não pedem confirmação** (são ações não destrutivas e reversíveis).
5. **Listas fixadas aparecem sempre antes** das não-fixadas no índice, independentemente das datas de modificação.
6. Dentro da seção **Fixadas**, as listas são ordenadas por **modificação mais recente primeiro** (`updated_at` descendente).
7. Dentro da seção **Demais**, as listas são ordenadas por **modificação mais recente primeiro** (`updated_at` descendente).
8. Marcar/desmarcar um item, renomear ou adicionar item em uma lista atualiza seu `updated_at` e, com isso, **reposiciona** a lista dentro de sua seção (a reordenação é por modificação em ambas as seções).
9. Fixar/desfixar funciona **offline** (sem rede): a mudança é gravada no cache local e reflete no índice imediatamente; o sync com o cloud ocorre ao reconectar (mesmo fluxo de LB-6/LB-7).
10. O estado `pinned` **persiste entre sessões** (fechar e reabrir o app mantém quais listas estão fixadas e a ordenação).
11. O estado `pinned` **sincroniza cross-device**: fixar em um dispositivo reflete no outro após o sync (merge por `updated_at`, LB-6).
12. Após o upgrade, **nenhuma lista existente está fixada** (default `pinned = false`); a migration é aditiva e **sem breaking change** nos dados existentes.
13. **Nenhuma mudança em RLS** é introduzida: `pinned` fica protegido pela policy por `auth.uid()` já existente na tabela de listas; outra conta não enxerga nem altera o estado fixado do usuário.
14. Quando nenhuma lista está fixada, a seção Fixadas não é exibida (o índice mostra só as demais); quando todas estão fixadas, a seção Demais não é exibida.

---

## Notas para o 🤖 PD

- A **affordance** de fixar (ícone 📌 on/off ou equivalente) e onde ela vive (linha do índice e/ou menu overflow "⋮" na tela da lista, junto a "🗑️ Excluir lista" da LB-8 e "Copiar link" da LB-12) é decisão de design. Sugerido: o natural é um controle por lista, alcançável tanto no índice quanto no detalhe, mas o PD define.
- O **tratamento visual das seções** (header "Fixadas"/"Demais", divisor, ícone de pino indicando estado) é decisão de design; esta spec só exige que o estado fixado seja **visível** e a ordem das seções seja **Fixadas acima de Demais**.
- Manter o padrão de acessibilidade já usado no índice/menu (roles `menu`/`menuitem` quando aplicável, `aria-label`, `min-h-11` nos alvos de toque).

## Notas para o 🤖 DEV

- A ordenação atual do índice é **por criação** (`lists` em ordem de criação, sem sort em `ListasIndex.tsx`). Esta feature troca para **modificação** (`updated_at` desc) com seção fixada acima — mudança de comportamento deliberada.
- O campo `pinned` é **aditivo** (default `false`); a forma exata (booleano puro vs. timestamp) e a migration são do DEV, respeitando as regras de DB do `docs/agents/dev.md` (additive, sem breaking change, preview usa banco de prod → nada destrutivo/em massa).
- Empate de `updated_at`: desempate determinístico (sugerido `created_at`, depois `id`) — detalhe de implementação.
- Sync: `pinned` segue o mesmo fluxo local-first das demais mutações (LB-6/LB-7) e o merge por `updated_at`; o `deletedIds` da LB-8 não é afetado.