-- ==================================================================
-- 154 - MAO DE OBRA: ARMAZEM PELOS INPUTS DO PPR PLAN (29/09/2026)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono: "o simulador do armazem seja realizado pelas atividades
-- dos inputs do PPR plan do armazem; para alterar o QLP planejado do
-- armazem, precisa alterar nos inputs".
--
-- A conta passa a ser a das abas "Inputs Armazem Plan" e "Dimensionamento
-- Plan" da planilha da companhia (src/lib/mao-de-obra.ts, contaArmazem,
-- conferida mes a mes contra o "PPR armazem 2026.xlsm" de Sao Felix em
-- src/lib/__testes__/mao-de-obra-armazem.teste.mjs). Os turnos digitados
-- no mes deixam de valer.
--
--   1. Funcao nova: ajudante_amarracao (o PPR a dimensiona a parte).
--   2. Os parametros do PPR (tempos, percentuais, extras, jornadas) em
--      jsonb `armazem`, congelados por mes como o resto da configuracao.
--   3. Os inputs do mes (puxada, pallets, mix, alta temporada, ajuste de
--      ferias) em mao_obra_meses.
--   4. Sao Felix recebe os valores do proprio "PPR armazem 2026.xlsm".
-- ==================================================================

-- 1) A funcao nova nas tabelas que validam a funcao.
do $$
declare r record; t text;
begin
  foreach t in array array['mao_obra_salarios', 'mao_obra_realizado'] loop
    for r in
      select conname from pg_constraint
      where conrelid = ('public.' || t)::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%funcao%'
    loop
      execute format('alter table public.%I drop constraint %I', t, r.conname);
    end loop;
    execute format(
      'alter table public.%I add constraint %I check (funcao in (''motorista'',''ajudante_entrega'',''puxador'',''operador'',''ajudante_armazem'',''ajudante_amarracao'',''conferente'',''manobrista''))',
      t, t || '_funcao_check');
  end loop;
end $$;

-- 2) Os parametros do PPR, na configuracao padrao e na de cada mes.
alter table public.mao_obra_config add column if not exists armazem jsonb not null default '{}'::jsonb;
alter table public.mao_obra_config_mes add column if not exists armazem jsonb not null default '{}'::jsonb;

-- 3) Os inputs do mes.
alter table public.mao_obra_meses
  add column if not exists arm_viagens_puxada_ff numeric(12,2) check (arm_viagens_puxada_ff >= 0),
  add column if not exists arm_spot_retornavel_dia numeric(10,2) check (arm_spot_retornavel_dia >= 0),
  add column if not exists arm_spot_descartavel_dia numeric(10,2) check (arm_spot_descartavel_dia >= 0),
  add column if not exists arm_pallets_retornaveis numeric(14,4) check (arm_pallets_retornaveis >= 0),
  add column if not exists arm_mix_retornavel numeric(8,4) check (arm_mix_retornavel between 0 and 100),
  add column if not exists arm_alta_temporada numeric(8,2) check (arm_alta_temporada >= 0),
  add column if not exists arm_ajuste_ferias numeric(8,2) check (arm_ajuste_ferias >= 0);

-- 4) SAO FELIX: os valores do "PPR armazem 2026.xlsm" (coluna "Utilizado"
--    da aba Inputs Armazem Plan). Vale para a configuracao padrao e para
--    cada mes ja congelado (migration 152).
update public.mao_obra_config
set armazem = '{"perc_entrega_ff":0.9,"hl_por_caixa":0.17,"caixas_por_palete":42,"paletes_por_viagem":6,"caixas_viagem_spot":144,"pux_ff_noite":0.1,"pux_ff_manha":0.3,"pux_spot_noite":0.1,"pux_spot_manha":0.3,"pallets_blitz_puxada":0.5,"mix_referencia":0.465381419886258,"ret_ate14":0.08,"ret_14a16":0.25,"ret_16a18":0.31,"ret_18a20":0.15,"ret_20a22":0.11,"ret_apos22":0.1,"pallets_mistos":0.66,"carros_batidos":0.085,"devolucao":0.016,"pallets_rebaixados":0.15,"blitz_carregamento":0.1,"blitz_retorno":0.1,"rebaixados_manha":0.8,"molho_noite":0.4,"absenteismo":0.01,"fator_dias_ajudante":1,"op_carregamento":20,"op_retorno_1a":20,"op_retorno_2a":20,"op_retorno_freteiro":20,"op_spot_retornavel":50,"op_spot_descartavel":30,"op_molho":3,"op_recarga":31,"aj_pallets_dia":20,"aj_rebaixamento":2,"aj_amarracao_freteiro":20,"aj_desamarracao_freteiro":12,"aj_amarracao_spot":45,"aj_desamarracao_spot":30,"aj_blitz_puxada":31,"aj_blitz_retorno":25,"aj_carga_batido":20,"aj_descarga_batido":10,"aj_sorting":10,"cf_carregamento":15,"cf_retorno_1a":12,"cf_retorno_2a":12,"cf_retorno_freteiro":12,"cf_spot_retornavel":55,"cf_spot_descartavel":45,"cf_balanco":120,"cf_contagem":120,"cf_blitz_retorno":15,"ex_limpeza_manha":0,"ex_picking_manha":0,"ex_marketing_manha":0,"ex_reepack_manha":1,"ex_reepack_tarde":0,"ex_trocas_manha":0,"ex_apoio_noite":1,"ex_apoio_manha":0,"ex_apoio_tarde":1,"jornada_horas":7.33,"jornada_conferente_noite":6.33}'::jsonb,
    atualizado_em = now(),
    atualizado_por_nome = 'Inputs do PPR armazem 2026 (migration 154)'
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe';

