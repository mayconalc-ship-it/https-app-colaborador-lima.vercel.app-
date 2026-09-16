-- ==================================================================
-- 121 - Modulo MATERIAL DE APOIO do armazem (Sao Felix e Barreiras)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (16/09/2026): conciliar o material de apoio do armazem
-- -- filme stretch, filme contratil, fitilho e outros.
--
--   * cadastro do produto: unidade (un, m ou kg), a LINEAR DE USO (quanto
--     se gasta por dia, semana ou mes) e as politicas de estoque em DIAS
--     (minima, objetiva e maxima);
--   * contagem: com a quantidade contada, quantos dias de estoque ha;
--   * alerta: chegando perto da politica minima, avisa as pessoas
--     escolhidas para solicitarem a compra.
--
-- Toda escrita passa pelo servidor (service role), que confere as regras.
-- Nao ha politica de INSERT/UPDATE/DELETE pelo navegador.

-- ------------------------------------------------------------------
-- O produto
-- ------------------------------------------------------------------
create table if not exists public.ma_produtos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  unidade text not null check (unidade in ('un', 'm', 'kg')),

  -- A linear de uso: tanto (na unidade do produto) por periodo. O consumo
  -- por dia sai da divisao -- semana = 7 dias, mes = 30.
  linear_quantidade numeric(14,3) not null check (linear_quantidade > 0),
  linear_periodo text not null default 'dia' check (linear_periodo in ('dia', 'semana', 'mes')),

  -- As politicas, em dias de estoque.
  politica_minima_dias integer not null check (politica_minima_dias between 0 and 3650),
  politica_objetivo_dias integer not null check (politica_objetivo_dias between 0 and 3650),
  politica_maxima_dias integer not null check (politica_maxima_dias between 0 and 3650),
  -- "Perto da minima": avisar quando faltarem ate estes dias para chegar nela.
  antecedencia_alerta_dias integer not null default 2 check (antecedencia_alerta_dias between 0 and 365),

  -- Desativar em vez de apagar: o historico de contagem continua de pe.
  ativo boolean not null default true,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text,

  constraint ma_produtos_politicas_em_ordem check (
    politica_minima_dias <= politica_objetivo_dias
    and politica_objetivo_dias <= politica_maxima_dias
  )
);

create unique index if not exists ma_produtos_nome_unico
  on public.ma_produtos (revenda_id, lower(btrim(nome)));

-- ------------------------------------------------------------------
-- A contagem
-- ------------------------------------------------------------------
create table if not exists public.ma_contagens (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- A conciliacao: os produtos contados juntos, no mesmo envio.
  lote_id uuid not null,
  produto_id uuid not null references public.ma_produtos(id) on delete cascade,
  quantidade numeric(14,3) not null check (quantidade >= 0),

  -- O consumo por dia NA HORA da contagem. Se a linear mudar amanha, a
  -- contagem de hoje continua dizendo quantos dias havia quando foi feita.
  consumo_diario numeric(16,5) not null check (consumo_diario > 0),

  contado_em timestamptz not null default now(),
  colaborador_id uuid references auth.users(id) on delete set null,
  colaborador_nome text not null,
  observacao text check (observacao is null or char_length(observacao) <= 300),
  criado_em timestamptz not null default now()
);

create index if not exists ma_contagens_produto_idx
  on public.ma_contagens (revenda_id, produto_id, contado_em desc);
create index if not exists ma_contagens_lote_idx
  on public.ma_contagens (revenda_id, lote_id);

-- ------------------------------------------------------------------
-- Quem recebe o alerta de compra
-- ------------------------------------------------------------------
create table if not exists public.ma_destinatarios (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (revenda_id, colaborador_id)
);

-- ------------------------------------------------------------------
-- Leitura (RLS)
-- ------------------------------------------------------------------
alter table public.ma_produtos enable row level security;
alter table public.ma_contagens enable row level security;
alter table public.ma_destinatarios enable row level security;

drop policy if exists "le produtos da revenda" on public.ma_produtos;
create policy "le produtos da revenda" on public.ma_produtos
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

drop policy if exists "le contagens da revenda" on public.ma_contagens;
create policy "le contagens da revenda" on public.ma_contagens
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

drop policy if exists "le destinatarios da revenda" on public.ma_destinatarios;
create policy "le destinatarios da revenda" on public.ma_destinatarios
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- ------------------------------------------------------------------
-- Liga o modulo nas duas revendas
-- ------------------------------------------------------------------
-- Ninguem ganha acesso aqui: a liberacao e pessoa a pessoa, em Acessos por
-- Pessoa (como o Ativo de Giro).
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'material-apoio', true
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id, modulo) do update set ativo = true;

-- Confira: duas linhas, uma por revenda, ativo = true.
select r.nome, rm.modulo, rm.ativo
from public.revenda_modulos rm
join public.revendas r on r.id = rm.revenda_id
where rm.modulo = 'material-apoio'
order by r.nome;
