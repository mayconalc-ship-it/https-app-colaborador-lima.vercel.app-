-- ==================================================================
-- 057 - RECEBIMENTO DE CARRETAS: TMA (portaria + conferencia)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Mede o TMA (tempo medio de atendimento) de carretas na revenda, do
-- apontamento da portaria ate a finalizacao do conferente.
--
-- Dois modulos opcionais novos (carretas-portaria / carretas-conferencia,
-- ver lib/acessos.ts) -- nao existe papel "Portaria"/"Conferente" no app,
-- entao a separacao de quem lanca cada etapa e feita concedendo um dos
-- dois modulos por pessoa em colaborador_modulos_extra, do jeito que o
-- Admin ja concede qualquer modulo opcional hoje (tela /admin/acessos).
--
-- Catalogos reaproveitados de produtividade-armazem (049/054): pa_fabricas,
-- pa_transportadoras, pa_produtos. Sem cadastro duplicado.
--
-- Fluxo de status:
--   aguardando_conferente -> em_descarga -> (em_carga, se houver) -> finalizado
--
-- O "inicio da descarga" e o mesmo instante em que o conferente assume o
-- atendimento e preenche os itens (decisao tomada na conversa que gerou
-- esta migracao) -- por isso nao existe uma coluna separada de "inicio da
-- descarga": inicio_atendimento_em cumpre esse papel.

-- ------------------------------------------------------------------
-- 1) CABECALHO DO ATENDIMENTO
-- ------------------------------------------------------------------
create table if not exists public.atendimentos_carretas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,

  -- Etapa 1: Portaria
  fabrica_id uuid not null references public.pa_fabricas(id) on delete restrict,
  transportadora_id uuid not null references public.pa_transportadoras(id) on delete restrict,
  numero_dt text not null,
  motorista_nome text not null,
  agendamento_em timestamptz,
  carga_agendada boolean not null default false,
  placa_cavalo text not null,
  placa_carreta text not null,
  chegada_em timestamptz not null default now(),
  portaria_colaborador_id uuid not null references auth.users(id) on delete cascade,
  portaria_nome text not null,

  -- Etapa 2: Conferencia
  status text not null default 'aguardando_conferente'
    check (status in ('aguardando_conferente', 'em_descarga', 'em_carga', 'finalizado')),
  inicio_atendimento_em timestamptz,
  conferente_colaborador_id uuid references auth.users(id) on delete set null,
  conferente_nome text,
  fim_descarga_em timestamptz,
  tem_carga boolean,
  inicio_carga_em timestamptz,
  fim_carga_em timestamptz,
  finalizacao_em timestamptz,

  criado_em timestamptz not null default now()
);

create index if not exists atendimentos_carretas_revenda_status_idx
  on public.atendimentos_carretas (revenda_id, status, chegada_em desc);
create index if not exists atendimentos_carretas_transportadora_idx
  on public.atendimentos_carretas (transportadora_id, chegada_em desc);

-- ------------------------------------------------------------------
-- 2) NOTAS FISCAIS (produto e remessa, cada uma numero + serie)
-- ------------------------------------------------------------------
create table if not exists public.atendimento_carretas_notas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  atendimento_id uuid not null references public.atendimentos_carretas(id) on delete cascade,
  tipo text not null check (tipo in ('produto', 'remessa')),
  numero text not null,
  serie text not null
);

create index if not exists atendimento_carretas_notas_atendimento_idx
  on public.atendimento_carretas_notas (atendimento_id);

-- ------------------------------------------------------------------
-- 3) ITENS DA DESCARGA (preenchidos pelo conferente ao assumir)
-- ------------------------------------------------------------------
create table if not exists public.atendimento_carretas_itens (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  atendimento_id uuid not null references public.atendimentos_carretas(id) on delete cascade,
  produto_id uuid not null references public.pa_produtos(id) on delete restrict,
  quantidade numeric(10,2) not null check (quantidade > 0),
  unidade text not null check (unidade in ('palete', 'caixa')),
  lote text not null,
  validade date not null,
  empilhador text not null
);

create index if not exists atendimento_carretas_itens_atendimento_idx
  on public.atendimento_carretas_itens (atendimento_id);
