-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- CENTRAL DE NOTIFICACOES
-- ==================================================================
-- Duas ideias diferentes convivem aqui, e separa-las e o que mantem o
-- sistema barato:
--
-- 1) NOTIFICACOES PUBLICADAS  -> viram linha na tabela "notificacoes".
--    Nascem quando alguem publica algo (noticia, padrao, ranking...).
--    UMA linha por publicacao, nunca uma por colaborador: com 83 pessoas,
--    duplicar geraria 83 linhas a cada noticia, sem necessidade.
--
-- 2) PENDENCIAS               -> nao viram linha nenhuma.
--    "Fulano ainda nao fez o feedback de hoje" e uma PERGUNTA feita as
--    tabelas que ja existem, na hora. Sem cron, sem processo de fundo,
--    sem registro que envelhece e vira mentira.
--
-- O estado de cada pessoa (viu, clicou, dispensou) fica numa tabela so,
-- identificada por uma CHAVE de texto -- assim os dois tipos acima usam
-- exatamente a mesma logica de "ja mostrei isso para voce".

-- ------------------------------------------------------------------
-- 1) NOTIFICACOES PUBLICADAS
-- ------------------------------------------------------------------
create table if not exists public.notificacoes (
  id bigint generated always as identity primary key,
  -- novo | atualizado | pendencia | lembrete | importante
  tipo text not null default 'novo',
  -- comunicados, padroes, ranking, sonho, escala, rv...
  modulo text not null,
  titulo text not null,
  mensagem text not null,
  -- Para onde o botao leva. Sempre um caminho interno do app.
  url text not null,
  -- Id do conteudo que originou (id da noticia, do padrao...).
  referencia_id text,
  -- Maior = aparece primeiro quando ha varias.
  prioridade smallint not null default 10,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  expira_em timestamptz,
  criado_por uuid references auth.users(id) on delete set null
);

create index if not exists notificacoes_recentes_idx
  on public.notificacoes (criado_em desc) where ativa;

-- ------------------------------------------------------------------
-- 2) ESTADO POR PESSOA
-- ------------------------------------------------------------------
-- A "chave" identifica o aviso:
--   "n:42"                      -> notificacao publicada de id 42
--   "feedback:2026-08-01"       -> lembrete de feedback daquele dia
-- Uma tabela unica para os dois casos evita duas logicas paralelas.
--
-- So existe linha para quem INTERAGIU. Quem nunca viu nao gera registro:
-- e por isso que a tabela nao cresce com 83 linhas por publicacao.
create table if not exists public.notificacao_estado (
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  chave text not null,
  vista_em timestamptz,
  clicada_em timestamptz,
  dispensada_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (colaborador_id, chave)
);

-- ------------------------------------------------------------------
-- 3) CONFIGURACAO -- uma linha por modulo, so o Admin mexe
-- ------------------------------------------------------------------
create table if not exists public.notificacao_config (
  modulo text primary key,
  ativa boolean not null default true,
  atualizado_em timestamptz not null default now()
);

insert into public.notificacao_config (modulo, ativa) values
  ('comunicados', true),
  ('padroes', true),
  ('ranking', true),
  ('sonho', true),
  ('escala', true),
  ('rv', true),
  ('feedback', true)
on conflict (modulo) do nothing;

-- Hora a partir da qual o lembrete de feedback aparece (0 a 23).
create table if not exists public.notificacao_ajustes (
  id smallint primary key default 1,
  hora_lembrete_feedback smallint not null default 16,
  max_por_acesso smallint not null default 1,
  constraint notificacao_ajustes_linha_unica check (id = 1)
);

insert into public.notificacao_ajustes (id) values (1)
on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- 4) PERMISSOES
-- ------------------------------------------------------------------
-- RLS ligada e NENHUMA politica: o banco nega tudo para quem usa a chave
-- publica do app. Toda leitura e gravacao passa por acoes de servidor, que
-- conferem quem esta pedindo -- mesmo desenho do resto do projeto.
--
-- E o que garante a privacidade: ninguem consegue perguntar ao banco
-- "o que o Joao ainda nao leu?".

alter table public.notificacoes enable row level security;
alter table public.notificacao_estado enable row level security;
alter table public.notificacao_config enable row level security;
alter table public.notificacao_ajustes enable row level security;

do $$
declare politica record;
begin
  for politica in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in (
        'notificacoes', 'notificacao_estado',
        'notificacao_config', 'notificacao_ajustes'
      )
  loop
    execute format(
      'drop policy %I on public.%I', politica.policyname, politica.tablename
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
