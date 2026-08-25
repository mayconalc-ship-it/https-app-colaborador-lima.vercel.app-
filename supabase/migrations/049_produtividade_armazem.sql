-- ==================================================================
-- 049 - PRODUTIVIDADE DO ARMAZEM
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Modulo novo, prefixo pa_ (produtividade armazem) para nao colidir com o
-- Programa 5S que ja existe (cinco_s_*): aqui o "5S" e um checklist rapido
-- de execucao (inicio/fim + itens marcados), nao a auditoria formal mensal
-- por area. Sao coisas diferentes de proposito -- ver pa_execucoes_5s.
--
-- Seis funcionalidades, catorze tabelas:
--   1) Reepack por embalagem      -> pa_embalagens, pa_reepack_lancamentos
--   2) Despejo                    -> pa_despejo_lancamentos (mesmo catalogo)
--   3) Empilhadeira                -> pa_empilhadeiras, pa_empilhadeira_operacoes,
--                                     pa_empilhadeira_lembretes
--   4) Recebimento de paletes     -> pa_fabricas, pa_transportadoras, pa_produtos,
--                                     pa_recebimentos, pa_recebimento_itens
--   5) 5S do armazem              -> pa_checklist_5s_itens, pa_execucoes_5s,
--                                     pa_execucao_5s_itens
--   6) Reabastecimento de picking -> pa_reabastecimentos_picking
--
-- Seguranca: mesmo desenho do resto do projeto (014, 019, 021, 035). RLS
-- ligada em tudo. Catalogos: leitura por revenda para quem esta logado,
-- escrita so pelo servidor (service role), depois de conferir a permissao.
-- Lancamentos: leitura por revenda (o time inteiro ve o proprio trabalho),
-- insercao restrita a colaborador_id = auth.uid(), edicao/exclusao pela
-- mesma regra do Ativo de Giro -- self-service, com o gestor alcancando
-- qualquer linha pelo service role depois de conferir "editar"/"excluir".
--
-- Sem tabela de dashboard: os indicadores (reepack/h, litros/h, % avaria,
-- tempo de empilhadeira, ranking) sao calculados na leitura, em cima de
-- um recorte de periodo -- o mesmo desenho do Painel do Ativo de Giro
-- (lib/ativo-giro.ts), e nao o de consolidacao do 5S. A diferenca e a
-- escala: uma auditoria tem 25 respostas para somar a cada abertura de
-- tela; um lancamento de reepack e UMA linha. Nao ha o que consolidar.

-- ------------------------------------------------------------------
-- 1) EMBALAGENS (catalogo compartilhado por Reepack e Despejo)
-- ------------------------------------------------------------------
-- tempo_padrao_segundos alimenta o calculo de eficiencia do reepack.
-- meta_reepacks_hora / meta_litros_hora sao os alvos que a tela mostra
-- como "acima/abaixo da meta" -- ficam nulos ate alguem cadastrar.
create table if not exists public.pa_embalagens (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null,
  tempo_padrao_segundos numeric(10,2),
  meta_reepacks_hora numeric(10,2),
  meta_litros_hora numeric(10,2),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

drop index if exists pa_embalagens_nome_unico;
create unique index pa_embalagens_nome_unico
  on public.pa_embalagens (revenda_id, lower(nome));
create index if not exists pa_embalagens_revenda_idx
  on public.pa_embalagens (revenda_id) where ativo;

-- ------------------------------------------------------------------
-- 2) REEPACK
-- ------------------------------------------------------------------
create table if not exists public.pa_reepack_lancamentos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  embalagem_id uuid not null references public.pa_embalagens(id) on delete restrict,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,
  turno text not null check (turno in ('manha', 'tarde', 'noite')),
  quantidade integer not null check (quantidade > 0),
  inicio timestamptz not null,
  fim timestamptz not null,
  observacao text,
  criado_em timestamptz not null default now(),
  constraint pa_reepack_periodo_valido check (fim > inicio)
);

create index if not exists pa_reepack_revenda_idx
  on public.pa_reepack_lancamentos (revenda_id, inicio desc);
create index if not exists pa_reepack_colaborador_idx
  on public.pa_reepack_lancamentos (colaborador_id, inicio desc);
