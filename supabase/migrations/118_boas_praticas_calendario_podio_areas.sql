-- ==================================================================
-- 118 - BOAS PRATICAS: calendario, podio de 3 lugares e areas
-- Execute no Supabase do App Colaborador DEPOIS da 117:
-- SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (15/09/2026):
--   * premio para 1o (R$ 200), 2o (R$ 100) e 3o (R$ 50) lugar;
--   * sugestoes ate 21/09, votacao ate 24/09, divulgacao em 25/09;
--   * antes da votacao a lideranca analisa e libera so as aprovadas
--     (ja era assim na 117);
--   * uma tela em Configuracao para escolher as AREAS que participam.

-- ------------------------------------------------------------------
-- A configuracao do programa, uma linha por revenda
-- ------------------------------------------------------------------
create table if not exists public.boas_praticas_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,

  -- As areas que participam: DU (Distribuicao) e/ou AL (Armazem), as
  -- mesmas do Desafio do Mes. Pelo menos uma.
  areas text[] not null default array['DU', 'AL']::text[]
    check (areas <@ array['DU', 'AL']::text[] and cardinality(areas) >= 1),

  -- O calendario. Nulo = sem prazo.
  sugestoes_ate date,
  votacao_ate date,
  divulgacao_em date,

  -- A premiacao, em reais.
  premio_1 numeric(10,2) check (premio_1 is null or premio_1 >= 0),
  premio_2 numeric(10,2) check (premio_2 is null or premio_2 >= 0),
  premio_3 numeric(10,2) check (premio_3 is null or premio_3 >= 0),

  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text,

  constraint boas_praticas_config_datas_em_ordem check (
    (sugestoes_ate is null or votacao_ate is null or sugestoes_ate <= votacao_ate)
    and (votacao_ate is null or divulgacao_em is null or votacao_ate < divulgacao_em)
  )
);

alter table public.boas_praticas_config enable row level security;

drop policy if exists "le config da revenda" on public.boas_praticas_config;
create policy "le config da revenda" on public.boas_praticas_config
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- ------------------------------------------------------------------
-- A votacao guarda o proprio calendario e o proprio premio
-- ------------------------------------------------------------------
-- Copiados da configuracao quando a votacao abre: mudar a configuracao
-- da proxima edicao nao reescreve o resultado desta.
alter table public.boas_praticas_votacoes
  add column if not exists divulgacao_em date,
  add column if not exists premio_1 numeric(10,2),
  add column if not exists premio_2 numeric(10,2),
  add column if not exists premio_3 numeric(10,2),
  -- O podio. O 1o lugar continua em vencedora_id (117).
  add column if not exists segunda_id uuid references public.boas_praticas(id) on delete set null,
  add column if not exists terceira_id uuid references public.boas_praticas(id) on delete set null;

-- ------------------------------------------------------------------
-- A primeira edicao, nas duas revendas
-- ------------------------------------------------------------------
insert into public.boas_praticas_config
  (revenda_id, areas, sugestoes_ate, votacao_ate, divulgacao_em, premio_1, premio_2, premio_3)
select r.id, array['DU', 'AL']::text[], date '2026-09-21', date '2026-09-24', date '2026-09-25', 200, 100, 50
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id) do nothing;

-- A tela de configuracao e um modulo proprio (liberado em Acessos por
-- Pessoa): quem conduz a votacao nao precisa ser quem define premio.
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'boas-praticas-config', true
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id, modulo) do update set ativo = true;

-- Confira: duas linhas, com as datas e os premios.
select r.nome, c.areas, c.sugestoes_ate, c.votacao_ate, c.divulgacao_em,
       c.premio_1, c.premio_2, c.premio_3
from public.boas_praticas_config c
join public.revendas r on r.id = c.revenda_id
order by r.nome;
