-- ==================================================================
-- 149 - MAO DE OBRA: JUSTIFICATIVA DO DIA ACIMA DO ANS COM VENDAS
-- Execute no Supabase do App Colaborador ANTES do deploy deste commit.
-- ==================================================================
-- Pedido do dono (28/09/2026): "a justificativa deve ser para os DIAS que
-- excederem 20% do necessario. Essa e a ANS com Vendas."
--
-- O acordo com Vendas e que o volume de um dia nao passe de 120% do
-- necessario daquele dia -- acima disso a operacao nao tem gente/frota
-- dimensionada. Todo dia acima de +20% passa a pedir motivo e detalhe,
-- gravados junto com o volume do dia.
--
-- A justificativa MENSAL da 148 (volume_justificativa_*) deixa de ser
-- usada pela tela; as colunas ficam, sem dado, para nao perder nada que
-- tenha sido digitado entre um deploy e outro.
-- ==================================================================

alter table public.mao_obra_dias
  add column if not exists justificativa_motivo text,
  add column if not exists justificativa text;

alter table public.mao_obra_dias
  drop constraint if exists mao_obra_dias_justificativa_tamanho;
alter table public.mao_obra_dias
  add constraint mao_obra_dias_justificativa_tamanho check (
    (justificativa_motivo is null or char_length(justificativa_motivo) <= 80)
    and (justificativa is null or char_length(justificativa) <= 300)
  );

notify pgrst, 'reload schema';

-- Confira: as duas colunas novas.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'mao_obra_dias'
  and column_name in ('justificativa_motivo', 'justificativa');
