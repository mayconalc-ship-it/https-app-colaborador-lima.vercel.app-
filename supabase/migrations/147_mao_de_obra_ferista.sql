-- ==================================================================
-- 147 - MAO DE OBRA: FROTA FERISTA E AJUSTE DA DISTRIBUICAO 2026
--       Revenda Lima Sao Felix
-- Execute no Supabase do App Colaborador ANTES do deploy deste commit
-- (a tela passa a ler e gravar a coluna nova).
-- ==================================================================
-- Pedido do dono (28/09/2026): "media do carro 40 HL, 1 reserva e 2
-- feristas". O simulador so tinha "reserva"; ferista (quem cobre FERIAS)
-- e outra coisa -- somar os dois num campo so apagaria a diferenca que o
-- dono faz entre eles. Vira coluna propria e entra na conta igual a
-- reserva:
--   frota = linear / media por carro + long distance + reserva + ferista - SPOT
--
-- Aplicado aos 12 meses de 2026, para o ano inteiro ter a mesma base (o
-- comparativo e a eficacia leem os meses anteriores).
-- ==================================================================

alter table public.mao_obra_meses
  add column if not exists frota_ferista integer;

update public.mao_obra_meses
set media_carro_hl = 40,
    frota_reserva = 1,
    frota_ferista = 2,
    revisado_em = now(),
    revisado_por_nome = 'Media 40 HL, 1 reserva e 2 feristas (28/09/2026)'
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and competencia between '2026-01-01' and '2026-12-01';

notify pgrst, 'reload schema';

-- Confira: 12 meses com 40 / 1 / 2.
select to_char(competencia, 'YYYY-MM') as mes, media_carro_hl, frota_long_dist, frota_reserva, frota_ferista, frota_spot
from public.mao_obra_meses
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and competencia between '2026-01-01' and '2026-12-01'
order by competencia;
