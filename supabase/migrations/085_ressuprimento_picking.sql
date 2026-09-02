-- ==================================================================
-- 085 - RESSUPRIMENTO DO PICKING: solicitacao, transporte, abastecimento
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Ate aqui o Abastecimento do Picking media UMA pessoa: quem abastecia
-- abria a sessao, lancava os produtos e fechava. O que acontece ANTES --
-- alguem perceber a falta, pedir, a empilhadeira buscar no bloco e
-- deixar na area -- nao existia em lugar nenhum. E e ai que a operacao
-- espera.
--
-- Tres papeis, tres momentos, e o que interessa medir e o INTERVALO
-- entre eles:
--
--   solicitante pede      -> espera pela empilhadeira
--   operador aceita       -> transporte
--   operador entrega      -> espera pelo ajudante
--   ajudante comeca       -> abastecimento (ja existia)
--   ajudante termina
--
-- NAO EXISTE COLUNA DE STATUS. O estado sai dos carimbos de tempo, na
-- leitura (ver estadoDe em src/lib/ressuprimento.ts). Um status mantido
-- a mao pelas acoes e a primeira coisa a divergir do que de fato
-- aconteceu: basta uma acao falhar no meio e a fila passa a mostrar "em
-- transporte" para um item ja entregue, sem ninguem conseguir explicar.
--
-- Só o cancelamento tem carimbo proprio, porque cancelar e um FATO novo,
-- nao a ausencia de outro.
--
-- O ABASTECIMENTO CONTINUA SENDO pa_abastecimentos. Esta migration so
-- acrescenta um vinculo opcional. Assim o indicador de HL/h, o ranking e
-- as metas continuam lendo a mesma tabela de sempre -- uma tabela nova em
-- paralelo faria o picking parar de contar metade do trabalho sem dar
-- erro nenhum. E o lancamento avulso (sem solicitacao) continua valendo:
-- o ajudante que so completa uma posicao no meio do turno nao pode ficar
-- obrigado a abrir uma solicitacao para si mesmo.

create table if not exists public.pa_ressuprimentos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,

  -- Quem pediu.
  solicitante_id uuid not null references auth.users(id) on delete cascade,
  solicitante_nome text not null,
  turno text not null check (turno in ('manha', 'tarde', 'noite')),
  prioridade text not null default 'normal' check (prioridade in ('normal', 'urgente')),
  observacao text,
  criado_em timestamptz not null default now(),

  -- Quem transportou. Nulo enquanto a solicitacao esta na fila.
  operador_id uuid references auth.users(id) on delete set null,
  operador_nome text,
  transporte_inicio timestamptz,

  -- Nao existe transporte_fim: e o carimbo do ULTIMO item entregue (ver
  -- transporteFim no lib). Um resumo gravado poderia discordar dos itens,
  -- e o item e o fato.

  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id) on delete set null,
  motivo_cancelamento text,

  constraint pa_ressuprimento_transporte_valido
    check (transporte_inicio is null or transporte_inicio >= criado_em)

  -- NAO existe check amarrando operador_id a transporte_inicio, de
  -- proposito. A amarra e tentadora ("aceitar sem se identificar deixa a
  -- entrega sem dono"), mas operador_id e ON DELETE SET NULL: no dia em
  -- que um colaborador desligado fosse apagado, o Postgres tentaria zerar
  -- a coluna, o check quebraria e a EXCLUSAO DO USUARIO falharia -- um
  -- erro em outra tela, sem nenhuma relacao aparente com ressuprimento.
  -- Quem garante os dois juntos e a acao que aceita (actions.ts), e o
  -- nome do operador fica gravado em operador_nome justamente para o
  -- historico sobreviver ao id.
);

create index if not exists pa_ressuprimento_revenda_idx
  on public.pa_ressuprimentos (revenda_id, criado_em desc);

-- A fila da empilhadeira: o que ainda nao foi aceito nem cancelado. E a
-- consulta que roda a cada abertura da tela do operador.
create index if not exists pa_ressuprimento_fila_idx
  on public.pa_ressuprimentos (revenda_id, criado_em)
  where transporte_inicio is null and cancelado_em is null;

