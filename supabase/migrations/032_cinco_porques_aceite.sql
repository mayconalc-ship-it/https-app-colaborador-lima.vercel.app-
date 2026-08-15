-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- 032 - 5 PORQUES: MOTORISTA ACEITA (OU NAO) O RETORNO DA LIDERANCA
-- ==================================================================
-- Depois que a lideranca responde (resposta_lideranca), o motorista ve
-- essa resposta numa tela propria e marca se aceita o retorno ou nao --
-- null = ainda nao viu/decidiu, true = aceitou, false = nao aceitou.
-- Independente de tratativa_status, que e controlado só pela lideranca.

alter table public.cinco_porques_analises
  add column if not exists motorista_aceitou boolean,
  add column if not exists motorista_aceitou_em timestamptz;

notify pgrst, 'reload schema';
