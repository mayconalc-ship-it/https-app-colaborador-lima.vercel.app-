-- ==================================================================
-- 141 - MAO DE OBRA: VOLUME REALIZADO POR DIA, JAN A SET/2026
--       Revenda Lima Bahia Samavi -> Sao Felix do Coribe no app
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- GERADO da base "VOLUME DIARIO_SAO FELIX.xlsx" (aba Export, 6.597
-- linhas), pedido do dono em 28/09/2026.
--
-- O QUE ENTRA:
--   * Operacao "Lima Bahia Samavi".
--   * SO as cestas "CATEGORIA_AGRUPADO - CERVEJA" e
--     "CATEGORIA_AGRUPADO - NAB", somadas = volume total do dia. As outras
--     cestas (RGB, High End, Match, Zero...) sao RECORTES dessas duas e
--     somar junto contaria o mesmo HL duas vezes.
--   * Coluna "1. Volume (hl) Real" (sellout). O "Sellin" e compra da
--     fabrica, nao o que a operacao entregou.
--
-- COMO ENTRA (mesma regra da tela "Volume do dia"):
--   * Segunda a sabado com venda: volume_realizado = HL do dia, opera = sim.
--   * Segunda a sabado SEM venda na base: opera = nao, sem volume
--     (feriado -- a meta dos outros dias se redistribui):
--       01/01 (qui), 03/04 (sex), 22/04 (qua), 07/09 (seg)
--   * Domingo: fica sem linha, que no app ja e "nao opera". A base traz
--     16 domingos com volume residual, somando 0.00 HL -- ignorado.
--   * O que ja estava digitado nesses dias e SUBSTITUIDO pela base.
--
-- VOLUME REALIZADO DO MES (mao_obra_meses): preenchido de jan a ago, os
-- meses fechados, e SO onde o mes ja existe no simulador (nao cria mes
-- vazio). Setembro fica so no dia a dia: o mes ainda nao fechou.
--
-- Total por mes que entra aqui:
--   2026-01   10.858,11 HL
--   2026-02    8.342,93 HL
--   2026-03    7.997,79 HL
--   2026-04    8.361,06 HL
--   2026-05   10.041,96 HL
--   2026-06   10.009,71 HL
--   2026-07   10.492,45 HL
--   2026-08    9.505,55 HL
--   2026-09   10.359,31 HL
-- ==================================================================