create table if not exists public.pa_ressuprimento_itens (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  ressuprimento_id uuid not null references public.pa_ressuprimentos(id) on delete cascade,
  produto_id uuid not null references public.pa_produtos(id) on delete restrict,
  unidade text not null check (unidade in ('caixa', 'palete')),
  quantidade numeric(10,2) not null check (quantidade > 0),
  -- HL GRAVADO, nao recalculado na leitura -- mesmo desenho do item de
  -- abastecimento (migration 071): se o fator do produto mudar amanha, o
  -- que ja foi pedido continua valendo o que valia.
  hl_calculado numeric(12,3) not null check (hl_calculado >= 0),

  -- Entrega ITEM A ITEM. A empilhadeira raramente leva tudo numa viagem,
  -- e uma solicitacao que so muda de estado quando o ultimo item chega
  -- esconde justamente a viagem que demorou.
  entregue_em timestamptz,
  entregue_por uuid references auth.users(id) on delete set null,

  -- Sem check amarrando entregue_em a entregue_por, pelo mesmo motivo do
  -- operador acima: entregue_por e ON DELETE SET NULL, e o check faria a
  -- exclusao de um usuario falhar. O carimbo e o fato; o autor e quem
  -- pode sumir.
  criado_em timestamptz not null default now()
);

create index if not exists pa_ressuprimento_itens_pedido_idx
  on public.pa_ressuprimento_itens (ressuprimento_id);
create index if not exists pa_ressuprimento_itens_produto_idx
  on public.pa_ressuprimento_itens (revenda_id, produto_id);

-- -------------------- O VINCULO COM O ABASTECIMENTO --------------------
-- Opcional de proposito: abastecimento sem solicitacao continua valendo.
alter table public.pa_abastecimentos
  add column if not exists ressuprimento_id uuid
  references public.pa_ressuprimentos(id) on delete set null;

-- Uma solicitacao e atendida por UMA sessao de abastecimento. Duas
-- sessoes na mesma solicitacao dariam dois tempos de ciclo para o mesmo
-- pedido, e nenhum dos dois seria o certo.
drop index if exists pa_abastecimento_ressuprimento_unico;
create unique index pa_abastecimento_ressuprimento_unico
  on public.pa_abastecimentos (ressuprimento_id)
  where ressuprimento_id is not null;

-- -------------------- RLS --------------------
alter table public.pa_ressuprimentos enable row level security;
alter table public.pa_ressuprimento_itens enable row level security;

-- Leitura por revenda: a fila e de todo mundo que participa do fluxo, e
-- quem pediu precisa acompanhar o proprio pedido.
drop policy if exists "le ressuprimento da revenda" on public.pa_ressuprimentos;
create policy "le ressuprimento da revenda" on public.pa_ressuprimentos
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

drop policy if exists "le itens de ressuprimento da revenda" on public.pa_ressuprimento_itens;
create policy "le itens de ressuprimento da revenda" on public.pa_ressuprimento_itens
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Escrita da SOLICITACAO: so a propria, so na revenda ativa -- igual aos
-- demais lancamentos do armazem.
drop policy if exists "insere ressuprimento proprio" on public.pa_ressuprimentos;
create policy "insere ressuprimento proprio" on public.pa_ressuprimentos
  for insert to authenticated
  with check (
    solicitante_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );

drop policy if exists "insere item de ressuprimento proprio" on public.pa_ressuprimento_itens;
create policy "insere item de ressuprimento proprio" on public.pa_ressuprimento_itens
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pa_ressuprimentos r
       where r.id = ressuprimento_id
         and r.solicitante_id = auth.uid()
         and r.transporte_inicio is null
    )
  );

drop policy if exists "exclui item de ressuprimento proprio" on public.pa_ressuprimento_itens;
create policy "exclui item de ressuprimento proprio" on public.pa_ressuprimento_itens
  for delete to authenticated
  using (
    exists (
      select 1 from public.pa_ressuprimentos r
       where r.id = ressuprimento_id
         and r.solicitante_id = auth.uid()
         and r.transporte_inicio is null
    )
  );

-- SEM POLITICA DE UPDATE, de proposito.
--
-- Aceitar, entregar e cancelar sao acoes de OUTRA pessoa que nao o dono
-- da linha -- "edita a propria" nao serve aqui. A alternativa seria
-- liberar update para qualquer um da revenda, e ai qualquer pessoa
-- logada poderia carimbar uma entrega que nao fez, inflando o indicador
-- de outro operador.
--
-- Essas transicoes passam pelo cliente de servico, atras de
-- exigirContextoModulo no servidor (ver ressuprimento/actions.ts). A
-- permissao fica num lugar so, e e a mesma que decide se a tela abre.

-- -------------------- LIBERA O MODULO --------------------
-- Onde ja existe o Abastecimento do Picking: e a mesma operacao, so que
-- agora com quem pede e quem transporta tambem dentro dela.
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select distinct rm.revenda_id, 'pa-ressuprimento', true
from public.revenda_modulos rm
where rm.modulo = 'pa-picking' and rm.ativo
on conflict (revenda_id, modulo) do update set ativo = true;

notify pgrst, 'reload schema';

-- Confira: uma linha por revenda que tem o picking.
select r.nome, rm.modulo, rm.ativo
from public.revenda_modulos rm
join public.revendas r on r.id = rm.revenda_id
where rm.modulo = 'pa-ressuprimento';
