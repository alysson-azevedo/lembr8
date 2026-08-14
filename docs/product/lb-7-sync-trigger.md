# Spec LB-7 — Disparo de sync pós-mutação e ao focar a aba (fix cross-device)

**Issue:** [LB-7](https://linear.app/alysson-azevedo/issue/LB-7/falha-na-sincronizacao-de-listas-entre-dispositivos) · **Tipo:** 🛠️ Bug
**Base:** LB-6 (✅ Deployed v0.4.1) — persistência local-first no Supabase (sync cross-device). Esta issue é bugfix dentro da arquitetura da LB-6: não reabre stack, schema, RPC, merge nem RLS.

**Escopo desta spec:** negócio (critérios de aceite + UX). A spec de **design** (debounce, wiring no SyncController, testabilidade) é trabalho do 🤖 PD em `design/lb-7-*.md`.

---

## Decisões de arquitetura (mantidas — não reabrir)

- Supabase é a fonte de verdade; localStorage é cache offline (local-first). UI continua lendo/escrevendo no cache.
- Sync = push do `pending` + pull/merge por `updated_at` (última escrita vence).
- Realtime live-sync fora do escopo (sync em login/reconexão é suficiente) — **esta issue não adiciona realtime**.
- Stack e serviço: confirmados — esta spec não propõe nem reabre alternativas.

---

## Problema

Listas/itens criados em um dispositivo não aparecem no outro. O `SyncController` (LB-6) só dispara `sync()` em 4 momentos (montagem do app, evento `online`, `SIGNED_IN`/`INITIAL_SESSION`, `SIGNED_OUT`). **Mutação online não dispara sync**: criar/marcar/renomear grava no cache e enfileira em `pending`, mas a fila só é esvaziada no próximo gatilho (reload/reconexão/relogin). Resultado: o device B nunca recebe as mudanças até um evento futuro — quebra do caso de uso central ("prepara no desktop, vê no celular").

## Causa raiz

Especificação de design da LB-6 (`docs/product/design/lb-6-supabase-sync.md` §5) omitiu o trigger de sync pós-mutação online. A implementação segue o design, mas o design é incompleto frente ao AC 4 da própria LB-6. Merge/RPC/RLS/adapter estão corretos — só falta o flush do `pending`.

## Valor para o usuário

Listas/itens criados em qualquer dispositivo aparecem no outro sem ação manual, cumprindo o caso de uso da LB-6: preparar no desktop e ver no celular ao abrir, e vice-versa.

## Caso de uso de referência

Usuário cria "Lista de compras" no desktop (logado, online) e adiciona "arroz". Em alguns segundos a mudança sobe ao cloud. No celular, abre o app (ou volta à aba que estava em segundo plano) e vê a mesma lista com o item — sem nenhuma ação manual.

---

## Escopo de negócio

### Flush do `pending` após mutação (online)
- Criar lista, adicionar item, marcar checkbox e renomear lista, quando online, disparam um sync (push do `pending`) em segundo plano, **debounced** — várias mutações rápidas viram um único sync.
- A UI não espera o sync: continua local-first (responde na hora do cache). O sync é best-effort em background; falha de rede mantém o `pending` para o próximo trigger (retry).
- Sem indicador de status de sync na UI (mantém o padrão da LB-6).

### Pull ao focar a aba (`visibilitychange` → visible)
- Ao voltar à aba/janela (de segundo plano para visível), logado e online, o app sincroniza (pull) — pega mudanças feitas por outro device enquanto a aba estava em background.
- Sem mudança no comportamento offline: o `online` event continua disparando sync ao reconectar.

### Sem realtime
- Um device com a aba aberta e em foco não recebe mudanças do outro em tempo real — só no próximo sync (agora também em `visibilitychange`). Realtime live-sync permanece fora de escopo.

---

## Fora de escopo (issues futuras — mantido)

- **Realtime live-sync** (Supabase Realtime subscriptions).
- **Compartilhamento de listas entre usuários / colaboração** entre contas.
- **Edição/exclusão/reordenação** de listas/itens (mantida fora de escopo desde LB-5).
- **Notificações / Web Push, e-mails** (outra issue).
- **Indicadores de UI de status de sync** (badge "offline", spinner, "sincronizando") — padrão: sem indicador.

---

## UX de produto (do ponto de vista do usuário)

Princípio mantido: o sync é **transparente**. O usuário não opera a sincronização; ele só percebe o resultado (seus dados aparecem no outro dispositivo). Sem botão "sincronizar agora", sem prompts, sem indicador.

### Mutar online
O usuário cria/marca/renomeia normalmente; a UI responde na hora do cache. Em background, a mudança sobe ao cloud sem que ele perceba. Se a rede cair no meio, nada quebra — a mudança fica no cache e sobe na próxima reconexão.

### Voltar à aba
O usuário deixou a aba em segundo plano e volta: o app puxa as mudanças do cloud em background e a lista reflete o estado mais recente. Sem animação de "sincronizando"; a lista simplesmente mostra o conteúdo atualizado.

### Abrir no outro device
Ao abrir o app no outro dispositivo (login/sessão ativa), o sync de montagem já cobre o pull (LB-6, mantido). Com o novo trigger pós-mutação, agora também há push entre openings — o fluxo fecha.

---

## Critérios de aceite (refinados — ponto de vista do usuário)

1. **Mutação online dispara sync (push) em background, debounced**: criar lista, adicionar item, marcar e renomear, estando online, fazem o `pending` subir ao cloud sem bloquear a UI. Múltiplas mutações rápidas convergem em um único sync. (Verificável: device A cria item online → device B, após sync, vê o item.)
2. **`visibilitychange` → visible dispara sync (pull)**: ao voltar à aba focada, logado e online, o app sincroniza e reflete mudanças feitas por outro device enquanto a aba estava em background. (Verificável: device B pushou → device A volta à aba → vê a mudança.)
3. **Offline mantém local-first**: sem rede, mutações continuam funcionando do cache, respondendo na hora; ao reconectar, o `online` event dispara sync como hoje (sem regressão).
4. **Sem perda/duplicata**: o merge por `updated_at` (LB-6) mantém-se; o novo trigger só adiciona momentos de flush, não altera a lógica de merge. Falha de rede durante o push mantém o `pending` para retry.
5. **Sem regressão**: UX mobile (LB-4), múltiplas listas (LB-5), local-first, isolamento entre contas (RLS) e o fluxo de login (LB-2) funcionam como antes; a UI de produto não muda.
6. **Sem realtime live-sync**: um device com a aba aberta não recebe mudanças do outro em tempo real — só no próximo sync (montagem, reconexão, mutação ou `visibilitychange`). Realtime permanece fora de escopo.
7. **Sem indicador de status de sync na UI**: nenhum badge/spinner "sincronizando" é adicionado (padrão da LB-6 mantido).
8. **Suite de testes automatizados passando**: lógica de trigger/debounce testável em node/jsdom (sem depender de timers reais); RLS intacta; UI permanece isolada do storage/cloud.

---

## Notas para o 🤖 PD (design técnico)

- Esta spec fixa **negócio** (AC + UX). Decisões de implementação — debounce (janela, API: `setTimeout`/`useEffect`), wiring no `SyncController` (novo listener de `visibilitychange`, chamada de sync após mutação via o `store`), como o `store` notifica o controller de mutações (callback registrado vs. polling vs. event), e estrutura de testes (fake timers do vitest) — são do escopo do PD, respeitando: (i) a UI não muda (continua consumindo só o `store`); (ii) local-first preservado (sync nunca bloqueia a UI); (iii) sem realtime; (iv) testável em node/jsdom com `FakeCloudAdapter` e fake timers.
- O trigger pós-mutação deve ser **debounced** (janela curta, ex.: 1-2s) para agrupar múltiplas mutações rápidas em um único sync e evitar rajadas de RPC.
- O `visibilitychange` deve sincronizar só na transição para `visible` (não em `hidden`), e respeitar `navigator.onLine` (offline → no-op).
- O `SyncController` permanece o único componente autorizado a importar `supabase`; a UI de produto (`ListasIndex`, `ListaScreen`) permanece sem `supabase`/`localStorage`.