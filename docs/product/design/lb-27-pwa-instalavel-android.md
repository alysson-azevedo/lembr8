# Spec de design — LB-27: PWA instalável no Android (ícones 192/512 + SW offline)

**Issue:** [LB-27](https://linear.app/alysson-azevedo/issue/LB-27/pwa-instalavel-no-android-icones-192512-sw-offline) · **State:** ✅ Deployed (v0.10.0) · **Tipo:** 🔍 Melhoria · **Prioridade:** média
**Spec de negócio:** `docs/product/lb-27-pwa-instalavel-android.md` (ACs 1-7). **ADRs:** `docs/decisions.md` — 2026-10-24 (SW manual sem deps; manifest JuxTheme `#1c1c23`).

Arquivos atuais relevantes: `src/app/manifest.ts` (ícones `/icon` 32×32 `sizes: "any"` — falha installability), `src/app/icon.tsx` (favicon 32×32 via `next/og`), `src/app/apple-icon.tsx` (iOS 180×180), `src/app/layout.tsx` (metadata aponta `manifest: "/manifest.webmanifest"`), `public/` vazio.

---

## Princípios

1. **Delta mínimo, zero dependências:** nenhum package novo, nenhum build step. Ícones são PNGs estáticos em `public/`; SW é arquivo único autocontido em `public/sw.js`; registro é um client component sem UI.
2. **Dados fora do SW:** o app é local-first (localStorage, LB-6/LB-8) — o SW nunca cacheia `/api/*` nem respostas do Supabase; offline de *dados* continua resolvido pela camada existente.
3. **Invisível e inofensivo:** o SW não muda UX alguma; browsers sem suporte e `next dev` seguem 100% funcionais, sem erro no console.
4. **Versionamento simples de cache:** nomes de cache carregam `vN`; `activate` apaga caches fora da versão corrente. Assets do Next são hashados no URL (`/_next/static/...`), então `VERSION` só precisa mudar quando a lista de precache ou a lógica do SW mudarem.

---

## 1. Ícones estáticos (`public/icons/`)

| Arquivo | Tamanho | purpose | Fundo | Conteúdo |
| --- | --- | --- | --- | --- |
| `public/icons/icon-192.png` | 192×192 | any | transparente | 💭 em ~80% do canvas |
| `public/icons/icon-512.png` | 512×512 | any | transparente | 💭 em ~80% do canvas |
| `public/icons/icon-maskable-512.png` | 512×512 | maskable | sólido `#1c1c23` | 💭 em ~55% do canvas |

- **Maskable:** safe zone do Android = círculo de raio 40% (conteúdo deve caber num diâmetro de 80%); emoji em 55% centrado tem meia-diagonal ≈ 38,9% ≤ 40% ✓. Fundo sólido `#1c1c23` cobre qualquer recorte (círculo/squircle/retângulo) sem bordas transparentes.
- **"Any" 80%:** half-diagonal ≈ 56,6% — pode ter canto levemente cortado se o launcher recortar em círculo, mas `purpose: "any"` não é recortado (o Android usa o maskable para adaptive) — apenas mantém a proporção visual do favicon atual (26/32 ≈ 81%).
- **Geração:** script `scripts/generate-icons.ts` (executado com `npx tsx scripts/generate-icons.ts`) reutiliza a arte do `src/app/icon.tsx` via `ImageResponse` do `next/og` — mesmo componente visual, sem arte manual. PNGs são **commitados** (não gerados no build — build fica determinístico e o script é regeneração pontual).
- `/icon` (favicon 32) e `/apple-icon` (iOS 180) **continuam existindo** via file conventions para os papéis de hoje (favicon/touch icon) — saem apenas do manifest.

## 2. Manifest (`src/app/manifest.ts`)

```ts
background_color: "#1c1c23", // splash (JuxTheme — LB-21; ADR 2026-10-24)
theme_color: "#1c1c23",      // barra standalone
icons: [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
],
```

- Demais campos inalterados (`name`, `short_name`, `description`, `start_url: "/"`, `display: "standalone"`).
- **Entrada `/apple-icon` do manifest é removida**: iOS ignora webmanifest (usa `apple-icon` via metadata do `layout.tsx`, que fica); manifest lista exatamente os 3 ícones de installability.

## 3. Service worker (`public/sw.js`)

```js
// Lembr8 service worker (LB-27) — shell offline. Dados do app são local-first
// (localStorage) e NÃO passam por aqui. Bump VERSION quando a lista de
// precache ou esta lógica mudarem (assets /_next/static são hashados no URL).
const VERSION = "v1";
const SHELL_CACHE = `lembr8-shell-${VERSION}`;
const STATIC_CACHE = `lembr8-static-${VERSION}`;
const PRECACHE = [
  "/",
  "/login",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // network-only — nunca cache

  if (req.mode === "navigate") {
    // Network-first com fallback ao cache (última shell visitada → "/").
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match("/")),
        ),
    );
    return;
  }

  // Imutáveis (hash no URL) e ícones: cache-first com preenchimento runtime.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon" ||
    url.pathname === "/apple-icon" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
```

Decisões embutidas:
- **`skipWaiting` + `clients.claim`:** o SW assume o controle na mesma visita — os assets pedidos depois da ativação já passam pelo cache (a visita em que se instala acumula o shell). Troca de versão fica imediata e o `activate` limpa caches antigos.
- **Navegação `/listas/[id]` offline:** não está no precache; fallback = cache da última página visitada (`ignoreSearch` para variação de query) ou `/` (spec de negócio: "navegações offline caem no fallback do shell").
- **RSC/prefetch (`?_rsc`):** não interceptados (não são `mode: "navigate"`) — offline falham em silêncio; o shell HTML é o que importa.
- **Fallback `caches.match("/")`:** "/" é precached no install, então sempre há uma shell.

## 4. Registro (`src/components/pwa/ServiceWorkerRegister.tsx` + `layout.tsx`)

```tsx
"use client";
// Registra o service worker do shell offline (LB-27). Invisível: sem UI,
// só em produção (evita cache no next dev) e sem quebrar browsers sem suporte.
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
      .catch((err) => console.warn("[sw] registro falhou:", err));
  }, []);
  return null;
}
```

- Montado no `RootLayout` (`<body>` do `src/app/layout.tsx`, antes de `{children}`) — cobre `/login` e rotas autenticadas.
- Preview da Vercel builda com `NODE_ENV=production` → QA valida o SW no preview.
- Falha de registro vira `warn` (nunca unhandled rejection) — AC 4.

## 5. Testes (`tests/`)

- **`tests/manifest.test.ts`** (node puro):
  - `icons` contém exatamente 192×192 `any`, 512×512 `any`, 512×512 `maskable`, com `src` em `/icons/`;
  - cada `src` aponta para PNG existente em `public/` cujo header **IHDR** declara as dimensões reais (192/192, 512/512, 512/512) — parse big-endian dos bytes 16-24, sem deps de imagem;
  - `theme_color`/`background_color` = `#1c1c23`; `display: "standalone"`; `start_url: "/"`.
- **`tests/sw-register.ui.test.tsx`** (jsdom):
  - `NODE_ENV=production` + `navigator.serviceWorker.register` mockado → registra `/sw.js` uma vez;
  - `NODE_ENV` ≠ production → não registra;
  - sem `serviceWorker` no `navigator` → não lança, não registra;
  - `register` rejeita → `console.warn`, sem unhandled rejection.
- **`tests/sw.test.ts`** (node puro, guarda de regressão — lê `public/sw.js` como texto): define listeners `install`/`activate`/`fetch`; precache inclui `/` e `/login`; bypass de `/api/` (network-only); caches versionados (`lembr8-shell-v`/`lembr8-static-v`) e cleanup no `activate`.
- **Suite completa verde** (`npm test`) + `npm run typecheck` + `npm run lint`.

## 6. Documentação que acompanha o código

- **No PR:** `docs/product/lb-27-pwa-instalavel-android.md` + esta spec + ADR já commitados na branch.
- **No deploy (🚀 Ready for Deploy):** entrada da LB-27 em `docs/product/README.md` (instalável + offline, MINOR bump v0.10.0) e nota do SW manual em `docs/stack.md` (Web Push futuro herda o SW).

## 7. Resumo de decisões de design

| Decisão | Escolha |
| --- | --- |
| Ícones | PNGs estáticos commitados em `public/icons/` (192 any / 512 any / 512 maskable), regeneráveis via `scripts/generate-icons.ts` (`next/og`, arte 💭 de `icon.tsx`) |
| Maskable | fundo sólido `#1c1c23`, emoji 55% centrado (meia-diagonal 38,9% ≤ safe zone 40%) |
| Manifest | 3 ícones com `sizes` reais; `theme_color`/`background_color` `#1c1c23`; saída da entrada `/apple-icon` (iOS usa metadata, não manifest) |
| SW estratégia | precache `/`+`/login`+ícones+manifest · navegações network-first→cache fallback `/` · `/_next/static`+ícones cache-first · `/api/*` network-only |
| SW versionamento | caches `lembr8-{shell,static}-vN`; `activate` apaga os demais; bump manual de `VERSION` |
| Registro | client component sem UI no `RootLayout`; só `NODE_ENV=production`; guard de suporte; falha → `warn` |
| Dados | intocados — localStorage local-first; SW nunca cacheia `/api/*` |
| Schema/RLS/deps | Nenhuma mudança; zero packages novos |
| Bump de versão | **MINOR** (v0.10.0) na promoção para `main` |

## 8. Trade-offs

1. **Precache só de `/` e `/login`** (não de `/listas/[id]`): fallback cobre; precache de rotas dinâmicas adicionaria complexidade sem ganho real (spec de negócio aceita).
2. **Chunks do Next acumulados em runtime** (cache-first preenche conforme uso): a primeira visita online pós-instalação já popula o essencial; chunks lazy nunca requisitados podem faltar offline — visitas subsequentes acumulam. Aceito no volume do app; sem parser de HTML no SW (complexidade desnecessária agora).
3. **Remoção do `/apple-icon` do manifest**: neutro para iOS (não lê manifest) e deixa o manifest só com o que a installability usa — sem risco.
4. **`VERSION` manual no `sw.js`**: assets hashados tornam o bump raro (só muda se precache/lógica mudar); esquecer o bump não serve stale content (HTML é network-first online), só atrasa cleanup de caches velhos.
