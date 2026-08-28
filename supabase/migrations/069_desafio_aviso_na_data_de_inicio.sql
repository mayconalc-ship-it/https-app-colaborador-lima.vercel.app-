-- ==================================================================
-- 069 - DESAFIO: aviso sai na data de inicio, nao na publicacao
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Aconteceu em 27/08/2026: o desafio de SETEMBRO (01/09 a 30/09) foi
-- publicado e o app avisou todo mundo na hora, com a mensagem "Novo
-- desafio disponivel". Disponivel ele nao estava -- getRodadaAtual so
-- devolve a rodada quando inicio <= hoje <= fim, entao quem clicasse no
-- aviso nao encontrava nada. Aviso que leva a lugar nenhum ensina o
-- time a ignorar o sino, que e o custo real do erro.
--
-- A disponibilizacao ja estava certa; o furo era so o aviso.
--
-- Mesmo desenho que o Jornal ja usa para publicacao agendada
-- (comunicados.publicar_em + publicacao_avisada_em, ver
-- publicacoesAgendadas em lib/lembretes-server.ts): uma coluna que
-- marca "ja avisei", e a varredura periodica cuida do resto.

alter table public.quiz_rodadas
  add column if not exists aviso_inicio_em timestamptz;

comment on column public.quiz_rodadas.aviso_inicio_em is
  'Quando o time foi avisado do inicio da rodada. Nulo = ainda nao avisado; a varredura de lembretes avisa quando inicio <= hoje.';

-- A varredura procura exatamente por isto: publicada, ja comecou, sem
-- aviso. Sem indice, varre a tabela inteira a cada rodada do cron.
create index if not exists quiz_rodadas_aviso_pendente_idx
  on public.quiz_rodadas (revenda_id, status, inicio)
  where aviso_inicio_em is null;

-- ------------------------------------------------------------------
-- Historico: quem JA foi avisado nao pode ser avisado de novo.
-- ------------------------------------------------------------------
-- Rodadas publicadas que ja comecaram tiveram o aviso disparado no ato
-- da publicacao (era o comportamento antigo). Marca com a data da
-- publicacao para a varredura nao reavisar o desafio de Agosto.
update public.quiz_rodadas
   set aviso_inicio_em = publicada_em
 where status = 'publicada'
   and publicada_em is not null
   and aviso_inicio_em is null
   and inicio <= (now() at time zone 'America/Sao_Paulo')::date;

-- O desafio de SETEMBRO fica de fora de proposito: o aviso que ele
-- recebeu foi o errado (e vai ser apagado do sino). Com
-- aviso_inicio_em nulo, a varredura avisa direito no dia 01/09.

notify pgrst, 'reload schema';
