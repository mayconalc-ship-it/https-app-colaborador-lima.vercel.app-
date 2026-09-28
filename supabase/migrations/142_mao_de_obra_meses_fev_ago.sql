-- ==================================================================
-- 142 - MAO DE OBRA: FEVEREIRO A AGOSTO/2026 A PARTIR DE SETEMBRO
--       Revenda Lima Sao Felix
-- Execute no Supabase do App Colaborador DEPOIS da 141.
-- ==================================================================
-- Pedido do dono (28/09/2026): repetir os parametros do mes nos meses
-- que faltam, EXCETO volume PPR, volume negociado e marketplace (ficam
-- em branco para ele preencher).
--
-- Campo a campo, de onde vem:
--   dias_totais (dia TT)   CALENDARIO: segunda a sabado do mes, menos os
--                          dias marcados "nao opera" na grade do dia
--                          (feriados sem venda, migration 141).
--   sabados                CALENDARIO: sabados do mes que operaram.
--   volume_entrega_sabado  PROPORCIONAL ao de setembro:
--                          200 HL / 11.780 HL negociado de setembro
--                          x volume realizado do mes.
--   media_carro_hl, frota_long_dist, frota_reserva, frota_spot,
--   frota_fixa_total, puxadores          = setembro.
--   armazem (operador_tarde ... conferente_tarde) = setembro.
--   volume_realizado       SOMA da grade do dia do proprio mes.
--   base_meta              = setembro.
--
-- Janeiro e setembro: SO dias_totais e sabados sao corrigidos para o
-- calendario (pedido do dono, 28/09/2026) -- estavam 24/4 e 26/4, e o
-- calendario da 26/5 (jan) e 25/4 (set, 07/09 nao opera). O resto do que
-- foi digitado a mao nesses dois meses fica como esta.
-- Se o mes ja existir, so os campos acima sao atualizados -- PPR,
-- negociado e marketplace que alguem tenha digitado ficam como estao.
-- ==================================================================

with sf as (select '7afe4da5-e846-4b02-947f-96843a2791fe'::uuid as id),
setembro as (
  select m.* from public.mao_obra_meses m, sf
  where m.revenda_id = sf.id and m.competencia = '2026-09-01'
),
meses as (
  select generate_series('2026-02-01'::date, '2026-08-01'::date, interval '1 month')::date as competencia
),
calendario as (
  select me.competencia,
         count(*) filter (where extract(dow from d) <> 0 and coalesce(dd.opera, true)) as dias,
         count(*) filter (where extract(dow from d) = 6 and coalesce(dd.opera, true)) as sabados
  from meses me
  cross join lateral generate_series(me.competencia, (me.competencia + interval '1 month' - interval '1 day')::date, interval '1 day') as d
  left join public.mao_obra_dias dd
    on dd.revenda_id = (select id from sf)
   and dd.competencia = me.competencia
   and dd.dia = extract(day from d)
  group by me.competencia
),
realizado as (
  select dd.competencia, sum(dd.volume_realizado) as hl
  from public.mao_obra_dias dd, sf
  where dd.revenda_id = sf.id
  group by dd.competencia
)
insert into public.mao_obra_meses (
  revenda_id, competencia,
  dias_totais, sabados, volume_entrega_sabado,
  media_carro_hl, frota_long_dist, frota_reserva, frota_spot, frota_fixa_total, puxadores,
  operador_tarde, operador_reserva, manobristas,
  ajudante_noite, ajudante_manha, ajudante_tarde, ajudante_reserva, ajudante_extra,
  conferente_noite, conferente_manha, conferente_tarde,
  volume_realizado, base_meta, observacao, revisado_em, revisado_por_nome
)
select
  (select id from sf), c.competencia,
  c.dias, c.sabados,
  round(s.volume_entrega_sabado / nullif(s.volume_negociado, 0) * r.hl, 2),
  s.media_carro_hl, s.frota_long_dist, s.frota_reserva, s.frota_spot, s.frota_fixa_total, s.puxadores,
  s.operador_tarde, s.operador_reserva, s.manobristas,
  s.ajudante_noite, s.ajudante_manha, s.ajudante_tarde, s.ajudante_reserva, s.ajudante_extra,
  s.conferente_noite, s.conferente_manha, s.conferente_tarde,
  r.hl, s.base_meta,
  'Parametros repetidos de set/2026; dias e sabados pelo calendario; volume de sabado proporcional ao realizado.',
  now(), 'Carga fev-ago a partir de set/2026 (28/09/2026)'
from calendario c
cross join setembro s
left join realizado r on r.competencia = c.competencia
on conflict (revenda_id, competencia) do update set
  dias_totais = excluded.dias_totais,
  sabados = excluded.sabados,
  volume_entrega_sabado = excluded.volume_entrega_sabado,
  media_carro_hl = excluded.media_carro_hl,
  frota_long_dist = excluded.frota_long_dist,
  frota_reserva = excluded.frota_reserva,
  frota_spot = excluded.frota_spot,
  frota_fixa_total = excluded.frota_fixa_total,
  puxadores = excluded.puxadores,
  operador_tarde = excluded.operador_tarde,
  operador_reserva = excluded.operador_reserva,
  manobristas = excluded.manobristas,
  ajudante_noite = excluded.ajudante_noite,
  ajudante_manha = excluded.ajudante_manha,
  ajudante_tarde = excluded.ajudante_tarde,
  ajudante_reserva = excluded.ajudante_reserva,
  ajudante_extra = excluded.ajudante_extra,
  conferente_noite = excluded.conferente_noite,
  conferente_manha = excluded.conferente_manha,
  conferente_tarde = excluded.conferente_tarde,
  volume_realizado = excluded.volume_realizado,
  base_meta = excluded.base_meta,
  observacao = excluded.observacao,
  revisado_em = excluded.revisado_em,
  revisado_por_nome = excluded.revisado_por_nome;

-- ------------------------------------------------------------------
-- Janeiro e setembro: dias e sabados pelo calendario (mesma regra).
-- ------------------------------------------------------------------
with calendario as (
  select me.competencia,
         count(*) filter (where extract(dow from d) <> 0 and coalesce(dd.opera, true)) as dias,
         count(*) filter (where extract(dow from d) = 6 and coalesce(dd.opera, true)) as sabados
  from (values ('2026-01-01'::date), ('2026-09-01'::date)) as me(competencia)
  cross join lateral generate_series(me.competencia, (me.competencia + interval '1 month' - interval '1 day')::date, interval '1 day') as d
  left join public.mao_obra_dias dd
    on dd.revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
   and dd.competencia = me.competencia
   and dd.dia = extract(day from d)
  group by me.competencia
)
update public.mao_obra_meses m
set dias_totais = c.dias,
    sabados = c.sabados,
    revisado_em = now(),
    revisado_por_nome = 'Dias e sabados pelo calendario (28/09/2026)'
from calendario c
where m.revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and m.competencia = c.competencia;

-- Confira: 9 meses; jan 26/5, set 25/4; fev-ago com PPR/negociado vazios.
select to_char(competencia, 'YYYY-MM') as mes, dias_totais, sabados, volume_entrega_sabado,
       media_carro_hl, frota_fixa_total, volume_ppr, volume_negociado, marketplace, volume_realizado
from public.mao_obra_meses
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and competencia between '2026-01-01' and '2026-09-01'
order by competencia;