update public.mao_obra_config_mes cm
set armazem = c.armazem,
    atualizado_em = now(),
    atualizado_por_nome = 'Inputs do PPR armazem 2026 (migration 154)'
from public.mao_obra_config c
where cm.revenda_id = c.revenda_id
  and cm.revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe';

-- Os inputs de cada mes, do mesmo arquivo: viagens de puxada FF (linha
-- 342), spot retornavel/descartavel por dia (345/346), pallets retornaveis
-- (439), mix retornavel (350, em %), alta temporada e ajuste de ferias
-- (linhas 35 e 36 da aba Dimensionamento Plan).
update public.mao_obra_meses m
set arm_viagens_puxada_ff = v.puxada,
    arm_spot_retornavel_dia = v.spot_ret,
    arm_spot_descartavel_dia = 0,
    arm_pallets_retornaveis = 3080.3535,
    arm_mix_retornavel = v.mix,
    arm_alta_temporada = 0,
    arm_ajuste_ferias = v.ajuste
from (values
  ('2026-01-01'::date, 151, 0, 46.5381, 1),
  ('2026-02-01'::date, 128, 0, 53.5905, 1),
  ('2026-03-01'::date, 131, 0, 60.2456, 1),
  ('2026-04-01'::date, 137, 0, 57.2320, 2),
  ('2026-05-01'::date, 143, 0, 55.5194, 2),
  ('2026-06-01'::date, 137, 0, 57.6275, 2),
  ('2026-07-01'::date, 136, 0, 57.9138, 2),
  ('2026-08-01'::date, 127, 0, 62.1715, 2),
  ('2026-09-01'::date, 132, 0, 59.5695, 2),
  ('2026-10-01'::date, 150, 0, 52.9027, 0),
  ('2026-11-01'::date, 147, 0, 53.6977, 0),
  ('2026-12-01'::date, 161, 8, 46.8065, 0)
) as v(competencia, puxada, spot_ret, mix, ajuste)
where m.revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and m.competencia = v.competencia;

-- Ajudante de amarracao: o PPR de Sao Felix informa 0 ativos, e o custo
-- por pessoa igual ao do ajudante de armazem (mesma linha de custo).
insert into public.mao_obra_realizado (revenda_id, competencia, funcao, quantidade)
select '7afe4da5-e846-4b02-947f-96843a2791fe', '2026-09-01', 'ajudante_amarracao', 0
where not exists (
  select 1 from public.mao_obra_realizado
  where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
    and competencia = '2026-09-01' and funcao = 'ajudante_amarracao'
);

insert into public.mao_obra_salarios
select (jsonb_populate_record(null::public.mao_obra_salarios,
         to_jsonb(s) || jsonb_build_object('funcao', 'ajudante_amarracao'))).*
from public.mao_obra_salarios s
where s.funcao = 'ajudante_armazem'
  and not exists (
    select 1 from public.mao_obra_salarios x
    where x.revenda_id = s.revenda_id and x.funcao = 'ajudante_amarracao'
  );

notify pgrst, 'reload schema';

-- Confira: os meses de Sao Felix com os inputs do PPR.
select to_char(competencia, 'YYYY-MM') as mes, volume_ppr, dias_totais,
       arm_viagens_puxada_ff, arm_spot_retornavel_dia, arm_mix_retornavel, arm_ajuste_ferias
from public.mao_obra_meses
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
order by competencia;
