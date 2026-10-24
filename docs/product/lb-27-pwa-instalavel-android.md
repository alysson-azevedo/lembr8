# Spec LB-27 — PWA instalável no Android: ícones 192/512 + SW offline

**Issue:** [LB-27](https://linear.app/alysson-azevedo/issue/LB-27/pwa-instalavel-no-android-icones-192512-sw-offline) · **State:** 📝 Backlog (na escrita desta spec) · **Tipo:** 🔍 Melhoria · **Prioridade:** média
**Base:** estado atual do manifest (`src/app/manifest.ts`: ícones `/icon` 32×32 com `sizes: "any"` — falha no critério de installability do Chromium, que exige ícone ≥144px com tamanho declarado). Sem service worker, sem registro de SW, sem dependências PWA. Dados do app já são **local-first** (cache localStorage, LB-6/LB-8) — o offline de *dados* já existe; falta o offline do *shell*.

**Escopo desta spec:** negócio (instalabilidade, offline do shell, critérios de aceite). A spec de **design** (arquivos exatos, estratégias de cache do SW, safe zone do ícone maskable, ponto de registro, shape dos testes) é trabalho do 🤖 PD em `design/lb-27-*.md`.

---

## Decisões de escopo (confirmadas com o humano — 2026-10-24)

Os dois pontos abertos da issue ("ferramenta a definir na spec", "sequência do theme_color") foram escalados por envolverem stack; decisões registradas também em `docs/decisions.md` (ADR 2026-10-24).

1. **Service worker manual, zero dependências.** Sem serwist/next-pwa/Workbox — `public/sw.js` autocontido, sem integração de build (Turbopack é o default do Next 16; `@serwist/next` é webpack-based). Estratégia mínima que satisfaz os ACs: **precache** do shell na instalação (`/`, `/login`, ícones, manifest) · **cache-first** para imutáveis (`/_next/static/`, ícones) · **network-first** para navegações (HTML) com fallback ao cache · `/api/*` **network-only**. O offline de dados não depende do SW (localStorage local-first já cobre).
2. **Cores do manifest = paleta JuxTheme já nesta issue.** `background_color`/`theme_color` = `#1c1c23` (splash e barra standalone dark), alinhadas à LB-21 (aprovada, em 🚀 Ready for Deploy — chegará à produção antes da LB-27). Efeito transitório aceito: se o preview desta issue subir antes do deploy da LB-21, o preview fica claro com manifest dark (cosmético, sem AC impactado). Mantê-las `#ffffff` exigiria issue follow-up só para trocar dois hex (LB-21 excluiu manifest do escopo dela).
3. **Ícones estáticos PNG em `public/`** com tamanho real declarado no manifest: **192×192** (any), **512×512** (any) e **512×512** (maskable). Arte é o 💭 atual (redesign fora de escopo); maskable recebe fundo sólido para sobreviver ao recorte circular do Android (detalhe na spec de design).
4. **Registro do SW somente em produção** (`NODE_ENV === 'production'`), com guard para browsers sem suporte — sem erro no console onde não há suporte, sem interferir no `next dev`.
5. **Tipo/prioridade:** 🔍 Melhoria, prioridade **média** (feedback direto do dono, desbloqueia o caso de uso core do produto — usar no mercado sem sinal).

## Fora de escopo (issues futuras — limitação aceita)

- **Botão "Instalar app" custom** via `beforeinstallprompt` (follow-up possível).
- **Web Push / notificações** — feature própria futura; o SW desta issue é o alicerce, mas push não entra aqui.
- **Redesenho de ícone/logo** — 💭 mantido, apenas nos tamanhos corretos.
- **Splash/manifest iOS** além do `apple-icon` existente (180×180 via `app/apple-icon.tsx`).
- **Precache de páginas internas** (`/listas/[id]`) — navegações offline caem no fallback do shell; refinar depois se fizer falta.
- **UI de "atualização disponível"** — o SW atualiza pelo versionamento de cache padrão; não há aviso ao usuário.

---

## Problema

No Chrome/Brave Android o site só oferece **"criar atalho"** — não instala como app. O Chromium exige ícone **≥144px com tamanho declarado** no manifest para o critério de instalabilidade; hoje o manifest aponta `/icon` (PNG 32×32 gerado por `src/app/icon.tsx`, declarado `sizes: "any"`) — DevTools → Application → Manifest mostra a falha. Além disso, sem service worker não há offline do shell (cenário core: abrir a lista no mercado sem sinal) e as notificações Web Push previstas na stack o exigirão.

## Valor para o usuário

Instalar o Lembr8 como **app** na homescreen do Android (ícone, splash, standalone fullscreen — sem barra de navegador) e abri-lo **sem sinal**, com a lista e o histórico local disponíveis. Desbloqueia o caso de uso central do produto (preparar em casa, usar no mercado).

## Caso de uso de referência

O usuário instala o app pela primeira vez em casa (Wi-Fi). No mercado, sem sinal, abre o app pelo ícone: o shell abre standalone, a lista carrega do cache local, ele marca itens e cria novos — tudo como no uso online, pois a UI é local-first. Ao reconectar, o sync da LB-6/LB-7 reconcilia com o cloud.

---

## Escopo de negócio

### Manifest (instalabilidade)
- Ícones declarados com **tamanho real**: 192×192 (purpose `any`), 512×512 (`any`) e 512×512 (`maskable`), servidos como estáticos de `public/`.
- `theme_color` e `background_color` = `#1c1c23` (decisão 2).
- Demais campos inalterados: `name`/`short_name`/`description`/`start_url: "/"`/`display: "standalone"`.
- `/icon` (favicon 32×32) e `/apple-icon` (iOS 180×180) continuam existindo para os papéis de hoje (favicon/touch icon) — saem apenas do manifest.

### Ícones
- Mesma arte do app (💭), fundo transparente nas variantes `any`; maskable com fundo sólido `#1c1c23` e conteúdo dentro da safe zone (recorte do Android).
- Arquivos nomeados e versionáveis; regeneráveis por script (sem arte manual).

### Service worker (offline do shell)
- **Na instalação:** precache de `/` e `/login` (shells HTML), ícones e manifest.
- **Navegações (HTML):** network-first com fallback ao cache — offline abre a última shell visitada (ou o fallback `/`).
- **Estáticos imutáveis** (`/_next/static/`, ícones, manifest): cache-first.
- **`/api/*`:** network-only (o app é local-first; nada de cache de API).
- **Dados do usuário:** fora do SW — continuam no cache localStorage (LB-6/LB-8), inalterados.
- Ativação limpa caches antigos (versionamento de cache); sem UI visível — o SW é invisível para o usuário.

### Registro
- Client component monta no layout raiz; registra `/sw.js` apenas em produção; browsers sem `serviceWorker` seguem funcionando sem erro de console.

---

## Critérios de aceite (testáveis)

1. **"Instalar app" no Android:** menu (⋮) do Chrome e do Brave Android mostra **"Instalar app"** (não só "criar atalho"); instala e abre standalone, sem barra de navegador. (QA manual no preview de produção, device Android.)
2. **Installability sem erros:** DevTools → Application → Manifest não acusa falha de installability; ícones 192/512/maskable resolvidos. (QA manual + teste automatizado do manifest.)
3. **Offline:** com o app instalado e offline, o shell abre e os dados do cache local continuam acessíveis (listar, criar e marcar itens funcionam offline como hoje). (QA manual: DevTools offline ou modo avião.)
4. **SW em produção:** registra e ativa sem erro no console; em browsers sem suporte, nenhum erro. (QA manual no preview.)
5. **Manifest declara tamanhos reais:** `icons` contém 192×192 `any`, 512×512 `any` e 512×512 `maskable`; `theme_color`/`background_color` `#1c1c23`. (Teste automatizado: campos do manifest + dimensões reais dos PNGs parseadas do header IHDR.)
6. **Registro guardado:** componente de registro só chama `navigator.serviceWorker.register` em produção e com suporte. (Teste automatizado: suporte/nodo de ambiente/nenhuma chamada.)
7. **Suite completa passando** (`vitest`), `typecheck` e `lint` verdes.

---

## Notas para o 🤖 PD (design técnico)

- Touch points prováveis: `src/app/manifest.ts` (ícones/cores), novos `public/icons/icon-{192,512,maskable-512}.png` + script de geração (reaproveitar a arte de `src/app/icon.tsx` via `next/og` `ImageResponse`), `public/sw.js`, novo `src/components/pwa/ServiceWorkerRegister.tsx` montado no `src/app/layout.tsx`, `tests/` (manifest, PNG IHDR, guard do registro).
- Decisões de design a registrar na spec: safe zone do maskable (padding %, cor de fundo), proporção do emoji, estratégia exata de cache por tipo de request (tabela), lista de precache, esquema de versionamento de cache (`lembr8-v<N>` + cleanup no `activate`), fallback de navegação offline, e onde o registro vive.
- O SW não deve cachear respostas de `/api/` nem leituras do Supabase; RLS/auth inalterados.
- **Versionamento:** MINOR bump na promoção para `main` (nova funcionalidade retrocompatível: instalável + offline; não é bugfix).
