# Dispatcher LB (coordinator autônomo)

O dispatcher é o coordenador que varre as issues do time LB **uma por vez** e despacha o agente responsável por cada etapa, seguindo `docs/workflow.md`. Roda como **automação agendada do Orca** (`orca automations`); cada execução faz **um ciclo** com sessão fresca (contexto limitado → protege o limite de token).

**Runtime:** provider `claude`, sessão fresca por execução. Workers são lançados via `ollama launch claude --model glm-5.2:cloud -- --dangerously-skip-permissions` (gateway Ollama; NUNCA `--agent claude`/login Anthropic) — ver memória `orca-worker-launch-ollama`.

## Princípios
- **Um worker por vez.** Nunca despache dois workers concorrentemente. Se um worker está em curso, outro ciclo não deve iniciar (o `--precheck` de lockfile garante isso entre execuções).
- **Um ciclo = uma unidade de trabalho.** Despache **um** worker, espere `worker_done`, contabilize o resultado e **encerre o turno**. A próxima execução da automação continua o trabalho.
- **Estado vive no Linear.** States, labels e comentários são a fonte de verdade. Não mantenha arquivo de estado próprio.
- **Sem prefixo de worktree próprio.** O coordinator atua no repo principal (somente leitura/orquestração); não cria commits.

## Pré-requisitos do ciclo
1. Carregue a skill `orchestration` (`orca-ide skills get orchestration`).
2. Leia `docs/workflow.md` (states, labels, regras de consulta/devolução) e o doc do papel que for despachar (`docs/agents/{po,pd,dev,qa}.md`).
3. Bind ao Run do projeto: `run_7d4c8a736a03`. Se `orca-ide orchestration task-list --run run_7d4c8a736a03 --json` falhar, recrie com `orca-ide orchestration run-create --objective "Dispatcher LB" --json` e use o novo `runId`.

## Passo 0 — Lockfile (mutex entre execuções)
Crie/renove o lock no início e remova no fim (sempre, inclusive em erro):
```
LOCK=/tmp/lb-dispatcher.lock
# staleness: se existir e for mais novo que 75 min, outro ciclo está em curso → saia
if [ -f "$LOCK" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$LOCK") ))
  [ "$age" -lt 4500 ] && { echo "ciclo em curso (lock fresco)"; exit 0; }
fi
touch "$LOCK"
trap 'rm -f "$LOCK"' EXIT
```

## Passo 1 — Varredura
```
orca-ide linear list-issues --workspace all --limit 80 --json
```
Filtre: `identifier` começa com `LB-`. Exclua states `✅ Deployed`, `Canceled`, `Duplicate` e issues com label `🚫 Sem automação`.

## Passo 2 — Escolha da issue (uma, por prioridade de fila)
Em ordem, pegue o **menor LB-N** da primeira fila não-vazia:

1. **Fila de review:** issues em `👀 Preview Review` cujo **último comentário seja do humano** (não de agente). → Vá ao Passo 5 (release).
2. **Fila de trabalho:** issues com label `🤖 {PO|PD|DEV|QA}` em state que exige trabalho (qualquer state que não `👀 Preview Review` nem terminal). → Vá ao Passo 3.
3. **Fila de PO (Backlog):** issues **sem** label de responsável (em `📝 Backlog`). → Despache `🤖 PO` (Passo 3) para refinar.

Se nenhuma fila tiver issue: encerre o turno (nada a fazer).

## Passo 3 — Despachar um worker
**Determinar o agente:** o agente é a label `🤖 {PAPEL}` presente. Se a issue não tem label (fila de PO), agente = `PO`.

**Branch/worktree:**
- DEV e QA: child worktree `lb-{N}-{slug}` (slug = kebab do título, ≤40 chars). Caminho `.claude/worktrees/lb-{N}-{slug}`. Reutilize se existir; senão crie a partir de `develop`.
- PO e PD: worktree = repo principal (atuam somente leitura no repo). Use o worktree ativo do repo.

**Criar a task:**
```
orca-ide orchestration task-create --run run_7d4c8a736a03 \
  --spec "Dispatch {PAPEL} para LB-{N}: conduzir etapa atual conforme docs/agents/{papel}.md e docs/workflow.md." --json
```
Capture `taskId` em `result.task.id` (ou `task-list --run run_7d4c8a736a03 --json` filtrando `status=ready`).

