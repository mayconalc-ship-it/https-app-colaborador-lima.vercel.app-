-- ==================================================================
-- 026 - RECONTAGEM: SO PARA QUEM CONTOU NAQUELE DIA
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O aviso de recontagem estava alcancando a revenda inteira -- inclusive
-- quem nunca abriu o Ativo de Giro. Duas mudancas para restringir a
-- audiencia a quem realmente contou o dia em questao, nesta revenda:
--
-- 1) ag_recontagens ganha "dia": o pedido e sobre o dia que o controle
--    estava conciliando. E o que permite achar quem contou naquele dia.
--
-- 2) notificacoes ganha "destinatario_id": nulo continua avisando a
--    revenda inteira (comunicados, padroes, etc. -- nada muda ali); um
--    id preenchido restringe o aviso aquela UNICA pessoa. A recontagem
--    passa a gravar uma linha por destinatario, so para quem contou.

alter table public.ag_recontagens
  add column if not exists dia date not null default current_date;

alter table public.notificacoes
  add column if not exists destinatario_id uuid references auth.users(id) on delete cascade;

create index if not exists notificacoes_destinatario_idx
  on public.notificacoes (destinatario_id) where destinatario_id is not null;

notify pgrst, 'reload schema';
