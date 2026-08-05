-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- 1) PAPEL "LIDERANCA"
-- ==================================================================
-- Ate agora existiam so 'admin' e 'colaborador'. A lideranca fica no meio:
-- alimenta o conteudo do dia a dia (jornal, ranking, padroes) e acompanha os
-- feedbacks, sem chegar perto de pessoas, remuneracao e configuracao.
--
-- Quem decide o que cada papel pode fazer e o app: TODA gravacao passa por
-- uma acao de servidor que confere o papel antes de escrever. O banco nao
-- aceita escrita de usuario comum em nenhuma dessas tabelas -- veja a secao 3.
-- A restricao abaixo serve para impedir papel escrito errado.

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'lideranca', 'colaborador'));

-- ==================================================================
-- 2) MEDICAO DE USO
-- ==================================================================
-- Duas tabelas: uma sessao por aba aberta (para contar tempo) e uma linha
-- por tela visitada (para saber o que e usado).

create table if not exists public.uso_sessoes (
  id uuid primary key,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  iniciada_em timestamptz not null default now(),
  ultima_atividade timestamptz not null default now(),
  segundos int not null default 0
);

create index if not exists uso_sessoes_data_idx
  on public.uso_sessoes (iniciada_em desc);

create table if not exists public.uso_telas (
  id bigint generated always as identity primary key,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  caminho text not null,
  criado_em timestamptz not null default now()
);

create index if not exists uso_telas_data_idx
  on public.uso_telas (criado_em desc);

-- ==================================================================
-- 3) PERMISSOES DAS TABELAS DE USO
-- ==================================================================
-- O registro e feito pelo proprio navegador do colaborador, entao aqui
-- precisa de politica de escrita -- mas so da PROPRIA linha. Ninguem
-- consegue registrar uso em nome de outra pessoa, nem ler o de ninguem:
-- a leitura fica so para o painel, que usa a chave de administrador.

alter table public.uso_sessoes enable row level security;
alter table public.uso_telas enable row level security;

drop policy if exists "registra propria sessao" on public.uso_sessoes;
create policy "registra propria sessao"
  on public.uso_sessoes for insert
  to authenticated
  with check (auth.uid() = colaborador_id);

drop policy if exists "atualiza propria sessao" on public.uso_sessoes;
create policy "atualiza propria sessao"
  on public.uso_sessoes for update
  to authenticated
  using (auth.uid() = colaborador_id)
  with check (auth.uid() = colaborador_id);

drop policy if exists "registra propria tela" on public.uso_telas;
create policy "registra propria tela"
  on public.uso_telas for insert
  to authenticated
  with check (auth.uid() = colaborador_id);