create index if not exists pa_reepack_embalagem_idx
  on public.pa_reepack_lancamentos (embalagem_id, inicio desc);

-- ------------------------------------------------------------------
-- 3) DESPEJO (mesmo racional, litros em vez de quantidade)
-- ------------------------------------------------------------------
create table if not exists public.pa_despejo_lancamentos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  embalagem_id uuid not null references public.pa_embalagens(id) on delete restrict,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,
  turno text not null check (turno in ('manha', 'tarde', 'noite')),
  litros numeric(10,2) not null check (litros > 0),
  inicio timestamptz not null,
  fim timestamptz not null,
  observacao text,
  criado_em timestamptz not null default now(),
  constraint pa_despejo_periodo_valido check (fim > inicio)
);

create index if not exists pa_despejo_revenda_idx
  on public.pa_despejo_lancamentos (revenda_id, inicio desc);
create index if not exists pa_despejo_colaborador_idx
  on public.pa_despejo_lancamentos (colaborador_id, inicio desc);
create index if not exists pa_despejo_embalagem_idx
  on public.pa_despejo_lancamentos (embalagem_id, inicio desc);

-- ------------------------------------------------------------------
-- 4) EMPILHADEIRAS -- cadastro das maquinas
-- ------------------------------------------------------------------
create table if not exists public.pa_empilhadeiras (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  numero text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

drop index if exists pa_empilhadeiras_numero_unico;
create unique index pa_empilhadeiras_numero_unico
  on public.pa_empilhadeiras (revenda_id, lower(numero));
create index if not exists pa_empilhadeiras_revenda_idx
  on public.pa_empilhadeiras (revenda_id) where ativo;

-- ------------------------------------------------------------------
-- 5) OPERACOES DE EMPILHADEIRA -- o coracao da regra critica
-- ------------------------------------------------------------------
-- Uma linha por jornada: abre com horimetro inicial + foto, fica "aberta"
-- o turno inteiro, fecha no fim do expediente com horimetro final + foto.
--
-- A TRAVA DE VERDADE esta no indice unico parcial logo abaixo, nao na UI:
-- "where status = 'aberta'" nao deixa existir uma segunda linha aberta
-- para a MESMA empilhadeira, mesmo que duas pessoas tentem abrir no
-- mesmo segundo -- o Postgres serializa e uma das duas leva erro de
-- violacao de unicidade, que a acao de servidor traduz na mensagem "ja
-- existe operacao aberta por Fulano desde HH:MM".
--
-- encerrado_por_id/nome ficam nulos quando quem fechou foi quem abriu --
-- so preenchem quando OUTRA pessoa fechou a operacao de alguem (o caso
-- do Jose fechando a maquina que o Joao deixou aberta).
create table if not exists public.pa_empilhadeira_operacoes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  empilhadeira_id uuid not null references public.pa_empilhadeiras(id) on delete restrict,
  operador_id uuid not null references auth.users(id) on delete cascade,
  operador_nome text not null,
  horimetro_inicial numeric(10,1) not null check (horimetro_inicial >= 0),
  foto_inicial_url text not null,
  inicio timestamptz not null default now(),
  horimetro_final numeric(10,1) check (horimetro_final is null or horimetro_final >= horimetro_inicial),
  foto_final_url text,
  fim timestamptz,
  encerrado_por_id uuid references auth.users(id) on delete set null,
  encerrado_por_nome text,
  status text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  criado_em timestamptz not null default now()
);

create index if not exists pa_empilhadeira_op_revenda_idx
  on public.pa_empilhadeira_operacoes (revenda_id, inicio desc);
create index if not exists pa_empilhadeira_op_operador_idx
  on public.pa_empilhadeira_operacoes (operador_id, inicio desc);

-- A regra critica: impossivel existir duas operacoes abertas na mesma
-- empilhadeira ao mesmo tempo.
drop index if exists pa_empilhadeira_op_aberta_unica;
create unique index pa_empilhadeira_op_aberta_unica
  on public.pa_empilhadeira_operacoes (empilhadeira_id) where status = 'aberta';

