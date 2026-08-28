-- ==================================================================
-- 070 - EMPILHADEIRA: custo do P20 para o dashboard de consumo
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O dashboard de consumo de gas (pedido do dono, 28/08/2026) calcula
-- ciclos entre trocas de P20 e rateia o consumo entre os operadores pelo
-- tempo de uso. Tudo isso sai dos dados que JA existem:
--
--   pa_empilhadeira_operacoes  -> a "sessao de utilizacao" da spec
--   pa_empilhadeira_trocas_gas -> o marco de fim de ciclo
--
-- A unica coisa que falta no banco e o valor do botijao, para virar
-- custo por hora. Um valor por revenda: a decisao foi valor unico
-- cadastrado no Admin, nao historico por troca.
--
-- Tipo de gas e numeracao do bujao NAO entram de proposito: a operacao
-- so usa P20 e nao numera os botijoes, entao os campos seriam mais um
-- item para o operador preencher na bancada sem nada consumindo o dado.
-- Se um dia numerarem, entra em migration propria.

create table if not exists public.pa_empilhadeira_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  -- Nulo = sem custo cadastrado. O dashboard mostra as horas e o
  -- consumo mesmo assim; so os cartoes de dinheiro ficam de fora.
  custo_p20 numeric(10,2) check (custo_p20 is null or custo_p20 >= 0),
  atualizado_em timestamptz not null default now()
);

comment on column public.pa_empilhadeira_config.custo_p20 is
  'Valor unitario do botijao P20, em reais. Nulo = nao cadastrado.';

alter table public.pa_empilhadeira_config enable row level security;

-- Leitura por revenda (o dashboard le com o token do usuario); escrita
-- so pelo servidor, como os demais catalogos do armazem.
drop policy if exists "le config empilhadeira da revenda" on public.pa_empilhadeira_config;
create policy "le config empilhadeira da revenda" on public.pa_empilhadeira_config
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- O dashboard varre trocas e operacoes por empilhadeira e faixa de
-- horimetro. Sem estes indices, cada abertura le as tabelas inteiras.
create index if not exists pa_trocas_gas_empilhadeira_horimetro_idx
  on public.pa_empilhadeira_trocas_gas (revenda_id, empilhadeira_id, horimetro);
create index if not exists pa_operacoes_empilhadeira_horimetro_idx
  on public.pa_empilhadeira_operacoes (revenda_id, empilhadeira_id, horimetro_inicial);

notify pgrst, 'reload schema';
