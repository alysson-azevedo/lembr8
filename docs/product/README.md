# Produto — Lembr8

App de tarefas/lembretes: o usuário registra itens a fazer e é lembrado deles (notificação Web Push, prevista para issues futuras).

Primeira feature (LB-3, ✅ Deployed v0.2.0): tela inicial com lista de tarefas simples (todo) — entrada inline (campo + Enter) e checkbox, persistência local (localStorage) atrás de uma camada única de acesso aos dados. Spec em `lb-3-todo-list.md`.

Melhoria de UX mobile (LB-4, ✅ Deployed v0.2.1): viewport com safe areas (notch/home indicator), alvos de toque ≥44px (checkbox em `<label>` e botão "Sair"), entrada inline confortável com teclado mobile (fonte 16px + `enterKeyHint`), estado vazio legível — sem regressão em desktop. Spec de design em `design/lb-4-mobile-ux.md`.

Pontos mapeados para spec futura:
- Tratamento de timezone do usuário nos horários de lembrete.
- Notificações / Web Push e lembretes por horário.
- Sync entre dispositivos / persistência remota (Supabase).

Agentes: não assumam funcionalidades além do que estiver especificado aqui.