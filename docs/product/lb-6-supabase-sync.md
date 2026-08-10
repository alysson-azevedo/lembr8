# Spec LB-6 — Persistência local-first das listas no Supabase (sync cross-device)

**Issue:** [LB-6](https://linear.app/alysson-azevedo/issue/LB-6/persistencia-local-first-das-listas-no-supabase-sync-cross-device) · **State:** ✅ Deployed (v0.4.0) · **Tipo:** 🧹 Tarefa
**Base:** LB-5 (✅ Deployed v0.3.0) — modelo `Lista` + `Item`, camada única de acesso aos dados, persistência em localStorage. UX mobile (LB-4) e múltiplas listas (LB-5) preservadas.

**Escopo desta spec:** negócio (critérios de aceite + UX do ponto de vista do usuário). A spec de **design** (estrutura de código, schema, estratégia de fila de mudanças, formato do cache) é trabalho do 🤖 PD em `design/lb-6-*.md`.

---

## Decisões de arquitetura (confirmadas — ADR 2026-08-10, não reabrir)

- **Supabase (Postgres + RLS por `auth.uid()`) é a fonte de verdade** das listas/itens; **localStorage é cache offline** (local-first).
- A UI continua lendo/escrevendo no cache (funciona sem rede); o repository sincroniza com o cloud **ao reconectar** e **ao login**: push das mudanças locais + pull; merge por `updated_at` (última escrita vence).
- Dados existentes no localStorage são **migrados para o cloud no 1º login pós-upgrade** (upsert por lista/item). Em conflito multi-device, **primeiro-device-vence / merge simples** — sem perda.
- **Realtime live-sync fora do escopo** (sync em login/reconexão é suficiente).

Stack e escolha de serviço: confirmadas — esta spec não propõe nem reabre alternativas.

---

## Problema

As listas/itens (LB-5) persistem apenas em localStorage — não sincronizam entre dispositivos e ficam presos ao device/browser. Quem usa o app no celular e no desktop, ou troca de aparelho, perde a continuidade.

## Valor para o usuário

Listas e itens sincronizam entre dispositivos via Supabase, mantendo o uso offline (local-first). O app continua funcionando sem rede (cache localStorage) e sincroniza ao reconectar. Dados existentes no localStorage são migrados para o cloud no primeiro login pós-upgrade, sem perda.

## Caso de uso de referência

Usuário prepara a lista de compras em casa no desktop (logado, online) e sai para o mercado com o celular. No celular abre o app e vê a mesma lista (sincronizada). Dentro do mercado, sem sinal, adiciona e marca itens normalmente — o app responde na hora. Ao sair e reconectar, as mudanças feitas no celular sobem para o cloud e aparecem no desktop na próxima abertura. Nada se perde por falta de rede.

---

## Escopo de negócio

### Persistência no Supabase (fonte de verdade)
- Listas e itens do usuário passam a residir no Supabase (Postgres), acessíveis de qualquer dispositivo onde ele se autentique. Persistem entre sessões e dispositivos.
- Cada conta é isolada por **RLS** (`auth.uid() = user_id`): o usuário só acessa suas próprias listas/itens.

### Local-first (offline)
- A UI continua atendida pelo cache localStorage: o app funciona sem rede exatamente como hoje (criar/marcar/renomear responde imediatamente). Nenhuma ação do usuário fica bloqueada por falta de rede.

### Sync ao reconectar e ao login
- Ao recuperar a conexão (e ao iniciar sessão/logar), o app sincroniza em segundo plano: sobe as mudanças feitas localmente e baixa as mudanças do cloud.
- Conflito (mesma lista/item editada em dispositivos diferentes): a edição mais recente vence (`updated_at`). Sem prompt de merge, sem pergunta ao usuário.
- Nenhuma mudança perdida por falta de rede; nenhuma duplicata indevida.

### Migração no 1º login pós-upgrade
- Usuário que já usava o app (dados em localStorage do LB-5/MVP) abre o app após o upgrade e se autentica (login novo ou sessão persistente ativa): seus dados existentes sobem para o cloud, sem ação do usuário, sem perda.
- Se o usuário já havia migrado em outro dispositivo, os dois conjuntos se fundem (**união por lista/item** — ids locais são únicos por device, não há colisão de id; em empate de `updated_at`, o que chegou primeiro ao cloud prevalece). Nenhum dado perdido.

---

## Fora de escopo (issues futuras — mantido)

- **Realtime live-sync** (subscrição Supabase Realtime) — sync em login/reconexão é suficiente.
- **Compartilhamento de listas entre usuários / colaboração** entre contas.
- **Edição/exclusão/reordenação** de listas/itens (mantida fora de escopo desde LB-5).
- **Notificações / Web Push, e-mails** (outra issue).
- **Indicadores de UI elaborados** (painel de sync, histórico de mudanças, logs) — ver trade-off abaixo.

---

## UX de produto (do ponto de vista do usuário)

Princípio: o sync é **transparente**. O usuário não opera a sincronização; ele só percebe o resultado (seus dados aparecem no outro dispositivo). Sem assistente de migração, sem botão "sincronizar agora", sem prompts de conflito.

### Usar offline
Ao perder a conexão (ex.: entra no mercado sem sinal), o usuário continua adicionando itens, marcando e renomeando exatamente como sempre. Tudo responde na hora, do cache local. **Nenhuma mensagem de erro, nenhum botão desabilitado, nenhuma interrupção.** A única diferença em relação ao uso online é que as mudanças aguardam rede para subirem — mas isso o usuário não precisa saber.

### Reconectar
Quando a rede volta, o app sincroniza em segundo plano: sobe o que foi feito offline e baixa o que mudou no cloud. O usuário não faz nada. Se a mesma lista/item foi editada em dois dispositivos, a edição mais recente prevalece — sem pergunta ao usuário, sem tela de conflito. Ao final, o conteúdo reflete o estado consolidado e continua utilizável normalmente.

### 1º login pós-upgrade (com dados antigos)
Usuário que já usava o app abre após o upgrade e entra com sua conta. Suas listas e itens existentes são enviados ao cloud automaticamente — **sem assistente, sem confirmação, sem aviso "migrando"**. Os dados continuam aparecendo como antes (mesmas listas, mesmos itens, mesma ordem e estados de conclusão da LB-5). A partir desse momento ficam acessíveis de qualquer dispositivo onde ele logar. Se já migrou em outro dispositivo, os conjuntos se fundem sem perda.

### Segundo dispositivo
Usuário loga em um novo dispositivo (ex.: desktop, após usar no celular) e vê suas listas e itens iguais aos do outro dispositivo (vindos do cloud). Pode usar offline também; ao reconectar, sincroniza normalmente. O fluxo de login em si (Supabase Auth, e-mail/senha) é o já existente (LB-2) — sem mudança.

### RLS (isolamento entre contas)
Cada conta é estanque: o usuário A nunca vê nem acessa listas/itens do usuário B, em nenhum dispositivo nem estado de rede. O cache local só contém dados da conta autenticada.

### Indicador de status na UI — trade-off (passível de confirmação)
**Recomendação: nenhum indicador** (transparência total), alinhado a "a UI não muda" e ao mínimo que entrega valor — o sync se manifesta pelo resultado (dados no outro device), não por um spinner/badge.

Alternativa: um indicador mínimo e simples (ex.: rótulo "offline" discreto quando sem rede, sumindo ao reconectar). Só vale a pena se o uso real mostrar fricção (usuário incerto se salvou). **Decisão passível de confirmação pelo humano/PD** — se houver ambiguidade sobre a necessidade, o PD pode propô-lo no design técnico; o padrão desta spec é não ter indicador.

---

## Critérios de aceite (refinados — ponto de vista do usuário)

1. **Deslogado** em `/` e em `/listas/[id]` → redireciona para o login (mantido da LB-5).
2. **Logado em qualquer dispositivo**, ao abrir o app, vê **suas** listas e itens (vindos do Supabase, fonte de verdade). Ao trocar de dispositivo e logar com a mesma conta, vê as mesmas listas e itens; persistem entre sessões e dispositivos.
3. **Offline (sem rede)**: criar item, marcar checkbox e renomear lista funcionam e respondem imediatamente, do cache local; nenhuma ação fica bloqueada, nenhum erro é exibido ao usuário.
4. **Ao reconectar**: mudanças feitas offline sobem ao cloud e mudanças do cloud descem; merge por `updated_at` (última escrita vence). Nenhuma mudança é perdida e nenhuma duplicata indevida é criada. (Verificável: offline em device A → reconecta → device B vê as mudanças; mesma lista editada em A e B → prevalece a edição mais recente, sem pergunta ao usuário.)
5. **RLS**: o usuário A não enxerga nem acessa listas/itens do usuário B — em nenhum dispositivo, nem em uso offline (o cache local só contém dados da conta autenticada).
6. **Migração no 1º login pós-upgrade**: um usuário com dados no localStorage (LB-5/MVP) que abre o app após o upgrade e se autentica vê seus dados preservados (mesmas listas/itens, ordem e estados de conclusão) e, a partir dali, acessíveis de qualquer dispositivo; nenhum dado perdido. Se já migrou em outro dispositivo, os conjuntos se fundem sem perda.
7. **Sem regressão**: UX mobile (LB-4) e múltiplas listas (LB-5) — índice, telas, entrada inline, seções a-fazer/concluídos, reutilização de concluído e foco de duplicado — funcionam como antes; sem regressão em desktop.
8. **Migration aplicada em prod** antes de o preview depender dela; preview funcional (usa o banco de prod — nada destrutivo/em massa no preview, conforme ADR 2026-08-05).
9. **Suite de testes automatizados passando**: lógica de sync/merge (incl. `updated_at`), migração (sem perda, união multi-device), RLS (Supabase local em Docker); UI permanece isolada do storage (sem chamada direta ao Supabase na camada de UI).

---

## Notas para o 🤖 PD (design técnico)

- Esta spec fixa **negócio** (AC + UX). Decisões de implementação — schema exato (`lists`/`items`, colunas, índices), fila de mudanças locais, detecção de "online/reconexão", formato e versionamento do cache localStorage, momento exato do trigger de sync, estratégia de upsert na migração — são do escopo do PD, respeitando: (i) a UI não muda (continua consumindo só o `store`/repository via `useSyncExternalStore`); (ii) nenhum dado perdido; (iii) RLS obrigatória; (iv) migration aplicada em prod antes do preview depender dela; (v) testável em node/jsdom e Supabase local em Docker.
- O trade-off do indicador de status (item "Indicador de status na UI") fica em aberto para o PD endereçar no design — padrão: sem indicador.
- Edição/exclusão/reordenação continuam fora de escopo; o sync cobre apenas criar/marcar/renomear já suportados pela LB-5.