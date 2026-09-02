-- ==================================================================
-- 088 - BATE PALETE: quantidade BATIDA + AVARIADA, em caixa ou unidade
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Correcao de modelo, pedida pelo dono depois do primeiro teste. A 087
-- guardava "caixas avariadas" e "caixas repostas" -- a segunda foi
-- invencao minha, e nao e assim que a operacao conta.
--
-- O jeito certo e o dele: registra-se O QUE FOI BATIDO (produto e
-- quantidade) e, dentro disso, QUANTO ESTAVA AVARIADO. Duas medidas do
-- mesmo lote, nao duas pilhas separadas.
--
-- Isso muda o indicador para melhor: com "batida" e "avariada" sai o
-- PERCENTUAL DE AVARIA do lote, que e o numero que aponta problema na
-- origem. Com "avariada" e "reposta" nao saia -- faltava o denominador.
--
-- A UNIDADE passa a ser escolhida: caixa ou unidade. Nem todo produto
-- avariado se conta em caixa; garrafa solta se conta em unidade, e
-- obrigar a converter na cabeca e como se erra o apontamento.
--
-- DADO EXISTENTE: uma sessao de teste do proprio dono, ainda aberta, com
-- um item. Ela e apagada aqui de proposito -- os numeros dela foram
-- lancados com outro significado ("repostas"), e converte-los seria
-- inventar um "batido" que ninguem informou.

delete from public.pa_bate_palete;

alter table public.pa_bate_palete_itens
  add column if not exists quantidade numeric(10,2),
  add column if not exists unidade text,
  add column if not exists hl_batido numeric(12,3),
  add column if not exists hl_avariado numeric(12,3);

-- A avariada continua, so muda de nome: ela nao e mais "caixas", porque
-- agora a unidade e escolhida.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_name = 'pa_bate_palete_itens' and column_name = 'caixas_avariadas'
  ) then
    alter table public.pa_bate_palete_itens rename column caixas_avariadas to quantidade_avariada;
  end if;
end $$;

alter table public.pa_bate_palete_itens drop column if exists caixas_repostas;
alter table public.pa_bate_palete_itens drop column if exists hl_recuperado;

-- Com a tabela vazia da para exigir os campos sem default mentiroso.
alter table public.pa_bate_palete_itens
  alter column quantidade set not null,
  alter column unidade set not null,
  alter column hl_batido set not null,
  alter column hl_avariado set not null;

-- As travas do modelo novo.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pa_bate_palete_item_tem_trabalho') then
    alter table public.pa_bate_palete_itens drop constraint pa_bate_palete_item_tem_trabalho;
  end if;
end $$;

alter table public.pa_bate_palete_itens
  add constraint pa_bate_palete_unidade_valida check (unidade in ('caixa', 'unidade')),
  -- Palete batido com quantidade zero nao foi batido.
  add constraint pa_bate_palete_quantidade_positiva check (quantidade > 0),
  add constraint pa_bate_palete_avaria_nao_negativa check (quantidade_avariada >= 0),
  -- A avariada esta DENTRO da batida. Sem isto daria para lancar 10
  -- batidas com 50 avariadas, e o percentual de avaria passaria de 100%
  -- sem ninguem entender de onde veio.
  add constraint pa_bate_palete_avaria_cabe_no_lote check (quantidade_avariada <= quantidade);

comment on column public.pa_bate_palete_itens.quantidade is
  'Quanto foi batido, na unidade da coluna "unidade".';
comment on column public.pa_bate_palete_itens.quantidade_avariada is
  'Quanto do que foi batido estava avariado. Sempre <= quantidade -- e o numerador do percentual de avaria.';
comment on column public.pa_bate_palete_itens.hl_batido is
  'HL do lote batido, GRAVADO na hora: se o fator do produto mudar amanha, o que ja foi batido continua valendo o que valia.';

notify pgrst, 'reload schema';

-- Confira: as colunas do modelo novo, e nenhuma do antigo.
select column_name, is_nullable
from information_schema.columns
where table_name = 'pa_bate_palete_itens'
order by ordinal_position;
