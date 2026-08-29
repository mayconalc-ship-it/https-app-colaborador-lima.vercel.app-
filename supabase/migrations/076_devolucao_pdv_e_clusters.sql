-- ==================================================================
-- 076 - DEVOLUCAO: metrica por PDV e os clusters da casa
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Duas mudancas pedidas pelo dono em 29/08/2026:
--
-- 1) A metrica principal passa a ser PONTO DE VENDA, nao valor. E como a
--    operacao mede (inclusive para a RV). O valor continua na tela, em
--    segundo plano.
--
--    Medido nos 8 meses: a operacao roda a 1,47% dos PDVs atendidos --
--    a meta de 1,6% fica logo acima, coerente. Vale saber que no DIA a
--    regua e grossa: com ~16 PDVs por dia, uma unica devolucao ja da 6%.
--    Na pratica, 18% dos dias passam da meta, que sao exatamente os
--    mesmos 18% que tiveram alguma devolucao.
--
-- 2) Os nomes dos clusters viram os da casa: Mercado (era "cliente"),
--    Armazem/Financeiro (era "operacao") e entra VENDAS, que nao existia.

-- -------------------- PDV NO DIA --------------------
-- Contagem de PDVs DISTINTOS: um mesmo cliente pode ter duas notas no
-- mesmo dia e nao pode contar duas vezes.
alter table public.devolucao_dia
  add column if not exists pdvs_entregues integer not null default 0,
  add column if not exists pdvs_devolvidos integer not null default 0;

comment on column public.devolucao_dia.pdvs_entregues is
  'PDVs distintos atendidos no dia. E o denominador do indicador principal.';
comment on column public.devolucao_dia.pdvs_devolvidos is
  'PDVs distintos com devolucao que CONTA (ver devolucao_motivos.conta_no_indicador).';

-- Zerado ate a proxima importacao: a contagem so existe relendo o
-- relatorio, porque o agregado antigo nao guardava o cliente.

-- -------------------- CLUSTERS DA CASA --------------------
alter table public.devolucao_motivos
  drop constraint if exists devolucao_motivos_responsabilidade_check;

update public.devolucao_motivos set responsabilidade = 'mercado'
 where responsabilidade = 'cliente';

update public.devolucao_motivos set responsabilidade = 'armazem_financeiro'
 where responsabilidade = 'operacao';

-- "nao_conta" era o jeito antigo de tirar do indicador, antes da 075
-- separar os dois eixos. Quem estava assim vira Armazem/Financeiro com a
-- caixa desmarcada -- que e a mesma coisa, dita corretamente.
update public.devolucao_motivos
   set responsabilidade = 'armazem_financeiro', conta_no_indicador = false
 where responsabilidade = 'nao_conta';

alter table public.devolucao_motivos
  add constraint devolucao_motivos_responsabilidade_check
  check (responsabilidade in ('mercado', 'armazem_financeiro', 'vendas', 'entrega', 'nao_classificado'));

-- A justificativa continua sendo do motorista ou do ajudante -- este
-- check nao muda, mas fica registrado que foi conferido.

notify pgrst, 'reload schema';
