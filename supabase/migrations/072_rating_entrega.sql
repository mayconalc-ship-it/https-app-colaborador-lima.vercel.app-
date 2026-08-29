-- ==================================================================
-- 072 - RATING DE ENTREGA (motorista e ajudante)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O cliente avalia a ENTREGA de 1 a 5 no LOG.CO, mas a planilha nao diz
-- quem entregou: a coluna Motorista vem vazia. Quem entregou sai do
-- 03.11.29, cruzando pelo numero do mapa -- conferido nos 8 meses de
-- 2026, fecha em 99,0% (as 139 que sobram sao de mapa anterior ao inicio
-- do 03.11.29, nao ha o que cruzar).
--
-- A corrente inteira:
--   avaliacao --mapa--> viagem --codigo+tipo--> pessoa --CPF--> profile
--
-- Por que "codigo + TIPO" e nao so codigo: motorista e ajudante sao
-- cadastros SEPARADOS que colidem no numero. Conferido nas 3.651
-- viagens: os 2.809 nomes de motorista batem com o cadastro 01.20.01.47,
-- e os 2.218 de ajudante erram TODOS (o codigo 1011 e uma pessoa como
-- ajudante e outra como motorista). Sem o tipo na chave, todo ajudante
-- seria atribuido a pessoa errada, sem erro nenhum aparecer.

-- -------------------- CONFIGURACAO --------------------
create table if not exists public.rating_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  pasta_id text,
  pasta_link text,
  ultima_sincronizacao timestamptz,
  ultimo_resultado text,
  atualizado_em timestamptz not null default now()
);

-- -------------------- CADASTRO (01.20.01.47 e .48) --------------------
create table if not exists public.rating_pessoas (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- 'motorista' vem do 01.20.01.47, 'ajudante' do 01.20.01.48.
  tipo text not null check (tipo in ('motorista', 'ajudante')),
  codigo text not null,
  nome text not null,
  -- 11 digitos, sem mascara. O relatorio exporta sem o zero a esquerda
  -- (44.569.881.00 = 04456988100); o app completa e confere o digito
  -- verificador antes de gravar, senao deixa nulo.
  cpf text,
  status text,
  colaborador_id uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  primary key (revenda_id, tipo, codigo)
);

create index if not exists rating_pessoas_cpf_idx on public.rating_pessoas (revenda_id, cpf);

-- -------------------- VIAGENS (03.11.29) --------------------
-- Quem estava em cada mapa. Tabela separada das avaliacoes para que
-- reimportar o LOG.CO nao dependa deste arquivo estar presente.
create table if not exists public.rating_viagens (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  mapa text not null,
  data date,
  placa text,
  supervisor_nome text,
  motorista_codigo text,
  motorista_nome text,
  ajudante1_codigo text,
  ajudante1_nome text,
  ajudante2_codigo text,
  ajudante2_nome text,
  atualizado_em timestamptz not null default now(),
  primary key (revenda_id, mapa)
);

-- -------------------- AVALIACOES (LOG.CO) --------------------
create table if not exists public.rating_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  data_avaliacao date not null,
  nota smallint not null check (nota between 1 and 5),
  -- Conferido nas 14.211 avaliacoes de 2026: 1-3 = Detrator, 4 = Neutro,
  -- 5 = Promotor, sem uma excecao. Guardado assim mesmo, e nao derivado
  -- da nota, para o dia em que o LOG.CO mudar a regua.
  classificacao text not null check (classificacao in ('detrator', 'neutro', 'promotor')),
  mapa text not null,
  cod_pdv text,
  nome_pdv text,
  pedido text,
  motivo text,
  comentario text,
  estado text,
  cidade text,

  -- Resolvido no momento da importacao e GRAVADO aqui, em vez de juntar
  -- na leitura: a tela do motorista pergunta "as minhas avaliacoes de
  -- hoje", e isso vira um indice em vez de tres junções por consulta.
  motorista_colaborador_id uuid references auth.users(id) on delete set null,
  motorista_nome text,
  ajudante1_colaborador_id uuid references auth.users(id) on delete set null,
  ajudante1_nome text,
  ajudante2_colaborador_id uuid references auth.users(id) on delete set null,
  ajudante2_nome text,

  importado_em timestamptz not null default now(),

  -- Reimportar o mesmo mes atualiza em vez de duplicar. A avaliacao e de
  -- um cliente, num mapa, num pedido -- e o pedido sozinho nao serve,
  -- porque vem vazio em parte das linhas.
  unique (revenda_id, data_avaliacao, mapa, cod_pdv, pedido)
);

