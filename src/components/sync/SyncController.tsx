"use client";

import { useEffect } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { resetForUser, subscribeToMutations, sync } from "@/lib/todos/store";
import { createSyncTriggers, defaultSchedule } from "@/lib/sync/triggers";

/**
 * Wiring de lifecycle do sync (LB-6 + LB-7) — plumbing, sem UI visível
 * (`return null`). Único componente de produto autorizado a importar `supabase`
 * (a UI de listas permanece isolada do storage/cloud).
 *
 * Dispara `sync()` sempre que logado e online:
 *  - ao montar o app autenticado (se `navigator.onLine`) — LB-6;
 *  - no evento `online` (reconexão) — LB-6;
 *  - em `SIGNED_IN`/`INITIAL_SESSION` (`onAuthStateChange`) — `resetForUser`
 *    (isolamento por conta) + `sync()` — LB-6;
 *  - Em `SIGNED_OUT` → `resetForUser(null)` (limpa o cache) — LB-6.
 *
 * Gatilhos novos (LB-7):
 *  - mutação online (create/rename/add/toggle) → `sync()` debounced (1500ms,
 *    trailing), via `subscribeToMutations`. No-op offline (pending persiste).
 *  - `visibilitychange` → visible + online → `sync()` (pull; sem debounce).
 *
 * Sem indicador de UI (padrão da spec de negócio).
 */
export function SyncController(): null {
  useEffect(() => {
    const supabase = getBrowserSupabase();

    if (navigator.onLine) void sync();

    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        const uid = session?.user?.id ?? null;
        if (uid) {
          resetForUser(uid);
          void sync();
        }
      } else if (event === "SIGNED_OUT") {
        resetForUser(null);
      }
    });

    // Gatilhos novos (LB-7) — debounce pós-mutação + visibility pull.
    const triggers = createSyncTriggers({
      isOnline: () => navigator.onLine,
      visibilityState: () => document.visibilityState,
      sync: () => void sync(),
      schedule: defaultSchedule,
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