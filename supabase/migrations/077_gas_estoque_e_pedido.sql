-- ==================================================================
-- 077 - GAS P20: contagem de botijoes e pedido de reposicao
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono, 30/08/2026: na troca de gas o empilhador passa a contar
-- os botijoes P20 em estoque (cheios e vazios). Caindo ao minimo, o app
-- acende um alerta com o nome e o telefone do fornecedor para ELE mesmo
-- ligar, e avisa a lideranca escolhida. O alerta so sai da tela quando
-- alguem confirmar que o pedido foi feito.

-- -------------------- CONTAGEM NA TROCA --------------------
-- Nulo nas 7 trocas que ja existem: elas foram lancadas antes de o campo
-- existir, e inventar zero ali dispararia um alerta retroativo.
alter table public.pa_empilhadeira_trocas_gas
  add column if not exists botijoes_cheios integer check (botijoes_cheios is null or botijoes_cheios >= 0),
  add column if not exists botijoes_vazios integer check (botijoes_vazios is null or botijoes_vazios >= 0);

comment on column public.pa_empilhadeira_trocas_gas.botijoes_cheios is
  'Botijoes P20 CHEIOS no estoque do armazem no momento da troca. E a contagem do deposito, nao da maquina.';

-- -------------------- FORNECEDOR E LIMITE --------------------
alter table public.pa_empilhadeira_config
  add column if not exists estoque_minimo_p20 integer not null default 2
    check (estoque_minimo_p20 >= 0),
  add column if not exists fornecedor_nome text,
  add column if not exists fornecedor_telefone text;

comment on column public.pa_empilhadeira_config.estoque_minimo_p20 is
  'Cheios menor ou igual a isto acende o alerta. Padrao 2, pedido do dono.';

-- -------------------- QUEM E AVISADO --------------------
-- A lideranca que recebe o alerta e escolhida no Admin. Sem tabela, seria
-- avisar a revenda inteira -- e aviso que toca no bolso de quem nao pode
-- resolver vira aviso ignorado.
create table if not exists public.pa_gas_notificados (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (revenda_id, colaborador_id)
);

-- -------------------- O PEDIDO EM ABERTO --------------------
-- Um pedido por vez: enquanto ninguem confirmar, o alerta continua na
-- tela e uma nova troca com estoque baixo NAO abre outro pedido -- ela so
-- atualiza a contagem do que ja esta aberto.
create table if not exists public.pa_gas_pedidos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  troca_id uuid references public.pa_empilhadeira_trocas_gas(id) on delete set null,

  -- A contagem que acendeu o alerta, e a mais recente enquanto ele esta
  -- aberto: se o estoque cair de 2 para 1 antes de alguem pedir, o alerta
  -- mostra 1.
  botijoes_cheios integer not null,
  botijoes_vazios integer,
  aberto_em timestamptz not null default now(),
  aberto_por uuid references auth.users(id) on delete set null,
  aberto_por_nome text,

  confirmado_em timestamptz,
  confirmado_por uuid references auth.users(id) on delete set null,
  confirmado_por_nome text,
  observacao text
);

-- Um pedido ABERTO por revenda. A trava e o indice, nao a tela: duas
-- trocas quase simultaneas passariam por qualquer checagem em codigo.
drop index if exists pa_gas_pedido_aberto_unico;
create unique index pa_gas_pedido_aberto_unico
  on public.pa_gas_pedidos (revenda_id) where confirmado_em is null;

create index if not exists pa_gas_pedidos_revenda_idx
  on public.pa_gas_pedidos (revenda_id, aberto_em desc);

-- -------------------- RLS --------------------
alter table public.pa_gas_pedidos enable row level security;
alter table public.pa_gas_notificados enable row level security;

-- O alerta e da operacao inteira: quem enxerga o modulo precisa ver o
-- pedido em aberto, senao o aviso nao chega a quem esta no deposito.
drop policy if exists "le pedido de gas da revenda" on public.pa_gas_pedidos;
create policy "le pedido de gas da revenda" on public.pa_gas_pedidos
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Confirmar o pedido e ato de quem esta no chao -- qualquer pessoa da
-- revenda pode, e fica gravado quem foi. Reabrir, nao: por isso o update
-- so aceita fechar (confirmado_em passa a existir), nunca o contrario.
drop policy if exists "confirma pedido de gas" on public.pa_gas_pedidos;
create policy "confirma pedido de gas" on public.pa_gas_pedidos
  for update to authenticated
  using (
    confirmado_em is null
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  )
  with check (
    confirmado_em is not null
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );

-- O fornecedor precisa ser lido por quem ve o alerta: sem isso o aviso
-- diria "peca gas" sem dizer para quem.
drop policy if exists "le config da empilhadeira" on public.pa_empilhadeira_config;
create policy "le config da empilhadeira" on public.pa_empilhadeira_config
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

alter table public.pa_empilhadeira_config enable row level security;

notify pgrst, 'reload schema';
