-- ==================================================================
-- 094 - AG: TRANSITO ROTA, TRANSITO CARRETA E COMODATO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (03/09/2026): o "transito" nao e uma coisa so. A conta
-- da conciliacao passa a ser
--
--     contado + transito rota + transito carreta + comodato - parque
--
-- e cada parcela e um lugar diferente onde o ativo pode estar:
--
--   transito rota     saiu com a entrega e volta no mesmo dia
--   transito carreta  esta entre unidades, com o transportador
--   comodato          esta emprestado ao cliente, e fica la
--
-- POR QUE O COMODATO E OUTRA TABELA, e nao uma terceira coluna do dia:
-- ele nao muda todo dia. Palavras do dono: "comodato pode manter o dos
-- outros dias, e somente quando houver necessidade a controle modifica".
-- Se ele fosse coluna do lancamento diario, alguem teria de redigitar o
-- mesmo numero toda manha -- e no dia em que esquecesse, o comodato
-- viraria zero e a conciliacao acusaria uma falta que nao existe.
--
-- Assim ele fica igual ao parque: um saldo que vale ate alguem mudar.
-- O preco e o mesmo do parque, e vale dizer: uma conciliacao de um mes
-- atras passa a ser recalculada com o comodato de HOJE. Para a janela
-- que a tela mostra (semanas) isso e honesto; para meses, nao seria --
-- e por isso o historico nao volta anos.
--
-- DADO EXISTENTE: 8 linhas lancadas hoje pela Barbara, antes da divisao.
-- Elas eram "transito" sem classificacao, entao vao para TRANSITO ROTA e
-- nao se perdem -- mas ninguem informou que eram de rota. A controladoria
-- precisa conferir e reclassificar o que for carreta. Perder o numero
-- dela seria pior; inventar a classificacao em silencio, tambem: por
-- isso esta escrito aqui e vai dito na tela.

alter table public.ag_transito
  add column if not exists transito_carreta integer not null default 0
    check (transito_carreta >= 0);

-- "quantidade" era o transito sem classificacao. Vira "transito_rota",
-- levando junto os valores ja lancados.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_name = 'ag_transito' and column_name = 'quantidade'
  ) then
    alter table public.ag_transito rename column quantidade to transito_rota;
  end if;
end $$;

-- A trava antiga se chamava pelo nome antigo da coluna; recria com o novo.
do $$
declare c text;
begin
  foreach c in array array[
    'ag_transito_quantidade_check',
    'ag_transito_transito_rota_check'
  ]
  loop
    if exists (select 1 from pg_constraint where conname = c) then
      execute format('alter table public.ag_transito drop constraint %I', c);
    end if;
  end loop;
end $$;

alter table public.ag_transito
  add constraint ag_transito_transito_rota_check check (transito_rota >= 0);

comment on column public.ag_transito.transito_rota is
  'Ativo que saiu com a entrega e volta no mesmo dia, em caixas.';
comment on column public.ag_transito.transito_carreta is
  'Ativo entre unidades, com o transportador, em caixas.';

-- ------------------------------------------------------------------
-- COMODATO -- saldo que vale ate alguem mudar, igual ao parque
-- ------------------------------------------------------------------
create table if not exists public.ag_comodato (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  tipo text not null check (tipo in ('Kit AG', 'GFE sem Garrafa')),
  formato text not null check (formato in ('600ml', '300ml', '1000ml', 'Verde')),
  -- Em CAIXAS, a mesma unidade do parque, do contado e do transito -- e o
  -- que permite somar os quatro sem conversao no meio do caminho.
  quantidade integer not null default 0 check (quantidade >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_por_nome text,
  primary key (revenda_id, tipo, formato)
);

-- Lido por todo mundo que esta logado, igual ao transito e as contagens:
-- ele aparece na conciliacao e quem conta precisa ver de onde saiu a
-- diferenca. Escrever e que exige liberacao, e nao ha policy de escrita:
-- toda gravacao passa por acao de servidor, que confere.
alter table public.ag_comodato enable row level security;
grant select on public.ag_comodato to authenticated;
grant all on public.ag_comodato to service_role;

drop policy if exists ag_comodato_ler on public.ag_comodato;
create policy ag_comodato_ler on public.ag_comodato
  for select to authenticated using (true);

comment on table public.ag_comodato is
  'Ativo emprestado ao cliente. Saldo que vale ate alguem mudar -- nao se redigita todo dia.';

notify pgrst, 'reload schema';

-- Confira: as 8 linhas da Barbara viraram transito_rota, carreta zerado.
select data, tipo, formato, transito_rota, transito_carreta
from public.ag_transito
order by tipo, formato;
