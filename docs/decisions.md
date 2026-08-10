# Decisões (ADRs)

Formato: uma seção por decisão — contexto em 1-2 linhas, decisão, consequências. Mais recente no topo.

## 2026-08-10 — Persistência local-first das listas no Supabase (sync cross-device)
**Contexto:** LB-5 entregou múltiplas listas em localStorage. O ADR de 2026-08-09 (LB-3) dizia "Revisitar [Supabase] quando sync/cross-device for necessário". O app é PWA de lembretes usado em casa e no mercado (pode estar offline), e a camada de acesso aos dados já abstrai o storage — condição para a troca sem tocar a UI.
**Decisão (humano, LB-6):** tornar o **Supabase** (Postgres + RLS por `auth.uid()`) a **fonte de verdade** das listas/itens, mantendo o **localStorage como cache offline** (local-first): a UI continua lendo/escrevendo no cache (funciona sem rede) e o repository sincroniza com o cloud ao reconectar (push das mudanças locais + pull, merge por `updated_at` — última escrita vence). Dados existentes no localStorage são **migrados para o cloud no 1º login** pós-upgrade (upsert por lista/item; em conflito multi-device, primeiro-device-vence / merge simples). Realtime live-sync fica fora do escopo do MVP (sync em login/reconexão é suficiente).
**Consequências:** sync entre dispositivos habilitado; dados sobrevivem à troca/limpeza de device; RLS é a barreira entre contas. Custo: complexidade de fila de mudanças + resolução de conflito no repository. O preview aponta para o banco de prod → a migration precisa estar aplicada em prod **antes** de o preview depender dela, e nada destrutivo/em massa no preview. Acesso ao projeto cloud `tfgbkyjwzqvvklutmeln` via access token fornecido pelo humano (credencial — não versionado). Revoga o "Revisitar quando sync for necessário" do ADR de 2026-08-09.

## 2026-08-09 — Persistência local (localStorage) para o todo MVP
**Contexto:** a primeira feature (LB-3) é uma lista de tarefas simples (todo) com entrada inline e checkbox; o fluxo de uso (preparar em casa, usar no mercado) exige persistência entre sessões. A stack prevê Supabase para dados, mas levá-la agora traria migrações/RLS e expandiria o escopo.
**Decisão (humano, LB-3):** persistir o todo MVP em **localStorage** no navegador (mesmo dispositivo), atrás da camada de acesso aos dados. Supabase (persistência remota, sync entre dispositivos, histórico remoto) fica para issue futura.
**Consequências:** dados não sincronizam entre dispositivos e ficam presos ao device; histórico é local. A camada de acesso abstrai o storage para a troca por Supabase não tocar a UI. Revisitar quando sync/cross-device for necessário.

## 2026-08-09 — Fluxo de branches (develop como base) + SemVer
**Contexto:** trabalho de código precisa de linha de integração distinta de produção; versionamento precisa ser explícito.
**Decisão:** branch padrão do repo é `develop` (ajustado no GitHub). Fluxo normal: branch `lb-<n>-slug` a partir de `develop` → PR para `develop` → deploy é a promoção `develop → main`. Bugfix emergencial (hotfix): branch a partir de `main` → PR para `main` **e** para `develop` (ou cherry-pick), mantendo `develop` em dia. Versionamento por Semantic Versioning (`MAJOR.MINOR.PATCH`); bump de versão disparado na promoção para `main`.
**Consequências:** `main` reflete sempre a produção; `develop` é a base do trabalho normal. Detalhes do fluxo em `docs/agents/dev.md`.

