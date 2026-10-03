-- ==================================================================
-- 161 - LIMPA O MEDIDOR DE USO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O medidor de tempo e a tela Uso do App sairam do app (03/10/2026,
-- pedido do dono): estouravam a cota de Log Ingestion do plano gratuito.
--
-- Ordem: primeiro sai do tempo real, depois apaga -- senao cada linha
-- apagada seria transmitida.
--
-- 1. uso_sessoes: ninguem grava nem le mais. Esvaziada com TRUNCATE, que
--    devolve o espaco na hora (DELETE so marca as linhas como livres).
--    A tabela fica, vazia: a Saude do sistema confere que ela existe.
--
-- 2. eventos_acesso: CONTINUA recebendo uma linha por tela aberta -- a
--    Limpeza de Acessos usa os ultimos 180 dias. Sai o que nao serve:
--    o que passou de 180 dias e os tipos que o app nao grava mais
--    (login e acao).
--
-- 3. eventos_acesso sai do tempo real: o feed ao vivo da tela Uso do App
--    era o unico ouvinte. Sem isto, cada tela aberta continuava sendo
--    transmitida para ninguem.

truncate table public.uso_sessoes;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'eventos_acesso'
  ) then
    alter publication supabase_realtime drop table public.eventos_acesso;
  end if;
end $$;

delete from public.eventos_acesso
 where criado_em < now() - interval '180 days'
    or tipo <> 'tela';

-- Confira: uso_sessoes vazia, eventos_acesso so com telas dos ultimos 180 dias.
select
  (select count(*) from public.uso_sessoes) as sessoes,
  (select count(*) from public.eventos_acesso) as eventos,
  (select min(criado_em) from public.eventos_acesso) as evento_mais_antigo,
  pg_size_pretty(pg_database_size(current_database())) as tamanho_do_banco;
