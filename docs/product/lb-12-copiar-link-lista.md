# Spec LB-12 — Copiar link da lista no menu overflow

**Issue:** [LB-12](https://linear.app/alysson-azevedo/issue/LB-12/copiar-link-compartilhar-lista-no-menu-overflow) · **State:** ✅ Deployed (v0.6.0) · **Tipo:** 🔍 Melhoria · **Prioridade:** baixa
**Base:** LB-8 (✅ Deployed) — menu overflow "⋮" na tela de lista (`/listas/[id]`) já expõe "🗑️ Excluir lista". LB-5 (múltiplas listas) e LB-6 (Supabase, RLS por `auth.uid()`).

**Escopo desta spec:** negócio (critérios de aceite + UX do ponto de vista do usuário). A spec de **design** (controle de UI, mecanismo de clipboard, componente de toast, estrutura de código) é trabalho do 🤖 PD em `design/lb-12-*.md`.

---

## Decisão de escopo (confirmada — não reabrir)

- O autor confirmou em comentário: ignorar "compartilhar"; **apenas copiar a URL** da lista para a área de transferência já basta.
- Logo, **sem** mudança de RLS, **sem** mudança de schema do Supabase, **sem** nova decisão de arquitetura/stack/custo — não escala ao humano.
- O link copiado é um **deep link** que só abre a lista para o **próprio dono logado** (a RLS por `auth.uid()` continua sendo a barreira). **Não é compartilhamento** entre contas.

## Fora de escopo (issue futura — limitação aceita)

- **Compartilhamento cross-conta / link público / convite** que permita outro usuário/conta ver a lista. Exigiria decisão de arquitetura (RLS de leitura pública/por convite, schema de compartilhamento) — ponto crítico, adiado. Levantar como issue filha quando o produto quiser compartilhar de fato.
- Qualquer alteração em RLS ou schema do Supabase.
- Compartilhar via Web Share API nativa do dispositivo (pode ser considerado pelo PD como detalhe de implementação, mas não é requisito de negócio).

---

## Problema

Não há como obter o link de uma lista. O usuário quer guardar atalhos para listas específicas (ex.: na tela inicial do celular/navegador, em favoritos ou anotações), mas hoje é obrigado a navegar manualmente até a lista toda vez que precisa acessá-la.

## Valor para o usuário

O usuário cria atalhos diretos para as listas que usa com frequência, agilizando o acesso. Copia a URL da lista uma vez e salva onde quiser; o acesso vira um toque, não uma navegação.

## Caso de uso de referência

O usuário tem uma lista de compras que usa toda semana. Na tela dessa lista, abre o menu "⋮", escolhe "Copiar link" e recebe a confirmação "Link copiado". Cola a URL nos favoritos do navegador ou adiciona como atalho na tela inicial do celular. A partir dali, acessa a lista direto, sem passar pelo índice.

---

## Escopo de negócio

### Ação "Copiar link" no menu overflow
- Na tela de lista (`/listas/[id]`), o menu overflow "⋮" passa a exibir a ação **"Copiar link"**, além de "🗑️ Excluir lista" (já existente).
- "Copiar link" é uma ação **não destrutiva**: não pede confirmação.

### Copiar para a área de transferência
- Ao acionar "Copiar link", a **URL (deep link)** da lista atual é copiada para a área de transferência do dispositivo.
- A URL copiada é a rota pública da lista: `${origin}/listas/${listId}` (ex.: `https://lembr8.app/listas/abc123`).

### Feedback de cópia
- Após copiar, o usuário recebe um **feedback visível e efêmero** (toast) confirmando que o link foi copiado (ex.: "Link copiado").
- O feedback some sozinho após alguns segundos; não exige interação.

### Comportamento do menu
- O menu overflow fecha após acionar "Copiar link" (mesmo comportamento dos demais itens).
- A ação fica disponível sempre que a lista existir e estiver renderizada (não depende de conexão — é ação puramente local de clipboard).

### Isolamento (RLS) — sem mudança
- O link copiado é um deep link interno: só leva à lista quem for o **dono logado**. A RLS por `auth.uid()` não muda; abrir o link sem estar logado/redirecionado não expõe dados de outra conta.
- Nenhuma mudança em RLS ou schema do Supabase.

---

## Critérios de aceite (testáveis)

1. Na tela de lista (`/listas/[id]`), o menu overflow "⋮" exibe o item "Copiar link" além de "🗑️ Excluir lista".
2. Ao acionar "Copiar link", a URL `${origin}/listas/${listId}` correspondente à lista atual é colocada na área de transferência.
3. Após copiar, aparece um feedback efêmero (toast) com a mensagem "Link copiado", que desaparece sozinho.
4. O menu overflow fecha imediatamente após acionar "Copiar link".
5. A ação não pede confirmação (não é destrutiva).
6. A ação funciona offline (depende só do clipboard local; não chama o Supabase).
7. Nenhuma mudança em RLS ou schema do Supabase é introduzida.
8. O link copiado, quando aberto pelo próprio dono autenticado, leva à lista correta (reaproveita o deep-link já tratado em LB-8 §4 — lista inexistente/excluída volta ao índice).

---

## Notas para o 🤖 PD

- Hoje **não existe** componente de toast nem uso de `navigator.clipboard` no codebase (`src/components/ui/` só tem `ConfirmDialog`). O PD deve definir o mecanismo de clipboard (Web `navigator.clipboard.writeText`, com fallback legível quando indisponível/bloqueado) e o componente de feedback efêmero.
- O item "Copiar link" deve vir **acima** de "🗑️ Excluir lista" no menu (ação não destrutiva antes da destrutiva).
- Manter o padrão de acessibilidade já usado no menu (roles `menu`/`menuitem`, `aria-label`, `min-h-11` nos itens).