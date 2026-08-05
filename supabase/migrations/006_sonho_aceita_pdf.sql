-- Execute no Supabase: SQL Editor > New query > colar > Run

alter table public.sonho_revenda
  drop constraint if exists sonho_revenda_tipo_check;

alter table public.sonho_revenda
  add constraint sonho_revenda_tipo_check
  check (tipo in ('imagem', 'pptx', 'pdf'));
