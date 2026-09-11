-- ==================================================================
-- 113 - CANAIS DO RODAPE por revenda (Solicitacao de EPI e Ouvidoria)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (11/09/2026), na implantacao de Barreiras: os links da
-- Solicitacao de EPI e do Canal de Ouvidoria ficavam fixos no codigo, e
-- valiam para todas as revendas. Barreiras tem os proprios canais.
--
-- Agora cada revenda tem os seus, editaveis em Fontes de Dados. Canal sem
-- link NAO aparece no app daquela revenda: melhor nenhum botao do que um
-- que leve a ouvidoria de outra unidade.
--
-- Sao Felix ja nasce com os links de hoje, entao nada muda por la.
-- Barreiras fica sem linha ate o dono colar os links dela.

create table if not exists public.revenda_canais (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  epi_url text,
  ouvidoria_url text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

comment on table public.revenda_canais is
  'Links dos canais do rodape da tela inicial, por revenda. Link vazio = o canal nao aparece naquela revenda.';

-- Mesmo desenho da 084: RLS ligada e sem politica. Quem le e escreve e o
-- servidor, com o cliente de servico -- o rodape e montado no servidor.
alter table public.revenda_canais enable row level security;
grant all on public.revenda_canais to service_role;

-- Sao Felix: os links que estavam no codigo ate hoje.
insert into public.revenda_canais (revenda_id, epi_url, ouvidoria_url)
values (
  '7afe4da5-e846-4b02-947f-96843a2791fe',
  'https://forms.office.com/r/MGf5xTSDzr',
  'https://ouvidoria-limalogistica.lovable.app/'
)
on conflict (revenda_id) do nothing;

notify pgrst, 'reload schema';

-- Confira: Sao Felix com os dois links; Barreiras em branco.
select r.nome, c.epi_url, c.ouvidoria_url
from public.revendas r
left join public.revenda_canais c on c.revenda_id = r.id
order by r.nome;
