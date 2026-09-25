-- ==================================================================
-- 135 - SIMULADOR DE MAO DE OBRA (25/09/2026)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono, para o item 1.2 do DPO (Dimensionamento): a unidade
-- precisa de simulador operacional para antecipar a necessidade de mao de
-- obra, revisado mensalmente, comparando DIMENSIONADO x REALIZADO,
-- acompanhando a dispersao do volume e com plano de acao para os desvios.
--
-- As contas sao as mesmas da planilha da companhia (Simulador Dist,
-- Simulador Armazem, Imputs e Base Salario). Aqui ficam os DADOS; as
-- contas moram em src/lib/mao-de-obra.ts.
--
-- Quatro tabelas:
--   mao_obra_config     -- os parametros da operacao (aba Imputs)
--   mao_obra_salarios   -- o custo mensal de uma pessoa, por funcao
--   mao_obra_meses      -- o que a lideranca digita a cada mes
--   mao_obra_realizado  -- o QLP real, por funcao (dimensionado x real)
--   mao_obra_acoes      -- o plano de acao do desvio
-- ==================================================================

-- ------------------------------------------------------------------
-- 1) Parametros da operacao
-- ------------------------------------------------------------------
create table if not exists public.mao_obra_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  percentual_montagem numeric(6,4) not null default 0.4,
  perc_blitz_carregamento numeric(6,4) not null default 0.1,
  perc_blitz_refugo numeric(6,4) not null default 0.1,
  perc_blitz_puxada numeric(6,4) not null default 0.1,
  tempo_reposicao_picking numeric(8,6) not null default 0.25,
  tempo_carregamento_caminhao numeric(8,6) not null default 0.013889,
  tma numeric(8,6) not null default 0.125,
  hl_carreta numeric(10,2) not null default 210,
  jornada numeric(8,6) not null default 0.305556,
  tempo_blitz numeric(8,6) not null default 0.027778,
  hl_por_mapa numeric(10,2) not null default 50,
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text
);

-- ------------------------------------------------------------------
-- 2) Base salarial, por funcao
-- ------------------------------------------------------------------
create table if not exists public.mao_obra_salarios (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  funcao text not null check (funcao in (
    'motorista', 'ajudante_entrega', 'puxador',
    'operador', 'ajudante_armazem', 'conferente', 'manobrista'
  )),
  salario numeric(12,2) not null default 0,
  encargos numeric(12,2) not null default 0,
  hora_extra numeric(12,2) not null default 0,
  dsr_hora_extra numeric(12,2) not null default 0,
  vale_transporte numeric(12,2) not null default 0,
  ticket numeric(12,2) not null default 0,
  assistencia_medica numeric(12,2) not null default 0,
  seguro_vida numeric(12,2) not null default 0,
  cesta_basica numeric(12,2) not null default 0,
  produtividade numeric(12,2) not null default 0,
  decimo_terceiro numeric(12,2) not null default 0,
  ferias numeric(12,2) not null default 0,
  uniforme numeric(12,2) not null default 0,
  adicional_noturno numeric(12,2) not null default 0,
  premio_assiduidade numeric(12,2) not null default 0,
  dsr_produtividade numeric(12,2) not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text,
  primary key (revenda_id, funcao)
);

-- ------------------------------------------------------------------
-- 3) O mes -- o que a lideranca digita
-- ------------------------------------------------------------------
create table if not exists public.mao_obra_meses (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- Primeiro dia do mes, como no 5S: competencia e mes, nao dia.
  competencia date not null,
  -- Distribuicao
  volume_ppr numeric(14,2),
  volume_negociado numeric(14,2),
  marketplace numeric(14,2),
  dias_totais integer,
  sabados integer,
  volume_entrega_sabado numeric(14,2),
  media_carro_hl numeric(10,2),
  frota_long_dist integer,
  frota_reserva integer,
  frota_spot integer,
  frota_fixa_total integer,
  puxadores integer,
  -- Armazem (os turnos que nao saem de conta)
  operador_tarde integer,
  operador_reserva integer,
  manobristas integer,
  ajudante_noite integer,
  ajudante_manha integer,
  ajudante_tarde integer,
  ajudante_reserva integer,
  ajudante_extra integer,
  conferente_noite integer,
  conferente_manha integer,
  conferente_tarde integer,
  -- Acompanhamento
  volume_realizado numeric(14,2),
  observacao text check (observacao is null or char_length(observacao) <= 500),
  -- A EVIDENCIA da revisao mensal que o DPO pede.
  revisado_em timestamptz not null default now(),
  revisado_por_nome text,
  primary key (revenda_id, competencia)
);

-- ------------------------------------------------------------------
-- 4) O realizado (QLP) -- dimensionado x real
-- ------------------------------------------------------------------
create table if not exists public.mao_obra_realizado (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  competencia date not null,
  funcao text not null check (funcao in (
    'motorista', 'ajudante_entrega', 'puxador',
    'operador', 'ajudante_armazem', 'conferente', 'manobrista'
  )),
  quantidade integer not null check (quantidade >= 0 and quantidade <= 2000),
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text,
  primary key (revenda_id, competencia, funcao)
);

