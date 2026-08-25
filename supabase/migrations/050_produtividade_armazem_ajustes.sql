-- ==================================================================
-- 050 - PRODUTIVIDADE DO ARMAZEM: ajustes pos-revisao
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Tres mudancas, pedidas depois de ver o modulo rodando:
--
--   1) Reepack e despejo tem "tempo padrao" proprio -- eram um campo so,
--      compartilhado, e faziam sentidos diferentes em cada tela.
--   2) Lembrete de empilhadeira muda de "por maquina, num horario fixo"
--      para "por empilhadeirista, no fim do turno dele" -- o aviso
--      precisa achar a PESSOA parada com a maquina aberta, nao cutucar
--      um numero de patrimonio.
--   3) Troca de gas: uma funcionalidade nova, mesmo espirito do horimetro
--      da operacao (foto obrigatoria), mas um EVENTO SO -- sem abrir e
--      fechar. A media de litros/hora sai da diferenca de horimetro
--      entre uma troca e a troca anterior da MESMA maquina, calculada na
--      leitura (ver lib/produtividade-armazem.ts), sem tabela de mais.
--      Pedido explicito: nao bloquear troca nova por causa da anterior --
--      so o horimetro decrescente e recusado, o resto e so registro.

-- ------------------------------------------------------------------
-- 1) TEMPO PADRAO -- reepack e despejo, cada um com o seu
-- ------------------------------------------------------------------
alter table public.pa_embalagens
  rename column tempo_padrao_segundos to tempo_padrao_reepack_segundos;

alter table public.pa_embalagens
  add column if not exists tempo_padrao_despejo_segundos numeric(10,2);

-- ------------------------------------------------------------------
-- 2) LEMBRETE POR EMPILHADEIRISTA, NAO POR MAQUINA
-- ------------------------------------------------------------------
-- A tabela nasceu vazia (ninguem tinha cadastrado lembrete nenhum ate
-- agora), entao a troca de coluna e livre -- nao ha linha para migrar.
alter table public.pa_empilhadeira_lembretes
  drop constraint if exists pa_empilhadeira_lembretes_empilhadeira_id_fkey;

drop index if exists pa_empilhadeira_lembretes_empilhadeira_idx;

alter table public.pa_empilhadeira_lembretes
  drop column if exists empilhadeira_id,
  drop column if exists horario,
  add column if not exists operador_id uuid references auth.users(id) on delete cascade,
  add column if not exists operador_nome text,
  add column if not exists turno text check (turno in ('manha', 'tarde', 'noite'));

update public.pa_empilhadeira_lembretes set operador_nome = '' where operador_nome is null;
alter table public.pa_empilhadeira_lembretes
  alter column operador_id set not null,
  alter column operador_nome set not null,
  alter column turno set not null;

-- Um lembrete por pessoa por turno -- cadastrar duas vezes o mesmo par
-- so duplicaria o aviso na mesma janela de 15 minutos.
drop index if exists pa_empilhadeira_lembretes_pessoa_turno_unico;
create unique index pa_empilhadeira_lembretes_pessoa_turno_unico
  on public.pa_empilhadeira_lembretes (operador_id, turno);

create index if not exists pa_empilhadeira_lembretes_operador_idx
  on public.pa_empilhadeira_lembretes (operador_id) where ativo;

-- ------------------------------------------------------------------
-- 3) TROCA DE GAS
-- ------------------------------------------------------------------
-- Um evento por troca: horimetro + foto no momento em que a garrafa foi
-- trocada. NAO ha status aberta/encerrada de proposito (decisao
-- explicita: nao bloquear) -- a troca seguinte da mesma maquina JA e,
-- na pratica, o fechamento da anterior, porque a diferenca de horimetro
-- entre as duas e o que vira "horas rodadas com aquela garrafa".
create table if not exists public.pa_empilhadeira_trocas_gas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  empilhadeira_id uuid not null references public.pa_empilhadeiras(id) on delete restrict,
  operador_id uuid not null references auth.users(id) on delete cascade,
  operador_nome text not null,
  horimetro numeric(10,1) not null check (horimetro >= 0),
  foto_url text not null,
  realizada_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create index if not exists pa_trocas_gas_empilhadeira_idx
  on public.pa_empilhadeira_trocas_gas (empilhadeira_id, realizada_em desc);
create index if not exists pa_trocas_gas_revenda_idx
  on public.pa_empilhadeira_trocas_gas (revenda_id, realizada_em desc);

grant select, insert on public.pa_empilhadeira_trocas_gas to authenticated;
grant all on public.pa_empilhadeira_trocas_gas to service_role;

alter table public.pa_empilhadeira_trocas_gas enable row level security;

drop policy if exists "le trocas de gas da propria revenda" on public.pa_empilhadeira_trocas_gas;
create policy "le trocas de gas da propria revenda"
  on public.pa_empilhadeira_trocas_gas for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

drop policy if exists "registra troca de gas em nome proprio" on public.pa_empilhadeira_trocas_gas;
create policy "registra troca de gas em nome proprio"
  on public.pa_empilhadeira_trocas_gas for insert to authenticated
  with check (operador_id = auth.uid() and revenda_id in (select public.revendas_do_usuario()));

notify pgrst, 'reload schema';
