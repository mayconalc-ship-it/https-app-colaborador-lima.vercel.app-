-- ==================================================================
-- 073 - REFUGO DE VASILHAME
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O conferente afere as garrafas que voltaram no mapa e classifica os
-- defeitos. O relatorio 03.11.34.05 ja traz o CODIGO DO MOTORISTA na
-- propria linha -- diferente do rating, aqui nao e preciso cruzar para
-- achar quem dirigiu. Conferido nos 8 meses de 2026: o motorista do
-- refugo bate com o do 03.11.29 em 434 de 434 linhas.
--
-- O AJUDANTE, esse sim, sai do cruzamento pelo mapa (rating_viagens),
-- porque o campo de ajudante do relatorio de refugo vem "Nao cadastrado"
-- em 427 das 434 linhas. Pelo mapa, 97,2% das afericoes acham ajudante.

-- -------------------- CONFIGURACAO --------------------
-- A pasta Refugo fica DENTRO da mesma pasta mae do rating
-- (05. Indicadores_LOG), entao quando esta em branco a importacao
-- reaproveita o link ja cadastrado em rating_config.
create table if not exists public.refugo_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  pasta_id text,
  pasta_link text,
  ultima_sincronizacao timestamptz,
  ultimo_resultado text,
  atualizado_em timestamptz not null default now()
);

-- -------------------- VALOR DOS MATERIAIS --------------------
-- O relatorio conta garrafas, nao dinheiro. O valor unitario e cadastrado
-- aqui pela lideranca, e o app multiplica. Sao poucos itens: nos 8 meses
-- de 2026 apareceram QUATRO (GFA CERV 600 AM, 1/2, 600 VE e 1L).
--
-- O valor NAO e historico de proposito: mudar o preco recalcula todo o
-- periodo. E o comportamento certo aqui, porque o objetivo e "quanto vale
-- o refugo hoje", nao contabilidade do dia da afericao.
create table if not exists public.refugo_itens (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  codigo text not null,
  descricao text not null,
  valor_unitario numeric(12,4) check (valor_unitario is null or valor_unitario >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (revenda_id, codigo)
);

-- -------------------- AFERICOES --------------------
create table if not exists public.refugo_afericoes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  data date not null,
  mapa text not null,
  veiculo text,
  placa text,
  transportadora text,
  -- Por que este mapa foi sorteado para conferencia: "Alto Indice
  -- Refugo", "Baixo Indice Refugo" ou "Nao Sorteado 30 dias". Nem todo
  -- mapa e aferido, e sem isso o motorista nao entende por que aparece.
  tipo_sorteio text,
  pct_incidencia_veiculo numeric(6,2),
  pct_nao_aferido numeric(6,2),

  item_codigo text not null,
  item_descricao text,

  total_aferido integer not null default 0 check (total_aferido >= 0),
  qt_boa integer not null default 0 check (qt_boa >= 0),
  -- A separacao pedida pelo dono em 29/08/2026: FALTANTE e garrafa que
  -- nao voltou, os outros 13 sao defeito de manuseio. Somados num numero
  -- so, um esconde o outro -- e o faltante e 81,7% do total.
  qt_faltante integer not null default 0 check (qt_faltante >= 0),
  qt_qualidade integer not null default 0 check (qt_qualidade >= 0),
  -- A quebra completa por tipo de defeito, como veio do relatorio. Em
  -- jsonb para o dia em que a Ambev acrescentar um tipo novo: a coluna
  -- nova entra sozinha, sem migration.
  defeitos jsonb not null default '{}'::jsonb,

  motorista_codigo text,
  motorista_nome text,
  conferente_codigo text,
  conferente_nome text,

  -- Resolvidos na importacao e gravados aqui, para a tela do colaborador
  -- ser um indice em vez de tres junções.
  motorista_colaborador_id uuid references auth.users(id) on delete set null,
  ajudante1_colaborador_id uuid references auth.users(id) on delete set null,
  ajudante1_nome text,
  ajudante2_colaborador_id uuid references auth.users(id) on delete set null,
  ajudante2_nome text,
  conferente_colaborador_id uuid references auth.users(id) on delete set null,

  importado_em timestamptz not null default now(),

  -- Conferido nas 434 linhas: data+mapa+item nao repete uma unica vez.
  -- (data+mapa sozinho repete 173 vezes -- um mapa traz varios itens.)
  unique (revenda_id, data, mapa, item_codigo)
);

create index if not exists refugo_motorista_idx
  on public.refugo_afericoes (revenda_id, motorista_colaborador_id, data desc);
create index if not exists refugo_ajudante1_idx
  on public.refugo_afericoes (revenda_id, ajudante1_colaborador_id, data desc);
create index if not exists refugo_ajudante2_idx
  on public.refugo_afericoes (revenda_id, ajudante2_colaborador_id, data desc);
create index if not exists refugo_conferente_idx
  on public.refugo_afericoes (revenda_id, conferente_colaborador_id, data desc);
create index if not exists refugo_data_idx
  on public.refugo_afericoes (revenda_id, data desc);

-- -------------------- RLS --------------------
alter table public.refugo_config enable row level security;
alter table public.refugo_itens enable row level security;
alter table public.refugo_afericoes enable row level security;

-- Cada um le o proprio refugo -- motorista, ajudante ou conferente
-- daquela afericao. A lideranca ve o conjunto pelo caminho
-- administrativo (service role), sem afrouxar esta politica: assim um
-- bug de tela nunca expoe o numero de um colega.
drop policy if exists "le o proprio refugo" on public.refugo_afericoes;
create policy "le o proprio refugo" on public.refugo_afericoes
  for select to authenticated
  using (
    motorista_colaborador_id = auth.uid()
    or ajudante1_colaborador_id = auth.uid()
    or ajudante2_colaborador_id = auth.uid()
    or conferente_colaborador_id = auth.uid()
  );

-- O valor unitario e lido por quem ve o refugo, para a tela mostrar
-- quanto custou. Nao e segredo: e preco de garrafa.
drop policy if exists "le o valor dos itens" on public.refugo_itens;
create policy "le o valor dos itens" on public.refugo_itens
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Escrita de cadastro e configuracao: so pelo importador/admin
-- (service role). Ninguem escreve direto pelo cliente.

notify pgrst, 'reload schema';
