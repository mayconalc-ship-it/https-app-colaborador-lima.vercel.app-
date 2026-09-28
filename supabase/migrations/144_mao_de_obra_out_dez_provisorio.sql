-- ==================================================================
-- 144 - MAO DE OBRA: OUTUBRO A DEZEMBRO/2026, PROVISORIO
--       Revenda Lima Sao Felix
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (28/09/2026): lancar out-nov-dez repetindo SETEMBRO,
-- inclusive PPR, negociado e marketplace, COMO PROVISORIO -- os volumes
-- reais ainda nao existem. A observacao de cada mes diz isso, para
-- ninguem tomar a estimativa por plano.
--
-- Campo a campo:
--   volume_ppr, volume_negociado, marketplace  = setembro (PROVISORIO)
--   dias_totais, sabados   CALENDARIO: segunda a sabado, menos os
--                          feriados nacionais do periodo:
--                            12/10 (seg) N. Sra. Aparecida
--                            02/11 (seg) Finados
--                            20/11 (sex) Consciencia Negra
--                            25/12 (sex) Natal
--                          (15/11 cai num domingo). Feriado MUNICIPAL de
--                          Sao Felix do Coribe nao esta aqui -- desmarque
--                          na grade do dia se houver.
--   volume_entrega_sabado  proporcional ao de setembro (mesmo volume -> 200 HL)
--   frota, media por carro, puxadores, armazem, base_meta = setembro
--   volume_realizado       vazio (o mes nao aconteceu)
--
-- Os feriados tambem entram na grade do dia como "nao opera", para a meta
-- dos outros dias ja nascer redistribuida.
-- ==================================================================

-- 1) Os feriados na grade do dia.
insert into public.mao_obra_dias (revenda_id, competencia, dia, volume_realizado, opera, atualizado_em, atualizado_por_nome)
values
  ('7afe4da5-e846-4b02-947f-96843a2791fe', '2026-10-01', 12, null, false, now(), 'Feriado nacional (migration 144)'),
  ('7afe4da5-e846-4b02-947f-96843a2791fe', '2026-11-01', 2,  null, false, now(), 'Feriado nacional (migration 144)'),
  ('7afe4da5-e846-4b02-947f-96843a2791fe', '2026-11-01', 20, null, false, now(), 'Feriado nacional (migration 144)'),
  ('7afe4da5-e846-4b02-947f-96843a2791fe', '2026-12-01', 25, null, false, now(), 'Feriado nacional (migration 144)')
on conflict (revenda_id, competencia, dia) do update
  set opera = false, atualizado_em = excluded.atualizado_em, atualizado_por_nome = excluded.atualizado_por_nome;

-- 2) Os tres meses, a partir de setembro.
with sf as (select '7afe4da5-e846-4b02-947f-96843a2791fe'::uuid as id),
setembro as (
  select m.* from public.mao_obra_meses m, sf
  where m.revenda_id = sf.id and m.competencia = '2026-09-01'
),
meses as (
  select generate_series('2026-10-01'::date, '2026-12-01'::date, interval '1 month')::date as competencia
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
)
insert into public.mao_obra_meses (
  revenda_id, competencia,
  volume_ppr, volume_negociado, marketplace,
  dias_totais, sabados, volume_entrega_sabado,
  media_carro_hl, frota_long_dist, frota_reserva, frota_spot, frota_fixa_total, puxadores,
  operador_tarde, operador_reserva, manobristas,
  ajudante_noite, ajudante_manha, ajudante_tarde, ajudante_reserva, ajudante_extra,
  conferente_noite, conferente_manha, conferente_tarde,
  volume_realizado, base_meta, observacao, revisado_em, revisado_por_nome
)
select
  (select id from sf), c.competencia,
  s.volume_ppr, s.volume_negociado, s.marketplace,
  c.dias, c.sabados,
  round(s.volume_entrega_sabado / nullif(s.volume_negociado, 0) * s.volume_negociado, 2),
  s.media_carro_hl, s.frota_long_dist, s.frota_reserva, s.frota_spot, s.frota_fixa_total, s.puxadores,
  s.operador_tarde, s.operador_reserva, s.manobristas,
  s.ajudante_noite, s.ajudante_manha, s.ajudante_tarde, s.ajudante_reserva, s.ajudante_extra,
  s.conferente_noite, s.conferente_manha, s.conferente_tarde,
  null, s.base_meta,
  'PROVISORIO: PPR, negociado e marketplace repetidos de set/2026 ate o volume real sair. Nao formalizar como definitivo.',
  now(), 'Carga out-dez provisoria a partir de set/2026 (28/09/2026)'
from calendario c
cross join setembro s
on conflict (revenda_id, competencia) do update set
  volume_ppr = excluded.volume_ppr,
  volume_negociado = excluded.volume_negociado,
  marketplace = excluded.marketplace,
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
  base_meta = excluded.base_meta,
  observacao = excluded.observacao,
  revisado_em = excluded.revisado_em,
  revisado_por_nome = excluded.revisado_por_nome;

-- Confira: out 26/5, nov 23/4, dez 26/4; PPR 11.540 e negociado 11.780.
select to_char(competencia, 'YYYY-MM') as mes, dias_totais, sabados, volume_entrega_sabado,
       volume_ppr, volume_negociado, marketplace, observacao
from public.mao_obra_meses
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and competencia between '2026-10-01' and '2026-12-01'
order by competencia;
