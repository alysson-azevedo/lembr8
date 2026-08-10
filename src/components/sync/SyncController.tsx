"use client";

import { useEffect } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { resetForUser, sync } from "@/lib/todos/store";

/**
 * Wiring de lifecycle do sync (LB-6) — plumbing, sem UI visível (`return null`).
 * Único componente de produto autorizado a importar `supabase` (a UI de listas
 * permanece isolada do storage/cloud).
 *
 * Dispara `sync()` sempre que logado e online:
 *  - ao montar o app autenticado (se `navigator.onLine`);
 *  - no evento `online` (reconexão);
 *  - em `SIGNED_IN`/`INITIAL_SESSION` (`onAuthStateChange`) — `resetForUser`
 *    (isolamento por conta) + `sync()`;
 * Em `SIGNED_OUT` → `resetForUser(null)` (limpa o cache). `offline` não dispara
 * nada (continua no cache). Sem indicador de UI (padrão da spec de negócio).
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

    return () => {
      window.removeEventListener("online", onOnline);
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}