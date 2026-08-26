-- ==================================================================
-- 064 - DESPEJO: embalagem propria (nao mais a do repack), por unidade
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Ate aqui, Despejo usava a MESMA pa_embalagens do Reepack (id em
-- pa_despejo_lancamentos.embalagem_id, litros_por_pacote/meta_litros_hora
-- guardados nela). A planilha nova separa os dois vocabularios --
-- "LATA 350ML C/12" pro Repack, "LATA 350ML" pro Despejo, nomes
-- diferentes de proposito -- entao Despejo ganha catalogo proprio.
--
-- A quantidade lancada tambem passa a ser em UNIDADE (nao mais caixa):
-- litros_por_unidade e o litro de UM item (ex.: 0.35 pra lata 350ml),
-- nao mais o litro do pacote inteiro.
--
-- Historico intocado: so 5 lancamentos de despejo existem ate hoje, e
-- nenhum e alterado por esta migration. embalagem_id (a coluna antiga)
-- continua exatamente como esta, virando NULL-avel so pra lancamentos
-- novos poderem deixá-la vazia; embalagem_despejo_id (a coluna nova) e
-- quem os lancamentos daqui pra frente usam. A leitura combina as duas
-- (embalagem_despejo_id se tiver, senao cai pra embalagem_id) -- mesmo
-- padrao de fallback ja usado em Carretas (retorno_decidido_em ?? fim
-- da descarga) pra nao reescrever numero de lancamento antigo nenhum.

create table if not exists public.pa_embalagens_despejo (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null,
  litros_por_unidade numeric(10,3),
  meta_litros_hora numeric(10,2),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create unique index if not exists pa_embalagens_despejo_nome_unico
  on public.pa_embalagens_despejo (revenda_id, lower(nome));
create index if not exists pa_embalagens_despejo_revenda_idx
  on public.pa_embalagens_despejo (revenda_id) where ativo;

alter table public.pa_despejo_lancamentos
  add column if not exists embalagem_despejo_id uuid references public.pa_embalagens_despejo(id) on delete restrict,
  alter column embalagem_id drop not null;

comment on column public.pa_despejo_lancamentos.embalagem_id is
  'Legado -- so em lancamentos de antes desta migration (26/08/2026), aponta pra pa_embalagens (catalogo do Repack). Lancamentos novos deixam null e usam embalagem_despejo_id.';
comment on column public.pa_despejo_lancamentos.embalagem_despejo_id is
  'Embalagem de despejo, catalogo proprio (pa_embalagens_despejo) -- usada por todo lancamento a partir desta migration.';
comment on column public.pa_despejo_lancamentos.quantidade_pacotes is
  'Apesar do nome (ficou assim pra nao precisar migrar coluna), a partir desta migration guarda a quantidade em UNIDADES, nao mais em caixas/pacotes -- a mudanca de unidade e so no que a tela pede e no litros_por_unidade usado pra calcular; o numero em si continua sendo "quantidade informada pela pessoa que lancou", so troca o que ele representa.';

-- ------------------------------------------------------------------
-- PERMISSOES DE TABELA (Data API)
-- ------------------------------------------------------------------
grant select on public.pa_embalagens_despejo to authenticated;
grant all on public.pa_embalagens_despejo to service_role;

-- ------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------
alter table public.pa_embalagens_despejo enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename = 'pa_embalagens_despejo'
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

create policy "le pa_embalagens_despejo da propria revenda"
  on public.pa_embalagens_despejo for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

notify pgrst, 'reload schema';
