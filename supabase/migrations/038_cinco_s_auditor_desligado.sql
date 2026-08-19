-- ==================================================================
-- 038 - AUDITORIA ANTIGA DE QUEM NAO ESTA MAIS NA EMPRESA
-- Execute no Supabase: SQL Editor > New query > colar > Ctrl+A > Run
-- ==================================================================
-- A coluna auditor_id nasceu "not null", e a intencao estava certa:
-- auditoria sem auditor designado nao deveria existir. Mas essa regra
-- fala do FUTURO -- de uma auditoria que alguem precisa ir fazer.
--
-- O historico e outra coisa. A auditoria de agosto de 2025 aconteceu,
-- tem 25 respostas e uma nota, e o fato de a pessoa que a fez ter
-- saido da empresa depois nao a desfaz. Com "not null" o app so tinha
-- duas saidas ruins:
--
--   1) jogar fora a auditoria -- perdendo, no caso da Sala pecas
--      Frota, praticamente todo o historico da area;
--   2) atribui-la a outra pessoa -- o que e simplesmente falso, e
--      contamina para sempre o indicador "por auditor".
--
-- Nulo aqui significa exatamente "feita por alguem que nao esta mais
-- no cadastro", e nao "ninguem fez".
--
-- O que NAO muda: toda auditoria nova continua nascendo com auditor.
-- Quem cobra isso e a tela de planejamento, que exige o campo, e nao
-- mais o banco -- porque a mesma coluna precisa aceitar as duas
-- situacoes.

alter table public.cinco_s_auditorias
  alter column auditor_id drop not null;

comment on column public.cinco_s_auditorias.auditor_id is
  'Quem fez a auditoria. Nulo apenas em historico importado de quem nao esta mais no cadastro -- auditoria nova sempre tem auditor (exigido na tela de planejamento).';

-- O indice de auditor continua servindo: o Postgres nao indexa nulos
-- em btree por padrao para efeito de igualdade, e "as auditorias de
-- fulano" nunca procura por nulo.

notify pgrst, 'reload schema';
