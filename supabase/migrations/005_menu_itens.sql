-- Execute no Supabase: SQL Editor > New query > colar > Run

create table if not exists public.menu_itens (
  chave text primary key,
  titulo text not null,
  emoji text not null,
  href text not null,
  ordem int not null,
  visivel boolean not null default true
);

alter table public.menu_itens enable row level security;

create policy "colaboradores leem menu"
  on public.menu_itens for select
  using (auth.role() = 'authenticated');

insert into public.menu_itens (chave, titulo, emoji, href, ordem) values
  ('sonho',     'Sonho da Revenda',      '🎯', '/sonho-da-revenda', 1),
  ('padroes',   'Padrões',               '📋', '/padroes',          2),
  ('ranking',   'Ranking Super Matinal', '🏆', '/ranking',          3),
  ('comunicados','Comunicados',          '📣', '/comunicados',      4),
  ('escala',    'Escala de Trabalho',    '🗓️', '/escala',           5),
  ('rv',        'Minha RV',              '💰', '/rv',               6),
  ('feedback',  'Feedback da Rota',      '📝', '/feedback-rota',    7),
  ('conta',     'Minha Conta',           '🔒', '/minha-conta',      8)
on conflict (chave) do nothing;