-- ------------------------------------------------------------------
-- 6) LEMBRETES DE EMPILHADEIRA
-- ------------------------------------------------------------------
-- Um horario por empilhadeira (ex.: fim do turno) para cutucar quem
-- esta com ela aberta a fechar a operacao antes de ir embora. Disparado
-- pela mesma varredura de 15 em 15 min que ja cuida do 5S e do Jornal
-- (ver lib/lembretes-server.ts).
create table if not exists public.pa_empilhadeira_lembretes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  empilhadeira_id uuid not null references public.pa_empilhadeiras(id) on delete cascade,
  horario time not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists pa_empilhadeira_lembretes_revenda_idx
  on public.pa_empilhadeira_lembretes (revenda_id) where ativo;
create index if not exists pa_empilhadeira_lembretes_empilhadeira_idx
  on public.pa_empilhadeira_lembretes (empilhadeira_id) where ativo;

-- ------------------------------------------------------------------
-- 7) RECEBIMENTO DE PALETES -- catalogos
-- ------------------------------------------------------------------
create table if not exists public.pa_fabricas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
drop index if exists pa_fabricas_nome_unico;
create unique index pa_fabricas_nome_unico on public.pa_fabricas (revenda_id, lower(nome));

create table if not exists public.pa_transportadoras (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
drop index if exists pa_transportadoras_nome_unico;
create unique index pa_transportadoras_nome_unico on public.pa_transportadoras (revenda_id, lower(nome));

-- Codigo e descricao chegam da operacao (lista enviada a parte). A tela de
-- cadastro do Admin aceita colar/editar em lote.
create table if not exists public.pa_produtos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  codigo text not null,
  descricao text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
drop index if exists pa_produtos_codigo_unico;
create unique index pa_produtos_codigo_unico on public.pa_produtos (revenda_id, codigo);
create index if not exists pa_produtos_revenda_idx on public.pa_produtos (revenda_id) where ativo;

-- ------------------------------------------------------------------
-- 8) RECEBIMENTO -- cabecalho + itens
-- ------------------------------------------------------------------
create table if not exists public.pa_recebimentos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  fabrica_id uuid not null references public.pa_fabricas(id) on delete restrict,
  transportadora_id uuid not null references public.pa_transportadoras(id) on delete restrict,
  placa_cavalo text,
  placa_carreta text not null,
  motoristas text not null,
  conferente_id uuid not null references auth.users(id) on delete cascade,
  conferente_nome text not null,
  ajudante_id uuid references auth.users(id) on delete set null,
  ajudante_nome text,
  operador_id uuid references auth.users(id) on delete set null,
  operador_nome text,
  data_recebimento date not null default current_date,
  criado_em timestamptz not null default now()
);

create index if not exists pa_recebimentos_revenda_idx
  on public.pa_recebimentos (revenda_id, data_recebimento desc);
create index if not exists pa_recebimentos_transportadora_idx
  on public.pa_recebimentos (transportadora_id, data_recebimento desc);

-- pct_avaria por item: coluna gerada, para o front nunca ter que refazer a
-- conta (nem correr o risco de refazer errado). Consolidado do recebimento
-- inteiro sai de uma soma dos itens, na consulta (ver lib/produtividade-armazem.ts).
create table if not exists public.pa_recebimento_itens (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  recebimento_id uuid not null references public.pa_recebimentos(id) on delete cascade,
  produto_id uuid not null references public.pa_produtos(id) on delete restrict,
  quantidade_recebida integer not null check (quantidade_recebida >= 0),
  quantidade_avariada integer not null check (quantidade_avariada >= 0),
  pct_avaria numeric(5,2) generated always as (
    case when quantidade_recebida = 0 then 0
      else round((quantidade_avariada::numeric * 100) / quantidade_recebida, 2)
    end
  ) stored,
  criado_em timestamptz not null default now(),
  constraint pa_recebimento_item_avaria_valida check (quantidade_avariada <= quantidade_recebida)
);

create index if not exists pa_recebimento_itens_recebimento_idx
  on public.pa_recebimento_itens (recebimento_id);
create index if not exists pa_recebimento_itens_produto_idx
  on public.pa_recebimento_itens (produto_id);

