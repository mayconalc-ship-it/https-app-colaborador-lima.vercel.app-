-- ==================================================================
-- 139 - WQI: baixa de quebra de PA (produto acabado) por manuseio
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (26/09/2026): trazer para o app o lancamento de WQI que
-- hoje vive numa planilha/AppSheet ("Baixas WQI"), e dar visibilidade do
-- que se quebra, onde, em que turno e com quem.
--
-- A base foi a propria planilha (aba ProdutosWQI, 2.215 linhas de
-- 10/02/2026 a 25/09/2026). Colunas dela -> colunas daqui:
--   DataReg    -> criado_em (e data_ocorrido, na importacao)
--   email      -> colaborador_nome (quem lancou)
--   IDProduto  -> produto_codigo (+ produto_id quando o codigo existe)
--   Quantidade -> quantidade      Medida -> unidade (Un/Cx)
--   Motivo     -> motivo          Local  -> local
--   Turno      -> turno (T1/T2/T3 = manha/tarde/noite, a regua do app)
--   Quem       -> responsavel_nome (matricula da aba QLP)
--   Evidencia  -> foto_url (so nos lancamentos novos; ver 140)
-- E do print enviado pelo dono: Data Ocorrido, Nota Fiscal, Funcao e
-- Colaborador -- data_ocorrido, nota_fiscal, responsavel_funcao e
-- responsavel_nome.
--
-- MOTIVO E LOCAL SAO GRAVADOS PELO NOME, nao por id: o catalogo serve
-- ao formulario, e o nome de um fato passado nao muda quando alguem
-- renomeia o motivo hoje (mesma decisao dos depositos do FEFO, 097).
--
-- PRODUTO TAMBEM LEVA CODIGO E DESCRICAO GRAVADOS: a planilha tem
-- codigos que podem nao existir no cadastro de hoje, e a baixa antiga
-- precisa continuar legivel.
--
-- Permissao: modulo "wqi" (texto livre nas tabelas de permissao, sem
-- DDL). Colaborador lanca por liberacao individual; lideranca com
-- "wqi:ver" abre o painel em /gestao/wqi, "wqi:excluir" apaga lancamento.
-- ==================================================================

-- ------------------------------------------------------------------
-- 1) Catalogos do formulario
-- ------------------------------------------------------------------
create table if not exists public.pa_wqi_motivos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  -- Quando usar. Sem isso duas pessoas classificam a mesma quebra de
  -- jeitos diferentes, e agrupar por motivo deixa de dizer alguma coisa.
  ajuda text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint pa_wqi_motivo_unico unique (revenda_id, nome)
);

create table if not exists public.pa_wqi_locais (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint pa_wqi_local_unico unique (revenda_id, nome)
);

alter table public.pa_wqi_motivos enable row level security;
alter table public.pa_wqi_locais enable row level security;

drop policy if exists "le motivos wqi da revenda" on public.pa_wqi_motivos;
create policy "le motivos wqi da revenda" on public.pa_wqi_motivos
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

drop policy if exists "le locais wqi da revenda" on public.pa_wqi_locais;
create policy "le locais wqi da revenda" on public.pa_wqi_locais
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Escrita dos catalogos so pelo servidor (Admin > Produtividade do
-- Armazem > WQI), que ja confere permissao.

