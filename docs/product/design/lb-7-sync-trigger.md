# Spec de design técnico — LB-7: Disparo de sync pós-mutação e ao focar a aba (fix cross-device)

**Issue:** [LB-7](https://linear.app/alysson-azevedo/issue/LB-7/falha-na-sincronizacao-de-listas-entre-dispositivos) · **State:** 📑 Spec → 🚧 Dev in progress · **Tipo:** 🛠️ Bug
**Base:** LB-6 (✅ Deployed v0.4.1) — `SyncController` + `createLocalFirstRepository` + `sync()`/`resetForUser()`.

Spec de **negócio** (AC + UX): [`docs/product/lb-7-sync-trigger.md`](../lb-7-sync-trigger.md). ADRs: 2026-08-10 (arquitetura local-first). **Bugfix dentro da arquitetura da LB-6** — não reabre stack, schema, RPC, merge nem RLS. Esta spec define apenas **quando** o `sync()` existente passa a ser disparado.

Este documento define as decisões de **implementação** (debounce, wiring no `SyncController`, sinalização de mutação store→controller, testabilidade) suficientes para o 🤖 DEV implementar sem inventar. **Não reabre** decisões de arquitetura/produto já confirmadas.

---

## Princípios orientadores (herdados da LB-6)

1. **A UI não muda** — `ListasIndex.tsx`, `ListaScreen.tsx` e a API pública do `store` (`useListas`, `useLista`, `createList`, `renameList`, `addItemToLista`, `toggleItem`, `useHydrated`) continuam idênticas em assinatura e comportamento. A UI nunca chama o Supabase nem dispara sync explicitamente.
2. **Local-first** — toda mutação responde na hora do cache; o sync é best-effort em background e nunca bloqueia a UI.
3. **Sem realtime, sem indicador de UI** — mantidos fora de escopo.
4. **Reutilização, não reescrita** — o `sync()` (push+pull+merge por `updated_at`) e o `SyncController` da LB-6 **não são reescritos**: apenas recebem dois novos gatilhos. Lógica de merge, fila de `pending`, RPC `sync_push`, RLS e migração são intocadas.

---

## 1. Decisão central — reutilizar `sync()` para ambos os gatilhos

O `store.sync()` existente já faz **push do `pending` + pull/merge por `updated_at`** (ver `src/lib/todos/store.ts:154` e `repository.ts:702`), e já é no-op quando offline (`isOnline()`) ou sem adapter. Os dois novos gatilhos da LB-7 chamamam **o mesmo `sync()`** — não se criam `pushOnly()`/`pullOnly()`:

- **Gatilho pós-mutação (AC 1):** o objetivo é o flush do `pending` (push). Chamar `sync()` (push+pull) é correto e minimal: o pull que o acompanha é **idempotente** (merge por `updated_at`) e barato; não cria nova superfície de repo nem duplica lógica. Mutações rápidas são agrupadas pelo debounce (§2), então o pull extra não vira rajada.
- **Gatilho `visibilitychange` → visible (AC 2):** o objetivo é o pull. `sync()` faz pull (e um push vazio se `pending` estiver limpo — no-op prático).

**Justificativa da reutilização:** o bug da LB-7 é exclusivamente a **ausência de gatilhos**, não um defeito no algoritmo de sync. Adicionar gatilhos que chamam a função existente é o mínimo que entrega valor. Qualquer subdivisão push/pull seria invenção desnecessária e aumentaria a superfície de teste/RLS.

**Guarda costas de idempotência:** `sync()` já retorna `{pushed:0, pulled:0}` sem efeito se `!isOnline()` ou `adapter == null`; chamá-lo debounced/visível quando offline é seguro (no-op). `sync()` é safe to call concurrently — o `pending` é dedupado por `(kind,id)` e o merge é determinista por `updated_at`; no máximo há trabalho redundante descartável, nunca duplicata nem perda.

---

## 2. Debounce do gatilho pós-mutação

Janela: **1500 ms** (dentro do intervalo 1–2s da spec de negócio). Mecanismo: `setTimeout` simples, resetado a cada mutação (trailing debounce).

```
notifyMutation()                       // chamado pela store a cada mutação (§3)
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void sync()                         // push+pull, no-op se offline
  }, DEBOUNCE_MS)                       // 1500
```

**Decisões:**
- **Apenas trailing** (dispara após a janela de silêncio). Múltiplas mutações rápidas (digitar/ marcar vários itens) viram **um único** `sync()`. Sem leading edge — evitar rajada de RPC no início da digitação.
- **Respeita `navigator.onLine` indiretamente:** `sync()` é no-op offline, então agendar o timer é inofensivo; mas para não acumular timers à toa, `notifyMutation()` pode pular o agendamento quando `!isOnline()` (otimização, não correção — o `pending` permanece para o próximo gatilho). **Recomendado:** pular o `setTimeout` quando offline, para zero trabalho em background desnecessário.
- **Sem flush forçado no unmount:** o timer pendente é cancelado no `destroy()`; o `pending` persistido aguarda o próximo gatilho (reload/reconexão/visibilidade). Sem perda (está no `localStorage`).
- **Sem coalescência entre gatilhos:** o timer de mutação e o gatilho de `visibilitychange` são independentes (§4); ambos chamam `sync()`, que é idempotente.

**Por que 1500 ms e não 500:** agrupar rajadas típicas (marcar 5 itens em sequência, digitar um nome) em um único sync, reduzindo RPCs. 1500 cobre a janela de edição contínua sem parecer atraso ao outro device (o AC mede "após sync", não tempo real). Dentro do range 1–2s confirmado pelo humano.

---

## 3. Sinalização de mutação store → SyncController

A store é a única que sabe quando uma mutação ocorre. O `SyncController` precisa ser notificado. **Decisão: subscriber explícito na store** (não polling, não event global, não acoplar a `useSyncExternalStore`).

### Adição ao `store.ts`

Um segundo conjunto de ouvintes, separado dos `listeners` de render (que servem `useSyncExternalStore`):

```ts
const mutationListeners = new Set<() => void>();

/** Registra cb chamado ao final de toda mutação (create/rename/add/toggle).
 *  Usado pelo SyncController para o trigger debounced (LB-7). Não confundir
 *  com `listeners` (snapshot da UI). */
export function subscribeToMutations(cb: () => void): () => void {
  mutationListeners.add(cb);
  return () => mutationListeners.delete(cb);
}

function notifyMutations(): void {
  for (const cb of mutationListeners) cb();
}
```

Cada mutação existente passa a chamar `notifyMutations()` **logo após** `notify()` (criar/renomear/adicionar/alternar):

```ts
export function createList(): Lista {
  ...
  bumpVersion();
  notify();
  notifyMutations();   // ← novo
  return lista;
}
// idem em renameList, addItemToLista, toggleItem
```

`sync()` e `resetForUser()` **não** chamam `notifyMutations()` (não são mutações de UI; evita re-acionar o trigger em loop). `__resetListasStoreForTests()` ganha `mutationListeners.clear()`.

> **Por que subscriber e não callback injetado:** a store é um módulo singleton client-only (não um hook); um `subscribeToMutations` espelha o padrão `subscribe` já existente, mantém o SyncController desacoplado e é trivialmente testável (registra um spy). Alternativas rejeitadas: (a) o `SyncController` escutar `listeners` de `useSyncExternalStore` — esses disparam também em `sync()`/`resetForUser()` (não só mutação) e em qualquer mudança de versão, gerando falsos positivos e possível loop (sync→notify→trigger); (b) polling de `lastSyncAt`/`pending` — inventa estado só para deteção; (c) event bus global — acoplamento externo desnecessário.

---

## 4. Gatilho `visibilitychange` → visible (pull)

No `SyncController`, listener em `document`:

```
onVisibilityChange()
  if (document.visibilityState === 'visible' && navigator.onLine)
    void sync()            // pull (AC 2); no-op se já sincronizado/merge idempotente
```

**Decisões:**
- **Só na transição para `visible`** (não em `hidden`) — conforme spec de negócio. `document.visibilityState === 'visible'`.
- **Respeita `navigator.onLine`** — offline → no-op (não chama `sync()`). O `sync()` teria sido no-op de qualquer forma, mas pular evita o custo de uma chamada.
- **Sem debounce** (já é um evento esparso, no máximo uma vez por volta à aba). Chamada direta.
- **Sem throttle extra:** voltar à aba repetidamente dispara `sync()` a cada vez — aceitável (idempotente, esparso). Se o uso real mostrar fricção, throttle de ~5s pode ser proposto em issue futura; **não implementar aqui.**
- **Janela de montagem já coberta pela LB-6** (`if (navigator.onLine) void sync()` no mount) — mantida, sem mudança.

---

## 5. Wiring no `SyncController` (novo módulo de triggers testável)

Para que a lógica de debounce/visibility seja **testável em jsdom com fake timers** (AC 8), ela é extraída do componente React para um módulo puro injetável. O `SyncController` fica como wiring fino.

### Novo módulo `src/lib/sync/triggers.ts` (puro, sem React/Supabase)

```ts
export interface SyncTriggerDeps {
  isOnline: () => boolean;                 // () => navigator.onLine (injetável p/ teste)
  visibilityState: () => string;           // () => document.visibilityState
  sync: () => void;                        // () => void sync() da store
  schedule: (fn: () => void, ms: number) => () => void; // setTimeout+clear (fake timers)
  addEventListener: (type: string, cb: () => void) => () => void; // document/window
}

export interface SyncTriggers {
  /** Sinaliza que uma mutação ocorreu (store → aqui). Inicia/resseta o debounce. */
  notifyMutation: () => void;
  /** Desliga listeners e cancela o timer pendente. Idempotente. */
  destroy: () => void;
}

export const DEBOUNCE_MS = 1500;

/** Cria e ativa os triggers de sync da LB-7. Não chama sync() na ativação. */
export function createSyncTriggers(deps: SyncTriggerDeps): SyncTriggers {
  let cancelTimer: (() => void) | null = null;

  const onVisibility = () => {
    if (deps.visibilityState() === "visible" && deps.isOnline()) deps.sync();
  };

  const notifyMutation = () => {
    if (!deps.isOnline()) return;          // offline: não agenda (pending persiste)
    if (cancelTimer) cancelTimer();
    cancelTimer = deps.schedule(() => {
      cancelTimer = null;
      deps.sync();
    }, DEBOUNCE_MS);
  };

  const offVisibility = deps.addEventListener("visibilitychange", onVisibility);

  const destroy = () => {
    offVisibility();
    if (cancelTimer) { cancelTimer(); cancelTimer = null; }
  };

  return { notifyMutation, destroy };
}
```

> `schedule` default = `(fn, ms) => { const h = setTimeout(fn, ms); return () => clearTimeout(h); }`. Em testes, usa-se `vi.useFakeTimers()` e um `schedule` que delega ao `setTimeout` real (controlado pelo vitest) — ou injeta-se um dupla para asserções finas. O ponto é: **toda a lógica de temporização fica atrás de `schedule`**, sem `setTimeout` direto no módulo, permitindo `vi.advanceTimersByTime(1500)` deterministicamente.

### `SyncController.tsx` — wiring fino (reusa o existente + novos triggers)

```tsx
"use client";
import { useEffect } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { resetForUser, subscribeToMutations, sync } from "@/lib/todos/store";
import { createSyncTriggers, type SyncTriggers } from "@/lib/sync/triggers";

export function SyncController(): null {
  useEffect(() => {
    const supabase = getBrowserSupabase();

    // Gatilhos de montagem/online/auth (LB-6, mantidos) ..........................
    if (navigator.onLine) void sync();
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        const uid = session?.user?.id ?? null;
        if (uid) { resetForUser(uid); void sync(); }
      } else if (event === "SIGNED_OUT") {
        resetForUser(null);
      }
    });

    // Gatilhos novos (LB-7) — debounce pós-mutação + visibility pull ............
    const triggers = createSyncTriggers({
      isOnline: () => navigator.onLine,
      visibilityState: () => document.visibilityState,
      sync: () => void sync(),
      schedule: (fn, ms) => { const h = setTimeout(fn, ms); return () => clearTimeout(h); },
      addEventListener: (type, cb) => {
        document.addEventListener(type, cb);
        return () => document.removeEventListener(type, cb);
      },
    });
    const unsubMutations = subscribeToMutations(triggers.notifyMutation);

    return () => {
      window.removeEventListener("online", onOnline);
      sub.subscription.unsubscribe();
      unsubMutations();
      triggers.destroy();
    };
  }, []);

  return null;
}
```

**Notas de wiring:**
- A ordem de criação não importa; `triggers.destroy()` no cleanup cancela o timer e remove o listener de `visibilitychange`; `unsubMutations()` remove o subscriber da store.
- `sync: () => void sync()` envolve a async store em `void` (fire-and-forget, best-effort) — erros de rede já são engolidos pelo `catch` do `repo.sync()`.
- O `SyncController` permanece o **único** componente de produto autorizado a importar `supabase`; `triggers.ts` e `store.ts` **não** importam `supabase`.

---

## 6. Testabilidade (AC 8)

`environment: node` (vitest.config.ts). **jsdom** só onde necessário para `document`/`navigator` — os testes de triggers usam duplas injetadas, sem DOM real (o módulo é puro).

### Novo `tests/sync-triggers.test.ts` (lógica de triggers/debounce — node, fake timers)

```
vi.useFakeTimers()
- notifyMutation() não chama sync() imediatamente (debounce trailing).
- notifyMutation()×3 consecutivas → 1 sync() após advanceTimersByTime(1500).
- nova notifyMutation() antes de 1500 reset o timer (não dispara em 1500 do primeiro).
- isOnline()=false → notifyMutation() não agenda (sync() não chamado nem após 1500).
- visibilitychange→'visible' + online → sync() chamado imediatamente (sem debounce).
- visibilitychange→'hidden' → sync() NÃO chamado.
- visibilitychange→'visible' + offline → sync() NÃO chamado.
- destroy() cancela timer pendente (sync() não chamado após advanceTimers) e remove listener (nova dispatch de visibilitychange → sync() não chamado).
- DEBOUNCE_MS exportado e == 1500 (assert do contrato).
```
Usa duplas `isOnline`/`visibilityState` controláveis e um `schedule` que conta chamadas + um array `syncCalls`. Sem `setTimeout` real (fake timers do vitest). `vi.useFakeTimers()` / `vi.advanceTimersByTime` / `vi.clearAllTimers`.

### Estende `tests/todos.test.ts` (store: mutation listeners)
- `subscribeToMutations(cb)` é chamado a cada `createList`/`renameList`/`addItemToLista`/`toggleItem`.
- **Não** é chamado por `sync()` nem `resetForUser()` (evita loop).
- `__resetListasStoreForTests()` limpa os `mutationListeners`.
- Mantém o bloco de isolamento UI/store: `SyncController` continua sendo o único a importar `supabase`; `store.ts`/`triggers.ts` sem `supabase`.

### Estende `tests/listas.ui.test.tsx` (jsdom — wiring real do SyncController, opcional/light)
- Se houver harness de render do `SyncController` (jsdom com `document`/`navigator.onLine` stubados), um teste de smoke: mutação via store → após `advanceTimersByTime(1500)` → `sync()` observado (spy no `repo`). **Opcional** se o custo do harness for alto — a lógica está coberta em `sync-triggers.test.ts`; o wiring é trivial e lido por inspeção. Priorizar `sync-triggers.test.ts`.

### Não alterado
- `tests/sync.test.ts` (merge/pending/migração/isolamento) — intocado: o bug é de gatilho, não de algoritmo.
- `tests/rls.test.ts` — intocado: RLS e RPC `sync_push` não mudam.

### Onde cada teste vive
- `tests/sync-triggers.test.ts` (novo) — debounce + visibility (lógica pura, fake timers).
- `tests/todos.test.ts` (estendido) — `subscribeToMutations` na store.
- `tests/listas.ui.test.tsx` (opcional) — smoke do wiring.

---

## 7. Sem regressão + fora de escopo

- **Sem UI de produto:** nenhum componente de UI é criado/alterado; nenhum indicador de sync. `SyncController` segue `return null`.
- **Sem nova dependência:** `setTimeout`/`clearTimeout`, `document.visibilityState`, `navigator.onLine`, `addEventListener` — todos APIs nativas já usadas. Sem pacote novo, sem novo serviço, sem custo.
- **Sem realtime, sem delete, sem reordenação, sem compartilhamento** — mantidos fora de escopo.
- **Offline inalterado:** mutações continuam no cache; `online` event (LB-6) dispara sync ao reconectar; o novo debounce pula quando offline, sem mudar o fluxo.
- **Local-first e isolamento RLS preservados** — o trigger só adiciona momentos de chamada a `sync()`; nada no merge/cache/RLS.

---

## 8. Checklist de implementação (para o DEV)

- [ ] `src/lib/sync/triggers.ts` (novo): `createSyncTriggers(deps)`, `DEBOUNCE_MS = 1500`, tipos `SyncTriggerDeps`/`SyncTriggers`. Puro, sem React/Supabase/`setTimeout` direto (atrás de `schedule`).
- [ ] `src/lib/todos/store.ts`: `subscribeToMutations(cb)` + `notifyMutations()`; chamar `notifyMutations()` em `createList`/`renameList`/`addItemToLista`/`toggleItem` (não em `sync`/`resetForUser`); limpar em `__resetListasStoreForTests`.
- [ ] `src/components/sync/SyncController.tsx`: manter gatilhos LB-6; adicionar `createSyncTriggers({...browser deps...})` + `subscribeToMutations(triggers.notifyMutation)`; cleanup com `unsubMutations()` + `triggers.destroy()`.
- [ ] `tests/sync-triggers.test.ts` (novo): debounce trailing, reset, offline no-op, visibility visible/hidden/online/offline, destroy cancela+desliga, `DEBOUNCE_MS`. Fake timers.
- [ ] `tests/todos.test.ts` (estendido): `subscribeToMutations` dispara em mutações, não em sync/reset; reset de testes limpa listeners.
- [ ] (Opcional) `tests/listas.ui.test.tsx`: smoke do wiring em jsdom.
- [ ] `npm test` verde; PR referencia LB-7; anexar PR na issue (`orca linear attach`).