with revenda as (
  select id from public.revendas where id = '7afe4da5-e846-4b02-947f-96843a2791fe' -- Sao Felix
),
dados (competencia, dia, volume_realizado, opera) as (
  values
  ('2026-01-01', 1, null, false),
  ('2026-01-01', 2, 640.69, true),
  ('2026-01-01', 3, 437.22, true),
  ('2026-01-01', 5, 578.45, true),
  ('2026-01-01', 6, 458.17, true),
  ('2026-01-01', 7, 394.46, true),
  ('2026-01-01', 8, 551.41, true),
  ('2026-01-01', 9, 369.31, true),
  ('2026-01-01', 10, 215.97, true),
  ('2026-01-01', 12, 228.46, true),
  ('2026-01-01', 13, 487.88, true),
  ('2026-01-01', 14, 386.14, true),
  ('2026-01-01', 15, 529.52, true),
  ('2026-01-01', 16, 519.01, true),
  ('2026-01-01', 17, 293.54, true),
  ('2026-01-01', 19, 462.87, true),
  ('2026-01-01', 20, 469.72, true),
  ('2026-01-01', 21, 485.95, true),
  ('2026-01-01', 22, 285.20, true),
  ('2026-01-01', 23, 262.18, true),
  ('2026-01-01', 24, 94.82, true),
  ('2026-01-01', 26, 416.70, true),
  ('2026-01-01', 27, 400.73, true),
  ('2026-01-01', 28, 320.81, true),
  ('2026-01-01', 29, 427.53, true),
  ('2026-01-01', 30, 523.13, true),
  ('2026-01-01', 31, 618.24, true),
  ('2026-02-01', 2, 346.79, true),
  ('2026-02-01', 3, 351.24, true),
  ('2026-02-01', 4, 542.27, true),
  ('2026-02-01', 5, 533.28, true),
  ('2026-02-01', 6, 318.16, true),
  ('2026-02-01', 7, 0.00, true),
  ('2026-02-01', 9, 284.06, true),
  ('2026-02-01', 10, 463.92, true),
  ('2026-02-01', 11, 449.04, true),
  ('2026-02-01', 12, 414.08, true),
  ('2026-02-01', 13, 468.52, true),
  ('2026-02-01', 14, 236.19, true),
  ('2026-02-01', 16, 258.06, true),
  ('2026-02-01', 17, 0.00, true),
  ('2026-02-01', 18, 294.10, true),
  ('2026-02-01', 19, 317.20, true),
  ('2026-02-01', 20, 622.05, true),
  ('2026-02-01', 21, 275.41, true),
  ('2026-02-01', 23, 543.46, true),
  ('2026-02-01', 24, 185.35, true),
  ('2026-02-01', 25, 345.15, true),
  ('2026-02-01', 26, 331.81, true),
  ('2026-02-01', 27, 585.06, true),
  ('2026-02-01', 28, 177.73, true),
  ('2026-03-01', 2, 184.11, true),
  ('2026-03-01', 3, 374.04, true),
  ('2026-03-01', 4, 225.98, true),
  ('2026-03-01', 5, 295.41, true),
  ('2026-03-01', 6, 260.94, true),
  ('2026-03-01', 7, 109.24, true),
  ('2026-03-01', 9, 305.40, true),
  ('2026-03-01', 10, 295.71, true),
  ('2026-03-01', 11, 353.38, true),
  ('2026-03-01', 12, 322.06, true),
  ('2026-03-01', 13, 327.12, true),
  ('2026-03-01', 14, 187.82, true),
  ('2026-03-01', 16, 306.76, true),
  ('2026-03-01', 17, 274.81, true),
  ('2026-03-01', 18, 352.15, true),
  ('2026-03-01', 19, 428.07, true),
  ('2026-03-01', 20, 322.36, true),
  ('2026-03-01', 21, 416.80, true),
  ('2026-03-01', 23, 286.77, true),
  ('2026-03-01', 24, 301.59, true),
  ('2026-03-01', 25, 339.86, true),
  ('2026-03-01', 26, 426.53, true),
  ('2026-03-01', 27, 292.93, true),
  ('2026-03-01', 28, 259.51, true),
  ('2026-03-01', 30, 336.75, true),
  ('2026-03-01', 31, 411.69, true),
  ('2026-04-01', 1, 329.65, true),
  ('2026-04-01', 2, 415.24, true),
  ('2026-04-01', 3, null, false),
  ('2026-04-01', 4, 215.53, true),
  ('2026-04-01', 6, 205.36, true),
  ('2026-04-01', 7, 348.39, true),
  ('2026-04-01', 8, 386.30, true),
  ('2026-04-01', 9, 440.33, true),
  ('2026-04-01', 10, 340.96, true),
  ('2026-04-01', 11, 175.84, true),
  ('2026-04-01', 13, 235.78, true),
  ('2026-04-01', 14, 353.63, true),
  ('2026-04-01', 15, 414.39, true),
  ('2026-04-01', 16, 390.45, true),
  ('2026-04-01', 17, 428.77, true),
  ('2026-04-01', 18, 186.97, true),
  ('2026-04-01', 20, 199.89, true),
  ('2026-04-01', 21, 432.13, true),
  ('2026-04-01', 22, null, false),
  ('2026-04-01', 23, 498.14, true),
  ('2026-04-01', 24, 470.28, true),
  ('2026-04-01', 25, 218.45, true),
  ('2026-04-01', 27, 386.84, true),
  ('2026-04-01', 28, 358.57, true),
  ('2026-04-01', 29, 462.49, true),
  ('2026-04-01', 30, 466.68, true),
  ('2026-05-01', 1, 0.00, true),
  ('2026-05-01', 2, 385.63, true),
  ('2026-05-01', 4, 409.54, true),
  ('2026-05-01', 5, 498.43, true),
  ('2026-05-01', 6, 377.33, true),
  ('2026-05-01', 7, 424.58, true),
  ('2026-05-01', 8, 392.30, true),
  ('2026-05-01', 9, 170.04, true),
  ('2026-05-01', 11, 313.11, true),
  ('2026-05-01', 12, 418.61, true),
  ('2026-05-01', 13, 516.40, true),
  ('2026-05-01', 14, 430.62, true),
  ('2026-05-01', 15, 778.16, true),
  ('2026-05-01', 16, 391.56, true),
  ('2026-05-01', 18, 474.40, true),
  ('2026-05-01', 19, 407.07, true),
  ('2026-05-01', 20, 459.72, true),
  ('2026-05-01', 21, 410.97, true),
  ('2026-05-01', 22, 496.39, true),
  ('2026-05-01', 23, 177.02, true),
  ('2026-05-01', 25, 274.36, true),
  ('2026-05-01', 26, 382.43, true),
  ('2026-05-01', 27, 406.61, true),
  ('2026-05-01', 28, 420.14, true),
  ('2026-05-01', 29, 445.61, true),
  ('2026-05-01', 30, 180.93, true),
  ('2026-06-01', 1, 227.09, true),
  ('2026-06-01', 2, 415.38, true),
  ('2026-06-01', 3, 437.05, true),
  ('2026-06-01', 4, 333.29, true),
  ('2026-06-01', 5, 442.79, true),
  ('2026-06-01', 6, 267.42, true),
  ('2026-06-01', 8, 373.63, true),
  ('2026-06-01', 9, 438.02, true),
  ('2026-06-01', 10, 467.37, true),
  ('2026-06-01', 11, 407.54, true),
  ('2026-06-01', 12, 406.18, true),
  ('2026-06-01', 13, 164.01, true),
  ('2026-06-01', 15, 336.84, true),
  ('2026-06-01', 16, 388.64, true),
  ('2026-06-01', 17, 562.64, true),
  ('2026-06-01', 18, 568.86, true),
  ('2026-06-01', 19, 497.77, true),
  ('2026-06-01', 20, 380.31, true),
  ('2026-06-01', 22, 376.93, true),
  ('2026-06-01', 23, 410.81, true),
  ('2026-06-01', 24, 463.32, true),
  ('2026-06-01', 25, 492.03, true),
  ('2026-06-01', 26, 413.57, true),
  ('2026-06-01', 27, 124.86, true),
  ('2026-06-01', 29, 233.96, true),
  ('2026-06-01', 30, 379.40, true),
  ('2026-07-01', 1, 413.36, true),
  ('2026-07-01', 2, 0.00, true),
  ('2026-07-01', 3, 550.60, true),
  ('2026-07-01', 4, 392.53, true),
  ('2026-07-01', 6, 275.54, true),
  ('2026-07-01', 7, 475.23, true),
  ('2026-07-01', 8, 559.29, true),
  ('2026-07-01', 9, 414.09, true),
  ('2026-07-01', 10, 349.97, true),
  ('2026-07-01', 11, 300.90, true),
  ('2026-07-01', 13, 247.59, true),
  ('2026-07-01', 14, 413.86, true),
  ('2026-07-01', 15, 308.93, true),
  ('2026-07-01', 16, 503.13, true),
  ('2026-07-01', 17, 486.92, true),
  ('2026-07-01', 18, 214.17, true),
  ('2026-07-01', 20, 349.00, true),
  ('2026-07-01', 21, 329.93, true),
  ('2026-07-01', 22, 420.99, true),
  ('2026-07-01', 23, 502.21, true),
  ('2026-07-01', 24, 469.48, true),
  ('2026-07-01', 25, 263.38, true),
  ('2026-07-01', 27, 246.91, true),
  ('2026-07-01', 28, 384.92, true),
  ('2026-07-01', 29, 588.46, true),
  ('2026-07-01', 30, 402.37, true),
  ('2026-07-01', 31, 628.69, true),
  ('2026-08-01', 1, 171.51, true),
  ('2026-08-01', 3, 225.03, true),
  ('2026-08-01', 4, 376.74, true),
  ('2026-08-01', 5, 346.89, true),
  ('2026-08-01', 6, 471.96, true),
  ('2026-08-01', 7, 406.80, true),
  ('2026-08-01', 8, 174.99, true),
  ('2026-08-01', 10, 257.07, true),
  ('2026-08-01', 11, 412.82, true),
  ('2026-08-01', 12, 417.07, true),
  ('2026-08-01', 13, 539.93, true),
  ('2026-08-01', 14, 385.16, true),
  ('2026-08-01', 15, 189.66, true),
  ('2026-08-01', 17, 236.46, true),
  ('2026-08-01', 18, 355.37, true),
  ('2026-08-01', 19, 459.00, true),
  ('2026-08-01', 20, 392.40, true),
  ('2026-08-01', 21, 256.82, true),
  ('2026-08-01', 22, 0.00, true),
  ('2026-08-01', 24, 245.05, true),
  ('2026-08-01', 25, 548.38, true),
  ('2026-08-01', 26, 530.60, true),
  ('2026-08-01', 27, 735.30, true),
  ('2026-08-01', 28, 475.81, true),
  ('2026-08-01', 29, 496.55, true),
  ('2026-08-01', 31, 398.18, true),
  ('2026-09-01', 1, 397.28, true),
  ('2026-09-01', 2, 403.00, true),
  ('2026-09-01', 3, 536.37, true),
  ('2026-09-01', 4, 463.09, true),
  ('2026-09-01', 5, 192.24, true),
  ('2026-09-01', 7, null, false),
  ('2026-09-01', 8, 515.84, true),
  ('2026-09-01', 9, 528.84, true),
  ('2026-09-01', 10, 546.61, true),
  ('2026-09-01', 11, 647.94, true),
  ('2026-09-01', 12, 502.31, true),
  ('2026-09-01', 14, 418.69, true),
  ('2026-09-01', 15, 565.11, true),
  ('2026-09-01', 16, 347.61, true),
  ('2026-09-01', 17, 440.69, true),
  ('2026-09-01', 18, 527.49, true),
  ('2026-09-01', 19, 273.08, true),
  ('2026-09-01', 21, 322.30, true),
  ('2026-09-01', 22, 424.63, true),
  ('2026-09-01', 23, 461.02, true),
  ('2026-09-01', 24, 678.53, true),
  ('2026-09-01', 25, 569.27, true),
  ('2026-09-01', 26, 246.19, true),
  ('2026-09-01', 28, 351.18, true)
)
insert into public.mao_obra_dias (revenda_id, competencia, dia, volume_realizado, opera, atualizado_em, atualizado_por_nome)
select r.id, d.competencia::date, d.dia, d.volume_realizado::numeric, d.opera, now(), 'Base Volume Diario (Samavi) - 28/09/2026'
from dados d cross join revenda r
on conflict (revenda_id, competencia, dia) do update
  set volume_realizado = excluded.volume_realizado,
      opera = excluded.opera,
      atualizado_em = excluded.atualizado_em,
      atualizado_por_nome = excluded.atualizado_por_nome;

