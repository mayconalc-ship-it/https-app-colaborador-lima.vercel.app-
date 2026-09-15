-- ==================================================================
-- 117 - Modulo BOAS PRATICAS (Sao Felix e Barreiras)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (15/09/2026): o programa de boas praticas dentro do app.
--
--   1. o colaborador sugere uma pratica -- quantas quiser -- com o
--      problema, o objetivo, o escopo e os beneficios;
--   2. a lideranca avalia: seleciona para a votacao ou devolve com o
--      motivo;
--   3. a lideranca abre a votacao com as selecionadas;
--   4. os colegas votam: um voto por pessoa, nunca na propria pratica;
--   5. a lideranca encerra e divulga a vencedora (o premio e texto livre,
--      ainda esta sendo definido).
--
-- Toda escrita passa pelo servidor (service role), que confere as regras.
-- Por isso nao ha politica de INSERT/UPDATE/DELETE: pelo navegador
-- ninguem grava nada direto nestas tabelas.

-- ------------------------------------------------------------------
-- A votacao (uma rodada do programa)
-- ------------------------------------------------------------------
create table if not exists public.boas_praticas_votacoes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 3 and 120),
  -- O incentivo do ganhador. Texto livre e opcional: o dono ainda esta
  -- definindo, e da para preencher depois com a votacao aberta.
  premio text check (premio is null or char_length(premio) <= 200),
  -- Ultimo dia para votar, inclusive, no fuso da operacao.
  fim date not null,
  aberta_em timestamptz not null default now(),
  aberta_por_id uuid references auth.users(id) on delete set null,
  aberta_por_nome text not null,
  encerrada_em timestamptz,
  encerrada_por_nome text,
  criado_em timestamptz not null default now()
);

-- Uma votacao aberta por revenda. Duas ao mesmo tempo dividiriam o voto
-- das mesmas pessoas e ninguem saberia em qual esta votando.
create unique index if not exists boas_praticas_uma_votacao_aberta
  on public.boas_praticas_votacoes (revenda_id)
  where encerrada_em is null;

create index if not exists boas_praticas_votacoes_revenda_idx
  on public.boas_praticas_votacoes (revenda_id, aberta_em desc);

-- ------------------------------------------------------------------
-- A pratica sugerida
-- ------------------------------------------------------------------
create table if not exists public.boas_praticas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,

  -- Quem sugeriu. O nome fica gravado: o reconhecimento e da pessoa, e
  -- continua certo mesmo que o cadastro dela mude depois.
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,

  titulo text not null check (char_length(titulo) between 3 and 100),
  problema text not null check (char_length(problema) between 10 and 1500),
  objetivo text not null check (char_length(objetivo) between 10 and 1500),
  escopo text not null check (char_length(escopo) between 10 and 1500),
  beneficios text not null check (char_length(beneficios) between 10 and 1500),
  foto_url text,

  status text not null default 'em_analise'
    check (status in ('em_analise', 'selecionada', 'nao_selecionada')),
  -- O que a lideranca respondeu. Obrigatorio para "nao selecionada":
  -- quem sugeriu precisa saber por que, senao nao sugere de novo.
  retorno text check (retorno is null or char_length(retorno) <= 500),
  avaliado_por_id uuid references auth.users(id) on delete set null,
  avaliado_por_nome text,
  avaliado_em timestamptz,

  -- Em qual votacao ela entrou. Uma pratica disputa uma votacao so.
  votacao_id uuid references public.boas_praticas_votacoes(id) on delete set null,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint boas_praticas_recusa_tem_motivo
    check (status <> 'nao_selecionada' or retorno is not null),
  constraint boas_praticas_so_selecionada_vai_a_votacao
    check (votacao_id is null or status = 'selecionada')
);

create index if not exists boas_praticas_revenda_status_idx
  on public.boas_praticas (revenda_id, status, criado_em desc);
create index if not exists boas_praticas_colaborador_idx
  on public.boas_praticas (colaborador_id, criado_em desc);
create index if not exists boas_praticas_votacao_idx
  on public.boas_praticas (votacao_id);

-- A vencedora. Depois das duas tabelas porque uma aponta para a outra.
alter table public.boas_praticas_votacoes
  add column if not exists vencedora_id uuid
    references public.boas_praticas(id) on delete set null;

-- ------------------------------------------------------------------
-- O voto
-- ------------------------------------------------------------------
create table if not exists public.boas_praticas_votos (
  id bigint generated always as identity primary key,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  votacao_id uuid not null references public.boas_praticas_votacoes(id) on delete cascade,
  pratica_id uuid not null references public.boas_praticas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  votado_em timestamptz not null default now(),
  -- Um voto por pessoa por votacao. Trocar de voto atualiza esta linha.
  constraint boas_praticas_um_voto_por_pessoa unique (votacao_id, colaborador_id)
);

create index if not exists boas_praticas_votos_pratica_idx
  on public.boas_praticas_votos (votacao_id, pratica_id);

-- ------------------------------------------------------------------
-- Leitura (RLS)
-- ------------------------------------------------------------------
alter table public.boas_praticas_votacoes enable row level security;
alter table public.boas_praticas enable row level security;
alter table public.boas_praticas_votos enable row level security;

drop policy if exists "le votacoes da revenda" on public.boas_praticas_votacoes;
create policy "le votacoes da revenda" on public.boas_praticas_votacoes
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- A sugestao em analise e da pessoa e da lideranca (que le pelo servidor).
-- O colega so enxerga a pratica depois que ela vai para a votacao.
drop policy if exists "le pratica propria ou em votacao" on public.boas_praticas;
create policy "le pratica propria ou em votacao" on public.boas_praticas
  for select to authenticated
  using (
    public.ehowner_atual()
    or (
      revenda_id in (select public.revendas_do_usuario())
      and (colaborador_id = auth.uid() or votacao_id is not null)
    )
  );

-- Voto secreto: cada um le so o proprio. A parcial e lida pelo servidor,
-- e so para a lideranca.
drop policy if exists "le o proprio voto" on public.boas_praticas_votos;
create policy "le o proprio voto" on public.boas_praticas_votos
  for select to authenticated
  using (colaborador_id = auth.uid());

-- ------------------------------------------------------------------
-- Liga o modulo nas duas revendas
-- ------------------------------------------------------------------
-- Nao e modulo liberado pessoa a pessoa: todo colaborador da revenda
-- sugere e vota. Quem avalia e monta a votacao e a lideranca com a
-- permissao "Boas Praticas" em Acessos por Pessoa.
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'boas-praticas', true
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
where rm.modulo = 'boas-praticas'
order by r.nome;
