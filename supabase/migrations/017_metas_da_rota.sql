-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- METAS DA ROTA
-- ==================================================================
-- A cor da barra deixa de ser um numero fixo no codigo e passa a nascer
-- da meta da operacao. Trocando a meta aqui, toda a leitura do app muda
-- junto -- sem precisar mexer em codigo.

alter table public.rotas_config
  add column if not exists meta_ocupacao numeric not null default 70,
  add column if not exists meta_caixas numeric;

comment on column public.rotas_config.meta_ocupacao is
  'Meta de ocupacao em %, vale para caixas e peso';
comment on column public.rotas_config.meta_caixas is
  'Meta de caixas por viagem. Vazio = nao cobra';

notify pgrst, 'reload schema';
