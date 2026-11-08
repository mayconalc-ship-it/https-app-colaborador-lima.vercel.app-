-- ====================================================================
-- 175 -- PDVs VIP (08/11/2026, pedido do dono)
--
-- "Em fonte de dados, coloque para que carregue uma lista de PDVs vips, e
-- sempre que for colocado o mapa que tenha pdv dessa base, apareça o aviso
-- assim como o da prioridade."
--
-- A lista vem de uma planilha no Drive (Fontes de Dados › PDVs VIP), uma
-- por revenda. Cada importação TROCA a lista inteira da revenda: PDV que
-- saiu da planilha deixa de ser VIP. A Minha Rota avisa o motorista quando
-- o mapa tem PDV desta lista.
-- ====================================================================

create table if not exists public.pa_pdv_vips (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  cod_pdv text not null,
  segmento text not null default 'VIP',
  nome text,
  setor text,
  gv text,
  cidade text,
  atualizado_em timestamptz not null default now(),
  primary key (revenda_id, cod_pdv)
);

comment on table public.pa_pdv_vips is
  'PDVs VIP da revenda (lista do Drive, Fontes de Dados). Trocada inteira a cada importação. Segmento como veio na planilha (VIP, CONTRATO...).';

alter table public.pa_pdv_vips enable row level security;
drop policy if exists "pa_pdv_vips_leitura" on public.pa_pdv_vips;
create policy "pa_pdv_vips_leitura" on public.pa_pdv_vips
  for select to authenticated using (true);

-- O link da planilha: mesmas três colunas que a tela de Fontes lê em todas.
create table if not exists public.pa_vip_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  pasta_link text,
  ultima_sincronizacao timestamptz,
  ultimo_resultado text,
  atualizado_em timestamptz not null default now()
);

alter table public.pa_vip_config enable row level security;
drop policy if exists "pa_vip_config_leitura" on public.pa_vip_config;
create policy "pa_vip_config_leitura" on public.pa_vip_config
  for select to authenticated using (true);

grant select on public.pa_pdv_vips, public.pa_vip_config to authenticated;
grant all on public.pa_pdv_vips, public.pa_vip_config to service_role;

notify pgrst, 'reload schema';

-- Confira: as duas tabelas existem e estão vazias.
select 'pa_pdv_vips' as tabela, count(*) from public.pa_pdv_vips
union all
select 'pa_vip_config', count(*) from public.pa_vip_config;
