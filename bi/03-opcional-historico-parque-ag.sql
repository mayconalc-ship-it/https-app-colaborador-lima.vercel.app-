-- ==================================================================
-- OPCIONAL - HISTORICO DO PARQUE DE AG
-- Execute no Supabase SOMENTE se quiser divergencia historica de verdade
-- ==================================================================
-- ESTE E O UNICO ARQUIVO DA PASTA QUE ALTERA O BANCO DO APP. Os outros
-- dois so criam views e permissoes. Leia antes de rodar.
--
-- O problema que ele resolve
-- --------------------------
-- public.ag_parque guarda UM saldo por revenda/tipo/formato, sobrescrito
-- a cada ajuste. E o desenho certo para a tela do app, que sempre mostra
-- o saldo de agora. Mas para o BI ele destroi o passado: a divergencia
-- do dia 3 de junho passa a ser calculada contra o saldo de hoje, e o
-- grafico de "evolucao das divergencias" vira ficcao -- ele se reescreve
-- inteiro toda vez que alguem corrige o parque.
--
-- Por isso bi.fato_ag_conciliacao marca parque_confiavel = false em tudo
-- que nao for o dia da ultima atualizacao. Isso e honesto, mas deixa o
-- indicador quase sem serie historica.
--
-- Como ele resolve
-- ----------------
-- Uma tabela de fotografias: toda vez que o parque muda, grava-se o
-- saldo daquele dia. A partir da instalacao, cada dia passa a ter o
-- saldo que valia nele. Nao ha reconstrucao do passado -- o que ja foi
-- sobrescrito, foi. A serie confiavel comeca hoje.
--
-- Custo: uma linha por revenda/tipo/formato por DIA EM QUE HOUVE MUDANCA.
-- Com 2 tipos x 4 formatos x 2 revendas, sao no maximo 16 linhas por dia
-- de ajuste. Em dez anos isso nao chega a 60 mil linhas.

-- ------------------------------------------------------------------
-- 1) A TABELA DE FOTOGRAFIAS
-- ------------------------------------------------------------------
create table if not exists public.ag_parque_historico (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- O dia da revenda (America/Sao_Paulo), nao o dia UTC do servidor.
  dia date not null,
  tipo text not null check (tipo in ('Kit AG', 'GFE sem Garrafa')),
  formato text not null check (formato in ('600ml', '300ml', '1000ml', 'Verde')),
  quantidade integer not null check (quantidade >= 0),
  registrado_em timestamptz not null default now(),
  -- Uma foto por dia. Se o parque mudar tres vezes no mesmo dia, vale a
  -- ultima -- e o saldo com que o dia fechou, que e o que a conciliacao
  -- do dia deve enxergar.
  primary key (revenda_id, dia, tipo, formato)
);

create index if not exists ag_parque_historico_dia_idx
  on public.ag_parque_historico (revenda_id, dia desc);

grant all on public.ag_parque_historico to service_role;

alter table public.ag_parque_historico enable row level security;

-- RLS ligada e nenhuma politica, no mesmo desenho de ag_parque: a tela
-- do app nao le esta tabela, so o BI (pela camada bi, que roda como dona)
-- e as acoes de servidor.

-- ------------------------------------------------------------------
-- 2) O GATILHO QUE FOTOGRAFA
-- ------------------------------------------------------------------
create or replace function public.ag_parque_fotografar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ag_parque_historico
    (revenda_id, dia, tipo, formato, quantidade)
  values (
    new.revenda_id,
    (now() at time zone 'America/Sao_Paulo')::date,
    new.tipo, new.formato, new.quantidade
  )
  on conflict (revenda_id, dia, tipo, formato) do update
    set quantidade    = excluded.quantidade,
        registrado_em = now();
  return new;
end;
$$;

drop trigger if exists ag_parque_fotografar on public.ag_parque;
create trigger ag_parque_fotografar
  after insert or update of quantidade on public.ag_parque
  for each row execute function public.ag_parque_fotografar();

-- ------------------------------------------------------------------
-- 3) A PRIMEIRA FOTO
-- ------------------------------------------------------------------
-- Grava o saldo atual como sendo o do dia em que ele foi atualizado pela
-- ultima vez. E a unica informacao de passado que existe -- dai para tras
-- nao ha o que recuperar.
insert into public.ag_parque_historico
  (revenda_id, dia, tipo, formato, quantidade, registrado_em)
select
  p.revenda_id,
  (p.atualizado_em at time zone 'America/Sao_Paulo')::date,
  p.tipo, p.formato, p.quantidade, p.atualizado_em
from public.ag_parque p
on conflict (revenda_id, dia, tipo, formato) do nothing;

-- ------------------------------------------------------------------
-- 4) A CONCILIACAO COM HISTORICO
-- ------------------------------------------------------------------
-- Para cada dia contado, busca a foto MAIS RECENTE que nao seja posterior
-- a ele -- o saldo que valia naquele dia, e nao o de hoje.
--
-- Depois de rodar este arquivo, troque bi.fato_ag_conciliacao por esta
-- view nos visuais de divergencia do relatorio.
create or replace view bi.fato_ag_conciliacao_historica as
with contado as (
  select
    c.revenda_id, c.data, c.tipo, c.formato,
    sum(c.total_caixas)              as contado,
    count(*)                         as linhas,
    count(distinct c.colaborador_id) as contadores
  from bi.fato_ag_contagem c
  group by 1, 2, 3, 4
)
select
  ct.revenda_id,
  ct.data,
  ct.tipo,
  ct.formato,
  ct.tipo || ' · ' || ct.formato          as item,
  ct.contado,
  ct.linhas,
  ct.contadores,
  h.quantidade                            as parque,
  h.dia                                   as parque_do_dia,
  (ct.data - h.dia)                       as idade_do_parque_dias,
  ct.contado - h.quantidade               as diferenca,
  abs(ct.contado - h.quantidade)          as diferenca_abs,
  case when h.quantidade > 0 then
    round((ct.contado - h.quantidade)::numeric / h.quantidade, 4)
  end                                     as diferenca_pct,
  case
    when h.quantidade is null              then 'Sem parque na data'
    when ct.contado = h.quantidade         then 'Bateu'
    when ct.contado > h.quantidade         then 'Sobra'
    else                                        'Falta'
  end                                     as resultado,
  (h.quantidade is not null)              as parque_confiavel
from contado ct
left join lateral (
  select ph.quantidade, ph.dia
  from public.ag_parque_historico ph
  where ph.revenda_id = ct.revenda_id
    and ph.tipo       = ct.tipo
    and ph.formato    = ct.formato
    and ph.dia       <= ct.data
  order by ph.dia desc
  limit 1
) h on true;

comment on view bi.fato_ag_conciliacao_historica is
  'Contado x parque que valia NAQUELE dia. idade_do_parque_dias mostra ha quanto tempo o saldo nao era ajustado.';

-- Libera a view nova para o usuario de BI, se ele ja existir. O "if" evita
-- que este arquivo falhe quando rodado antes do 02-acesso-powerbi.sql.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'powerbi_readonly') then
    grant select on bi.fato_ag_conciliacao_historica to powerbi_readonly;
  end if;
end $$;

notify pgrst, 'reload schema';
