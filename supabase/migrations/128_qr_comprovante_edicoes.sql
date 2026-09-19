-- ==================================================================
-- 128 - COMPROVANTE DE PAGAMENTO: REGISTRO DAS EDICOES E CONFERENCIA
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (19/09/2026): o motorista pode EDITAR valor e fotos do
-- proprio comprovante, no mesmo dia (no lugar do "Apagar"). Quem concilia
-- precisa saber que o comprovante mudou -- e de quanto para quanto.
--
--   qr_comprovantes.editado_em: a ultima edicao (a marca na conciliacao).
--   qr_comprovante_edicoes:     o historico, uma linha por edicao salva.

alter table public.qr_comprovantes
  add column if not exists editado_em timestamptz;

-- A CONFERENCIA DO FINANCEIRO (pedido do dono, 19/09/2026: "algo que ajude
-- a conciliar"): quem bateu o comprovante com o extrato, e quando. Se o
-- motorista editar depois, a conferencia cai e o comprovante volta a
-- esperar -- o que foi conferido nao era o que esta la agora.
alter table public.qr_comprovantes
  add column if not exists conferido_em timestamptz,
  add column if not exists conferido_por_nome text;

create table if not exists public.qr_comprovante_edicoes (
  id uuid primary key default gen_random_uuid(),
  comprovante_id uuid not null references public.qr_comprovantes(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid references auth.users(id) on delete set null,
  colaborador_nome text not null,
  valor_antes numeric(12,2),
  valor_depois numeric(12,2),
  fotos_tiradas integer not null default 0 check (fotos_tiradas >= 0),
  fotos_novas integer not null default 0 check (fotos_novas >= 0),
  editado_em timestamptz not null default now()
);

create index if not exists qr_comprovante_edicoes_comprovante_idx
  on public.qr_comprovante_edicoes (comprovante_id, editado_em);

-- Como as outras tabelas do modulo: RLS ligada e SEM politica -- so o
-- servidor le e escreve.
alter table public.qr_comprovante_edicoes enable row level security;

notify pgrst, 'reload schema';

-- Confira: as colunas novas (3) e a tabela do historico (1).
select 'colunas novas' as item, count(*)::text as valor
from information_schema.columns
where table_schema = 'public' and table_name = 'qr_comprovantes'
  and column_name in ('editado_em', 'conferido_em', 'conferido_por_nome')
union all
select 'tabela qr_comprovante_edicoes', count(*)::text
from information_schema.tables
where table_schema = 'public' and table_name = 'qr_comprovante_edicoes';
