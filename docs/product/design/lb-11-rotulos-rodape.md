# Spec de design — LB-11: Mover rótulos de ambiente/build para o rodapé

**Issue:** [LB-11](https://linear.app/alysson-azevedo/issue/LB-11/mover-rotulos-de-ambientebuild-para-o-rodape) · **State:** ✅ Deployed (v0.5.1) · **Tipo:** 🔍 Melhoria
**Base:** LB-5 (shell autenticado, ✅ Deployed). Arquivos afetados: `src/app/(app)/layout.tsx` (único). Sem mudança em `src/lib/build-info.ts`, `src/app/layout.tsx`, `/login`, nem em componentes/rotas.

Frontend/layout apenas. Sem mudança de funcionalidade, de conteúdo dos rótulos, nem da fonte de dados (`getBuildInfo()` intocada — critério 3 da issue). Sem novos componentes, tokens de cor ou fontes. **Sem indicador de UI novo** — só reposiciona o bloco já existente.

## Diagnóstico do estado atual

Renderização atual (`src/app/(app)/layout.tsx:31-34`): o bloco `mt-8 space-y-1 font-mono text-[0.8rem] text-muted` com duas linhas `<p>` (Ambiente/Build) está **dentro** do container centrado `max-w-[28rem]`, logo abaixo de `{children}`. Ocupa espaço vertical no fluxo de conteúdo da rota e destoa do conteúdo funcional (listas/itens).

Estrutura do shell autenticado hoje:
- `<main className="min-h-dvh flex items-start justify-center sm:items-center">` — centra o conteúdo verticalmente no desktop.
- Container interno `w-full max-w-[28rem] px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]` — já respeita safe-area top/bottom (LB-4).
- Raiz (`src/app/layout.tsx`): `<body className="min-h-full flex flex-col">`; `viewport` com `viewportFit: "cover"` já exportado (LB-4).

## Princípios

1. **Fora do fluxo de conteúdo principal**: o rodapé sai do container `max-w-[28rem]` e passa a ser irmão dele, na base do `<main>` — não ocupa mais espaço vertical no fluxo da rota.
2. **Reutilizar o design system existente**: `font-mono`, `text-muted` (token `--muted`, já com variante dark), `env(safe-area-inset-bottom)`, `max-w-[28rem]` para o alinhamento horizontal. Zero novos tokens/componentes.
3. **Discreto e estável**: fonte pequena (`text-[0.8rem]`), cor muted, fixo na base — visível sem competir com o conteúdo. Não empurra nem sobrepõe o conteúdo principal (critério 4).
4. **Mínimo que entrega valor**: uma única mudança de layout no `(app)/layout.tsx`. Sem sticky, sem `fixed`, sem JS de cliente, sem observer de altura.

## Especificação

### 1. Reestruturação do `<main>` (`src/app/(app)/layout.tsx`)

Trocar o `<main>` de centralizador único para **coluna flex** com o conteúdo ocupando o espaço livre e o rodapé na base. O `<main>` passa a ser o **único** wrapper de conteúdo e rodapé; o container `max-w-[28rem]` continua sendo o wrapper do conteúdo da rota (sem o bloco Ambiente/Build dentro dele).

Layout atual → novo:

```
<main min-h-dvh flex items-start justify-center sm:items-center>          <main min-h-dvh flex flex-col>
  <div max-w-[28rem] ...>                                                    <div max-w-[28rem] flex-1 ... flex items-start
    {children}                                                                justify-center sm:items-center self-center w-full>
    <div mt-8 ...>Ambiente/Build</div>  ← remove daqui                          {children}
  </div>                                                                       </div>
  <SyncController/>                                                          <Footer Ambiente/Build/>  ← fora do container
</main>                                                                       <SyncController/>
                                                                            </main>
```

Classes do `<main>`: `min-h-dvh flex flex-col` (substitui `items-start justify-center sm:items-center`, que sobe para o wrapper do conteúdo).

### 2. Wrapper de conteúdo (preserva o centro do desktop)

O `<div>` interno passa a centralizar verticalmente o conteúdo da rota no desktop e a crescer para preencher o espaço acima do rodapé:

```tsx
<div className="flex-1 w-full max-w-[28rem] px-6 pt-[max(1.5rem,env(safe-area-inset-top))] self-center flex items-start justify-center sm:items-center">
  {children}
</div>
```

- `flex-1`: ocupa o espaço vertical livre, empurrando o rodapé para a base quando o conteúdo é curto; quando o conteúdo é alto, a página cresce e rola naturalmente (rodapé no fim, sem sobreposição).
- `self-center`: mantém a largura `max-w-[28rem]` centralizada horizontalmente dentro do `<main>` (coluna flex).
- O `pb-[max(1.5rem,env(safe-area-inset-bottom))]` **sai** do container de conteúdo e vai para o rodapé (item 3) — o conteúdo não precisa mais de padding inferior próprio, pois o rodapé abaixo já provê o respiro da safe area. Mantém apenas `px-6` + `pt-[max(1.5rem,env(safe-area-inset-top))]`.

### 3. Rodapé Ambiente/Build (fora do container, na base)

Novo bloco **irmão** do container de conteúdo, **depois** dele e antes do `<SyncController/>`. Reutiliza exatamente as classes já usadas pelo bloco atual (`font-mono`, `text-[0.8rem]`, `text-muted`):

```tsx
<footer className="w-full max-w-[28rem] self-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center font-mono text-[0.8rem] text-muted">
  <p className="flex flex-wrap justify-center gap-x-2 gap-y-0.5">
    <span>Ambiente: {environment}</span>
    <span aria-hidden="true" className="opacity-50">·</span>
    <span>Build: {commit}</span>
  </p>
</footer>
```

Detalhes de design (todas decisões de layout, não de arquitetura):

- **Elemento `<footer>`** (semântico, discreto; **não** é um novo componente — é markup local do layout).
- **Separação entre os rótulos**: linha única com separador `·` (middot) entre "Ambiente" e "Build", em `<span aria-hidden>` com `opacity-50` para ficar ainda mais discreto que o texto. Em viewport estreito, `flex-wrap` deixa o Build cair para a segunda linha sem quebrar o label (cada `<span>` é atômico).
- **Alinhamento**: `text-center` + `justify-center` no `<p>` — o rodapé fica centralizado horizontalmente, alinhado ao container `max-w-[28rem]` acima (mesma largura via `max-w-[28rem] self-center px-6`).
- **Estilo discreto**: `font-mono text-[0.8rem] text-muted` (idêntico ao bloco atual — preserva a estética de diagnóstico de QA/dev). Sem hover, sem borda, sem fundo.
- **Safe area inferior**: `pb-[max(1.5rem,env(safe-area-inset-bottom))]` — em desktop `env()` = 0 → respiro de `1.5rem`; em mobile respeita o home indicator (critério 4). Como o rodapé está no fluxo (não `fixed`/`sticky`), ele **não sobrepõe** o conteúdo — apenas termina a página com o respiro correto.
- **Sem padding superior próprio**: o `flex-1` do container de conteúdo já garante o afastamento vertical do rodapé quando o conteúdo é curto; quando é alto, o fim do conteúdo + o rodapé ficam naturalmente separados pelo fluxo. (Se o DEV quiser um respiro extra consistente, pode adicionar `pt-2` ao `<footer>` — opcional, não obrigatório para o critério de aceite.)
- **`max-w-[28rem] self-center px-6`**: espelha a largura/centro do container de conteúdo, mantendo o rodapé alinhado à coluna de conteúdo no desktop (não estica de borda a borda).

### 4. Ordem no `<main>`

```tsx
<main className="min-h-dvh flex flex-col">
  <div className="...container de conteúdo...">{children}</div>
  <footer className="...rodapé Ambiente/Build...">...</footer>
  <SyncController />
</main>
```

- `getBuildInfo()` continua sendo chamado uma vez no topo do componente (sem mudança de lógica) e `{environment}` / `{commit}` alimentam o `<footer>`.
- `<SyncController/>` permanece como último filho, fora do fluxo visível (já é hoje).

### 5. Escopo garantido (não muda)

- `/login` (`src/app/login/`): **não** recebe o rodapé — não está no grupo `(app)`, tem layout próprio. (Critério 2.)
- `getBuildInfo()` (`src/lib/build-info.ts`): intocada; `tests/build-info.test.ts` continua passando. (Critério 3/5.)
- Raiz `src/app/layout.tsx`: sem mudança (viewport/safe-area já configurados na LB-4).
- Não adicionar versão SemVer nem novo rótulo. (Fora de escopo.)

## Trade-offs (decisões de design, não arquitetura)

1. **Rodapé no fluxo (A, recomendado) vs. `fixed` na base (B).**
   - **A (flex-col + `flex-1`):** rodapé fica na base do viewport quando o conteúdo é curto e no fim da página quando é alto; rola junto; nunca sobrepõe o conteúdo. Zero risco de sobreposição, sem JS, sem lidar com `visualViewport`.
   - **B (`fixed bottom-0`):** sempre visível, mas sobrepõe o conteúdo em listas longas (precisaria de padding-bottom dinâmico no conteúdo e de observar o teclado/mobile — complexidade e risco de regressão).
   - **Recomendação: A.** Cumpre o critério 4 ("não sobrepõe nem empurra o conteúdo") no sentido literal e mais seguro. O diagnóstico de ambiente/build só precisa estar acessível, não sempre colado à tela.

2. **Um rótulo por linha (A, atual) vs. linha única com separador (B, recomendado).**
   - **A:** duas linhas `<p>` — ocupa mais altura de rodapé.
   - **B:** linha única com `·`, `flex-wrap` para telas estreitas — mais compacto, mais discreto, alinhado ao caráter de diagnóstico secundário.
   - **Recomendação: B.** Reduz o ruído visual (próprio objetivo da issue) mantendo os mesmos textos/origem de dados.

3. **Largura do rodapé — `max-w-[28rem]` alinhado ao conteúdo (A, recomendado) vs. full-width de borda a borda (B).**
   - **A:** espelha o container de conteúdo → rodapé alinhado à coluna central, visual coeso no desktop.
   - **B:** rodapé esticado de ponta a ponta → destoa da coluna central `max-w-[28rem]` e chama mais atenção (contrário do "discreto").
   - **Recomendação: A.**

## Critérios de aceite (para DEV/QA)

1. Os rótulos "Ambiente" e "Build" (valores atuais de `getBuildInfo()`) são renderizados num `<footer>` **fora** do container `max-w-[28rem]` do conteúdo da rota — o container de conteúdo não contém mais o bloco Ambiente/Build.
2. O rodapé aparece em todas as rotas do grupo `(app)` (`/` e `/listas/[id]`); **não** aparece em `/login`.
3. Conteúdo e origem dos dados dos rótulos permanecem iguais: `getBuildInfo()` sem alteração de lógica — apenas o layout/posicionamento mudam.
4. Em viewport móvel (ex.: 390×844, iPhone 14), o rodapé respeita `env(safe-area-inset-bottom)` (não cola no home indicator) e não sobrepõe nem empurra o conteúdo principal; com conteúdo curto, o rodapé fica na base do viewport; com conteúdo alto, a página rola e o rodapé aparece ao final.
5. `tests/build-info.test.ts` continua passando (lógica de `getBuildInfo` intocada).
6. Sem regressão em desktop: card `max-w-[28rem]` centralizado permanece, rodapé alinhado à mesma coluna, paleta `text-muted`/`font-mono` inalterada.

## Out of scope (mesmos da issue)

- Rótulo de versão SemVer na UI (hoje não existe; issue separada).
- Exibir os rótulos na tela de `/login`.
- Mudar a lógica ou a fonte de dados de `getBuildInfo()`.
- Alterar rótulos em e-mails ou telas não autenticadas.
- Novos componentes de design system, novos tokens de cor/fonte, animações ou indicadores de UI.