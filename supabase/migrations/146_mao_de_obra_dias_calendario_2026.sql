-- ==================================================================
-- 146 - MAO DE OBRA: DIAS DE OPERACAO PELO CALENDARIO OFICIAL DE 2026
--       Revenda Lima Sao Felix (Bahia)
-- Execute no Supabase do App Colaborador DEPOIS da 145.
-- ==================================================================
-- Pedido do dono (28/09/2026): dias de operacao "conforme o calendario de
-- 2026". Regra: segunda a sabado, menos os feriados que caem nesses dias.
--
-- Feriados considerados (nacionais + estadual da Bahia):
--   01/01 qui  Confraternizacao        03/04 sex  Paixao de Cristo
--   21/04 ter  Tiradentes              01/05 sex  Dia do Trabalho
--   02/07 qui  Independencia da Bahia  07/09 seg  Independencia
--   12/10 seg  N. Sra. Aparecida       02/11 seg  Finados
--   20/11 sex  Consciencia Negra       25/12 sex  Natal
--   (15/11 cai no domingo.)
-- NAO sao feriado: Carnaval (16-17/02) e Corpus Christi (04/06) -- ponto
-- facultativo. Feriado MUNICIPAL de Sao Felix do Coribe nao esta aqui.
--
-- So dias_totais e sabados mudam; a grade do dia (o que de fato operou)
-- nao e tocada -- a base de volume mostra venda em 01/05 e 02/07, e esse
-- realizado continua valendo. Na pratica, mudam so maio (26 -> 25) e
-- julho (27 -> 26); os outros ja batiam.
-- ==================================================================

update public.mao_obra_meses m
set dias_totais = v.dias,
    sabados = v.sabados,
    revisado_em = now(),
    revisado_por_nome = 'Dias pelo calendario oficial 2026 (28/09/2026)'
from (values
  ('2026-01-01'::date, 26, 5),
  ('2026-02-01'::date, 24, 4),
  ('2026-03-01'::date, 26, 4),
  ('2026-04-01'::date, 24, 4),
  ('2026-05-01'::date, 25, 5),
  ('2026-06-01'::date, 26, 4),
  ('2026-07-01'::date, 26, 4),
  ('2026-08-01'::date, 26, 5),
  ('2026-09-01'::date, 25, 4),
  ('2026-10-01'::date, 26, 5),
  ('2026-11-01'::date, 23, 4),
  ('2026-12-01'::date, 26, 4)
) as v(competencia, dias, sabados)
where m.revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and m.competencia = v.competencia;

-- Confira: soma 303 dias no ano.
select to_char(competencia, 'YYYY-MM') as mes, dias_totais, sabados
from public.mao_obra_meses
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and competencia between '2026-01-01' and '2026-12-01'
order by competencia;
