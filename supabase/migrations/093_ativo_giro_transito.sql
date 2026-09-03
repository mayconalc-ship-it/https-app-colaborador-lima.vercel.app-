-- ==================================================================
-- 093 - ATIVO DE GIRO: TRANSITO DO DIA E LIBERACAO DE QUEM LANCA
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (03/09/2026): fechar a conciliacao inteira dentro do
-- app. Hoje a conta e "contado - parque", e falta a parcela que nao esta
-- no patio para ser contada -- o ativo em transito. A conta passa a ser
--
--     contado + transito - parque = diferenca
--
-- e a diferenca ate 5% do parque e aceitavel (verde); acima, vermelho.
--
-- DUAS TABELAS, porque sao duas coisas diferentes:
--
-- ag_transito           o numero do dia, por tipo e formato. Uma linha
--                       por dia, entao relancar CORRIGE em vez de somar
--                       -- e o mesmo desenho de ag_parque, e evita a
--                       duvida "lancei duas vezes, dobrou?".
--
-- ag_transito_liberados quem pode lancar. O dono pediu essa liberacao
--                       DENTRO da configuracao do Ativo de Giro, e nao
--                       em Acessos por Pessoa: quem cuida do parque nao
--                       e quem cuida do mapa de permissao do app, e
--                       obrigar a passar por la para liberar uma pessoa
--                       transformaria uma tarefa da controladoria num
--                       chamado para o Admin.
--
-- CUIDADO COM DUPLA CONTAGEM: ag_contagens.status ja tem "Transito Rota"
-- e "Transito Fabrica", e aquilo e coisa CONTADA no patio, entrando em
-- "contado". Esta tabela e o que NAO da para contar -- o ativo que esta
-- com o transportador, entre unidades. A tela diz isso em uma linha, do
-- lado da coluna.

create table if not exists public.ag_transito (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('Kit AG', 'GFE sem Garrafa')),
  formato text not null check (formato in ('600ml', '300ml', '1000ml', 'Verde')),
  -- Em CAIXAS, a mesma unidade do parque e do contado -- e o que permite
  -- somar os tres sem conversao no meio do caminho.
  quantidade integer not null default 0 check (quantidade >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_por_nome text,
  primary key (revenda_id, data, tipo, formato)
);

create index if not exists ag_transito_dia_idx
  on public.ag_transito (revenda_id, data desc);

create table if not exists public.ag_transito_liberados (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  liberado_em timestamptz not null default now(),
  liberado_por uuid references auth.users(id) on delete set null,
  primary key (revenda_id, colaborador_id)
);

-- ------------------------------------------------------------------
-- ACESSO
-- ------------------------------------------------------------------
-- O transito e LIDO por todo mundo que esta logado, igual as contagens:
-- ele aparece na conciliacao ao lado do contado, e quem conta precisa
-- ver de onde saiu a diferenca. Ele so nao pode ser ESCRITO por
-- qualquer um -- e por isso nao existe policy de insert/update/delete:
-- toda escrita passa por acao de servidor, que confere a liberacao.
alter table public.ag_transito enable row level security;
grant select on public.ag_transito to authenticated;
grant all on public.ag_transito to service_role;

drop policy if exists ag_transito_ler on public.ag_transito;
create policy ag_transito_ler on public.ag_transito
  for select to authenticated using (true);

-- A lista de liberados e do servidor, ponto: quem a le pelo cliente
-- descobriria quem pode mexer no numero -- e quem consegue escrever nela
-- se libera sozinho. RLS ligada e nenhuma policy.
alter table public.ag_transito_liberados enable row level security;
grant all on public.ag_transito_liberados to service_role;

comment on table public.ag_transito is
  'Ativo de giro em transito no dia, em caixas. Entra na conciliacao: contado + transito - parque.';
comment on table public.ag_transito_liberados is
  'Quem pode lancar o transito. Liberado na tela de configuracao do Ativo de Giro.';

notify pgrst, 'reload schema';

-- Confira: as duas tabelas criadas e vazias.
select 'ag_transito' as tabela, count(*) from public.ag_transito
union all
select 'ag_transito_liberados', count(*) from public.ag_transito_liberados;
