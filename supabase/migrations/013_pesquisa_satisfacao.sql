-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- PESQUISA DE SATISFACAO DO APP
-- ==================================================================
-- Duas tabelas: uma linha de configuracao (quando a pesquisa roda) e uma
-- linha por resposta. Nomes em portugues para acompanhar o resto do banco
-- (comunicados, padroes, feedback_rota, uso_sessoes).
--
-- Nao confundir com "feedback_rota", que e o relato diario do motorista
-- sobre a ROTA. Esta pesquisa e sobre o APP.

-- ------------------------------------------------------------------
-- 1) CONFIGURACAO -- uma linha so, sempre id = 1
-- ------------------------------------------------------------------
create table if not exists public.pesquisa_config (
  id smallint primary key default 1,
  ativa boolean not null default false,
  inicio date,
  fim date,
  -- O ciclo e a chave de tudo: trocar este valor libera todo mundo para
  -- responder de novo, sem apagar nada do que ja foi respondido.
  ciclo text not null default to_char(now(), 'YYYY-MM'),
  titulo text not null default 'Pesquisa de satisfação',
  atualizado_em timestamptz not null default now(),
  constraint pesquisa_config_linha_unica check (id = 1)
);

insert into public.pesquisa_config (id) values (1)
on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- 2) RESPOSTAS
-- ------------------------------------------------------------------
create table if not exists public.pesquisa_respostas (
  id bigint generated always as identity primary key,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  ciclo text not null,
  nota smallint not null check (nota between 1 and 5),
  motivos text[] not null default '{}',
  comentario text,
  criado_em timestamptz not null default now(),

  -- A trava de verdade contra resposta duplicada. A tela tambem confere,
  -- mas tela se burla; restricao de banco nao.
  constraint pesquisa_respostas_unica unique (colaborador_id, ciclo)
);

create index if not exists pesquisa_respostas_ciclo_idx
  on public.pesquisa_respostas (ciclo, criado_em desc);

-- ------------------------------------------------------------------
-- 3) PERMISSOES
-- ------------------------------------------------------------------
-- RLS ligada e NENHUMA politica: com isso o banco nega tudo para quem usa
-- a chave publica do app -- inclusive usuario logado. Nao ha como um
-- colaborador ler a nota de outro, alterar a propria, nem descobrir quem
-- respondeu o que.
--
-- Todo acesso passa pelas acoes de servidor do app, que usam a chave de
-- administrador e conferem quem esta pedindo antes de gravar ou ler. E o
-- mesmo desenho ja usado em comunicados, padroes e ranking.

alter table public.pesquisa_config enable row level security;
alter table public.pesquisa_respostas enable row level security;

-- Limpa politicas de execucoes anteriores deste script.
do $$
declare politica record;
begin
  for politica in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('pesquisa_config', 'pesquisa_respostas')
  loop
    execute format(
      'drop policy %I on public.%I', politica.policyname, politica.tablename
    );
  end loop;
end $$;