create index if not exists rating_aval_motorista_idx
  on public.rating_avaliacoes (revenda_id, motorista_colaborador_id, data_avaliacao desc);
create index if not exists rating_aval_ajudante1_idx
  on public.rating_avaliacoes (revenda_id, ajudante1_colaborador_id, data_avaliacao desc);
create index if not exists rating_aval_ajudante2_idx
  on public.rating_avaliacoes (revenda_id, ajudante2_colaborador_id, data_avaliacao desc);
create index if not exists rating_aval_data_idx
  on public.rating_avaliacoes (revenda_id, data_avaliacao desc);

-- -------------------- RESPOSTA DO COLABORADOR --------------------
-- Toda avaliacao abaixo de 5 estrelas pede a versao de quem entregou.
-- Uma resposta por pessoa por avaliacao: motorista e ajudante da mesma
-- entrega respondem cada um a sua.
create table if not exists public.rating_feedbacks (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  avaliacao_id uuid not null references public.rating_avaliacoes(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,
  papel text not null check (papel in ('motorista', 'ajudante')),
  texto text not null check (length(btrim(texto)) > 0),
  criado_em timestamptz not null default now(),
  unique (avaliacao_id, colaborador_id)
);

create index if not exists rating_feedbacks_aval_idx
  on public.rating_feedbacks (avaliacao_id);

-- -------------------- RLS --------------------
alter table public.rating_config enable row level security;
alter table public.rating_pessoas enable row level security;
alter table public.rating_viagens enable row level security;
alter table public.rating_avaliacoes enable row level security;
alter table public.rating_feedbacks enable row level security;

-- As avaliacoes sao PESSOAIS: cada um le as suas. A lideranca ve o
-- conjunto pelo caminho administrativo (service role), nao afrouxando
-- esta politica -- assim um bug de tela nunca expoe a nota de um
-- motorista para o colega.
drop policy if exists "le as proprias avaliacoes" on public.rating_avaliacoes;
create policy "le as proprias avaliacoes" on public.rating_avaliacoes
  for select to authenticated
  using (
    motorista_colaborador_id = auth.uid()
    or ajudante1_colaborador_id = auth.uid()
    or ajudante2_colaborador_id = auth.uid()
  );

drop policy if exists "le os proprios feedbacks" on public.rating_feedbacks;
create policy "le os proprios feedbacks" on public.rating_feedbacks
  for select to authenticated
  using (colaborador_id = auth.uid());

drop policy if exists "escreve o proprio feedback" on public.rating_feedbacks;
create policy "escreve o proprio feedback" on public.rating_feedbacks
  for insert to authenticated
  with check (
    colaborador_id = auth.uid()
    and exists (
      select 1 from public.rating_avaliacoes a
       where a.id = avaliacao_id
         and (a.motorista_colaborador_id = auth.uid()
              or a.ajudante1_colaborador_id = auth.uid()
              or a.ajudante2_colaborador_id = auth.uid())
    )
  );

drop policy if exists "corrige o proprio feedback" on public.rating_feedbacks;
create policy "corrige o proprio feedback" on public.rating_feedbacks
  for update to authenticated
  using (colaborador_id = auth.uid())
  with check (colaborador_id = auth.uid());

-- Cadastro, viagens e configuracao sao administrativos: quem escreve e o
-- importador (service role). Ninguem le direto pelo cliente.

notify pgrst, 'reload schema';
