-- ==================================================================
-- 061 - CARRETAS V2: cadastros de apoio, config, retorno com AG
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Fecha lacunas do modulo de carretas (057): motorista e empilhador eram
-- texto livre sem sugestao; nao existia meta de TMA nem alerta de
-- validade; "vai ter carga alem da descarga?" nao refletia como a
-- operacao funciona -- quase sempre a carreta volta com Ativo de Giro
-- (garrafeira, pallet, chapa eucatex), nao "outra carga qualquer".
--
-- Motorista/empilhador continuam TEXTO LIVRE nas tabelas de atendimento
-- (atendimentos_carretas.motorista_nome, atendimento_carretas_itens.
-- empilhador) -- os catalogos novos so alimentam sugestao por nome no
-- formulario (ver ComboboxNome.tsx), sem virar FK: digitar um nome fora
-- da lista continua funcionando, do jeito que a operacao real e -- gente
-- nova aparece antes de alguem lembrar de cadastrar.

-- ------------------------------------------------------------------
-- 1) MOTORISTAS e EMPILHADORES (catalogos simples de nome)
-- ------------------------------------------------------------------
create table if not exists public.pa_motoristas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists pa_motoristas_nome_unico
  on public.pa_motoristas (revenda_id, lower(nome));
create index if not exists pa_motoristas_revenda_idx
  on public.pa_motoristas (revenda_id) where ativo;

create table if not exists public.pa_empilhadores (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists pa_empilhadores_nome_unico
  on public.pa_empilhadores (revenda_id, lower(nome));
create index if not exists pa_empilhadores_revenda_idx
  on public.pa_empilhadores (revenda_id) where ativo;

-- ------------------------------------------------------------------
-- 2) CATALOGO DE AG (Ativo de Giro que retorna na carreta)
-- ------------------------------------------------------------------
-- unidade e por ITEM (nao fixa): garrafeira 300/600/1000ml entra como
-- palete, chapa eucatex e o proprio pallet avulso entram como unidade --
-- quem decide isso e o cadastro, nao o codigo.
create table if not exists public.pa_ag_catalogo (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  codigo text not null,
  descricao text not null,
  unidade text not null default 'palete' check (unidade in ('palete', 'unidade')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists pa_ag_catalogo_codigo_unico
  on public.pa_ag_catalogo (revenda_id, codigo);
create index if not exists pa_ag_catalogo_revenda_idx
  on public.pa_ag_catalogo (revenda_id) where ativo;

-- ------------------------------------------------------------------
-- 3) CONFIG DE RECEBIMENTO (um numero por revenda)
-- ------------------------------------------------------------------
-- Mesmo desenho de rotas_config (016/017/021): revenda_id como PK,
-- colunas soltas -- nao existe tabela chave-valor generica no app, e nao
-- vale a pena criar uma so pra dois numeros.
create table if not exists public.pa_recebimento_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  tma_alvo_minutos integer not null default 120,
  dias_minimos_validade_alerta integer not null default 30
);

-- ------------------------------------------------------------------
-- 4) RETORNO COM AG: destino no cabecalho, itens numa tabela propria
-- ------------------------------------------------------------------
alter table public.atendimentos_carretas
  add column if not exists destino_retorno text;

create table if not exists public.atendimento_carretas_ag_itens (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  atendimento_id uuid not null references public.atendimentos_carretas(id) on delete cascade,
  ag_id uuid not null references public.pa_ag_catalogo(id) on delete restrict,
  quantidade numeric(10,2) not null check (quantidade > 0)
);
create index if not exists atendimento_carretas_ag_itens_atendimento_idx
  on public.atendimento_carretas_ag_itens (atendimento_id);
create index if not exists atendimento_carretas_ag_itens_ag_idx
  on public.atendimento_carretas_ag_itens (ag_id);

-- ------------------------------------------------------------------
-- 5) PERMISSOES DE TABELA (Data API)
-- ------------------------------------------------------------------
grant select on public.pa_motoristas, public.pa_empilhadores,
  public.pa_ag_catalogo, public.pa_recebimento_config
  to authenticated;
grant select, insert on public.atendimento_carretas_ag_itens to authenticated;

grant all on
  public.pa_motoristas, public.pa_empilhadores, public.pa_ag_catalogo,
  public.pa_recebimento_config, public.atendimento_carretas_ag_itens
  to service_role;

-- ------------------------------------------------------------------
-- 6) RLS
-- ------------------------------------------------------------------
alter table public.pa_motoristas enable row level security;
alter table public.pa_empilhadores enable row level security;
alter table public.pa_ag_catalogo enable row level security;
alter table public.pa_recebimento_config enable row level security;
alter table public.atendimento_carretas_ag_itens enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('pa_motoristas', 'pa_empilhadores', 'pa_ag_catalogo',
        'pa_recebimento_config', 'atendimento_carretas_ag_itens')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- Catalogos: leitura por revenda, escrita so pelo servidor -- mesmo
-- desenho do loop de catalogos em 049.
do $$
declare t text;
begin
  foreach t in array array['pa_motoristas', 'pa_empilhadores', 'pa_ag_catalogo']
  loop
    execute format(
      'create policy "le %I da propria revenda" on public.%I for select to authenticated
         using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))',
      t, t
    );
  end loop;
end $$;

create policy "le config de recebimento da propria revenda"
  on public.pa_recebimento_config for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Itens de AG: leitura por revenda (mesma regra dos itens de descarga em
-- 057), insercao liberada pra quem esta na revenda -- quem de fato chega
-- na acao e decidido no servidor por requireAcessoModulo, nao aqui.
create policy "le itens de ag da propria revenda"
  on public.atendimento_carretas_ag_itens for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));
create policy "insere itens de ag na propria revenda"
  on public.atendimento_carretas_ag_itens for insert to authenticated
  with check (revenda_id in (select public.revendas_do_usuario()));

-- ------------------------------------------------------------------
-- 7) RENOMEIA OS ITENS DE MENU JA SEMEADOS
-- ------------------------------------------------------------------
-- A migration 057 so roda uma vez -- mudar o INSERT dela agora nao
-- atualiza quem ja foi semeado. UPDATE direto pela chave, que nao muda.
update public.menu_itens set titulo = 'Portaria', emoji = '🛂'
  where chave = 'carretas-portaria';
update public.menu_itens set titulo = 'Monitor de Recebimento', emoji = '🖥️'
  where chave = 'carretas-conferencia';

notify pgrst, 'reload schema';