-- ------------------------------------------------------------------
-- 5) Plano de acao do desvio
-- ------------------------------------------------------------------
create table if not exists public.mao_obra_acoes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  competencia date not null,
  funcao text,
  o_que text not null check (char_length(o_que) between 5 and 300),
  responsavel text not null check (char_length(responsavel) between 3 and 120),
  prazo date,
  status text not null default 'aberta' check (status in ('aberta', 'em_andamento', 'concluida')),
  criado_em timestamptz not null default now(),
  criado_por_nome text,
  concluida_em timestamptz
);

create index if not exists mao_obra_acoes_revenda_idx
  on public.mao_obra_acoes (revenda_id, competencia);

-- ------------------------------------------------------------------
-- RLS: so o servidor le e escreve (custo de gente nao sai pelo navegador)
-- ------------------------------------------------------------------
alter table public.mao_obra_config enable row level security;
alter table public.mao_obra_salarios enable row level security;
alter table public.mao_obra_meses enable row level security;
alter table public.mao_obra_realizado enable row level security;
alter table public.mao_obra_acoes enable row level security;

-- ------------------------------------------------------------------
-- Liga o modulo nas duas revendas e semeia os parametros
-- ------------------------------------------------------------------
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'mao-de-obra', true
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id, modulo) do update set ativo = true;

insert into public.mao_obra_config (revenda_id, atualizado_por_nome)
select r.id, 'migration 135 (padrao da companhia -- conferir)'
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe',
  'fc365d16-ccbd-4322-ae02-e992a36861e8'
)
on conflict (revenda_id) do nothing;

-- A base salarial de partida vem da planilha da companhia. Os numeros de
-- CADA revenda se ajustam na tela (Lideranca > Simulador de Mao de Obra);
-- sem isso o custo sai errado, mas o dimensionamento (que e o que o DPO
-- cobra) ja funciona.
insert into public.mao_obra_salarios (
  revenda_id, funcao, salario, encargos, hora_extra, dsr_hora_extra, vale_transporte, ticket,
  assistencia_medica, seguro_vida, cesta_basica, produtividade, decimo_terceiro, ferias,
  uniforme, adicional_noturno, premio_assiduidade, dsr_produtividade, atualizado_por_nome
)
select r.id, v.funcao, v.salario, v.encargos, v.hora_extra, v.dsr_he, v.vt, v.ticket,
       v.saude, v.seguro, v.cesta, v.produtividade, v.decimo, v.ferias, v.uniforme,
       v.noturno, v.assiduidade, v.dsr_prod, 'migration 135 (padrao da companhia -- conferir)'
from public.revendas r
cross join (values
  -- funcao,            salario, encargos, he,     dsr_he, vt,  ticket, saude, seguro, cesta, prod,  decimo,  ferias,  unif,  noturno, assid,  dsr_prod
  ('motorista',         2301.00, 389.00,   283.87, 70.81,  200, 375,    400,   6.28,   293,   600,   191.75,  258.17,  67.75, 0,       115.08, 107),
  ('ajudante_entrega',  1580.00, 389.00,   200.00, 100.00, 200, 375,    400,   6.28,   293,   420,   131.66,  164.58,  67.75, 0,       79.00,  80),
  ('puxador',           2301.00, 432.42,   100.00, 20.00,  200, 375,    400,   6.28,   293,   0,     191.75,  767.00,  67.75, 250,     300.00, 80),
  ('operador',          2200.00, 407.14,   150.00, 30.00,  200, 375,    400,   6.28,   293,   350,   183.33,  733.33,  67.75, 250,     110.00, 137),
  ('ajudante_armazem',  1674.29, 315.97,   150.00, 30.00,  200, 375,    400,   6.28,   293,   750,   139.52,  558.10,  67.75, 250,     83.71,  137),
  ('conferente',        2500.00, 497.55,   200.00, 40.00,  200, 375,    400,   6.28,   293,   0,     208.33,  833.33,  67.75, 250,     125.00, 137),
  ('manobrista',        2301.55, 586.14,   200.00, 40.00,  200, 375,    400,   6.28,   293,   0,     191.80,  767.18,  67.75, 250,     115.08, 137)
) as v(funcao, salario, encargos, hora_extra, dsr_he, vt, ticket, saude, seguro, cesta, produtividade, decimo, ferias, uniforme, noturno, assiduidade, dsr_prod)
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe',
  'fc365d16-ccbd-4322-ae02-e992a36861e8'
)
on conflict (revenda_id, funcao) do nothing;

notify pgrst, 'reload schema';

-- Confira: 2 configs, 14 linhas de salario (7 funcoes x 2 revendas).
select
  (select count(*) from public.mao_obra_config) as configs,
  (select count(*) from public.mao_obra_salarios) as salarios,
  (select count(*) from public.revenda_modulos where modulo = 'mao-de-obra' and ativo) as revendas_com_modulo;
