# Spec de design — LB-17: Filtro de listas por nome + toggle "exibir arquivadas"

**Issue:** [LB-17](https://linear.app/alysson-azevedo/issue/LB-17/filtro-de-listas-por-nome-toggle-exibir-arquivadas) · **State:** 📑 Spec → 🚧 Dev in progress · **Tipo:** 🧹 Tarefa · **Prioridade:** baixa
**Base:** LB-5 (índice em `/`), LB-6 (Supabase + cache local-first, sync por `updated_at`), LB-7 (sync pós-mutação), LB-8 (menu overflow "⋮" no detalhe), LB-14 (índice com seções Fixadas/Demais por `pinned`, `listIndex()` ordena por `updated_at` desc).
**Dependência:** `blocked-by` LB-16 (Arquivar listas — introduz `archived_at` na tabela de listas e o estado arquivado). **A spec de design cobre ambos os controles**; a implementação é particionada — ver §7 (Decomposição vs. LB-16).
**Spec de negócio:** descrição da issue (PO já refinou — filtro por nome case-insensitive por substring + toggle "exibir arquivadas" default off com persistência em `localStorage`). **ADRs:** `docs/decisions.md`.

Esta spec fixa **design de UI/UX** (affordance do campo de filtro, localização/estilo do toggle, persistência da preferência, comportamento combinado dos dois filtros) para o DEV implementar sem inventar. Decisões de negócio/AC não se reabrem. **Forma do campo `archived_at` no schema**, **migration**, **RLS** e **sync/merge** são do 🤖 DEV (e em grande parte já decididos por LB-16) — esta spec define apenas o **contrato de leitura da UI** (o que a UI lê/chama) e o **comportamento visual**. **Sem** nova dependência (sem Radix/HeadlessUI), **sem** novo token de cor, **sem** confirmação/undo-toast (ação não destrutiva — apenas filtra a visualização).

Arquivos atuais relevantes: `src/components/listas/ListasIndex.tsx` (índice, alvo da feature), `src/components/listas/ListaScreen.tsx` (menu overflow "⋮" + `ConfirmDialog` — alvo do arquivar em LB-16), `src/lib/todos/{types,store,repository}.ts`, `src/app/globals.css` (tokens `--background/--foreground/--muted`).

---

## Princípios

1. **Reutilizar o padrão visual LB-2..LB-14**: paleta `--background/--foreground/--muted`, bordas `border-current/20`, divisores `divide-current/10`, alvos `min-h-11` (44px, LB-4), dark mode por `prefers-color-scheme`. Sem novos tokens de cor.
2. **Mínimo que entrega valor**: dois controles simples (input de busca + checkbox/toggle) no topo do índice, acima da lista. Sem dropdown, sem popover, sem modal. Os controles vivem sempre visíveis no índice (não no detalhe) — é onde o usuário olha quando quer encontrar uma lista.
3. **Filtragem é visual, não destrutiva**: filtrar não altera dados, não reordena, não fixa/desfixa. A lista filtrada é uma **view** sobre o `listIndex()` — a ordenação Fixadas→Demais por `updated_at` desc (LB-14) é preservada, apenas com linhas ocultas. Limpar os filtros restaura o índice completo sem recarregar.
4. **Preferência é local, não sincronizada**: o estado do toggle "exibir arquivadas" persiste em `localStorage` apenas — não vai ao Supabase, não é por conta, não é por device além do atual. É uma preferência de visualização, não um dado de produto (consistente com o fato de `pinned` em LB-14 ser persistido, mas diferente em escopo: `archived` é de LB-16; o toggle aqui só controla *se* mostramos arquivadas). O texto do filtro **não** persiste — não é uma preferência, é uma busca efêmera (some ao recarregar).
5. **Combinação AND**: os dois filtros combinam por AND lógico — "nome casa E (não-arquivada OU (arquivada E toggle on))". Sem OR implícito. Ver §3.
6. **UI isolada do storage**: a UI lê `listIndex()` (que já entrega ordenação LB-14) e filtra client-side; lê/escreve o toggle em `localStorage` via helper local (não via `store` — não é dado sincronizado). O filtro por nome é state React puro (não persiste).

---

## 1. Layout dos controles no índice (`/`) — `ListasIndex`

Os dois controles aparecem **acima** da lista (e do botão "Nova lista"), dentro do mesmo container `mt-6`. Eles só são renderizados quando há pelo menos uma lista (`listas.length > 0`) — em índice vazio, nem o campo nem o toggle aparecem (não há o que filtrar).

### 1.1 Ordem vertical (rework — affordance expansível, feedback PO)

Estado fechado (default — prioriza a lista):
```
[＋ Nova lista]  [🔍]               ← botão "Nova lista" + botão-ícone de filtro
[lista (índice)...]                 ← conteúdo prioritário
```

Estado aberto (filtro ativo — botão-ícone clicado):
```
[Campo de filtro por nome]  [✕]     ← input expansível + botão fechar
[☐ Exibir arquivadas]               ← novo (default off) — só aparece quando filtro aberto (PR2)
[lista filtrada...]                 ← renderização condicional
```

**Racional (feedback PO):** no mobile, o input sempre visível + botão "Nova lista" roubam espaço vertical da lista, que é o conteúdo prioritário. O botão-ícone de filtro (🔍) ocupa mínimo espaço quando fechado; ao clicar, expande o campo com animação. O toggle "Exibir arquivadas" (PR2) só aparece quando o filtro está aberto — evita ruído quando o usuário só quer navegar.

> **Nota:** o botão "Nova lista" compacto e o botão "Sair" → "[...]" são issues separadas (LB-19, LB-20) — fora do escopo de LB-17. Esta spec trata só do filtro.

### 1.2 Botão-ícone de filtro + campo expansível (rework)

#### 1.2.1 Botão-ícone (estado fechado)

Quando o filtro está fechado, um botão com ícone `🔍` fica no topo do índice, ao lado do botão "Nova lista". Alvo `min-h-11 min-w-11` (44px, LB-4). Clicar abre o campo de filtro com animação.

```tsx
<button
  type="button"
  onClick={() => setFiltroAberto(true)}
  aria-label="Abrir filtro por nome"
  aria-expanded={false}
  className="flex min-h-11 min-w-11 items-center justify-center text-base text-foreground hover:bg-current/5"
>
  <span aria-hidden="true">🔍</span>
</button>
```

#### 1.2.2 Campo expansível (estado aberto)

Quando `filtroAberto === true`, o botão-ícone é substituído por um `<input type="search">` que ocupa a largura total, com um botão `✕` à direita para fechar. Aparece com animação de altura/opacity (transition CSS curta, ~150ms).

```tsx
{filtroAberto ? (
  <div className="flex items-center gap-2">
    <input
      type="search"
      inputMode="search"
      autoFocus
      value={filtroNome}
      onChange={(e) => setFiltroNome(e.target.value)}
      placeholder="Filtrar por nome"
      aria-label="Filtrar listas por nome"
      className="flex-1 min-h-11 rounded border border-current/20 bg-background px-3 py-2 text-base text-foreground placeholder:text-muted"
    />
    <button
      type="button"
      onClick={() => { setFiltroAberto(false); setFiltroNome(""); }}
      aria-label="Fechar filtro"
      className="flex min-h-11 min-w-11 items-center justify-center text-base text-muted hover:text-foreground"
    >
      <span aria-hidden="true">✕</span>
    </button>
  </div>
) : null}
```

#### 1.2.3 Detalhes

- **`type="search"`** (não `text`): em mobile traz o botão "limpar" nativo no teclado e o ícone de lupa no iOS; em desktop alguns browsers renderizam um "✕" nativo no campo quando há texto. O `inputMode="search"` refina o teclado mobile.
- **`autoFocus`**: ao abrir, o campo recebe foco automaticamente (pronto para digitar —economiza um toque no mobile).
- **Placeholder** "Filtrar por nome" — descreve a ação, não um exemplo (mantém curto, cabe em mobile <320px sem truncar).
- **Estado:** dois states React locais: `filtroAberto: boolean` (default `false`) e `filtroNome: string` (default `""`). **Nenhum persiste** — recarregar a página volta ao estado fechado com campo vazio (busca efêmera por design — princípio 4).
- **Fechar o filtro limpa o texto:** clicar em `✕` faz `setFiltroAberto(false)` **e** `setFiltroNome("")` (voltar ao estado fechado não pode deixar filtro fantasma ativo). Pressionar `Escape` no campo também fecha e limpa (padrão de UX search).
- **Case-insensitive por substring** (AC 1): `lista.nome.toLowerCase().includes(filtroNome.trim().toLowerCase())`. Trim para ignorar espaços nas pontas; vazio após trim → casa tudo (sem filtro ativo).
- **Sem debounce**: a lista é client-side e pequena (dezenas de listas, não milhares); filtrar a cada keystroke é instantâneo.
- **Animação:** ao abrir/fechar, o container do filtro usa uma transition CSS curta (ex.: `transition-all duration-150` no `max-height`/`opacity`). Sem lib de animação. Sem animação no conteúdo da lista (ela só reage à filtragem).
- **Estilo:** `min-h-11` (44px, LB-4) no botão-ícone e no campo; `border-current/20`, `bg-background`, `text-foreground`, `placeholder:text-muted` — mesmos tokens existentes. Sem novo token.
- **Acessibilidade:** `aria-label` em ambos os botões ("Abrir filtro por nome" / "Fechar filtro"); `aria-expanded` no botão-ícone reflete o estado; `type="search"` anuncia "campo de busca" ao leitor de tela; `autoFocus` leva o foco ao campo ao abrir (leitor de tela anuncia o placeholder). Botões focáveis por teclado; `Escape` fecha o campo.

### 1.3 Toggle "Exibir arquivadas"

```tsx
<label className="mt-2 flex min-h-11 items-center gap-2 text-base text-foreground">
  <input
    type="checkbox"
    checked={exibirArquivadas}
    onChange={(e) => {
      const v = e.target.checked;
      setExibirArquivadas(v);
      persistirPreferenciaArquivadas(v);
    }}
    className="h-4 w-4"
  />
  Exibir arquivadas
</label>
```

Detalhes:
- **Checkbox nativo** (não switch/custom toggle): é o controle mais simples e acessível para um binário "mostrar também X". Sem dependência de lib. O label envolve o checkbox para aumentar a área de toque (clicar no texto também alterna — alvo efetivo `min-h-11` com `flex items-center`).
- **Default off** (AC): no primeiro render, lê de `localStorage`; se não houver valor salvo, `false`. Ver §4 (persistência).
- **Texto "Exibir arquivadas"** — curto, claro, descreve o que acontece quando ligado. Sem ícone (checkbox é o indicador visual de estado).
- **Estado:** React state local (`useState(false)` inicializado a partir de `localStorage` no cliente, após `hydrated`) + escrita imediata em `localStorage` no `onChange`.
- **Estilo:** `text-foreground` (mesmo padrão de texto de UI), `h-4 w-4` no checkbox (tamanho nativo padrão, suficiente dentro do alvo `min-h-11` do label).
- **Acessibilidade:** `<label>` envolvendo o `<input>` (associação implícita); leitor de tela anuncia "Exibir arquivadas, caixa de seleção, [marcada/desmarcada]". Sem `aria-label` extra (o texto do label já é o nome acessível).

### 1.4 Comportamento quando não há listas

Índice vazio (`listas.length === 0`): nem o botão-ícone de filtro, nem o campo (mesmo que aberto), nem o toggle, nem a lista são renderizados — só o botão "Nova lista" e o estado vazio existente ("Nenhuma lista ainda. Toque em 'Nova lista' para começar."). Filtros sem nada para filtrar seriam ruído.

---

## 2. Renderização da lista filtrada

A lista renderizada é o resultado de aplicar os dois filtros sobre `listIndex()`. A ordenação Fixadas→Demais por `updated_at` desc (LB-14) é **preservada** — a filtragem só remove linhas, não reordena.

### 2.1 Pipeline de filtragem

```tsx
const visiveis = useMemo(() => {
  const q = filtroNome.trim().toLowerCase();
  return listas.filter((l) => {
    const casaNome = q === "" || l.nome.toLowerCase().includes(q);
    const casaArquivadas = !l.archived || exibirArquivadas;
    return casaNome && casaArquivadas;
  });
}, [listas, filtroNome, exibirArquivadas]);
```

- **`casaNome`**: substring case-insensitive; `q === ""` short-circuit (sem custo de `includes` quando campo vazio).
- **`casaArquivadas`**: lista **não-arquivada** (`!l.archived`) sempre passa; lista **arquivada** só passa se toggle on. Quando LB-16 não estiver implementado, `l.archived` é sempre `false` (default do tipo) → nenhuma lista é filtrada por arquivamento → o toggle não tem efeito visível (mas continua funcional, só não muda nada até haver arquivadas).
- **`useMemo`**: evita refiltrar a cada render não relacionado (ex.: mudança de `hydrated`). Dependências mínimas: `listas`, `filtroNome`, `exibirArquivadas`.
- **`listas` já vem ordenado** de `useListas()` / `listIndex()` (LB-14) — a UI não ordena, só filtra. `visiveis` mantém a ordem de `listas`.

### 2.2 Renderização

Substituir `listas` por `visiveis` no `<ul>` existente. As seções Fixadas/Demais (LB-14) continuam particionadas por `pinned` **sobre `visiveis`** — i.e., filtrar não quebra as seções; uma fixada arquivada com toggle off some das Fixadas; uma fixada não-arquivada com filtro que casa continua nas Fixadas.

```tsx
{visiveis.length > 0 ? (
  <ul className="mt-4 divide-y divide-current/10">
    {visiveis.map((lista) => <Linha key={lista.id} lista={lista} />)}
  </ul>
) : hydrated ? (
  <p className="mt-4 text-base text-muted">
    Nenhuma lista encontrada com esse nome.
  </p>
) : null}
```

- **Estado vazio do filtro** (AC implícito): quando `visiveis.length === 0` mas `listas.length > 0` (ou seja, o filtro excluiu tudo), mostrar "Nenhuma lista encontrada com esse nome." — diferente do estado vazio do índice ("Nenhuma lista ainda..."), porque aqui o usuário tem listas, só não casam com o filtro. Texto em `text-muted` (mesmo padrão de mensagens secundárias).
- **Diferenciação do estado vazio:** o estado vazio do índice (`listas.length === 0`) continua sendo "Nenhuma lista ainda. Toque em 'Nova lista' para começar." (inalterado, LB-5/LB-14). O estado vazio do filtro (`listas.length > 0 && visiveis.length === 0`) é a nova mensagem acima. Os dois são mutuamente exclusivos — quando o índice está vazio, os controles não renderizam (§1.4), então a nova mensagem nunca aparece nesse caso.
- **Guard `hydrated`:** evita flash de "Nenhuma lista encontrada" antes da hidratação do cache local (mesmo padrão do índice atual — `hydrated && listas.length === 0`).

### 2.3 Pin no índice mantido (LB-14)

A `Linha` existente (LB-14) não muda — o 📌 indicador de fixada permanece. Filtrar não remove o pin visual. Uma lista fixada que não casa com o filtro some da view, mas volta (com pin) ao limpar o filtro.

---

## 3. Combinação dos dois filtros (AND)

A tabela verdade do que aparece no índice:

| Lista | `archived` | Toggle on? | Casa nome? | **Aparece?** |
| ----- | ---------- | ---------- | ---------- | ------------ |
| Ativa | `false` | qualquer | sim | **sim** |
| Ativa | `false` | qualquer | não | não |
| Arquivada | `true` | off | sim | não |
| Arquivada | `true` | on | sim | **sim** |
| Arquivada | `true` | on | não | não |
| Arquivada | `true` | off | não | não |

Lógica: `casaNome && (!l.archived || exibirArquivadas)` — AND entre os dois critérios. Sem OR implícito, sem comportamento surpresa.

**Interação com seções LB-14:** como `visiveis` é particionado por `pinned` depois de filtrado, uma fixada arquivada com toggle off some das Fixadas (a seção Fixadas pode ficar vazia e não renderizar — mesmo comportamento condicional de LB-14 §1.2). O header "Fixadas"/"Demais" continua aparecendo só quando ambas as seções têm conteúdo (sobre `visiveis`, não sobre `listas`).

> **Nota para o DEV:** a particionização Fixadas/Demais deve ser feita **sobre `visiveis`**, não sobre `listas`. Se a implementação atual particiona `listas` direto, ajustar para particionar `visiveis` — caso contrário, uma fixada arquivada com toggle off seria contada na seção Fixadas (header apareceria) mas não renderizada (lista vazia dentro da seção).

---

## 4. Persistência da preferência "exibir arquivadas"

### 4.1 Chave e formato

- **Chave:** `lembr8:preferencia:exibir-arquivadas` (namespace `lembr8:preferencia:` para futuras preferências de view; `:` como separador, padrão Next.js/localStorage).
- **Valor:** string `"1"` (on) / `"0"` (off). Não JSON (booleano serializado direto — mais simples, legível em DevTools). Ausência da chave = off (default).
- **Leitura:** função helper `lerPreferenciaArquivadas(): boolean` — `typeof window !== "undefined"` guard, `localStorage.getItem(chave) === "1"`. Chamada na inicialização do state (`useState(() => lerPreferenciaArquivadas())`), **após** `hydrated` ser true (evita mismatch SSR/hidratação — ver §4.3).
- **Escrita:** função helper `persistirPreferenciaArquivadas(v: boolean): void` — `localStorage.setItem(chave, v ? "1" : "0")`. Chamada no `onChange` do toggle. `try/catch` silencioso (quota cheia ou modo privado não quebram a UI — a preferência só não persiste).

### 4.2 Onde vivem os helpers

Helpers locais em `ListasIndex.tsx` (ou em `src/lib/todos/preferences.ts` se o DEV preferir extrair — fica a critério do DEV, desde que a UI importe e chame só essas funções). **Não** vão no `store` — o `store` é a camada de dados sincronizada (LB-6/LB-7); preferência de view não é sincronizada (princípio 4). Misturar seria responsabilidade errada.

### 4.3 SSR / hidratação

- O `ListasIndex` já usa `useHydrated()` (LB-6) para evitar mismatch entre render server (sem `localStorage`) e client. O toggle segue o mesmo padrão: state inicial `false` no server, e na primeira render pós-hidratação lê de `localStorage` e atualiza.
- **Implementação idiomática:** `const [exibirArquivadas, setExibirArquivadas] = useState(false);` + `useEffect(() => { setExibirArquivadas(lerPreferenciaArquivadas()); }, []);` — o `useEffect` roda só no client, após a montagem, evitando mismatch de hidratação (React não reclama de diff server⇄client). O toggle começa off no primeiro render e pode "flipar" para on após hidratação se a preferência era on — flash aceitável (toggle é pequeno, não é conteúdo principal).
- **Filtro por nome** não tem esse problema: começa vazio (server e client concordam) e só muda por input do usuário.

---

## 5. Estados

| Estado | Comportamento |
| ------ | ------------- |
| **Filtro fechado, sem texto** (default) | botão-ícone `🔍` visível; índice completo, só listas ativas (todas, se LB-16 não implementado); igual ao comportamento atual |
| **Filtro aberto, sem texto** | campo `type="search"` visível com `autoFocus`; índice completo (não filtra até digitar) |
| **Filtro aberto, texto ativo** | só listas cujo nome casa (case-insensitive, substring); ordenação Fixadas→Demais preservada sobre o subconjunto |
| **Filtro fechado via `✕`** | campo some (animação), `filtroNome` limpa, índice volta completo |
| **Filtro aberto, sem resultados** (`visiveis.length === 0`, `listas.length > 0`) | mensagem "Nenhuma lista encontrada com esse nome." em `text-muted` abaixo do campo aberto |
| **Índice vazio** (`listas.length === 0`) | nenhum controle renderizado (nem botão-ícone); estado vazio existente ("Nenhuma lista ainda...") |
| **Recarregar a página** | filtro volta fechado e vazio (não persiste) |
| **Offline** | filtro funciona sobre o cache local (client-side puro); sync ao reconectar (LB-6/LB-7) atualiza `listas` e a view reage |
| **LB-16 não implementado** | `archived` sempre `false` → toggle não tem efeito visível (PR2 pendente). O filtro por nome funciona normalmente. **Ver §7.** |

> Estados do toggle "exibir arquivadas" (PR2) detalhados em §3 — só relevantes quando LB-16 landar.

**Acessibilidade:** botão-ícone com `aria-label` ("Abrir filtro por nome") e `aria-expanded` refletindo o estado; campo com `aria-label` + `autoFocus`; botão `✕` com `aria-label` ("Fechar filtro"); alvos `min-h-11`; fluxo operável por teclado (tab order: botão-ícone → campo → `✕`; `Escape` no campo fecha e limpa). Mensagem de "nenhuma encontrada" em `<p>` (leitor de tela lê).

---

## 6. Contrato da UI com o `store` e `localStorage`

### 6.1 Leitura de dados (store)

- `useListas()` / `listIndex()` retorna `ListaIndex[]` — cada entrada ganha **`archived: boolean`** (campo novo, introduzido por LB-16):
  ```ts
  type ListaIndex = { id: string; nome: string; aFazer: number; pinned: boolean; archived: boolean };
  ```
- **Atenção:** a adição de `archived` a `ListaIndex` é responsabilidade do 🤖 DEV no escopo de LB-16 (ou LB-17 se LB-16 não tiver entregado — ver §7). Esta spec assume que o contrato existe quando o toggle for implementado.
- A ordenação continua Fixadas→Demais por `updated_at` desc (LB-14) — **sem mudança**. Arquivadas são intercaladas (não vão para uma seção separada) quando o toggle está on.

### 6.2 Leitura/escrita de preferência (localStorage — não store)

```ts
const PREFERENCIA_KEY = "lembr8:preferencia:exibir-arquivadas";

function lerPreferenciaArquivadas(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(PREFERENCIA_KEY) === "1";
}

function persistirPreferenciaArquivadas(v: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFERENCIA_KEY, v ? "1" : "0");
  } catch {
    // quota cheia ou modo privado — preferência não persiste, UI não quebra
  }
}
```

A UI importa esses helpers (locais ou de `src/lib/todos/preferences.ts`) — nunca acessa `localStorage` direto no componente.

### 6.3 O que **não** é desta spec (decisão do 🤖 DEV)

- Forma do campo `archived_at` no schema do cloud (timestamp `nullable` vs. booleano derivado) — **decidido por LB-16** (`archived_at` timestamp, nulo = ativa).
- Migration SQL aditiva e migração do cache localStorage — **LB-16**.
- RLS — **LB-16** (nenhuma mudança esperada; `archived_at` fica na linha da lista, já coberta por policy por `auth.uid()`).
- Sync/merge do `archived_at` (segue o merge por `updated_at` do LB-6) — **LB-16**.
- Se o toggle deve também controlar a visibilidade de arquivadas no **detalhe** (`/listas/[id]` acessado diretamente por URL) — **não**: o toggle é uma preferência de **índice**; acessar uma arquivada por URL direta mostra a lista normalmente (não há razão para bloquear). Fora de escopo desta spec.

---

## 7. Decomposição vs. LB-16 (iniciar DEV agora ou aguardar)

**Situação:** LB-16 (Arquivar listas) está em 📑 Spec (label 🤖 PD), ainda não passou para DEV. LB-17 está `blocked-by` LB-16. No entanto, **partes de LB-17 não dependem de LB-16**.

### 7.1 Filtro por nome — independente de LB-16

O filtro por nome opera sobre `lista.nome` (campo que já existe desde LB-5). Não depende de `archived`. Pode ser **implementado agora**, isolado, sem esperar LB-16.

### 7.2 Toggle "exibir arquivadas" — depende de LB-16

O toggle precisa de `archived: boolean` em `ListaIndex` (campo que LB-16 introduz). Sem LB-16, o toggle é **inerte** (liga/desliga mas nenhuma lista tem `archived=true`, então nada muda). Implementar o toggle agora é possível, mas **não entregaria valor verificável** (não há como testar com listas arquivadas reais).

### 7.3 Recomendação de decomposição (decisão de design, não de execução)

Esta spec **não força** uma decomposição — é uma decisão de processo (PO + DEV), não de design. As opções:

- **(A) Implementar tudo agora** (filtro + toggle inerte): o toggle funciona estruturalmente, mas não tem efeito até LB-16 landar. Vantagem: uma PR, sem retrabalho. Desvantagem: toggle sem comportamento observável é difícil de testar/QA, e pode confundir o usuário se landar antes de LB-16 ("liguei e nada mudou").
- **(B) Implementar só o filtro agora, toggle após LB-16**: duas PRs. Vantagem: cada parte tem valor verificável isolado; QA não precisa simular arquivadas. Desvantagem: segunda PR precisa revisitdar esta spec (mas o design já está pronto aqui — é só implementar).
- **(C) Aguardar LB-16 inteiro antes de iniciar DEV**: uma PR única depois de LB-16. Vantagem: contexto completo, sem estado inerte. Desvantagem: atrasa o filtro por nome (que é independente) sem motivo.

**Recomendação da spec (PD):** opção **(B)** — implementar o filtro por nome agora (valor imediato, independent) e o toggle após LB-16 landar (valor verificável). Mas a decisão final de processo é do PO/DEV; esta spec suporta qualquer das três opções sem retrabalho de design.

### 7.4 Conclusão sobre iniciar DEV

Há trabalho de DEV que pode iniciar agora (o filtro por nome, §1.2 + §2 com `casaArquivadas` sempre true até LB-16). Logo, **LB-17 não está totalmente bloqueada** para DEV — apenas o toggle depende de LB-16. Esta spec recomenda mover para 🚧 Dev in progress com label 🤖 DEV, deixando claro no comentário-resumo que o toggle fica para uma segunda PR pós-LB-16 (opção B). Se o PO preferir aguardar LB-16 inteiro (opção C), pode manter em 📑 Spec — mas isso atrasaria valor independente.

---

## 8. Testes (notas para DEV/QA)

**UI (testing-library/jsdom):**
- Campo de filtro: digitar "mer" → só listas com "mer" no nome (case-insensitive) aparecem; limpar → volta ao índice completo.
- Toggle: default off; clicar → fica on; recarregar → mantém o estado (lê de `localStorage`); limpar `localStorage` → volta off.
- Combinação AND: com toggle off, arquivada não aparece mesmo se o nome casa; com toggle on, arquivada aparece se o nome casa.
- Estado vazio do filtro: filtro que exclui tudo → "Nenhuma lista encontrada com esse nome."; índice vazio → "Nenhuma lista ainda..." (mensagens diferentes, mutuamente exclusivas).
- Seções LB-14 preservadas: fixada que casa o filtro continua nas Fixadas; fixada arquivada com toggle off some das Fixadas (seção pode ficar sem header).
- Sem regressão: botão "Nova lista", pin 📌 (LB-14), contagem "a fazer", menu overflow "⋮" (LB-8/LB-12), fluxos de criar/marcar/renomear — tudo preservado.
- Acessibilidade: `aria-label` no campo; label envolvendo checkbox; alvos `min-h-11`.

**Preferência (localStorage):**
- `lerPreferenciaArquivadas()` retorna `false` quando chave ausente ou `"0"`; `true` quando `"1"`.
- `persistirPreferenciaArquivadas(true)` escreve `"1"`; `(false)` escreve `"0"`.
- `try/catch` no setter: mock `localStorage.setItem` lançando → não propaga exceção.
- Guard SSR: `typeof window === "undefined"` → retorna `false` / no-op.

**Store/repository (depende de LB-16):**
- `listIndex()` retorna `archived: boolean` por entrada (quando LB-16 implementar).
- Arquivada com toggle off é filtrada pela UI (não pelo `listIndex()` — a UI filtra, o store entrega todas).

---

## 9. Resumo das decisões de design

| Decisão | Escolha |
| --- | --- |
| Onde fica o controle de filtro | **Índice** (`/`), no topo — só quando há listas |
| Affordance do filtro (rework) | Botão-ícone `🔍` (estado fechado, mínimo espaço) → campo `<input type="search">` expansível com `autoFocus` + botão `✕` para fechar (animação CSS ~150ms) |
| States do filtro | `filtroAberto: boolean` (default `false`) + `filtroNome: string` (default `""`); **nenhum persiste** |
| Fechar o filtro | `✕` ou `Escape` → `setFiltroAberto(false)` + `setFiltroNome("")` (limpa) |
| Toggle "Exibir arquivadas" (PR2) | `<input type="checkbox">` nativo dentro de `<label>`, texto "Exibir arquivadas", default off — só visível quando filtro aberto |
| Combinação | AND: `casaNome && (!l.archived \|\| exibirArquivadas)` |
| Persistência | Toggle em `localStorage` (`lembr8:preferencia:exibir-arquivadas`, `"1"`/`"0"`); filtro **não** persiste (efêmero — fecha voltando ao default) |
| Ordenação pós-filtro | mantida (Fixadas→Demais por `updated_at` desc, LB-14) — filtrar só oculta, não reordena |
| Seções LB-14 | particionadas sobre `visiveis` (não sobre `listas`) — fixada arquivada com toggle off some das Fixadas |
| Estado vazio do filtro | "Nenhuma lista encontrada com esse nome." (diferente do vazio do índice) — só quando filtro aberto e sem resultados |
| Arquivadas visíveis (PR2) | intercaladas por `updated_at` desc (sem seção separada, sem separador visual) |
| Confirmação | nenhuma (filtrar é não destrutivo, reversível) |
| Feedback | imediato (filtragem client-side a cada keystroke; animação ao abrir/fechar) |
| Alvo/touch | `min-h-11 min-w-11` (44px, LB-4) no botão-ícone, no campo, no `✕` e no label do toggle |
| Contrato UI↔store | `ListaIndex.archived: boolean` (introduzido por LB-16); UI filtra client-side |
| Contrato UI↔localStorage | `lerPreferenciaArquivadas()` / `persistirPreferenciaArquivadas(v)` — helpers locais, **não** no store |
| Forma do campo/migration/RLS/sync de `archived_at` | 🤖 DEV (escopo LB-16) |
| Dependências/tokens | nenhum novo (sem Radix/HeadlessUI, sem novo token de cor, sem lib de animação) |
| Decomposição vs. LB-16 | PR1 = filtro por nome (rework affordance expansível); PR2 = toggle pós-LB-16 |
| Issues separadas (fora de escopo) | LB-19 (botão Nova lista compacto), LB-20 (Sair → `[...]`) |