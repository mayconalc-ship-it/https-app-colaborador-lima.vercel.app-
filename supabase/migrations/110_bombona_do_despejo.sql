-- ------------------------------------------------------------------
-- 110) A BOMBONA DO DESPEJO TEM FUNDO
--
-- O termometro da bombona nasceu contando os litros do PERIODO
-- filtrado na tela. Isso responde "quanto se despejou na semana", que
-- nao e a pergunta de quem esta na operacao: a bombona e um recipiente
-- fisico, e a pergunta e "quanto ainda cabe ali antes de encher".
--
-- Filtrada por turno ou por pessoa entao a leitura ficava pior ainda:
-- o T1 via a bombona pela metade e o T2 via vazia, sendo a MESMA
-- bombona.
--
-- Esta tabela guarda o unico evento que zera a conta: o esvaziamento.
-- O nivel de agora e a soma dos litros lancados DEPOIS do ultimo
-- esvaziamento -- sem recorte de data, sem recorte de turno, sem
-- recorte de pessoa. E um so numero para todo o armazem, que e o que
-- a bombona e.
--
-- Nao ha coluna de "nivel": nivel derivado nao mente. Guardar um saldo
-- e ter de manter esse saldo de acordo com lancamento apagado, editado
-- ou lancado com data retroativa -- e um deles vai escapar.
-- ------------------------------------------------------------------

create table if not exists public.pa_despejo_esvaziamentos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,

  -- Quem levou a bombona para o descarte, e quando. O "quando" e o
  -- corte: tudo lancado depois disso conta para a bombona nova.
  esvaziada_em timestamptz not null default now(),
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,

  -- Quanto marcava na hora. Nao entra em conta nenhuma -- e historico,
  -- para responder depois "a bombona foi esvaziada cheia ou pela
  -- metade?", que e o que diz se o descarte esta sendo feito na hora
  -- certa ou por conveniencia de horario.
  litros_no_momento numeric(10,2) not null default 0,
  observacao text,

  criado_em timestamptz not null default now()
);

create index if not exists pa_despejo_esvaziamentos_revenda_idx
  on public.pa_despejo_esvaziamentos (revenda_id, esvaziada_em desc);

alter table public.pa_despejo_esvaziamentos enable row level security;

-- Leitura por revenda: o nivel da bombona e informacao de todo mundo
-- que despeja, nao so da lideranca.
drop policy if exists "le esvaziamentos da revenda" on public.pa_despejo_esvaziamentos;
create policy "le esvaziamentos da revenda" on public.pa_despejo_esvaziamentos
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Escrita: so a propria sessao, so na revenda ativa. Quem esvaziou
-- assina o esvaziamento -- e um evento fisico, tem responsavel.
drop policy if exists "registra esvaziamento proprio" on public.pa_despejo_esvaziamentos;
create policy "registra esvaziamento proprio" on public.pa_despejo_esvaziamentos
  for insert to authenticated
  with check (
    colaborador_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );

-- Apagar existe para o engano do mesmo dia (clicou sem ter esvaziado):
-- sem isso a bombona ficaria zerada para sempre e a conta so voltaria
-- ao normal na proxima troca de verdade.
drop policy if exists "apaga esvaziamento proprio" on public.pa_despejo_esvaziamentos;
create policy "apaga esvaziamento proprio" on public.pa_despejo_esvaziamentos
  for delete to authenticated
  using (
    colaborador_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );
