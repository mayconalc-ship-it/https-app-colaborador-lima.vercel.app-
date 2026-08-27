-- ==================================================================
-- 066 - FEFO: registro de quebra (Padrao de Gestao de FEFO)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Modulo novo, pedido do dono (27/08/2026): o colaborador que ENCONTRA
-- uma quebra de FEFO no armazem avisa pelo app, e o controle de estoque
-- recebe na hora e responde o que foi feito.
--
-- So isso. Nao gera NRI, nao bloqueia palete no sistema, nao substitui a
-- conferencia semanal -- e o canal para a quebra chegar rapido a quem
-- resolve, que hoje depende de alguem lembrar de avisar no radio.
--
-- Duas datas de proposito: `validade` e a do palete que estava sendo
-- liberado, `menor_validade` e a menor que existe no estoque daquele
-- SKU. A quebra E a diferenca entre as duas -- por isso as duas moram na
-- mesma linha, e nao da para calcular uma a partir da outra depois.
--
-- Permissao: dois modulos separados na gestao de acesso, "fefo" (quem
-- informa) e "fefo-controle" (quem trata). Nao precisa de DDL: as
-- tabelas de permissao guardam o modulo como texto livre, entao a
-- liberacao e so DML.

create table if not exists public.pa_fefo_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  produto_id uuid not null references public.pa_produtos(id) on delete restrict,

  -- Tipos tirados do proprio padrao (secoes 5, 7.2 e 7.3).
  tipo text not null check (tipo in (
    'data_maior_liberada',  -- pegaram o palete de validade mais longa
    'sem_nri',              -- palete sem NRI, ou NRI em menos de 3 lados
    'vencimento_proximo',   -- menos de 45 dias e sem segregacao
    'sem_bloqueio',         -- deveria estar com trava pallet e nao estava
    'outro'
  )),

  quantidade integer not null check (quantidade > 0),
  validade date not null,
  menor_validade date not null,

  deposito text not null check (deposito in ('A', 'B', 'C')),
  rua smallint not null check (rua between 1 and 10),
  ponto text,                       -- nivel/posicao, opcional
  rua_bloqueada boolean not null default false,

  foto_url text,
  observacao text,

  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,
  criado_em timestamptz not null default now(),

  -- Tratativa do controle de estoque.
  status text not null default 'aberta' check (status in ('aberta', 'tratada')),
  acao text,
  tratado_por_id uuid references auth.users(id) on delete set null,
  tratado_por_nome text,
  tratado_em timestamptz,

  -- A menor data do estoque nunca pode ser maior que a do palete achado:
  -- se fosse, nao haveria data menor sendo pulada.
  constraint pa_fefo_datas_coerentes check (menor_validade <= validade),
  -- "Tratada" sem dizer o que foi feito nao serve para nada: seria so
  -- sumir com a pendencia da lista.
  constraint pa_fefo_tratada_com_acao check (
    status = 'aberta' or (acao is not null and btrim(acao) <> '')
  )
);

-- A tela do controle abre sempre pelas ABERTAS, mais recentes primeiro.
create index if not exists pa_fefo_revenda_status_idx
  on public.pa_fefo_ocorrencias (revenda_id, status, criado_em desc);
create index if not exists pa_fefo_produto_idx
  on public.pa_fefo_ocorrencias (produto_id);

alter table public.pa_fefo_ocorrencias enable row level security;

-- Leitura: todo mundo da revenda ve as ocorrencias dela. O controle
-- precisa ver as dos outros, e quem informou precisa acompanhar a
-- resposta -- entao a leitura e da revenda, nao do dono da linha.
drop policy if exists "le fefo da revenda" on public.pa_fefo_ocorrencias;
create policy "le fefo da revenda" on public.pa_fefo_ocorrencias
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Escrita: so a propria ocorrencia, e so na revenda em que a pessoa esta.
drop policy if exists "insere fefo proprio" on public.pa_fefo_ocorrencias;
create policy "insere fefo proprio" on public.pa_fefo_ocorrencias
  for insert to authenticated
  with check (
    colaborador_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );

-- A TRATATIVA nao entra aqui de proposito: quem trata mexe numa linha
-- que nao e dele, entao a acao do servidor usa service role depois de
-- conferir "fefo-controle". Sem politica de update, o token do usuario
-- comum nao altera nada -- nem a propria ocorrencia depois de enviada.

notify pgrst, 'reload schema';