create index if not exists atendimento_carretas_itens_produto_idx
  on public.atendimento_carretas_itens (produto_id);

-- ------------------------------------------------------------------
-- 4) PERMISSOES DE TABELA (Data API)
-- ------------------------------------------------------------------
grant select, insert, update on public.atendimentos_carretas to authenticated;
grant select, insert on public.atendimento_carretas_notas to authenticated;
grant select, insert on public.atendimento_carretas_itens to authenticated;

grant all on public.atendimentos_carretas, public.atendimento_carretas_notas,
  public.atendimento_carretas_itens
  to service_role;

-- ------------------------------------------------------------------
-- 5) RLS
-- ------------------------------------------------------------------
alter table public.atendimentos_carretas enable row level security;
alter table public.atendimento_carretas_notas enable row level security;
alter table public.atendimento_carretas_itens enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('atendimentos_carretas', 'atendimento_carretas_notas', 'atendimento_carretas_itens')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- Leitura: time inteiro da revenda ve o monitor (portaria e conferencia
-- precisam enxergar o mesmo atendimento, cada um na sua etapa).
create policy "le atendimentos da propria revenda"
  on public.atendimentos_carretas for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Insercao: so em nome de quem esta logado (a portaria que lanca).
create policy "insere atendimento em nome proprio"
  on public.atendimentos_carretas for insert to authenticated
  with check (portaria_colaborador_id = auth.uid() and revenda_id in (select public.revendas_do_usuario()));

-- Atualizacao: liberada para qualquer pessoa da revenda -- e o que
-- permite ao conferente (pessoa diferente de quem lancou na portaria)
-- assumir, preencher e finalizar. Quem pode de fato chegar nesta acao e
-- decidido no servidor por requireAcessoModulo("carretas-conferencia"),
-- nao aqui -- mesmo desenho da operacao de empilhadeira (049).
create policy "atualiza atendimento da propria revenda"
  on public.atendimentos_carretas for update to authenticated
  using (revenda_id in (select public.revendas_do_usuario()))
  with check (revenda_id in (select public.revendas_do_usuario()));

create policy "le notas da propria revenda"
  on public.atendimento_carretas_notas for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));
create policy "insere notas na propria revenda"
  on public.atendimento_carretas_notas for insert to authenticated
  with check (revenda_id in (select public.revendas_do_usuario()));

create policy "le itens da propria revenda"
  on public.atendimento_carretas_itens for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));
create policy "insere itens na propria revenda"
  on public.atendimento_carretas_itens for insert to authenticated
  with check (revenda_id in (select public.revendas_do_usuario()));

-- ------------------------------------------------------------------
-- 6) TEMPO REAL -- o monitor atualiza sozinho quando a portaria lanca ou
--    o conferente muda o status, sem recarregar a pagina.
-- ------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.atendimentos_carretas;
exception
  when duplicate_object then null;
end $$;

-- ------------------------------------------------------------------
-- 7) OS MODULOS NAS REVENDAS ATIVAS
-- ------------------------------------------------------------------
-- Fica ligado na revenda para todo mundo poder ser liberado depois --
-- ninguem enxerga nada ate o Admin conceder o modulo pessoa a pessoa em
-- /admin/acessos (sao MODULOS_OPCIONAIS, ver lib/acessos.ts). Se alguma
-- revenda ainda nao usa isto, o Admin desliga em /admin/revendas.
insert into public.revenda_modulos (revenda_id, modulo)
select id, m from public.revendas r, unnest(array['carretas-portaria', 'carretas-conferencia']) as m
where r.ativa
on conflict (revenda_id, modulo) do nothing;

insert into public.menu_itens (revenda_id, chave, titulo, emoji, href, ordem, visivel)
select id, 'carretas-portaria', 'Portaria de Carretas', '🚪', '/carretas-portaria', 14, true
from public.revendas where ativa
on conflict (revenda_id, chave) do nothing;

insert into public.menu_itens (revenda_id, chave, titulo, emoji, href, ordem, visivel)
select id, 'carretas-conferencia', 'Conferência de Carretas', '📥', '/carretas-conferencia', 15, true
from public.revendas where ativa
on conflict (revenda_id, chave) do nothing;

notify pgrst, 'reload schema';