-- ------------------------------------------------------------------
-- 2) As baixas
-- ------------------------------------------------------------------
create table if not exists public.pa_wqi_baixas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,

  data_ocorrido date not null,
  turno text not null check (turno in ('manha', 'tarde', 'noite')),

  produto_id uuid references public.pa_produtos(id) on delete set null,
  produto_codigo text not null,
  produto_descricao text not null,

  quantidade integer not null check (quantidade > 0),
  unidade text not null check (unidade in ('palete', 'lastro', 'caixa', 'unidade')),
  -- As duas conversoes, gravadas na hora (se o fator do produto mudar
  -- amanha, a baixa de ontem continua valendo o que valia). Nulas quando
  -- o cadastro nao tem o fator -- a baixa entra assim mesmo.
  unidades_equivalentes numeric(14,3),
  hl_calculado numeric(12,3),

  motivo text not null,
  local text not null,
  nota_fiscal text,

  -- Quem manuseava o produto quando quebrou. Opcional: na planilha 54%
  -- das linhas estao sem ninguem, e exigir faria a baixa nao ser lancada.
  responsavel_id uuid references auth.users(id) on delete set null,
  responsavel_nome text,
  responsavel_funcao text,

  foto_url text,
  observacao text,

  -- Quem lancou. Nulo so no historico importado da planilha, onde a
  -- pessoa e um e-mail e nao um cadastro do app.
  colaborador_id uuid references auth.users(id) on delete set null,
  colaborador_nome text not null,

  origem text not null default 'app' check (origem in ('app', 'planilha')),
  -- IDWQI da planilha: e o que impede a importacao de duplicar se for
  -- rodada duas vezes.
  origem_ref text,
  criado_em timestamptz not null default now(),

  constraint pa_wqi_app_tem_autor check (origem = 'planilha' or colaborador_id is not null)
);

create unique index if not exists pa_wqi_origem_ref_idx
  on public.pa_wqi_baixas (revenda_id, origem_ref)
  where origem_ref is not null;
create index if not exists pa_wqi_revenda_data_idx
  on public.pa_wqi_baixas (revenda_id, data_ocorrido desc);
create index if not exists pa_wqi_colaborador_idx
  on public.pa_wqi_baixas (colaborador_id, criado_em desc);

alter table public.pa_wqi_baixas enable row level security;

drop policy if exists "le wqi da revenda" on public.pa_wqi_baixas;
create policy "le wqi da revenda" on public.pa_wqi_baixas
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

drop policy if exists "insere wqi proprio" on public.pa_wqi_baixas;
create policy "insere wqi proprio" on public.pa_wqi_baixas
  for insert to authenticated
  with check (
    colaborador_id = auth.uid()
    and origem = 'app'
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );

-- Sem politica de update/delete: apagar lancamento errado e da lideranca
-- com "wqi:excluir", pela acao do servidor (service role).

-- ------------------------------------------------------------------
-- 3) Liga o modulo e semeia os catalogos com o que a planilha usa
-- ------------------------------------------------------------------
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'wqi', true
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id, modulo) do update set ativo = true;

-- Os 11 motivos que aparecem na planilha, na grafia dela. Sem "ajuda":
-- o texto de quando usar cada um e do dono, nao foi inventado aqui --
-- preencha no Admin.
insert into public.pa_wqi_motivos (revenda_id, nome)
select r.id, m.nome
from public.revendas r
cross join (
  values
    ('Avaria no Estoque'),
    ('Devolução/Retorno de rota'),
    ('Avaria na Descarga (Retorno de Rota)'),
    ('Avaria de Puxada'),
    ('Manuseio de produto'),
    ('Avaria no Carregamento (Arrumação)'),
    ('Prensagem de Produto'),
    ('Garfada/Perfuração'),
    ('Vazamento/Estouro Espontâneo'),
    ('Avaria por Paleteira Manual'),
    ('Arrastamento de Pallet')
) as m(nome)
where r.id in ('7afe4da5-e846-4b02-947f-96843a2791fe', 'fc365d16-ccbd-4322-ae02-e992a36861e8')
on conflict (revenda_id, nome) do nothing;

-- Os locais da planilha. "Pinking" la e erro de digitacao de Picking.
insert into public.pa_wqi_locais (revenda_id, nome)
select r.id, l.nome
from public.revendas r
cross join (
  values ('Armazém (Estoque)'), ('Repack'), ('Retorno de Rota'), ('Picking')
) as l(nome)
where r.id in ('7afe4da5-e846-4b02-947f-96843a2791fe', 'fc365d16-ccbd-4322-ae02-e992a36861e8')
on conflict (revenda_id, nome) do nothing;

notify pgrst, 'reload schema';

-- Confira: 2 revendas com o modulo, 22 motivos, 8 locais.
select
  (select count(*) from public.revenda_modulos where modulo = 'wqi' and ativo) as revendas_com_modulo,
  (select count(*) from public.pa_wqi_motivos) as motivos,
  (select count(*) from public.pa_wqi_locais) as locais;
