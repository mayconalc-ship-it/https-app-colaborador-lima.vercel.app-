-- ==================================================================
-- 060 - PRODUTIVIDADE DO ARMAZEM: cadastro de produto por planilha, meta por produto
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Ate aqui, deixar um produto pronto pro Reepack/Despejo passava por
-- DUAS telas do Admin: "Embalagens" (cadastro de tempo/meta por tipo de
-- embalagem) e "Reepack" (vincular produto a produto numa embalagem,
-- corrigindo Fator Hecto na mao pros que a importacao do SAP nao casou).
--
-- A partir de agora tudo isso -- cluster, Fator Hecto, caixas por
-- pallet, unidades por caixa, tipo, embalagem E meta -- vem pronto de
-- UMA planilha (Cadastro_Prod_App_Colaborador.xlsx), reimportada sempre
-- que houver produto novo ou meta nova. A meta sai do nivel de
-- embalagem (pa_embalagens.meta_reepacks_hora/meta_litros_hora, que
-- ficam paradas no banco, sem uso na tela dai pra frente -- nao foram
-- apagadas pra nao arriscar historico) e passa a ser por PRODUTO: faz
-- mais sentido, ja que dois produtos na mesma embalagem podem ter ritmo
-- de meta bem diferente.

alter table public.pa_produtos
  add column if not exists cluster_produto text,
  add column if not exists caixas_pallet integer,
  add column if not exists tipo text check (tipo is null or tipo in ('DESCARTAVEL', 'RETORNAVEL')),
  add column if not exists meta_reepack_hora numeric(10,2),
  add column if not exists meta_despejo_hora numeric(10,2);

comment on column public.pa_produtos.cluster_produto is
  'Cluster do produto (ex.: "001 - CERVEJA"), direto da coluna "Cluster Produto" da planilha de cadastro.';
comment on column public.pa_produtos.caixas_pallet is
  'Caixas por pallet, direto da coluna "Caixas Pallet" da planilha de cadastro.';
comment on column public.pa_produtos.tipo is
  'DESCARTAVEL ou RETORNAVEL, direto da coluna "Tipo" da planilha de cadastro.';
comment on column public.pa_produtos.meta_reepack_hora is
  'Meta de reepack DESTE produto, em caixas/hora -- coluna "META_(cx)REPACK/H" da planilha. Fica em branco ate a liderança definir.';
comment on column public.pa_produtos.meta_despejo_hora is
  'Meta de despejo DESTE produto, em litros/hora -- coluna "META_(l)DESPEJO/H" da planilha. Fica em branco ate a liderança definir.';

notify pgrst, 'reload schema';
