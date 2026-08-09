# Spec LB-3 — Lista de tarefas (todo) com entrada inline e checkbox

**Issue:** [LB-3](https://linear.app/alysson-azevedo/issue/LB-3/tela-inicial-com-lista-de-lembretes-mock-busca-e-filtros-rapidos) · **State:** 📑 Spec (PO → PD) · **Persistência:** localStorage (decisão em `docs/decisions.md`).

## Problema
Depois do login (LB-2) não há para onde ir: o app não tem tela inicial. Sem ela não dá para validar navegação, layout e a experiência de registrar e consultar tarefas.

## Valor para o usuário
O usuário mantém uma lista de tarefas simples: digita um item, dá Enter e ele entra na lista com um checkbox; marca o checkbox ao concluir. A lista persiste entre sessões — pode prepará-la em casa e usar no mercado, adicionando itens vistos na prateleira, e consultar o histórico depois.

## Caso de uso de referência
Usuário prepara uma lista de compras: digita "arroz", Enter → item com checkbox; "feijão", Enter; "pães", Enter. Sem botão "salvar" — cada Enter confirma. No mercado, abre a mesma lista e adiciona novos itens (produto visto/comprado), pelo mesmo mecanismo. Itens ficam para histórico/consulta futura.

## Escopo
Tela inicial (`/`):
- **Deslogado:** redireciona para a tela de login.
- **Logado:** exibe a lista de tarefas (única).
- **Entrada inline:** campo de texto + Enter adiciona o item à lista imediatamente, com checkbox ao lado; o campo limpa após adicionar. Sem ação explícita de "salvar".
- **Checkbox por item:** alterna concluído / a fazer; persiste no ato.
- **Persistência local imediata:** cada adição/marcação persiste no ato, sobrevivendo a fechar/abrir o app (localStorage).
- **Estado vazio** quando não há itens, com o campo de entrada disponível.

## Modelo de dados (todo simples, lista única)
Item: `id`, `texto`, `concluído` (boolean). Ordem = ordem de inserção.
Os itens e o acesso ao armazenamento ficam **isolados atrás de uma camada única de acesso aos dados**, de modo que a troca por Supabase em issue futura não toque a UI.

## Fora de escopo (issues futuras)
- Múltiplas listas (criação/seleção de listas).
- Editar o texto ou excluir um item.
- Persistência remota (Supabase), sincronização entre dispositivos, RLS, migrações.
- Busca, filtros e categorias.
- Ordenação/classificação da lista.
- Notificações / Web Push.

## Critérios de aceite
1. Usuário sem sessão que acessa `/` é redirecionado para a tela de login.
2. Usuário autenticado que acessa `/` vê a lista de tarefas; sem itens, vê estado vazio com o campo de entrada disponível.
3. Digitar um texto e pressionar Enter adiciona o item à lista imediatamente, com checkbox ao lado, e limpa o campo. Não há botão "salvar".
4. Marcar o checkbox de um item alterna entre concluído e a fazer, e a mudança persiste no ato.
5. Fechar e reabrir o app mantém a lista (itens e estados de conclusão) — persistência via localStorage.
6. Nenhuma chamada ao Supabase/banco é feita por esta tela; a UI consome apenas a camada única de acesso aos dados.