# Produto — Lembr8

App de tarefas/lembretes: o usuário registra itens a fazer e é lembrado deles (notificação Web Push, prevista para issues futuras).

Primeira feature (LB-3, ✅ Deployed v0.2.0): tela inicial com lista de tarefas simples (todo) — entrada inline (campo + Enter) e checkbox, persistência local (localStorage) atrás de uma camada única de acesso aos dados. Spec em `lb-3-todo-list.md`.

Pontos mapeados para spec futura:
- Tratamento de timezone do usuário nos horários de lembrete.
- Notificações / Web Push e lembretes por horário.
- Sync entre dispositivos / persistência remota (Supabase).

Agentes: não assumam funcionalidades além do que estiver especificado aqui.