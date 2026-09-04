-- ==================================================================
-- 096 - PALETE, LASTRO, CAIXA E UNIDADE no Picking e no FEFO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (04/09/2026): as quatro unidades em que o armazem conta
-- de verdade, no Abastecimento do Picking e na Quebra de FEFO, refletidas
-- no calculo de HL.
--
-- Cada modulo tinha a sua lista curta, e nenhum aceitava LASTRO -- que e
-- como o patio conta meio palete:
--   Abastecimento  caixa, palete
--   FEFO           palete, caixa, unidade
--
-- 1) O FATOR QUE FALTAVA
-- Nenhuma conversao de lastro era possivel porque o cadastro nao tinha o
-- numero: pa_produtos guarda caixas_pallet e unidades_por_caixa, e nada
-- sobre lastro. Sem esta coluna, "1 lastro" nao vira caixa nenhuma e
-- portanto nao vira HL.
--
-- Fica NULO por padrao, e isso e proposital: ninguem sabe o lastro de 565
-- produtos hoje. Quem nao tiver o numero simplesmente NAO OFERECE a opcao
-- lastro naquele produto -- a tela lista so as unidades que o cadastro
-- sustenta (ver unidadesDisponiveis em src/lib/unidades-produto.ts).
-- Preencher um valor chutado seria pior: viraria HL errado com cara de
-- certo.
--
-- 2) HL NO FEFO
-- O FEFO registrava quantidade e unidade e parava ali. Com as quatro
-- unidades no mesmo lugar, "12" de um produto e "12" de outro deixam de
-- ser comparaveis sem converter -- entao o HL passa a ser gravado na
-- hora, como no Abastecimento, no Reepack e no Bate Palete. Gravado, e
-- nao calculado na leitura: se o fator do produto mudar amanha, o que ja
-- foi registrado continua valendo o que valia.
--
-- Fica NULO nas ocorrencias antigas. Nao da para recalcular: elas foram
-- lancadas quando "palete" nao exigia caixas_pallet, e inventar o HL
-- delas agora seria inventar numero.

-- ------------------------------------------------------------------
-- 1) CAIXAS POR LASTRO
-- ------------------------------------------------------------------
alter table public.pa_produtos
  add column if not exists caixas_por_lastro integer;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pa_produtos_caixas_por_lastro_check') then
    alter table public.pa_produtos drop constraint pa_produtos_caixas_por_lastro_check;
  end if;
end $$;

-- Zero nao e "nao sei": e uma divisao que nao existe. Nulo e o "nao sei".
alter table public.pa_produtos
  add constraint pa_produtos_caixas_por_lastro_check
  check (caixas_por_lastro is null or caixas_por_lastro > 0);

comment on column public.pa_produtos.caixas_por_lastro is
  'Caixas em um lastro (uma camada do palete). NULO = nao cadastrado, e a unidade "lastro" nao e oferecida para este produto.';

-- ------------------------------------------------------------------
-- 2) AS UNIDADES ACEITAS EM CADA TABELA
-- ------------------------------------------------------------------
-- Abastecimento do Picking: aceitava caixa e palete.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pa_abastecimento_itens_unidade_check') then
    alter table public.pa_abastecimento_itens drop constraint pa_abastecimento_itens_unidade_check;
  end if;
end $$;
alter table public.pa_abastecimento_itens
  add constraint pa_abastecimento_itens_unidade_check
  check (unidade in ('palete', 'lastro', 'caixa', 'unidade'));

-- A solicitacao (o pedido que vira abastecimento) usa a mesma lista.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pa_ressuprimento_itens_unidade_check') then
    alter table public.pa_ressuprimento_itens drop constraint pa_ressuprimento_itens_unidade_check;
  end if;
end $$;
alter table public.pa_ressuprimento_itens
  add constraint pa_ressuprimento_itens_unidade_check
  check (unidade in ('palete', 'lastro', 'caixa', 'unidade'));

-- FEFO: aceitava palete, caixa e unidade -- faltava o lastro.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pa_fefo_unidade_valida') then
    alter table public.pa_fefo_ocorrencias drop constraint pa_fefo_unidade_valida;
  end if;
end $$;
alter table public.pa_fefo_ocorrencias
  add constraint pa_fefo_unidade_valida
  check (unidade in ('palete', 'lastro', 'caixa', 'unidade'));

-- ------------------------------------------------------------------
-- 3) HL NO FEFO
-- ------------------------------------------------------------------
alter table public.pa_fefo_ocorrencias
  add column if not exists hl_calculado numeric(12,3);

comment on column public.pa_fefo_ocorrencias.hl_calculado is
  'HL da quantidade encontrada, GRAVADO no lancamento. Nulo nas ocorrencias anteriores a 04/09/2026 -- nao da para recalcular sem inventar.';

notify pgrst, 'reload schema';

-- Confira: a coluna nova nos produtos, e quantos ja tem o lastro.
select
  count(*) as produtos,
  count(caixas_por_lastro) as com_lastro_cadastrado
from public.pa_produtos;
