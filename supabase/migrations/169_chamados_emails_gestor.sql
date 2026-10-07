-- ==================================================================
-- 169 - Chamados para Manutencao: e-mail de COMPRAS e de GESTOR
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O dono explicou o e-mail (07/10/2026): "a ideia do e-mail e para os
-- casos de necessidade de solicitacao para a compra de peca ou
-- autorizacao do gestor". Sao pessoas diferentes, entao duas listas:
--   emails          (da 167) quem recebe o PEDIDO DE COMPRA de peca
--   emails_gestor   (nova)   quem AUTORIZA (o gestor)
-- O botao "Pedir por e-mail" do chamado escolhe a lista pelo motivo.
-- ==================================================================

alter table public.chamados_config
  add column if not exists emails_gestor text[] not null default '{}';

comment on column public.chamados_config.emails is 'Quem recebe o pedido de compra de peca (botao Pedir por e-mail).';
comment on column public.chamados_config.emails_gestor is 'Quem autoriza: o gestor (botao Pedir por e-mail).';

notify pgrst, 'reload schema';

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'chamados_config' and column_name like 'emails%';
