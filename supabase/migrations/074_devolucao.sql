-- ==================================================================
-- 074 - DEVOLUCAO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- A devolucao sai do relatorio 03.02.37, que e por NOTA FISCAL (nao por
-- item: as colunas de produto e quantidade vem vazias em 100% das
-- linhas). Status "D" = Devolvida: 727 notas nos 8 meses de 2026,
-- R$ 1.450.187,11.
--
-- POR QUE EXISTE UMA CLASSIFICACAO DE MOTIVO
--
-- Os tres motivos mais frequentes sao PDV Fechado (213), Sem Dinheiro
-- (109) e Cliente Cancelou (93) -- 57% das ocorrencias, e nenhum deles e
-- falha de quem entrega. E o motivo que mais pesa em dinheiro, "Mapa nao
-- carregado" (R$ 876 mil, 60,4% do valor), esconde quatro notas de
-- transferencia para a FABRICA CAMACARI que somam R$ 836 mil.
--
-- Sem separar por responsabilidade, o motorista abriria o app e leria
-- "voce devolveu R$ 547 mil" por causa de uma transferencia. Por isso a
-- regua fica no banco, editavel pela lideranca, e nao no codigo.

-- -------------------- CONFIGURACAO --------------------
-- A pasta 03.02.37 fica dentro da mesma pasta mae do Rating; em branco,
-- a importacao reaproveita aquele link.
create table if not exists public.devolucao_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  pasta_id text,
  pasta_link text,
  -- Acima disso no dia, o colaborador precisa dizer o que aconteceu.
  -- Fica no banco e nao no codigo para a lideranca mudar a regua sem
  -- pedido de alteracao -- mesmo desenho da meta de ocupacao das rotas.
  --
  -- 1,6% e o padrao pedido pelo dono e bate com a operacao: nos 8 meses
  -- de 2026 ela rodou a 1,98% do valor entregue (0,78% sem a
  -- transferencia para a fabrica). Com esta regua, 11% dos dias com
  -- entrega pedem justificativa -- cerca de uma por motorista por mes.
  meta_pct numeric(5,2) not null default 1.60 check (meta_pct > 0 and meta_pct <= 100),
  ultima_sincronizacao timestamptz,
  ultimo_resultado text,
  atualizado_em timestamptz not null default now()
);

-- -------------------- MOTIVOS --------------------
-- Codigo e descricao vem do relatorio 01.20.01.06 (94 codigos). A
-- RESPONSABILIDADE e da casa: e ela que decide o que aparece como numero
-- do colaborador.
create table if not exists public.devolucao_motivos (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  codigo text not null,
  descricao text not null,
  responsabilidade text not null default 'nao_classificado'
    check (responsabilidade in ('cliente', 'operacao', 'entrega', 'nao_conta', 'nao_classificado')),
  atualizado_em timestamptz not null default now(),
  primary key (revenda_id, codigo)
);

-- -------------------- NOTAS DEVOLVIDAS --------------------
create table if not exists public.devolucao_notas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  data date not null,
  nota text not null,
  serie text,
  mapa text,
  motivo_codigo text,
  cliente_codigo text,
  cliente_nome text,
  valor numeric(14,2) not null default 0,

  motorista_codigo text,
  motorista_nome text,
  motorista_colaborador_id uuid references auth.users(id) on delete set null,
  ajudante1_colaborador_id uuid references auth.users(id) on delete set null,
  ajudante1_nome text,
  ajudante2_colaborador_id uuid references auth.users(id) on delete set null,
  ajudante2_nome text,

  importado_em timestamptz not null default now(),

  -- Conferido nas 727 devolucoes: o numero da nota NAO repete uma unica
  -- vez, nem entre arquivos de meses diferentes. A serie entra na chave
  -- por rigor fiscal, nao por necessidade.
  unique (revenda_id, nota, serie)
);

create index if not exists devolucao_motorista_idx
  on public.devolucao_notas (revenda_id, motorista_colaborador_id, data desc);
create index if not exists devolucao_ajudante1_idx
  on public.devolucao_notas (revenda_id, ajudante1_colaborador_id, data desc);
create index if not exists devolucao_ajudante2_idx
  on public.devolucao_notas (revenda_id, ajudante2_colaborador_id, data desc);
create index if not exists devolucao_data_idx
  on public.devolucao_notas (revenda_id, data desc);
create index if not exists devolucao_motivo_idx
  on public.devolucao_notas (revenda_id, motivo_codigo);

