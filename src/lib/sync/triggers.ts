/**
 * Triggers de sync da LB-7 — lógica pura de debounce pós-mutação e de
 * `visibilitychange` → visible, extraída do `SyncController` para ser testável
 * em node/jsdom com fake timers (AC 8). Não importa React nem Supabase; toda a
 * temporização fica atrás de `schedule` e todo o acesso ao ambiente behind das
 * deps injetáveis (`isOnline`/`visibilityState`/`addEventListener`), permitindo
 * `vi.advanceTimersByTime(1500)` deterministicamente.
 *
 * Reutiliza o `sync()` existente (push+pull+merge por `updated_at`) — o bug da
 * LB-7 é ausência de gatilhos, não defeito no algoritmo. Ver
 * `docs/product/design/lb-7-sync-trigger.md`.
 */

/** Dependências de ambiente/temporização injetáveis para testabilidade. */
export interface SyncTriggerDeps {
  /** `() => navigator.onLine` (injetável p/ teste). */
  isOnline: () => boolean;
  /** `() => document.visibilityState` (injetável p/ teste). */
  visibilityState: () => string;
  /** `() => void sync()` da store (fire-and-forget; erros já engolidos no repo). */
  sync: () => void;
  /** `setTimeout`+`clearTimeout` resetável (fake timers). Retorna cancelador. */
  schedule: (fn: () => void, ms: number) => () => void;
  /** Registra listener em `document`/`window`; retorna dessubinscrição. */
  addEventListener: (type: string, cb: () => void) => () => void;
}

/** Triggers ativos de sync. `destroy` é idempotente. */
export interface SyncTriggers {
  /** Sinaliza que uma mutação ocorreu (store → aqui). Inicia/resseta o debounce. */
  notifyMutation: () => void;
  /** Desliga listeners e cancela o timer pendente. Idempotente. */
  destroy: () => void;
}

/** Janela do debounce trailing pós-mutação (1–2s da spec de negócio). */
export const DEBOUNCE_MS = 1500;

/** Agendador padrão: `setTimeout` resetável via `clearTimeout`. */
export function defaultSchedule(fn: () => void, ms: number): () => void {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
}

/**
 * Cria e ativa os triggers de sync da LB-7. Não chama `sync()` na ativação.
 * - `notifyMutation()`: debounce trailing de `DEBOUNCE_MS`; no-op offline
 *   (o `pending` persiste para o próximo gatilho).
 * - `visibilitychange` → `visible` + online: `sync()` direto (sem debounce).
 */
export function createSyncTriggers(deps: SyncTriggerDeps): SyncTriggers {
  let cancelTimer: (() => void) | null = null;

  const onVisibility = (): void => {
    if (deps.visibilityState() === "visible" && deps.isOnline()) deps.sync();
  };

  const notifyMutation = (): void => {
    if (!deps.isOnline()) return; // offline: não agenda (pending persiste)
    if (cancelTimer) cancelTimer();
    cancelTimer = deps.schedule(() => {
      cancelTimer = null;
      deps.sync();
    }, DEBOUNCE_MS);
  };

  const offVisibility = deps.addEventListener("visibilitychange", onVisibility);

  const destroy = (): void => {
    offVisibility();
    if (cancelTimer) {
      cancelTimer();
      cancelTimer = null;
    }
  };

  return { notifyMutation, destroy };
}