update public.mao_obra_meses m
set volume_realizado = v.hl
from (values
  ('2026-01-01'::date, 10858.11),
  ('2026-02-01'::date, 8342.93),
  ('2026-03-01'::date, 7997.79),
  ('2026-04-01'::date, 8361.06),
  ('2026-05-01'::date, 10041.96),
  ('2026-06-01'::date, 10009.71),
  ('2026-07-01'::date, 10492.45),
  ('2026-08-01'::date, 9505.55)
) as v(competencia, hl)
where m.revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and m.competencia = v.competencia;

-- Confira: a revenda, e o total por mes (tem de bater com o cabecalho).
select
  (select nome from public.revendas where id = '7afe4da5-e846-4b02-947f-96843a2791fe') as revenda,
  to_char(d.competencia, 'YYYY-MM') as mes,
  count(*) filter (where d.volume_realizado is not null) as dias_com_volume,
  count(*) filter (where not d.opera) as dias_nao_opera,
  sum(d.volume_realizado) as hl_do_mes,
  (select m.volume_realizado from public.mao_obra_meses m
    where m.revenda_id = d.revenda_id and m.competencia = d.competencia) as realizado_no_mes
from public.mao_obra_dias d
where d.revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and d.competencia between '2026-01-01' and '2026-09-01'
group by d.revenda_id, d.competencia
order by d.competencia;