-- ------------------------------------------------------------------
-- 9) 5S DO ARMAZEM -- checklist rapido de execucao
-- ------------------------------------------------------------------
-- Diferente do Programa 5S (cinco_s_*): ali e auditoria mensal formal por
-- area, com auditor, plano de nao-conformidade e consolidado. Aqui e um
-- registro rapido "comecei, fiz isto e aquilo, terminei" -- mais parecido
-- com uma lista de tarefas do turno do que uma auditoria.
create table if not exists public.pa_checklist_5s_itens (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  senso text not null check (senso in (
    'utilizacao', 'organizacao', 'limpeza', 'conservacao', 'disciplina'
  )),
  descricao text not null,
  ordem integer not null default 100,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists pa_checklist_5s_itens_revenda_idx
  on public.pa_checklist_5s_itens (revenda_id, ordem) where ativo;

create table if not exists public.pa_execucoes_5s (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  responsavel_id uuid not null references auth.users(id) on delete cascade,
  responsavel_nome text not null,
  inicio timestamptz not null default now(),
  fim timestamptz,
  observacoes text,
  criado_em timestamptz not null default now()
);

create index if not exists pa_execucoes_5s_revenda_idx
  on public.pa_execucoes_5s (revenda_id, inicio desc);
create index if not exists pa_execucoes_5s_responsavel_idx
  on public.pa_execucoes_5s (responsavel_id, inicio desc);

-- Uma linha por item marcado como executado. Nao guarda os NAO marcados:
-- e uma lista de multipla escolha, nao um formulario sim/nao por item.
create table if not exists public.pa_execucao_5s_itens (
  id bigint generated always as identity primary key,
  execucao_id uuid not null references public.pa_execucoes_5s(id) on delete cascade,
  item_id uuid not null references public.pa_checklist_5s_itens(id) on delete restrict
);

drop index if exists pa_execucao_5s_itens_unica;
create unique index pa_execucao_5s_itens_unica
  on public.pa_execucao_5s_itens (execucao_id, item_id);

-- ------------------------------------------------------------------
-- 10) REABASTECIMENTO DE PICKING
-- ------------------------------------------------------------------
create table if not exists public.pa_reabastecimentos_picking (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,
  turno text not null check (turno in ('manha', 'tarde', 'noite')),
  inicio timestamptz not null default now(),
  fim timestamptz,
  area text,
  posicoes_reabastecidas integer check (posicoes_reabastecidas is null or posicoes_reabastecidas >= 0),
  observacao text,
  criado_em timestamptz not null default now()
);

create index if not exists pa_picking_revenda_idx
  on public.pa_reabastecimentos_picking (revenda_id, inicio desc);
create index if not exists pa_picking_colaborador_idx
  on public.pa_reabastecimentos_picking (colaborador_id, inicio desc);

-- ------------------------------------------------------------------
-- 11) PERMISSOES DE TABELA (Data API)
-- ------------------------------------------------------------------
grant select on public.pa_embalagens, public.pa_empilhadeiras,
  public.pa_fabricas, public.pa_transportadoras, public.pa_produtos,
  public.pa_checklist_5s_itens
  to authenticated;

grant select, insert, update, delete on public.pa_reepack_lancamentos,
  public.pa_despejo_lancamentos, public.pa_empilhadeira_operacoes,
  public.pa_recebimentos, public.pa_recebimento_itens,
  public.pa_execucoes_5s, public.pa_execucao_5s_itens,
  public.pa_reabastecimentos_picking
  to authenticated;

grant all on
  public.pa_embalagens, public.pa_reepack_lancamentos, public.pa_despejo_lancamentos,
  public.pa_empilhadeiras, public.pa_empilhadeira_operacoes, public.pa_empilhadeira_lembretes,
  public.pa_fabricas, public.pa_transportadoras, public.pa_produtos,
  public.pa_recebimentos, public.pa_recebimento_itens,
  public.pa_checklist_5s_itens, public.pa_execucoes_5s, public.pa_execucao_5s_itens,
  public.pa_reabastecimentos_picking
  to service_role;

