# Spec de design — LB-5: Múltiplas listas, separação de concluídos e reutilização de itens

**Issue:** [LB-5](https://linear.app/alysson-azevedo/issue/LB-5/multiplas-listas-separacao-de-concluidos-e-reutilizacao-de-itens) · **State:** ✅ Deployed (v0.3.0) · **Tipo:** 🧹 Tarefa
**Base:** LB-3/LB-4 (✅ Deployed). Arquivos: `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/todos/TodoList.tsx`, `src/lib/todos/{types,repository,store,gate}.ts`.

Frontend/UI + evolução do modelo de dados conceitual (`Lista` + `Item`), mantendo **persistência em localStorage atrás da camada única de acesso aos dados** (sem Supabase, sem nova dependência, sem mudança de stack). Sem excluir/reordenar/busca. Sem regressão em desktop nem na UX mobile da LB-4.

Decisões de produto já confirmadas (não reabrir) estão em itálico nos fluxos.

---

## Princípios

1. **Reutilizar o padrão visual LB-2/LB-3/LB-4**: paleta `--background/--foreground/--muted`, bordas `border-current/20`, `divide-current/10`, fontes Geist, dark mode por `prefers-color-scheme`. Sem novos tokens de cor nem componentes.
2. **Mobile-first sem regressão em desktop**: `max-w-[28rem]` centralizado permanece; unidades responsivas valem 0/auto em telas grandes.
3. **Mínimo que entrega valor**: nada de ícones novos, animações complexas, gestures ou estruturas além do necessário aos critérios de aceite.
4. **UI consome só a camada de acesso aos dados** (`store`/repository); nunca `localStorage` direto. A estrutura interna do repository (chave, formato, migração) é decisão do DEV — esta spec fixa o modelo conceitual e os fluxos de UX.

---

## 1. Arquitetura de navegação

**Decisão: sub-rotas.** `/` = índice de listas; `/listas/[id]` = tela da lista.

- **A (recomendado): sub-rotas.** `/` índice, `/listas/[id]` lista. Back do navegador/sistema volta ao índice naturalmente; URL deep-linkável; reload mantém o contexto. Reaproveita Next App Router (já na stack, sem mudança de tecnologia). O gate de auth é aplicado em um **layout compartilhado** envolvendo ambas as rotas (não duplicar o gate por página).
- **B: estado interno sem sub-rota.** `/` sempre; view troca por "lista selecionada" no store. Menos estrutura, mas o back do sistema sai do app (regressão mobile relevante), sem deep-link, reload perde contexto.
- **Recomendação: A.** O back nativo é primário no mobile; B quebra essa expectativa.

**Shell compartilhado (layout group, ex.: `app/(app)/layout.tsx`):** header com "Sair" + rodapé "Ambiente/Build" + safe areas (`min-h-dvh`, `items-start sm:items-center`, padding com `env(safe-area-inset-*)`) — igual ao container atual da `page.tsx`, reaproveitado nas duas telas. O `<main>`/container atual migra para esse layout; cada tela desenha só seu conteúdo.

**Gate:** `homeGate(user)` mantém `"redirect-login" | "show-list"`; `show-list` agora renderiza o índice (CA 1/2). A sub-rota `/listas/[id]` herda o mesmo gate via layout — deslogado é redirecionado ao login em ambas.

---

## 2. Tela: Índice de listas (`/`)

Conteúdo dentro do shell compartilhado.

### Header
- `<h1>` "Lembr8" (mantém `text-3xl`).
- Subtítulo: "Sua lista de tarefas" → **"Suas listas"**.
- "Sair" no canto direito (mantém `min-h-11`).

### Ação primária — Nova lista (1 toque)
- Botão **"Nova lista"** logo abaixo do header, largura total no mobile (`w-full min-h-11`, `text-base`), alvo 44px.
- 1 toque cria a lista com nome `Lista N` (ver §6) e **abre a lista criada** (navega para `/listas/[id]`). Justificativa: o caso comum é "quero uma lista nova para começar a adicionar"; criar e só exibir no índice força 1 toque extra (selecionar). Atende o CA 3 (a lista aparece no índice quando o usuário volta).
- **Trade-off (decisão de produto passível de confirmação):** criar e abrir (A, recomendado) vs. criar e permanecer no índice (B, literal à frase "aparece no índice"). Ambos atendem o CA 3. Se o humano preferir B, o botão cria e apenas atualiza o índice.

### Linha de lista (card/row)
Lista de listas como `<ul divide-y divide-current/10>`; cada `<li>` é um **botão/link** (`min-h-11`, área 44px, `text-base`) que navega para `/listas/[id]`.
Conteúdo da linha:
- **Nome da lista** (`Lista 1`, etc. ou nome renomeado).
- **Contagem de a-fazer** à direita, `text-muted text-base` (ex.: "3 a fazer"). Calculada a partir dos itens não concluídos da lista. Ajuda o usuário a escolher sem entrar. (Opcional leve; se o DEV julgar custoso, omitir — não é CA.)

Renomear **não** fica na linha do índice (ver §3) — a linha tem uma única ação (abrir), evitando conflito de alvo e clutter.

### Estado vazio
"Nenhuma lista ainda. Toque em ‘Nova lista’ para começar." (`text-base text-muted`, abaixo do botão). Usuário novo (sem dados MVP) vê isto; usuário existente vê `Lista 1` após migração (§5).

---

## 3. Renomear lista — onde?

**Decisão: renomear no header da tela da lista** (não no índice).

- **A (recomendado): título editável no header da lista.** Na tela `/listas/[id]`, o nome da lista é exibido como título; clicar/tocar vira `<input text-base>` (click-to-edit). Enter confirma, Esc cancela, blur confirma. O índice fica limpo (linhas = só abrir); faz sentido semântico ("estou na lista, renomeio-a").
- **B: ação de renomear na linha do índice.** Renomear sem entrar na lista. Adiciona um controle por linha e conflito de alvo (clicar na linha abre, clicar no controle renomeia). Mais complexo, mais alvos no mobile.
- **Recomendação: A.** Mantém o índice com uma ação por linha, alinhado a "sem excluir/reordenar/busca". Atende o CA 7 (o novo nome aparece no índice ao voltar).

---

## 4. Tela: Lista (`/listas/[id]`)

Conteúdo dentro do shell compartilhado.

### Header
- Linha 1: **"← Listas"** (link de voltar ao índice, `min-h-11`, `text-base`) à esquerda; **"Sair"** à direita. O back do navegador/sistema também volta (sub-rota).
- Título: `<h1>` com o **nome da lista** (editável, §3). `text-3xl` como o "Lembr8" atual.
- Subtítulo: **contagem** — "X a fazer · Y concluídos" (`text-muted`, `text-base`). Atualiza ao marcar/desmarcar.

### Entrada inline (mantém LB-3/LB-4)
- `<input>` no topo, abaixo do subtítulo: `text-base`, `enterKeyHint="enter"`, `px-3 py-3` (44px), `border-current/20`, `focus:border-current/50`, `aria-label="Novo item"`. Enter → adiciona (lógica em §7), limpa o campo, mantém foco. Sem `autoFocus`.
- Placeholder: "Adicione um item e pressione Enter" (mantém).

### Seções
A lista de itens é dividida em duas seções, nessa ordem vertical:

1. **A-fazer** (topo): itens não concluídos. `<ul divide-y divide-current/10>`.
2. **Concluídos** (embaixo): itens concluídos, sob um **cabeçalho de seção** "Concluídos" (`text-muted text-base`, com leve separação `pt-4`/`border-t border-current/10`). `<ul divide-y divide-current/10>`.

Cada `<li>` mantém o padrão LB-4: `<label min-h-11>` envolvendo checkbox `size-5` + texto; clicar em qualquer ponto da linha alterna. Texto concluído: `line-through text-muted`.

**Estado vazio da lista:** "Nenhum item ainda. Digite acima e pressione Enter para começar." (mantém o texto e `text-base`) — aparece abaixo do input quando não há itens a-fazer nem concluídos. Se há só concluídos (zero a-fazer), a seção a-fazer fica vazia sem mensagem (a seção "Concluídos" já é o conteúdo); o input permanece visível no topo.

### Ordenação dentro das seções (decisão de UX — ver §7)

---

## 5. Migração (UX)

Usuário existente (storage `lembr8.todos` do MVP) abre o app após o upgrade e vê **`Lista 1`** no índice com seus itens atuais; nenhuma ação do usuário, nenhum dado perdido (CA 8).

- A migração roda uma vez: detecta o storage antigo e o novo formato ausente → cria `Lista 1` com os itens existentes (preservando `concluido` e a ordem de inserção original). Após migrar, marca como feito (formato/versionamento do storage — decisão do DEV) para não re-migrar.
- Itens concluídos do MVP vão para a seção "Concluídos" da `Lista 1`; os a-fazer, para a seção "A-fazer". A ordem visual preserva a original do MVP (ver §7).
- Usuário novo (sem storage antigo) começa com índice vazio.

---

## 6. Auto-incremento de `Lista N`

Nome padrão ao criar: `Lista N`, onde **N = (maior número entre os nomes que casam `^Lista (\d+)$`) + 1, mínimo 1**. Ex.: sem listas → "Lista 1"; com "Lista 1" e "Lista 2" → "Lista 3"; se o usuário renomeou "Lista 1" → "Compras" e existe "Lista 2" → "Lista 3". Simples, sem contador persistente extra. (Detalhe de implementação; não é decisão crítica.)

---

## 7. Ordenação, reutilização de concluído e duplicado ativo

### Ordenação dentro das seções
*A decisão de produto diz: "reativa (desmarca e volta ao topo)".*

**Interpretação recomendada (B):** "voltar ao topo" = voltar à seção **a-fazer** (que está no topo da tela), não necessariamente à primeira posição. Ordenação preserva o hábito do LB-3 e simplifica a migração:
- **Seção a-fazer: ordem de inserção** (mais antigo no topo). Item novo (texto inédito) e item reativado entram no **fim** da seção a-fazer.
- **Seção concluídos: ordem de conclusão**, mais recentemente concluído no **fim** (ou seja, novos concluídos embaixo). Marcar move o item para o fim da seção concluídos.
- Migração: preserva a ordem original do MVP sem inversão.

**Alternativa (A, leitura literal de "topo"):** a-fazer em "mais recente no topo" — todo item que entra na seção a-fazer (novo ou reativado) vai à primeira posição. Honra a literalidade e mantém o item recém-tocado visível abaixo do input, mas **inverte a ordem do LB-3** e exige que a migração insira em ordem reversa para preservar a aparência original.

**Recomendação: B** (preserva o hábito LB-3 e a migração; o item recém-adicionado não fica no topo, mas o comportamento é idêntico ao atual). **Se o humano preferir a leitura literal "posição no topo", usar A** — sinalizado como ponto passível de confirmação, não como bloqueio.

### Reutilização de concluído e duplicado ativo (ao adicionar via Enter)
Texto T na lista L (comparação **case-insensitive, após `trim`**; o item reutilizado mantém seu texto original). Precedência:

1. **Duplicado ativo (default):** se existe item **a-fazer** em L com texto == T → **não cria**. Foca o existente: `scrollIntoView` + highlight transitório (ex.: `ring`/`bg` que some após ~1,2s via state local). O campo de entrada é limpo.
2. **Reutilizar concluído:** senão, se existe item **concluído** em L com texto == T → **reativa** esse item (`concluido = false`), movendo-o para a seção a-fazer (posição conforme §7). Não cria duplicata.
3. **Novo item:** senão → cria novo item a-fazer com texto T (o texto digitado, preservando capitalização).

- **Trade-off (match case-insensitive):** "Arroz" e "arroz" não coexistem (o segundo reativa o primeiro; mantém o texto do item pré-existente). Maximiza a reutilização — espírito da feature. Alternativa case-sensitive coexistiria "Arroz"/"arroz" como itens distintos; menos reutilização. **Recomendação: case-insensitive.**
- O highlight de "foca o existente" é feedback visual breve, sem lib de animação (state + timeout). Detalhe de implementação do DEV.

---

## 8. Ergonomia mobile (manter LB-4) — sem regressão

Tudo da LB-4 se aplica às duas telas:

| Elemento              | Especificação                                                              |
|-----------------------|---------------------------------------------------------------------------|
| Viewport/safe areas   | `viewport` em `layout.tsx` mantido (`viewportFit: cover`)                 |
| Container             | `min-h-dvh`, `items-start sm:items-center`, padding `env(safe-area-inset-*)`, `max-w-[28rem]` |
| Input (item)          | `text-base` (≥16px), `enterKeyHint="enter"`, `py-3` (44px), sem `autoFocus` |
| Linhas (lista/listas) | `<label>`/botão com `min-h-11` (44px), `text-base`                        |
| Checkbox              | `size-5` dentro de `<label min-h-11>`                                     |
| Botões (Sair/Nova/Voltar) | `min-h-11`, `text-sm`/`text-base`                                      |
| Estado vazio          | `text-base text-muted`, sem ícone                                         |
| Rolagem               | página inteira rola naturalmente; sem container de scroll interno         |

Sem regressão em desktop: card `max-w-[28rem]` centralizado, mesmas cores e layout das telas anteriores.

---

## 9. Modelo conceitual de dados (para o DEV)

- `Lista { id: string; nome: string }`
- `Item { id: string; listId: string; texto: string; concluido: boolean }`
- Persistência permanece em **localStorage**, atrás da **camada única de acesso aos dados** (interface repository evolui para listar listas, itens por lista, criar/renomear lista, adicionar item com reutilização, toggle). A UI consome só o `store`; o `store` consome só o repository. Sem Supabase, sem nova dependência.
- A estrutura exata do repository, a chave de storage e o versionamento/migração são decisão do DEV, respeitando: (i) nenhum dado perdido, (ii) UI isolada do storage, (iii) testável em node/jsdom sem `localStorage` real.

---

## 10. Trade-offs resumidos

1. **Navegação: sub-rotas (A, rec.) vs. estado interno (B).** A preserva back nativo e deep-link.
2. **Criar lista: abrir a criada (A, rec.) vs. só atualizar índice (B).** A poupa 1 toque; ambos atendem o CA 3. *Passível de confirmação.*
3. **Renomear: header da lista (A, rec.) vs. ação na linha do índice (B).** A mantém o índice com uma ação por linha.
4. **"Volta ao topo": volta à seção a-fazer + ordem de inserção (B, rec.) vs. primeira posição + mais recente no topo (A, literal).** B preserva LB-3 e migração. *Passível de confirmação.*
5. **Match de texto: case-insensitive (rec.) vs. case-sensitive.** Case-insensitive maximiza reutilização.

---

## 11. Critérios de aceite (refinados para DEV/QA)

1. Deslogado em `/` → redirect para login (e em `/listas/[id]` também).
2. Logado em `/` → índice de listas; listas persistem entre sessões (localStorage).
3. "Nova lista" em 1 toque cria `Lista N` (auto-incremento) e abre a lista (ou só a exibe no índice, conforme trade-off 2 confirmado).
4. Selecionar uma lista → vê seus itens, a-fazer no topo e concluídos embaixo (com cabeçalho "Concluídos"); voltar ao índice via "← Listas" ou back do sistema.
5. Adicionar (Enter) texto de um concluído na mesma lista → reativa o concluído (desmarca, volta à seção a-fazer) sem duplicata; texto novo → cria a-fazer.
6. Adicionar texto de um a-fazer existente na lista → não duplica; foca o existente (scroll + highlight).
7. Marcar/desmarcar move entre as seções; estado persiste.
8. Renomear a lista (título editável no header) altera o nome; persiste; reflete no índice ao voltar.
9. Itens existentes do MVP aparecem migrados em `Lista 1` (a-fazer/concluídos separados, ordem preservada); nenhum dado perdido.
10. UX mobile (LB-4) sem regressão; sem regressão em desktop.
11. Suite de testes automatizados passando (lógica de domínio: reutilização, duplicado, migração, auto-incremento, ordenação; renderização ajustada às novas telas).

---

## Out of scope (mesmos da issue)

Excluir lista/item, reordenar listas/itens, busca/filtros/categorias, persistência remota (Supabase)/sync, notificações/Web Push, mudança de stack.