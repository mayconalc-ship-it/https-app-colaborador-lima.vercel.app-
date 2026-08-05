-- Execute no Supabase: SQL Editor > New query > colar > Run

alter table public.feedback_rota
  add column if not exists rota text,
  add column if not exists ocorrencias text[] not null default '{}';
