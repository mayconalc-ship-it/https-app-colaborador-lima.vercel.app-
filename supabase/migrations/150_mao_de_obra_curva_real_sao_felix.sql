-- ==================================================================
-- 150 - MAO DE OBRA: CURVA DE VENDA REAL POR DIA DA SEMANA (SAO FELIX)
-- JA APLICADA em 28/09/2026 (gravada direto a pedido do dono). Rodar de
-- novo nao muda nada -- fica aqui como registro.
-- ==================================================================
-- A curva cadastrada (seg 15, ter 24, qua 23, qui 18, sex 12, sab 8) era
-- diferente da venda real: toda terca/quarta aparecia abaixo do ANS com
-- Vendas e quase toda sexta/sabado acima -- 114 dias "fora" em jan-set.
--
-- A curva nova e a MEDIA do volume realizado de cada dia da semana, de
-- janeiro a setembro/2026 (base Lima Bahia Samavi, migration 141), dias
-- com venda e que operaram:
--   seg 320 HL (38 dias)  ter 403 (37)  qua 420 (37)
--   qui 452 (37)          sex 455 (37)  sab 264 (37)
-- normalizada para somar 100%. Com ela, setembro cai de 14 para 6 dias
-- fora do ANS.
-- ==================================================================

update public.mao_obra_config
set sellout_seg = 13.8,
    sellout_ter = 17.4,
    sellout_qua = 18.2,
    sellout_qui = 19.5,
    sellout_sex = 19.7,
    sellout_sab = 11.4,
    sellout_dom = 0,
    atualizado_em = now(),
    atualizado_por_nome = 'Curva real jan-set/2026 (28/09/2026)'
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe';

select sellout_seg, sellout_ter, sellout_qua, sellout_qui, sellout_sex, sellout_sab, sellout_dom,
       sellout_seg + sellout_ter + sellout_qua + sellout_qui + sellout_sex + sellout_sab + sellout_dom as soma
from public.mao_obra_config
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe';
