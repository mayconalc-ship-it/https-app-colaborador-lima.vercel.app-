-- ==================================================================
-- 173 -- PRIORIDADES DOS GVs (03/11/2026, pedido do dono)
--
-- "Preciso de um link para que os GVs possam inputar as prioridades do
-- dia. Rápido e fácil: só o código do PDV e o motivo, várias de uma vez,
-- e só depois enviar tudo. Depois de lançar, fica gravada para não se
-- perder."
--
-- O link é PÚBLICO, sem login, como o QR do chamado (/os/): os GVs não
-- têm conta no app. A trava é o token do endereço (/prioridade/<token>),
-- um por revenda, conferido no servidor a cada envio. Quem lê e baixa a
-- lista é a logística, no painel da Gestão (/gestao/prioridades), atrás
-- do módulo "prioridades".
--
-- Antes de enviar, a lista mora no aparelho do GV (localStorage): fechar
-- o navegador não perde nada. Depois de enviada, mora aqui.
-- ==================================================================

create table if not exists public.prioridades_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  -- O link da revenda: /prioridade/<token_publico>. Trocar invalida o
  -- link que já foi para os GVs.
  token_publico text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  -- Os GVs da lista do formulário, na ordem: [{ "codigo": "1", "nome": "..." }].
  -- O código é o "Cód. gerente vendas" do Promax, o mesmo do Gestor LOG.
  gvs jsonb not null default '[]'::jsonb,
  -- Os motivos da lista suspensa, na ordem: ["Cliente sem estoque", ...].
  -- Vazio = a lista padrão do app (lib/prioridades.ts). "Outro" a tela
  -- sempre oferece, com campo para escrever.
  motivos jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text
);

create table if not exists public.prioridades (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- O dia da entrega que o GV quer priorizar.
  data_entrega date not null,
  cod_pdv text not null,
  -- O nome na base de clientes no momento do envio (nulo = não achou).
  nome_pdv text,
  motivo text not null,
  gv_codigo text,
  gv_nome text not null,
  -- Um envio = um lote (o botão "Enviar" com N prioridades).
  lote uuid not null,
  enviado_em timestamptz not null default now(),
  -- Um PDV só uma vez por dia de entrega: o segundo envio do mesmo PDV
  -- não duplica, e o GV fica sabendo que já estava na lista.
  unique (revenda_id, data_entrega, cod_pdv)
);

-- Quem rodou uma versão anterior desta migration (sem a lista de motivos).
alter table public.prioridades_config add column if not exists motivos jsonb not null default '[]'::jsonb;

create index if not exists prioridades_revenda_data on public.prioridades (revenda_id, data_entrega);

-- Só o servidor (service role) lê e grava: a página pública passa pelas
-- ações do servidor, e o painel também.
alter table public.prioridades_config enable row level security;
alter table public.prioridades enable row level security;

-- Um link por revenda. Barreiras já sai com os três GVs que o Gestor LOG
-- conhece (código do Promax -> nome); São Félix começa vazia e a lista
-- é montada no painel.
insert into public.prioridades_config (revenda_id, gvs)
select r.id,
  case when r.id = 'fc365d16-ccbd-4322-ae02-e992a36861e8' then
    '[{"codigo":"1","nome":"Kenio Saimon"},{"codigo":"2","nome":"Ismael Ramos"},{"codigo":"3","nome":"Guilherme Ventura"}]'::jsonb
  else '[]'::jsonb end
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix (Samavi)
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id) do nothing;

-- O módulo ligado nas revendas: revenda_modulos é conferido ANTES da
-- concessão da pessoa (sem esta linha ninguém abre o painel, nem o dono).
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'prioridades', true
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe',
  'fc365d16-ccbd-4322-ae02-e992a36861e8'
)
on conflict (revenda_id, modulo) do update set ativo = true;

notify pgrst, 'reload schema';

-- Os links, para conferir depois de rodar.
select 'Prioridades de ' || r.nome as revenda, 'https://app-colaborador-lima.vercel.app/prioridade/' || c.token_publico as link
from public.prioridades_config c join public.revendas r on r.id = c.revenda_id;
