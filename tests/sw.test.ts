// LB-27 — guarda de regressão do service worker (public/sw.js é JS puro,
// não importável como módulo; o comportamento real é validado pelo QA no
// preview — ver docs/product/design/lb-27-pwa-instalavel-android.md §5).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

describe("LB-27 — service worker", () => {
  it("registra os listeners install/activate/fetch", () => {
    expect(sw).toMatch(/addEventListener\("install"/);
    expect(sw).toMatch(/addEventListener\("activate"/);
    expect(sw).toMatch(/addEventListener\("fetch"/);
  });

  it("precacheia as shells (/ e /login), ícones e manifest", () => {
    for (const path of [
      "/",
      "/login",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-512.png",
      "/manifest.webmanifest",
    ]) {
      expect(sw, `precache: ${path}`).toContain(`"${path}"`);
    }
  });

  it("não intercepta /api/ (network-only — dados são local-first)", () => {
    expect(sw).toMatch(/pathname\.startsWith\("\/api\/"\)/);
  });

  it("usa caches versionados e limpa os antigos no activate", () => {
    expect(sw).toMatch(/lembr8-shell-\$\{VERSION\}/);
    expect(sw).toMatch(/lembr8-static-\$\{VERSION\}/);
    expect(sw).toMatch(/caches\.delete\(k\)/);
  });

  it("navegações caem no fallback da shell (/) quando offline", () => {
    expect(sw).toMatch(/req\.mode === "navigate"/);
    expect(sw).toMatch(/caches\.match\("\/"\)/);
  });
});
