-- ==================================================================
-- 159 - Relato de Anomalia de TMA: um relato por DT (atendimento)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- Pode rodar mais de uma vez.
-- ==================================================================
-- Pedido do dono (03/10/2026): "o relato de anomalia para TMA deve ser
-- somente de uma DT. Caso esse atendimento atinja o gatilho, devera
-- realizar o relato de anomalia."
--
-- Ate aqui o gatilho do TMA olhava a MEDIA DO DIA e abria um relato
-- para o recebimento inteiro. Agora cada atendimento e avaliado sozinho
-- e, passando do limite, abre o PROPRIO relato, apontando a carreta.
--
-- 1) atendimento_id no relato: a carreta de que o relato trata.
-- 2) A trava "um relato aberto por indicador" continua valendo para os
--    indicadores do dia (avaria), mas nao pode valer para o TMA: duas
--    DTs ruins no mesmo dia sao dois relatos. Para o TMA a trava passa a
--    ser UM RELATO POR DT -- para sempre, nao so enquanto aberto: a
--    varredura roda a cada 15 minutos, e a DT ja tratada nao pode abrir
--    um segundo relato depois de concluido o primeiro.
-- ==================================================================

alter table public.pa_relatos_anomalia
  add column if not exists atendimento_id uuid references public.atendimentos_carretas(id) on delete set null;

-- A trava antiga passa a valer so para relato SEM atendimento (o do dia).
drop index if exists public.pa_relato_aberto_unico;
create unique index if not exists pa_relato_aberto_unico_dia
  on public.pa_relatos_anomalia (revenda_id, indicador)
  where atendimento_id is null and status in ('aberto', 'em_analise', 'plano_definido');

-- Um relato por DT e indicador, em qualquer status.
create unique index if not exists pa_relato_por_atendimento_unico
  on public.pa_relatos_anomalia (indicador, atendimento_id)
  where atendimento_id is not null;

notify pgrst, 'reload schema';

-- Confira: a coluna nova e as duas travas.
select 'coluna atendimento_id' as item, count(*)::text as valor
from information_schema.columns
where table_schema = 'public' and table_name = 'pa_relatos_anomalia' and column_name = 'atendimento_id'
union all
select 'trava ' || indexname, 'ok'
from pg_indexes
where schemaname = 'public' and tablename = 'pa_relatos_anomalia' and indexname like 'pa_relato_%unico%';
