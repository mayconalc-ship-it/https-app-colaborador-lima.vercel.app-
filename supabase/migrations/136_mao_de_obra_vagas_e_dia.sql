-- ==================================================================
-- 136 - MAO DE OBRA: VAGAS PARA O R&S E VOLUME POR DIA (25/09/2026)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono: o simulador vira DIMENSIONAMENTO PLANEJADO, com
--   1) envio do quadro de vagas para o time de recrutamento e selecao,
--      pelos e-mails cadastrados, com historico de cada envio;
--   2) comparacao do dimensionamento dos ultimos meses;
--   3) o volume PLAN por dia util e o REALIZADO por dia, com a dispersao.
--
-- O envio abre no e-mail da pessoa (decisao dele: o app nao tem SMTP, e
-- assim o e-mail sai do endereco da empresa). O que fica no banco e o
-- REGISTRO de que foi enviado -- a evidencia para o DPO.
-- ==================================================================

-- ------------------------------------------------------------------
-- 1) Quem recebe o quadro de vagas
-- ------------------------------------------------------------------
create table if not exists public.mao_obra_destinatarios (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text check (nome is null or char_length(nome) <= 120),
  email text not null check (char_length(email) between 5 and 160 and position('@' in email) > 1),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por_nome text
);

create unique index if not exists mao_obra_destinatarios_email_idx
  on public.mao_obra_destinatarios (revenda_id, lower(email));

-- ------------------------------------------------------------------
-- 2) O historico dos envios
-- ------------------------------------------------------------------
create table if not exists public.mao_obra_envios (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  competencia date not null,
  enviado_em timestamptz not null default now(),
  enviado_por_nome text,
  -- Para quem foi, no dia do envio (a lista muda com o tempo).
  destinatarios text[] not null default '{}',
  -- O quadro enviado, congelado: [{funcao, dimensionado, atual, vagas}].
  vagas jsonb not null default '[]'::jsonb,
  total_vagas integer not null default 0,
  observacao text check (observacao is null or char_length(observacao) <= 500)
);

create index if not exists mao_obra_envios_revenda_idx
  on public.mao_obra_envios (revenda_id, competencia desc);

-- ------------------------------------------------------------------
-- 3) O volume por dia: plan (do mes) x realizado (digitado)
-- ------------------------------------------------------------------
create table if not exists public.mao_obra_dias (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  competencia date not null,
  dia smallint not null check (dia between 1 and 31),
  volume_realizado numeric(14,2) check (volume_realizado is null or volume_realizado >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text,
  primary key (revenda_id, competencia, dia)
);

alter table public.mao_obra_destinatarios enable row level security;
alter table public.mao_obra_envios enable row level security;
alter table public.mao_obra_dias enable row level security;

notify pgrst, 'reload schema';

-- Confira: as 3 tabelas novas.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('mao_obra_destinatarios', 'mao_obra_envios', 'mao_obra_dias')
order by table_name;
