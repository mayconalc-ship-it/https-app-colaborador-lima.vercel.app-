-- ==================================================================
-- 027 - LEMBRETE AGENDADO NO JORNAL
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Um comunicado pode carregar um lembrete: dispara sozinho numa data/hora
-- futura, opcionalmente só para alguns cargos. Nasce SEM linha nova --
-- é uma coluna a mais no próprio comunicado, e o "disparo" é uma
-- pergunta feita na hora ("tem lembrete vencido e ainda não enviado?"),
-- não um processo de fundo com estado próprio.

alter table public.comunicados
  add column if not exists lembrete_em timestamptz,
  add column if not exists lembrete_cargos text[],
  add column if not exists lembrete_mensagem text,
  add column if not exists lembrete_enviado_em timestamptz;

-- Índice parcial: só os pendentes importam para a consulta do disparo, e
-- a tabela de comunicados só cresce, então o índice fica pequeno para
-- sempre em vez de acompanhar o jornal inteiro.
create index if not exists comunicados_lembrete_pendente_idx
  on public.comunicados (lembrete_em)
  where lembrete_em is not null and lembrete_enviado_em is null;

notify pgrst, 'reload schema';