-- ------------------------------------------------------------------
-- 12) RLS
-- ------------------------------------------------------------------
alter table public.pa_embalagens enable row level security;
alter table public.pa_reepack_lancamentos enable row level security;
alter table public.pa_despejo_lancamentos enable row level security;
alter table public.pa_empilhadeiras enable row level security;
alter table public.pa_empilhadeira_operacoes enable row level security;
alter table public.pa_empilhadeira_lembretes enable row level security;
alter table public.pa_fabricas enable row level security;
alter table public.pa_transportadoras enable row level security;
alter table public.pa_produtos enable row level security;
alter table public.pa_recebimentos enable row level security;
alter table public.pa_recebimento_itens enable row level security;
alter table public.pa_checklist_5s_itens enable row level security;
alter table public.pa_execucoes_5s enable row level security;
alter table public.pa_execucao_5s_itens enable row level security;
alter table public.pa_reabastecimentos_picking enable row level security;

-- Limpa politicas de execucoes anteriores desta migracao.
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename like 'pa\_%'
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- Catalogos: leitura por revenda, escrita so pelo servidor.
do $$
declare t text;
begin
  foreach t in array array[
    'pa_embalagens', 'pa_empilhadeiras', 'pa_fabricas',
    'pa_transportadoras', 'pa_produtos', 'pa_checklist_5s_itens'
  ]
  loop
    execute format(
      'create policy "le %I da propria revenda" on public.%I for select to authenticated
         using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))',
      t, t
    );
  end loop;
end $$;

-- Lembretes de empilhadeira: SEM politica de proposito -- so o servidor
-- (que ja confere requireModulo) e o cron leem/escrevem. Ninguem com a
-- chave publica precisa saber o horario de fechamento de outra pessoa.

-- Lancamentos simples (reepack, despejo, picking): leitura por revenda
-- (o time inteiro ve o proprio trabalho, para o dashboard fechar as
-- contas), insercao/edicao/exclusao restrita a quem lancou -- mesmo
-- desenho do Ativo de Giro (019/021). O gestor com "editar"/"excluir"
-- alcanca qualquer linha pelo service role, ja conferido na acao.
do $$
declare t text;
begin
  foreach t in array array[
    'pa_reepack_lancamentos', 'pa_despejo_lancamentos', 'pa_reabastecimentos_picking'
  ]
  loop
    execute format(
      'create policy "le %I da propria revenda" on public.%I for select to authenticated
         using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))',
      t, t
    );
    execute format(
      'create policy "insere %I proprio" on public.%I for insert to authenticated
         with check (colaborador_id = auth.uid() and revenda_id in (select public.revendas_do_usuario()))',
      t, t
    );
    execute format(
      'create policy "edita %I proprio" on public.%I for update to authenticated
         using (colaborador_id = auth.uid() and revenda_id in (select public.revendas_do_usuario()))
         with check (colaborador_id = auth.uid() and revenda_id in (select public.revendas_do_usuario()))',
      t, t
    );
    execute format(
      'create policy "exclui %I proprio" on public.%I for delete to authenticated
         using (colaborador_id = auth.uid() and revenda_id in (select public.revendas_do_usuario()))',
      t, t
    );
  end loop;
end $$;

-- Empilhadeira: insercao so em nome de quem esta logado. A ATUALIZACAO
-- (fechar) e liberada para qualquer colaborador da revenda -- e o que
-- permite ao Jose fechar a maquina que o Joao deixou aberta. A acao de
-- servidor decide quem vira "encerrado_por".
create policy "le operacoes de empilhadeira da propria revenda"
  on public.pa_empilhadeira_operacoes for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

create policy "abre operacao de empilhadeira em nome proprio"
  on public.pa_empilhadeira_operacoes for insert to authenticated
  with check (operador_id = auth.uid() and revenda_id in (select public.revendas_do_usuario()));

create policy "fecha operacao de empilhadeira da propria revenda"
  on public.pa_empilhadeira_operacoes for update to authenticated
  using (revenda_id in (select public.revendas_do_usuario()))
  with check (revenda_id in (select public.revendas_do_usuario()));

-- Recebimento: cabecalho e itens seguem a mesma regra -- le a revenda
-- inteira (e trabalho de conferencia, publico para o time), insere/edita
-- quem esta logado na revenda. Sem exclusao pela UI: recebimento errado
-- se corrige lancando um ajuste, nao apagando o registro fiscal.
create policy "le recebimentos da propria revenda"
  on public.pa_recebimentos for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));