## 2026-08-05 — Preview Deploys apontam para o banco de produção
**Contexto:** com o ambiente de teste local em Docker, um preview hospedado na Vercel não alcança o banco na máquina do dev. Opções avaliadas: (A) preview aponta para o banco de **prod** — custo e setup zero, risco de poluir dados reais durante o QA; (B) 2º projeto Supabase **cloud** dedicado a preview — free tier permite 2 projetos (custo zero), exige aplicar migrações nos dois.
**Decisão (humano, LB-1):** opção **A** — os Preview Deploys usam o banco de produção. "Não tem porque deixar complexo agora."
**Consequências:** as env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` do ambiente Preview da Vercel apontam para `tfgbkyjwzqvvklutmeln` (mesmos valores de Production). O QA passa a ter ambiente de preview funcional, mas **escreve em dados reais**: validações destrutivas ou em massa não devem ser feitas no preview, e a RLS é a única barreira entre contas. Migrações precisam estar aplicadas em prod antes de o preview depender delas. Revisitar se o volume de dados reais crescer — a opção B continua disponível a custo zero.

## 2026-08-03 — Repositório público
**Contexto:** o projeto não é produto comercial.
**Decisão:** `alysson-azevedo/lembr8` permanece público.
**Consequências:** nenhum segredo pode entrar no repo — `.gitignore` cobre `.env`, `.env.*` e `*.env`; credenciais vivem apenas em arquivos locais e nas env vars da Vercel.

## 2026-08-03 — Ambiente de teste local em Docker (substitui o banco de teste na nuvem)
**Contexto:** a stack original previa um projeto Supabase de teste na nuvem compartilhado por develop/preview. Manter um projeto cloud só para teste não se paga num projeto pessoal.
**Decisão:** desenvolvimento, ambiente de teste e testes unitários rodam no **Supabase local em Docker** (`supabase start`); produção fica no projeto cloud `tfgbkyjwzqvvklutmeln`. O projeto `lembr8-test` não será criado.
**Consequências:** CI roda o Supabase local em Docker, sem dependência de nuvem. Abre a pendência do banco dos Preview Deploys (abaixo). `docs/stack.md` atualizado.

## 2026-08-03 — Chaves publishable/secret do Supabase
**Contexto:** o Supabase substituiu `anon key` / `service_role key` pelo par publishable/secret ([discussão 29260](https://github.com/orgs/supabase/discussions/29260)).
**Decisão:** usar o formato novo em todos os ambientes.
**Consequências:** env vars são `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`.

## 2026-08-02 — Stack do Lembr8
**Contexto:** Lembr8 é um PWA de lembretes/tarefas. Prioridade: resultado rápido com custo mínimo.
**Decisão:** Next.js + TypeScript na Vercel; Supabase (Postgres + Storage + Auth e-mail/senha); RLS obrigatória em todos os dados de usuário; cron na Vercel; lembretes via Web Push; e-mails via API Brevo; migrações versionadas com Supabase CLI. Prod usa banco próprio; develop/preview compartilham um único banco de teste (sem breaking changes garante compatibilidade).
**Consequências:** detalhes em `docs/stack.md`; regras de banco em `docs/agents/dev.md`. Mudanças nesta stack exigem confirmação humana.

## 2026-08-02 — Workflow de agentes no Linear (time LB)
**Contexto:** desenvolvimento por agentes com papéis distintos, orquestrado pelos states do Linear.
**Decisão:** Backlog→PO, Spec→PO+PD, Dev in progress→DEV, Preview Review→QA, Ready for Deploy→DEV. Labels 🤖 indicam o responsável atual; `🚫 Sem automação` bloqueia agentes. Sem gates humanos nas transições — só nos pontos críticos do CLAUDE.md. Detalhes em `docs/workflow.md`.
**Consequências:** cada agente segue seu doc em `docs/agents/`; mudanças no processo passam por aqui.

## 2026-08-02 — Modo de trabalho multi-agente
**Contexto:** o app será desenvolvido por agentes, com supervisão humana pontual.
**Decisão:** confirmação manual obrigatória apenas para (1) arquitetura/stack e (2) custos/credenciais. Deploy e merge na main são autônomos. Fluxo de sessão: diagnóstico → alinhamento → ações. Contexto persistido em `CLAUDE.md` + `docs/`.
**Consequências:** agentes devem consultar este log antes de propor mudanças; decisões críticas novas entram aqui.
