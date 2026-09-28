-- ==================================================================
-- 145 - MAO DE OBRA: VOLUME PPR DE 2026 (JAN A DEZ)
--       Revenda Lima Sao Felix
-- Execute no Supabase do App Colaborador DEPOIS da 144.
-- ==================================================================
-- Fonte: planilha "PPR Entrega - Resumo da Produtividade" (103411), linha
-- "Volume Hectolitros", enviada pelo dono em 28/09/2026. Soma 144.079 HL,
-- igual a coluna Acum da planilha.
--
-- So o volume_ppr muda. Negociado, marketplace, dias e o resto ficam como
-- estao. Em out-dez a observacao passa a dizer que o PPR e o oficial e que
-- so o NEGOCIADO continua provisorio (repetido de setembro).
-- ==================================================================

update public.mao_obra_meses m
set volume_ppr = v.ppr,
    revisado_em = now(),
    revisado_por_nome = 'PPR 2026 da planilha PPR Entrega (28/09/2026)'
from (values
  ('2026-01-01'::date, 11450.00),
  ('2026-02-01'::date, 12152.00),
  ('2026-03-01'::date, 11086.00),
  ('2026-04-01'::date, 11189.00),
  ('2026-05-01'::date, 11303.00),
  ('2026-06-01'::date, 11648.00),
  ('2026-07-01'::date, 11757.00),
  ('2026-08-01'::date, 10889.00),
  ('2026-09-01'::date, 12365.00),
  ('2026-10-01'::date, 12250.00),
  ('2026-11-01'::date, 13145.00),
  ('2026-12-01'::date, 14845.00)
) as v(competencia, ppr)
where m.revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and m.competencia = v.competencia;

update public.mao_obra_meses
set observacao = 'PROVISORIO: volume NEGOCIADO e marketplace repetidos de set/2026 ate a negociacao sair. O PPR e o oficial (planilha PPR Entrega).'
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and competencia between '2026-10-01' and '2026-12-01';

-- Confira: 12 meses, soma do PPR = 144.079.
select to_char(competencia, 'YYYY-MM') as mes, volume_ppr, volume_negociado, volume_realizado
from public.mao_obra_meses
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and competencia between '2026-01-01' and '2026-12-01'
order by competencia;

select sum(volume_ppr) as ppr_2026
from public.mao_obra_meses
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and competencia between '2026-01-01' and '2026-12-01';
