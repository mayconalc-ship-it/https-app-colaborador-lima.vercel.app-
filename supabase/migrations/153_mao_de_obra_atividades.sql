-- ==================================================================
-- 153 - MAO DE OBRA: ATIVIDADES DO ARMAZEM VIRAM GENTE (29/09/2026)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono: "o dimensionamento deveria levar em consideracao as
-- atividades". Montagem, reposicao do picking, blitz de refugo e blitz de
-- puxada estavam cadastradas mas nao entravam na conta. Agora cada uma
-- vira horas por dia (vezes por dia x tempo) e gente (horas / jornada) na
-- funcao que o dono escolher -- ele simula.
--
-- Tudo nasce FORA da conta ('nenhuma'): rodar esta migration nao muda
-- nenhum numero do simulador. Os turnos digitados no mes passam a valer
-- como minimo do posto.
--
-- As colunas entram na configuracao de cada mes (152) e no padrao da
-- revenda, que serve de base para mes sem configuracao antes dele.
-- ==================================================================

do $$
declare t text;
begin
  foreach t in array array['mao_obra_config', 'mao_obra_config_mes'] loop
    execute format('alter table public.%I add column if not exists produtividade_montagem numeric(10,2) not null default 0 check (produtividade_montagem >= 0)', t);
    execute format('alter table public.%I add column if not exists atividade_montagem text not null default ''nenhuma'' check (atividade_montagem in (''nenhuma'',''operador'',''ajudante_armazem'',''conferente''))', t);
    execute format('alter table public.%I add column if not exists atividade_reposicao text not null default ''nenhuma'' check (atividade_reposicao in (''nenhuma'',''operador'',''ajudante_armazem'',''conferente''))', t);
    execute format('alter table public.%I add column if not exists atividade_blitz_refugo text not null default ''nenhuma'' check (atividade_blitz_refugo in (''nenhuma'',''operador'',''ajudante_armazem'',''conferente''))', t);
    execute format('alter table public.%I add column if not exists atividade_blitz_puxada text not null default ''nenhuma'' check (atividade_blitz_puxada in (''nenhuma'',''operador'',''ajudante_armazem'',''conferente''))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Confira: 5 colunas novas em cada uma das duas tabelas (10 no total).
select table_name, count(*) as colunas_novas
from information_schema.columns
where table_schema = 'public'
  and table_name in ('mao_obra_config', 'mao_obra_config_mes')
  and (column_name like 'atividade_%' or column_name = 'produtividade_montagem')
group by table_name;