-- -------------------- O DIA DE CADA MOTORISTA --------------------
-- O denominador do indicador: quanto o motorista ENTREGOU no dia. Sem
-- ele nao existe "% de devolucao", so a contagem crua.
--
-- Guardado como AGREGADO do dia, e nao nota a nota: as entregues sao
-- 58.005 linhas em 8 meses (R$ 73,3 milhoes) contra 727 devolucoes.
-- Agregando, o mesmo periodo cabe em 2.167 linhas -- e o app nao precisa
-- da nota entregue individual para nada.
create table if not exists public.devolucao_dia (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  data date not null,
  motorista_codigo text not null,
  motorista_nome text,
  motorista_colaborador_id uuid references auth.users(id) on delete set null,
  ajudante1_colaborador_id uuid references auth.users(id) on delete set null,
  ajudante2_colaborador_id uuid references auth.users(id) on delete set null,

  notas_entregues integer not null default 0,
  valor_entregue numeric(14,2) not null default 0,
  notas_devolvidas integer not null default 0,
  valor_devolvido numeric(14,2) not null default 0,
  -- O devolvido que NAO conta para a meta (transferencia, cancelamento
  -- fiscal). Guardado a parte para o % ser justo sem esconder o valor.
  valor_fora_do_indicador numeric(14,2) not null default 0,

  importado_em timestamptz not null default now(),
  primary key (revenda_id, data, motorista_codigo)
);

create index if not exists devolucao_dia_colaborador_idx
  on public.devolucao_dia (revenda_id, motorista_colaborador_id, data desc);

-- -------------------- JUSTIFICATIVA --------------------
-- Uma por pessoa por DIA (nao por nota): a meta e do dia, e pedir uma
-- explicacao por nota faria o motorista escrever cinco vezes a mesma
-- coisa num dia ruim.
create table if not exists public.devolucao_justificativas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  data date not null,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,
  papel text not null check (papel in ('motorista', 'ajudante')),
  texto text not null check (length(btrim(texto)) > 0),
  criado_em timestamptz not null default now(),
  unique (revenda_id, data, colaborador_id)
);

-- -------------------- RLS --------------------
alter table public.devolucao_config enable row level security;
alter table public.devolucao_motivos enable row level security;
alter table public.devolucao_notas enable row level security;
alter table public.devolucao_dia enable row level security;
alter table public.devolucao_justificativas enable row level security;

drop policy if exists "le o proprio dia" on public.devolucao_dia;
create policy "le o proprio dia" on public.devolucao_dia
  for select to authenticated
  using (
    motorista_colaborador_id = auth.uid()
    or ajudante1_colaborador_id = auth.uid()
    or ajudante2_colaborador_id = auth.uid()
  );

drop policy if exists "le a propria justificativa" on public.devolucao_justificativas;
create policy "le a propria justificativa" on public.devolucao_justificativas
  for select to authenticated
  using (colaborador_id = auth.uid());

drop policy if exists "escreve a propria justificativa" on public.devolucao_justificativas;
create policy "escreve a propria justificativa" on public.devolucao_justificativas
  for insert to authenticated
  with check (colaborador_id = auth.uid());

drop policy if exists "corrige a propria justificativa" on public.devolucao_justificativas;
create policy "corrige a propria justificativa" on public.devolucao_justificativas
  for update to authenticated
  using (colaborador_id = auth.uid())
  with check (colaborador_id = auth.uid());

-- A meta precisa ser legivel por quem ve o proprio numero: sem ela a
-- tela nao sabe dizer se o dia bateu ou nao.
drop policy if exists "le a meta" on public.devolucao_config;
create policy "le a meta" on public.devolucao_config
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Cada um le a propria devolucao. A lideranca ve o conjunto pelo caminho
-- administrativo (service role), sem afrouxar esta politica.
drop policy if exists "le a propria devolucao" on public.devolucao_notas;
create policy "le a propria devolucao" on public.devolucao_notas
  for select to authenticated
  using (
    motorista_colaborador_id = auth.uid()
    or ajudante1_colaborador_id = auth.uid()
    or ajudante2_colaborador_id = auth.uid()
  );

-- O motivo e a classificacao dele sao lidos por quem ve a devolucao: sem
-- isso a tela mostraria "motivo 37" em vez de "PDV Fechado".
drop policy if exists "le os motivos" on public.devolucao_motivos;
create policy "le os motivos" on public.devolucao_motivos
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

notify pgrst, 'reload schema';
