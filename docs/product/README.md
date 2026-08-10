# Produto — Lembr8

App de tarefas/lembretes: o usuário registra itens a fazer e é lembrado deles (notificação Web Push, prevista para issues futuras).

Primeira feature (LB-3, ✅ Deployed v0.2.0): tela inicial com lista de tarefas simples (todo) — entrada inline (campo + Enter) e checkbox, persistência local (localStorage) atrás de uma camada única de acesso aos dados. Spec em `lb-3-todo-list.md`.

Melhoria de UX mobile (LB-4, ✅ Deployed v0.2.1): viewport com safe areas (notch/home indicator), alvos de toque ≥44px (checkbox em `<label>` e botão "Sair"), entrada inline confortável com teclado mobile (fonte 16px + `enterKeyHint`), estado vazio legível — sem regressão em desktop. Spec de design em `design/lb-4-mobile-ux.md`.

Múltiplas listas (LB-5, ✅ Deployed v0.3.0): índice de listas (`/`) e tela da lista (`/listas/[id]`); criação em 1 toque (`Lista N`, auto-incremento) e abre a lista; renomear via título editável (click-to-edit); dentro da lista, a-fazer no topo e concluídos embaixo; ao re-adicionar um concluído ele é reativado sem duplicata (match case-insensitive + trim) e duplicado ativo foca o existente; migração do MVP (lista única) para `Lista 1` sem perda de dados. Persistência permanece em localStorage atrás da camada única de acesso aos dados; sem mudança de stack. Spec de design em `design/lb-5-multiplas-listas.md`.

Sync cross-device no Supabase (LB-6, ✅ Deployed v0.4.1): o **Supabase (Postgres + RLS por `auth.uid()`) vira a fonte de verdade** das listas/itens, mantendo o **localStorage como cache offline** (local-first). A UI continua lendo/escrevendo no cache (funciona sem rede) e o repository sincroniza com o cloud ao reconectar e ao login (push das mudanças locais + pull, merge por `updated_at` — última escrita vence). Dados existentes no localStorage são migrados para o cloud no 1º login pós-upgrade, sem perda. Sem realtime, sem delete, sem colaboração entre contas. Spec em `lb-6-supabase-sync.md`, design em `design/lb-6-supabase-sync.md`.

Pontos mapeados para spec futura:
- Tratamento de timezone do usuário nos horários de lembrete.
- Notificações / Web Push e lembretes por horário.

Agentes: não assumam funcionalidades além do que estiver especificado aqui.