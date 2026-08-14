import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSyncTriggers,
  DEBOUNCE_MS,
  type SyncTriggerDeps,
} from "@/lib/sync/triggers";

/**
 * Lógica de triggers de sync da LB-7 (AC 1, 2, 8) — pura, sem DOM real: todas
 * as deps (isOnline/visibilityState/schedule/addEventListener) são duplas
 * controláveis. Fake timers do vitest determinam o debounce de 1500ms.
 */

/** Dupla de deps com estado controlável e registro de chamadas. */
function makeDeps(overrides: Partial<SyncTriggerDeps> = {}) {
  const syncCalls: number[] = [];
  let online = true;
  let visibility = "visible";
  const listeners = new Map<string, () => void>();

  const deps: SyncTriggerDeps = {
    isOnline: () => online,
    visibilityState: () => visibility,
    sync: () => {
      syncCalls.push(Date.now());
    },
    schedule: (fn, ms) => {
      const h = setTimeout(fn, ms);
      return () => clearTimeout(h);
    },
    addEventListener: (type, cb) => {
      listeners.set(type, cb);
      return () => listeners.delete(type);
    },
    ...overrides,
  };

  return {
    deps,
    syncCalls,
    setOnline: (v: boolean) => (online = v),
    setVisibility: (v: string) => (visibility = v),
    dispatchVisibility: () => listeners.get("visibilitychange")?.(),
    isListening: () => listeners.has("visibilitychange"),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("DEBOUNCE_MS (contrato)", () => {
  it("é 1500ms (janela 1–2s da spec de negócio)", () => {
    expect(DEBOUNCE_MS).toBe(1500);
  });
});

describe("notifyMutation — debounce trailing (AC 1)", () => {
  it("não chama sync() imediatamente", () => {
    const t = makeDeps();
    const triggers = createSyncTriggers(t.deps);
    triggers.notifyMutation();
    expect(t.syncCalls).toHaveLength(0);
    triggers.destroy();
  });

  it("dispara 1 sync() após advanceTimersByTime(1500)", () => {
    const t = makeDeps();
    const triggers = createSyncTriggers(t.deps);
    triggers.notifyMutation();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(t.syncCalls).toHaveLength(1);
    triggers.destroy();
  });

  it("3 notifyMutation consecutivas → 1 único sync() após 1500", () => {
    const t = makeDeps();
    const triggers = createSyncTriggers(t.deps);
    triggers.notifyMutation();
    triggers.notifyMutation();
    triggers.notifyMutation();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(t.syncCalls).toHaveLength(1);
    triggers.destroy();
  });

  it("nova notifyMutation antes de 1500 reseta o timer (não dispara cedo)", () => {
    const t = makeDeps();
    const triggers = createSyncTriggers(t.deps);
    triggers.notifyMutation();
    vi.advanceTimersByTime(DEBOUNCE_MS - 200); // quase
    expect(t.syncCalls).toHaveLength(0);
    triggers.notifyMutation(); // reseta
    vi.advanceTimersByTime(DEBOUNCE_MS - 200); // passaría do tempo original
    expect(t.syncCalls).toHaveLength(0);
    vi.advanceTimersByTime(200); // completa a nova janela
    expect(t.syncCalls).toHaveLength(1);
    triggers.destroy();
  });
});

describe("notifyMutation offline — no-op (AC 3)", () => {
  it("offline não agenda sync (pending persiste)", () => {
    const t = makeDeps();
    t.setOnline(false);
    const triggers = createSyncTriggers(t.deps);
    triggers.notifyMutation();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    expect(t.syncCalls).toHaveLength(0);
    triggers.destroy();
  });
});

describe("visibilitychange → visible (AC 2)", () => {
  it("visible + online → sync() imediato (sem debounce)", () => {
    const t = makeDeps();
    t.setVisibility("visible");
    const triggers = createSyncTriggers(t.deps);
    t.dispatchVisibility();
    expect(t.syncCalls).toHaveLength(1);
    triggers.destroy();
  });

  it("hidden → sync() NÃO chamado", () => {
    const t = makeDeps();
    t.setVisibility("hidden");
    const triggers = createSyncTriggers(t.deps);
    t.dispatchVisibility();
    expect(t.syncCalls).toHaveLength(0);
    triggers.destroy();
  });

  it("visible + offline → sync() NÃO chamado", () => {
    const t = makeDeps();
    t.setVisibility("visible");
    t.setOnline(false);
    const triggers = createSyncTriggers(t.deps);
    t.dispatchVisibility();
    expect(t.syncCalls).toHaveLength(0);
    triggers.destroy();
  });
});

describe("destroy (limpeza)", () => {
  it("cancela timer pendente — sync() não chamado após destroy", () => {
    const t = makeDeps();
    const triggers = createSyncTriggers(t.deps);
    triggers.notifyMutation();
    triggers.destroy();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    expect(t.syncCalls).toHaveLength(0);
  });

  it("remove listener de visibilitychange — sync() não chamado após destroy", () => {
    const t = makeDeps();
    t.setVisibility("visible");
    const triggers = createSyncTriggers(t.deps);
    triggers.destroy();
    expect(t.isListening()).toBe(false);
    t.dispatchVisibility();
    expect(t.syncCalls).toHaveLength(0);
  });

  it("é idempotente (chamar 2x não lança)", () => {
    const t = makeDeps();
    const triggers = createSyncTriggers(t.deps);
    expect(() => {
      triggers.destroy();
      triggers.destroy();
    }).not.toThrow();
  });
});

describe("isolamento — triggers é a única lógica de temporização", () => {
  it("schedule é a única fonte de setTimeout (sem timers diretos no módulo)", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/sync/triggers.ts", "utf8"),
    );
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    // defaultSchedule usa setTimeout, mas é a exportação injetável — o módulo
    // não chama setTimeout diretamente fora dela.
    const direct = (codeOnly.match(/\bsetTimeout\b/g) ?? []).length;
    expect(direct).toBe(1); // apenas em defaultSchedule
  });
});