create policy "insere recebimento na propria revenda"
  on public.pa_recebimentos for insert to authenticated
  with check (conferente_id = auth.uid() and revenda_id in (select public.revendas_do_usuario()));

create policy "le itens de recebimento da propria revenda"
  on public.pa_recebimento_itens for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));
create policy "insere itens de recebimento na propria revenda"
  on public.pa_recebimento_itens for insert to authenticated
  with check (revenda_id in (select public.revendas_do_usuario()));

-- 5S do armazem: leitura por revenda, quem abre a execucao so pode ser
-- o proprio responsavel, fechar (gravar fim + itens) e liberado para
-- quem abriu.
create policy "le execucoes 5s da propria revenda"
  on public.pa_execucoes_5s for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));
create policy "abre execucao 5s em nome proprio"
  on public.pa_execucoes_5s for insert to authenticated
  with check (responsavel_id = auth.uid() and revenda_id in (select public.revendas_do_usuario()));
create policy "fecha execucao 5s propria"
  on public.pa_execucoes_5s for update to authenticated
  using (responsavel_id = auth.uid() and revenda_id in (select public.revendas_do_usuario()))
  with check (responsavel_id = auth.uid() and revenda_id in (select public.revendas_do_usuario()));

create policy "le itens de execucao 5s"
  on public.pa_execucao_5s_itens for select to authenticated
  using (exists (
    select 1 from public.pa_execucoes_5s e
     where e.id = execucao_id
       and (public.ehowner_atual() or e.revenda_id in (select public.revendas_do_usuario()))
  ));
create policy "grava itens de execucao 5s propria"
  on public.pa_execucao_5s_itens for insert to authenticated
  with check (exists (
    select 1 from public.pa_execucoes_5s e
     where e.id = execucao_id and e.responsavel_id = auth.uid()
  ));

-- ------------------------------------------------------------------
-- 13) O MODULO NA REVENDA -- so Barreiras, por enquanto
-- ------------------------------------------------------------------
insert into public.revenda_modulos (revenda_id, modulo)
select id, 'produtividade-armazem' from public.revendas where slug = 'barreiras'
on conflict (revenda_id, modulo) do nothing;

insert into public.notificacao_config (revenda_id, modulo, ativa)
select id, 'produtividade-armazem', true from public.revendas where slug = 'barreiras'
on conflict (revenda_id, modulo) do nothing;

insert into public.menu_itens (revenda_id, chave, titulo, emoji, href, ordem, visivel)
select id, 'produtividade-armazem', 'Produtividade do Armazém', '🏭', '/produtividade-armazem', 13, true
from public.revendas where slug = 'barreiras'
on conflict (revenda_id, chave) do nothing;

-- ------------------------------------------------------------------
-- 14) O CHECKLIST 5S PADRAO (5 sensos, 2 itens cada -- ajustavel depois
--     pela tela de configuracao)
-- ------------------------------------------------------------------
insert into public.pa_checklist_5s_itens (revenda_id, senso, descricao, ordem)
select r.id, c.senso, c.descricao, c.ordem
from public.revendas r
cross join (values
  ('utilizacao', 'Área livre de materiais e equipamentos sem uso', 1),
  ('utilizacao', 'Itens pessoais fora dos postos de trabalho', 2),
  ('organizacao', 'Materiais e paletes nos endereços corretos', 3),
  ('organizacao', 'Corredores e faixas de circulação desobstruídos', 4),
  ('limpeza', 'Piso varrido e livre de resíduos', 5),
  ('limpeza', 'Lixo recolhido e descartado corretamente', 6),
  ('conservacao', 'Equipamentos e prateleiras em bom estado', 7),
  ('conservacao', 'Sinalização e identificações visíveis e íntegras', 8),
  ('disciplina', 'Checklist do turno anterior conferido', 9),
  ('disciplina', 'EPIs sendo usados corretamente pela equipe', 10)
) as c(senso, descricao, ordem)
where r.slug = 'barreiras'
on conflict do nothing;

notify pgrst, 'reload schema';
