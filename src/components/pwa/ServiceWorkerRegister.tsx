"use client";
// Registra o service worker do shell offline (LB-27). Invisível: sem UI,
// só em produção (evita cache durante o next dev) e sem quebrar browsers
// sem suporte. Falha de registro vira warn, nunca unhandled rejection.
import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err: unknown) => console.warn("[sw] registro falhou:", err));
  }, []);
  return null;
}
