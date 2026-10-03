-- ==================================================================
-- 164 - SELO DA REVENDA
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O selo de qualificacao (hoje o "Qualified DPO 2026") passa a ser
-- CONTEUDO de cada revenda, como a logo (046): o Admin troca em
-- Revendas quando vier o selo do ano seguinte, sem mexer no codigo.
--
-- Ele aparece ao lado do "Ola" na tela inicial e, esfumacado, como
-- marca d'agua nas outras telas. Nulo = revenda sem selo, nada aparece.
--
-- Barreiras e Sao Felix comecam com o DPO 2026, o arquivo que ja esta
-- no app (public/selo-dpo-2026.png).

alter table public.revendas
  add column if not exists selo_url text;

comment on column public.revendas.selo_url is
  'Selo de qualificacao da revenda (ex.: Qualified DPO 2026). Aparece na home e como marca d''agua. Nulo = sem selo.';

update public.revendas
   set selo_url = '/selo-dpo-2026.png'
 where id in ('fc365d16-ccbd-4322-ae02-e992a36861e8', '7afe4da5-e846-4b02-947f-96843a2791fe')
   and selo_url is null;

notify pgrst, 'reload schema';

-- Confira: as duas revendas com o selo.
select nome, selo_url from public.revendas order by ordem;