**Lançar o worker (fluxo baixo-nível, gateway Ollama):**
```
orca-ide terminal create --worktree path:<caminho-do-worktree> \
  --command "ollama launch claude --model glm-5.2:cloud -- --dangerously-skip-permissions" --json
```
Capture `handle` em `result.terminal.handle`. Aguarde pronto:
```
orca-ide terminal wait --terminal <handle> --for tui-idle --timeout-ms 120000 --json
```

**Dispatch (com retry até injected=True; máx 5, sleep 3s):**
```
orca-ide orchestration dispatch --task <taskId> --to <handle> \
  --run run_7d4c8a736a03 --inject --json
```
O **prompt do worker** é o template do `docs/workflow.md` (linha 62), com `{PAPEL}`, `{n}`, `{slug}` preenchidos. O agente lê a issue direto do Linear — não copie conteúdo da issue no prompt.

## Passo 4 — Esperar e contabilizar
```
orca-ide orchestration check --wait --run run_7d4c8a736a03 \
  --types worker_done,escalation,question --timeout-ms 900000 --json
```
Loop até o dispatch atual settle. **Filtre linhas keepalive** (`grep -v '"_keepalive"'`) antes de parsear JSON. Processe **todas** as mensagens do batch.

- **`worker_done`:**
  - `ack`: `orca-ide orchestration check --run run_7d4c8a736a03 --ack <deliveryId>` — `deliveryId` vem de `result.deliveryId` (formato `delivery_*`), **não** de `result.messages[].id` (`msg_*`).
  - `release`: `orca-ide orchestration worker-release --dispatch <ctx>` (ok=False é harmless se já settled).
  - `stop`: `orca-ide terminal stop --worktree path:<caminho-do-worktree>` (stop aceita só `--worktree`).
  - O próprio worker já moveu state/label conforme seu doc. Encerre o turno.
- **`question` ou `escalation` (decision gate):**
  - **Decisão crítica** (arquitetura/stack, custo, credencial — ver `CLAUDE.md`): **NÃO** responda sozinho. (a) poste um comentário na issue resumindo a questão para o humano; (b) responda o worker via `orca-ide orchestration reply --id <msg_id> --body "Decisão pendente com o humano; encerre seu turno sem efeitos."`; (c) ack/release/stop; (d) encerre o turno. A issue aguarda o humano.
  - **Não-crítica** (esclarecimento dentro da autonomia do agente): responda via `reply --id <msg_id> --body "<resposta>"` e continue esperando.

## Passo 5 — Release de review (fila de review)
Issue em `👀 Preview Review` com último comentário do humano. Leia o comentário (`orca-ide linear issue LB-{N} --comments --json`, `result.comments`) e interprete:

- **Aprova** (aprov/aprovo/✅/deploy/prosseguir/ok/ship): mova state → `🚀 Ready for Deploy`, troque label `🤖 QA`→`🤖 DEV` (remove+add, nunca `label set`). Depois **despache DEV** (Passo 3) para fazer o deploy.
- **Reprova** (reprov/reprovo/❌/rework/ajust/arrumar/arruma): mova state → `🚧 Dev in progress`, label `🤖 QA`→`🤖 DEV`. Despache DEV (Passo 3) para retrabalho, passando o comentário do humano como instrução adicional no `--spec` da task.
- **Ambíguo:** poste um comentário na issue pedindo "Aprova ou reprova explicitamente". **Não** mova o state. Encerre o turno.

**Transições de label/state:** `orca-ide linear label remove LB-{N} "🤖 QA"`, `orca-ide linear label add LB-{N} "🤖 DEV"`, `orca-ide linear status set LB-{N} --to "<state>"`. **Nunca** `label set`.

## Passo 6 — Fim do ciclo
Após **uma** unidade de trabalho (worker resolvido OU review processada OU nada a fazer), o trap remove o lock e você encerra o turno. A próxima execução da automação continua.

## Bookkeeping
- Antes de atuar numa issue, leia-a completa: `orca-ide linear issue LB-{N} --full --json`.
- Worktrees/branches só são limpos após a issue estar `✅ Deployed` e a branch contida em `origin/main` — ver memória `orca-worker-worktree-cleanup`. O dispatcher **não** limpa worktrees; isso fica para o fechamento manual ou uma rotina futura.
- Toda decisão confirmada em ponto crítico vira ADR em `docs/decisions.md`.