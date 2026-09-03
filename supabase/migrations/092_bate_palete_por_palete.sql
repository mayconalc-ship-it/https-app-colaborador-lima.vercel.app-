-- ==================================================================
-- 092 - BATE PALETE: batido em PALETE, avaria em caixa ou unidade
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Segunda correcao de modelo, e agora com o numero que o dono quer ver:
-- "% de avarias por palete batido" (03/09/2026).
--
-- O que muda: as duas quantidades deixam de compartilhar a unidade.
--
--   BATIDO  -> em PALETE. E o que a atividade produz: o ajudante bate
--              paletes inteiros, nao caixas. Contar em caixa obrigava a
--              multiplicar de cabeca o palete inteiro para depois o
--              sistema dividir de novo.
--   AVARIA  -> em CAIXA ou UNIDADE, a escolher. E o que sobra da avaria:
--              algumas caixas, as vezes garrafa solta. Contar avaria em
--              palete seria impossivel -- ninguem avaria um palete
--              inteiro.
--
-- As duas viram HL antes de virar percentual, e e o HL que as torna
-- comparaveis: palete -> caixas_por_palete x fator_hecto; caixa ->
-- fator_hecto; unidade -> (qtd / unidades_por_caixa) x fator_hecto.
--
-- A trava "avariada <= batida" SAI: com unidades diferentes ela comparava
-- laranja com maca (3 caixas avariadas em 1 palete disparava a
-- constraint). No lugar entra a mesma ideia, feita onde ela faz sentido:
-- o HL avariado nao pode passar do HL batido.
--
-- DADO EXISTENTE: nenhum. As duas tabelas estao vazias (conferido em
-- 03/09/2026, depois da limpeza da 088), entao nao ha o que converter --
-- e nao havia conversao honesta possivel: "quantidade" queria dizer
-- caixas batidas e passa a querer dizer paletes batidos.

alter table public.pa_bate_palete_itens
  add column if not exists paletes numeric(10,2);

-- A unidade que restou e a da AVARIA. O nome passa a dizer isso.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_name = 'pa_bate_palete_itens' and column_name = 'unidade'
  ) then
    alter table public.pa_bate_palete_itens rename column unidade to unidade_avariada;
  end if;
end $$;

-- "quantidade" era a batida em caixa/unidade. Sai: quem responde por ela
-- agora e "paletes".
alter table public.pa_bate_palete_itens drop column if exists quantidade;

-- Tabela vazia: da para exigir sem default mentiroso. `set not null` numa
-- coluna que ja e not null nao reclama, entao repetir a migration passa
-- direto por aqui.
alter table public.pa_bate_palete_itens
  alter column paletes set not null;

-- Derruba as travas ANTIGAS e tambem as NOVAS.
--
-- As novas entram na lista para esta migration poder ser rodada duas
-- vezes sem estourar. Rodar de novo acontece -- o dono rodou em
-- 03/09/2026, depois de a primeira ter dado certo, e levou um
-- "constraint already exists" que parecia falha e nao era. Uma migration
-- que so funciona na primeira tentativa e uma migration que assusta.
do $$
declare c text;
begin
  foreach c in array array[
    -- nomes antigos
    'pa_bate_palete_quantidade_positiva',
    'pa_bate_palete_avaria_cabe_no_lote',
    'pa_bate_palete_unidade_valida',
    -- nomes desta migration
    'pa_bate_palete_unidade_avariada_valida',
    'pa_bate_palete_paletes_positivo',
    'pa_bate_palete_avaria_nao_negativa',
    'pa_bate_palete_avaria_nao_negativa2',
    'pa_bate_palete_avaria_cabe_em_hl'
  ]
  loop
    if exists (select 1 from pg_constraint where conname = c) then
      execute format('alter table public.pa_bate_palete_itens drop constraint %I', c);
    end if;
  end loop;
end $$;

alter table public.pa_bate_palete_itens
  add constraint pa_bate_palete_unidade_avariada_valida
    check (unidade_avariada in ('caixa', 'unidade')),
  -- Palete batido com quantidade zero nao foi batido. Fracao e valida:
  -- meio palete acontece.
  add constraint pa_bate_palete_paletes_positivo check (paletes > 0),
  add constraint pa_bate_palete_avaria_nao_negativa2 check (quantidade_avariada >= 0),
  -- O lugar certo da trava de "cabe no lote": em HL, que e a unidade
  -- comum das duas medidas.
  add constraint pa_bate_palete_avaria_cabe_em_hl check (hl_avariado <= hl_batido);

comment on column public.pa_bate_palete_itens.paletes is
  'Quantos paletes deste produto foram batidos. Aceita fracao -- meio palete acontece.';
comment on column public.pa_bate_palete_itens.quantidade_avariada is
  'Quanto saiu avariado, na unidade da coluna "unidade_avariada" (caixa ou unidade).';
comment on column public.pa_bate_palete_itens.hl_batido is
  'HL dos paletes batidos, GRAVADO na hora: se o fator do produto mudar amanha, o que ja foi batido continua valendo o que valia.';

notify pgrst, 'reload schema';

-- Confira: paletes e unidade_avariada presentes, quantidade ausente.
select column_name, is_nullable
from information_schema.columns
where table_name = 'pa_bate_palete_itens'
order by ordinal_position;
