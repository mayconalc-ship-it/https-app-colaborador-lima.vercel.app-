-- ==================================================================
-- 131 - 5S: RECONHECIMENTO DAS AREAS (com fotos)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (21/09/2026): o reconhecimento das melhores areas e
-- feito no grupo de WhatsApp. O app guarda a EVIDENCIA -- o mes, as
-- areas reconhecidas, o texto e as fotos (prints do grupo, foto da
-- equipe) -- para o DPO (item 3.1, verificacao V.6).
--
-- Fotos num bucket PRIVADO proprio: print de grupo de WhatsApp mostra
-- nome e telefone de gente. A tela mostra por link assinado que expira.

insert into storage.buckets (id, name, public)
values ('reconhecimentos', 'reconhecimentos', false)
on conflict (id) do update set public = false;

create table if not exists public.cinco_s_reconhecimentos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- O mes do resultado reconhecido (dia 1).
  competencia date not null,
  area_ids uuid[] not null default '{}' check (cardinality(area_ids) between 1 and 20),
  texto text check (texto is null or char_length(texto) <= 400),
  criado_por uuid references auth.users(id) on delete set null,
  criado_por_nome text not null,
  criado_em timestamptz not null default now()
);

create index if not exists cinco_s_reconhecimentos_mes_idx
  on public.cinco_s_reconhecimentos (revenda_id, competencia desc);

create table if not exists public.cinco_s_reconhecimento_fotos (
  id uuid primary key default gen_random_uuid(),
  reconhecimento_id uuid not null references public.cinco_s_reconhecimentos(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  caminho text not null,
  criado_em timestamptz not null default now()
);

create index if not exists cinco_s_reconhecimento_fotos_idx
  on public.cinco_s_reconhecimento_fotos (reconhecimento_id);

-- Como o resto do 5S: RLS ligada e sem politica -- so o servidor.
alter table public.cinco_s_reconhecimentos enable row level security;
alter table public.cinco_s_reconhecimento_fotos enable row level security;

notify pgrst, 'reload schema';

-- Confira: o bucket privado e as duas tabelas.
select 'bucket reconhecimentos publico?' as item, public::text as valor from storage.buckets where id = 'reconhecimentos'
union all
select 'tabelas criadas', count(*)::text
from information_schema.tables
where table_schema = 'public' and table_name in ('cinco_s_reconhecimentos', 'cinco_s_reconhecimento_fotos');
