-- ==================================================================
-- 044 - PUBLICAÇÃO AGENDADA NO JORNAL
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O jornal já sabia agendar o LEMBRETE de uma matéria (ver 027). O que
-- faltava era agendar a própria matéria: o RH escrever o plano de
-- comunicação do mês inteiro numa tarde e cada notícia aparecer no dia e
-- na hora marcados.
--
-- Segue o mesmo desenho do lembrete, de propósito -- nada de tabela de
-- "fila": é uma coluna a mais no próprio comunicado, e "publicar" é uma
-- pergunta feita na hora ("tem agendamento vencido que ainda não
-- avisou?"), não um processo de fundo com estado próprio.
--
--   publicar_em            nulo = já está no ar, como sempre foi. É por
--                          isso que as 60 matérias antigas não precisam
--                          de backfill nenhum.
--   publicacao_avisada_em  carimbo do sino/push. Existe pelo mesmo motivo
--                          do `lembrete_enviado_em`: sem ele o cron
--                          avisaria a mesma matéria a cada 15 minutos.

alter table public.comunicados
  add column if not exists publicar_em timestamptz,
  add column if not exists publicacao_avisada_em timestamptz;

-- Índice parcial: só os agendamentos que ainda não avisaram entram na
-- consulta do cron. A tabela de comunicados só cresce, então o índice
-- fica pequeno para sempre em vez de acompanhar o jornal inteiro.
create index if not exists comunicados_publicacao_pendente_idx
  on public.comunicados (publicar_em)
  where publicar_em is not null and publicacao_avisada_em is null;

-- ------------------------------------------------------------------
-- A TRAVA DE VERDADE
-- ------------------------------------------------------------------
-- Esconder a matéria agendada só no `select` da página não seria
-- esconder nada: o app fala com o Supabase pela chave pública, e quem
-- soubesse montar a chamada leria o plano de comunicação do mês inteiro
-- antes da hora. Então a regra mora na política de leitura.
--
-- O Modo Liderança não é afetado: as telas de admin usam a service_role,
-- que passa por cima de RLS. Quem é dono também não vê antes da hora
-- NESTA tela -- e não deve, porque esta é a visão do colaborador; para
-- ver o que está na fila existe o calendário do Modo Liderança.
drop policy if exists "le a propria revenda" on public.comunicados;
create policy "le a propria revenda"
  on public.comunicados for select to authenticated
  using (
    (
      public.ehowner_atual()
      or revenda_id in (select public.revendas_do_usuario())
    )
    and (publicar_em is null or publicar_em <= now())
  );

notify pgrst, 'reload schema';
