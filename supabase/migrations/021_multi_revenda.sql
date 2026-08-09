-- ==================================================================
-- 021 - MULTI REVENDA (etapa 1: banco, vinculos e isolamento)
-- Execute no Supabase: SQL Editor > New query > colar > Run
-- ==================================================================
-- Ate aqui o app inteiro assumia uma revenda so. Nenhuma tabela sabia
-- responder "de quem e este dado?" -- e com duas revendas isso deixa de
-- ser detalhe e vira vazamento: 11 tabelas liberam leitura para
-- QUALQUER pessoa logada.
--
-- Esta migracao resolve as tres coisas de uma vez:
--   1) cria a revenda como entidade e liga TODO dado existente a
--      Sao Felix (que e, hoje, dona de tudo que esta no banco);
--   2) troca vinculo de texto solto por tabela de verdade, aceitando
--      que uma pessoa pertenca a mais de uma revenda (o caso da
--      lideranca que responde por Sao Felix e Barreiras);
--   3) reescreve as politicas permissivas para "so o que e da minha
--      revenda".
--
-- O que ela NAO faz, de proposito: nao cria linha de configuracao
-- nenhuma para Barreiras. Varias telas ainda buscam a linha unica com
-- .eq("id", 1) / .single() -- semear Barreiras agora faria a consulta
-- devolver duas linhas e quebrar a tela de Sao Felix. Essas linhas
-- nascem na etapa 3, junto com o codigo que ja filtra por revenda.
-- Por isso, depois desta migracao, o app continua funcionando
-- exatamente como funcionava.

-- ------------------------------------------------------------------
-- 1) AS REVENDAS
-- ------------------------------------------------------------------
create table if not exists public.revendas (
  id uuid primary key default gen_random_uuid(),
  -- Identificador estavel para usar em codigo e em pasta de arquivo.
  -- O nome pode ser reescrito a qualquer momento; o slug nao.
  slug text not null unique,
  nome text not null,
  ativa boolean not null default true,
  ordem int not null default 100,
  criado_em timestamptz not null default now()
);

insert into public.revendas (slug, nome, ordem) values
  ('sao-felix', 'Revenda Lima São Félix', 1),
  ('barreiras', 'Revenda Lima Barreiras', 2)
on conflict (slug) do nothing;

-- Atalho usado o resto do script inteiro: a revenda que ja existia de
-- fato, e para quem todo o dado atual vai ser atribuido.
create or replace function public.revenda_sao_felix()
returns uuid
language sql
stable
as $$
  select id from public.revendas where slug = 'sao-felix';
$$;

-- ------------------------------------------------------------------
-- 2) VINCULO PESSOA <-> REVENDA
-- ------------------------------------------------------------------
-- N:N de proposito. "profiles.revenda" era texto livre, gravado so no
-- cadastro, nunca editado e nunca lido -- nao dava para confiar nele, e
-- ele nao comportava a pessoa que atende as duas revendas.
--
-- "principal" e a revenda em que a pessoa entra por padrao. Quem tem um
-- vinculo so nunca ve escolha nenhuma: o app deduz.
create table if not exists public.colaborador_revendas (
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  principal boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  primary key (colaborador_id, revenda_id)
);

create index if not exists colaborador_revendas_pessoa_idx
  on public.colaborador_revendas (colaborador_id);
create index if not exists colaborador_revendas_revenda_idx
  on public.colaborador_revendas (revenda_id);

-- Uma principal por pessoa, no maximo. Sem isto, duas principais fariam
-- o login virar sorteio.
drop index if exists colaborador_revendas_principal_unica;
create unique index colaborador_revendas_principal_unica
  on public.colaborador_revendas (colaborador_id) where principal;

-- Todo mundo que ja usa o app e de Sao Felix. Ninguem fica sem vinculo:
-- sem vinculo a pessoa nao teria revenda ativa e nao entraria.
insert into public.colaborador_revendas (colaborador_id, revenda_id, principal)
select p.id, public.revenda_sao_felix(), true
from public.profiles p
on conflict (colaborador_id, revenda_id) do nothing;

-- ------------------------------------------------------------------
-- 3) MODULOS LIBERADOS POR REVENDA
-- ------------------------------------------------------------------
-- Responde "esta revenda usa este modulo?". E a camada mais externa do
-- controle de acesso, e vem ANTES das permissoes de pessoa: se a revenda
-- nao tem Ativo de Giro, nao existe permissao individual que faca a tela
-- aparecer para alguem dela.
create table if not exists public.revenda_modulos (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  modulo text not null,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (revenda_id, modulo)
);

-- Sao Felix ja usa tudo o que existe hoje -- e o retrato do app atual.
insert into public.revenda_modulos (revenda_id, modulo)
select public.revenda_sao_felix(), m
from unnest(array[
  'comunicados','ranking','padroes','sonho','escala','rv',
  'colaboradores','feedbacks','metricas','pesquisa','menu',
  'rotas','ativo-giro'
]) as m
on conflict (revenda_id, modulo) do nothing;

-- Barreiras comeca com o basico. O Admin liga o resto pela tela de
-- Revendas (etapa 2) conforme a operacao la for entrando no ar.
insert into public.revenda_modulos (revenda_id, modulo)
select r.id, m
from public.revendas r,
     unnest(array[
       'comunicados','padroes','escala','colaboradores','metricas','menu'
     ]) as m
where r.slug = 'barreiras'
on conflict (revenda_id, modulo) do nothing;

-- ------------------------------------------------------------------
-- 4) COLUNA revenda_id NAS TABELAS DE CONTEUDO
-- ------------------------------------------------------------------
-- O default garante o backfill sem UPDATE nenhum: as linhas que ja
-- existem recebem Sao Felix na hora em que a coluna nasce, e o codigo
-- atual -- que ainda nao manda revenda_id em insert nenhum -- continua
-- gravando certo ate a etapa 3 chegar.
--
-- O default fica de proposito ate o fim da migracao de codigo. Tira-lo
-- agora quebraria todo insert existente.

do $$
declare t text;
begin
  foreach t in array array[
    'comunicados', 'ranking_matinal', 'padroes', 'padroes_pilares',
    'sonho_revenda', 'escala_trabalho', 'rv_config', 'menu_itens',
    'rotas', 'rotas_config', 'ag_contagens', 'ag_parque', 'ag_fatores',
    'feedback_rota', 'pesquisa_config', 'pesquisa_respostas',
    'notificacoes', 'notificacao_config', 'notificacao_ajustes',
    'lideranca_permissoes', 'colaborador_modulos_extra'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists revenda_id uuid
         not null default public.revenda_sao_felix()
         references public.revendas(id) on delete cascade', t
    );
    execute format(
      'create index if not exists %I on public.%I (revenda_id)',
      t || '_revenda_idx', t
    );
  end loop;
end $$;

-- Uso e auditoria aceitam nulo: sao registros historicos, e linha antiga
-- de antes da separacao nao deve fingir que sabe de qual revenda era.
do $$
declare t text;
begin
  foreach t in array array['uso_sessoes', 'eventos_acesso', 'auditoria']
  loop
    execute format(
      'alter table public.%I add column if not exists revenda_id uuid
         references public.revendas(id) on delete set null', t
    );
    execute format(
      'create index if not exists %I on public.%I (revenda_id)',
      t || '_revenda_idx', t
    );
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 5) AS CHAVES QUE COLIDIRIAM
-- ------------------------------------------------------------------
-- Aqui esta o coracao do problema. Toda chave abaixo foi desenhada
-- quando "uma escala por area" e "um sonho por ano" eram verdades
-- absolutas. Com duas revendas elas passam a significar "uma escala por
-- area NO MUNDO" -- e a segunda revenda nao consegue nem cadastrar a
-- propria.

-- Escala: uma por area, POR REVENDA
alter table public.escala_trabalho drop constraint if exists escala_trabalho_pkey;
alter table public.escala_trabalho
  add constraint escala_trabalho_pkey primary key (revenda_id, area);

-- RV: uma planilha por area, POR REVENDA
alter table public.rv_config drop constraint if exists rv_config_pkey;
alter table public.rv_config
  add constraint rv_config_pkey primary key (revenda_id, area);

-- Menu: cada revenda ordena e esconde o proprio menu
alter table public.menu_itens drop constraint if exists menu_itens_pkey;
alter table public.menu_itens
  add constraint menu_itens_pkey primary key (revenda_id, chave);

-- Pilares dos padroes: cada revenda tem os seus, com os proprios nomes
alter table public.padroes_pilares drop constraint if exists padroes_pilares_nome_key;
alter table public.padroes_pilares
  add constraint padroes_pilares_nome_key unique (revenda_id, nome);

-- Sonho da Revenda: um por ano, POR REVENDA (o nome da tela ja dizia)
alter table public.sonho_revenda drop constraint if exists sonho_revenda_ano_key;
alter table public.sonho_revenda
  add constraint sonho_revenda_ano_key unique (revenda_id, ano);

-- Ranking: uma foto por mes/time/categoria, POR REVENDA
alter table public.ranking_matinal
  drop constraint if exists ranking_matinal_mes_ano_time_categoria_key;
alter table public.ranking_matinal
  add constraint ranking_matinal_mes_ano_time_categoria_key
  unique (revenda_id, mes_ano, time, categoria);

-- Rotas: o mapa 14768 de Barreiras nao e o mapa 14768 de Sao Felix
alter table public.rotas drop constraint if exists rotas_unica;
alter table public.rotas
  add constraint rotas_unica unique (revenda_id, data, mapa);

-- Ativo de Giro: parque e fatores sao da operacao de cada revenda
alter table public.ag_parque drop constraint if exists ag_parque_pkey;
alter table public.ag_parque
  add constraint ag_parque_pkey primary key (revenda_id, tipo, formato);

alter table public.ag_fatores drop constraint if exists ag_fatores_pkey;
alter table public.ag_fatores
  add constraint ag_fatores_pkey primary key (revenda_id, formato);

-- Pesquisa: um ciclo por revenda, e uma resposta por pessoa por ciclo
-- POR REVENDA (a liderança das duas responde pelas duas).
alter table public.pesquisa_respostas
  drop constraint if exists pesquisa_respostas_unica;
alter table public.pesquisa_respostas
  add constraint pesquisa_respostas_unica
  unique (revenda_id, colaborador_id, ciclo);

-- Permissao de lideranca: POR REVENDA. E isto que permite liberar
-- comunicados em Sao Felix e so leitura em Barreiras para a mesma
-- pessoa -- o caso que motivou a expansao.
alter table public.lideranca_permissoes drop constraint if exists lideranca_permissoes_pkey;
alter table public.lideranca_permissoes
  add constraint lideranca_permissoes_pkey
  primary key (colaborador_id, revenda_id, modulo, acao);

-- Modulo opcional liberado para a pessoa: idem, por revenda
alter table public.colaborador_modulos_extra
  drop constraint if exists colaborador_modulos_extra_pkey;
alter table public.colaborador_modulos_extra
  add constraint colaborador_modulos_extra_pkey
  primary key (colaborador_id, revenda_id, modulo);

-- As tres tabelas de "linha unica id = 1" viram "uma linha por revenda".
-- A coluna id continua existindo (e continua valendo 1 em todas as
-- linhas) so para nao quebrar o codigo atual, que ainda filtra por ela.
-- A etapa 3 troca esse filtro por revenda_id e ai a coluna sai.
alter table public.rotas_config drop constraint if exists rotas_config_linha_unica;
alter table public.rotas_config drop constraint if exists rotas_config_pkey;
alter table public.rotas_config
  add constraint rotas_config_pkey primary key (revenda_id);

alter table public.pesquisa_config drop constraint if exists pesquisa_config_linha_unica;
alter table public.pesquisa_config drop constraint if exists pesquisa_config_pkey;
alter table public.pesquisa_config
  add constraint pesquisa_config_pkey primary key (revenda_id);

alter table public.notificacao_ajustes
  drop constraint if exists notificacao_ajustes_linha_unica;
alter table public.notificacao_ajustes drop constraint if exists notificacao_ajustes_pkey;
alter table public.notificacao_ajustes
  add constraint notificacao_ajustes_pkey primary key (revenda_id);

-- Notificacao ligada/desligada por modulo, POR REVENDA
alter table public.notificacao_config drop constraint if exists notificacao_config_pkey;
alter table public.notificacao_config
  add constraint notificacao_config_pkey primary key (revenda_id, modulo);

-- ------------------------------------------------------------------
-- 6) DE QUEM E QUEM PERGUNTA
-- ------------------------------------------------------------------
-- "security definer" porque a funcao precisa ler colaborador_revendas
-- por dentro das politicas -- se ela obedecesse ao RLS, a politica
-- consultaria a si mesma. O search_path fixo impede que alguem crie uma
-- tabela homonima em outro esquema para enganar a funcao.
create or replace function public.revendas_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cr.revenda_id
    from public.colaborador_revendas cr
   where cr.colaborador_id = auth.uid();
$$;

revoke all on function public.revendas_do_usuario() from public;
grant execute on function public.revendas_do_usuario() to authenticated;

-- Correcao de rota: papel_atual() ainda comparava com 'admin', papel que
-- deixou de existir na 014 (virou 'owner'). Na pratica a politica de
-- leitura de eventos_acesso estava negando ate para o dono, e o painel
-- ao vivo -- que le pelo navegador, com a chave publica -- nunca recebia
-- linha nenhuma.
create or replace function public.ehowner_atual()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('owner', 'admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.ehowner_atual() from public;
grant execute on function public.ehowner_atual() to authenticated;

-- ------------------------------------------------------------------
-- 7) O ISOLAMENTO DE VERDADE
-- ------------------------------------------------------------------
-- Ate agora 11 tabelas diziam "qualquer autenticado le". Com uma revenda
-- so isso era inofensivo. Com duas, e um colaborador de Barreiras
-- baixando os comunicados, os padroes e as contagens de Sao Felix com a
-- chave publica que vai dentro do JavaScript do app.
--
-- Daqui em diante a resposta e sempre a mesma: le o que for das revendas
-- a que voce esta vinculado. O dono ve tudo.

do $$
declare t text;
begin
  foreach t in array array[
    'comunicados', 'ranking_matinal', 'padroes', 'padroes_pilares',
    'sonho_revenda', 'escala_trabalho', 'menu_itens',
    'ag_contagens', 'ag_parque', 'ag_fatores'
  ]
  loop
    -- Limpa as politicas de leitura antigas, seja qual for o nome que
    -- elas tenham ganhado ao longo das migracoes.
    execute format(
      'do $inner$
       declare pol record;
       begin
         for pol in select policyname from pg_policies
           where schemaname = ''public'' and tablename = %L and cmd = ''SELECT''
         loop
           execute format(''drop policy %%I on public.%I'', pol.policyname);
         end loop;
       end $inner$', t, t
    );

    execute format(
      'create policy "le a propria revenda" on public.%I
         for select to authenticated
         using (
           public.ehowner_atual()
           or revenda_id in (select public.revendas_do_usuario())
         )', t
    );
  end loop;
end $$;

-- Curtidas nao tem revenda propria: elas herdam a do comunicado. Sem
-- isto daria para contar as curtidas da outra revenda.
drop policy if exists "colaboradores leem curtidas" on public.comunicado_curtidas;
drop policy if exists "le curtidas da propria revenda" on public.comunicado_curtidas;
create policy "le curtidas da propria revenda"
  on public.comunicado_curtidas for select to authenticated
  using (
    public.ehowner_atual()
    or exists (
      select 1 from public.comunicados c
       where c.id = comunicado_id
         and c.revenda_id in (select public.revendas_do_usuario())
    )
  );

-- As contagens do Ativo de Giro tambem eram gravadas por qualquer
-- autenticado. Agora so dentro de revenda em que a pessoa esta.
drop policy if exists ag_contagens_criar on public.ag_contagens;
create policy ag_contagens_criar on public.ag_contagens
  for insert to authenticated
  with check (
    colaborador_id = auth.uid()
    and revenda_id in (select public.revendas_do_usuario())
  );

drop policy if exists ag_contagens_editar on public.ag_contagens;
create policy ag_contagens_editar on public.ag_contagens
  for update to authenticated
  using (
    colaborador_id = auth.uid()
    and revenda_id in (select public.revendas_do_usuario())
  )
  with check (
    colaborador_id = auth.uid()
    and revenda_id in (select public.revendas_do_usuario())
  );

drop policy if exists ag_contagens_excluir on public.ag_contagens;
create policy ag_contagens_excluir on public.ag_contagens
  for delete to authenticated
  using (
    colaborador_id = auth.uid()
    and revenda_id in (select public.revendas_do_usuario())
  );

-- Painel ao vivo: volta a funcionar para o dono (ver secao 6) e passa a
-- respeitar a revenda.
drop policy if exists "admin le eventos" on public.eventos_acesso;
create policy "admin le eventos"
  on public.eventos_acesso for select to authenticated
  using (
    public.ehowner_atual()
    or revenda_id in (select public.revendas_do_usuario())
  );

-- ------------------------------------------------------------------
-- 8) AS TABELAS NOVAS SO O SERVIDOR MEXE
-- ------------------------------------------------------------------
-- Mesmo desenho de lideranca_permissoes: RLS ligada e nenhuma politica.
-- Quem tem a chave publica nao le nem escreve vinculo de ninguem -- e o
-- que impede alguem de se vincular a outra revenda pela porta dos
-- fundos. Toda leitura passa por acao de servidor que confere quem pediu.
alter table public.revendas enable row level security;
alter table public.colaborador_revendas enable row level security;
alter table public.revenda_modulos enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('revendas', 'colaborador_revendas', 'revenda_modulos')
  loop
    execute format(
      'drop policy %I on public.%I', pol.policyname, pol.tablename
    );
  end loop;
end $$;

grant all on public.revendas to service_role;
grant all on public.colaborador_revendas to service_role;
grant all on public.revenda_modulos to service_role;

notify pgrst, 'reload schema';
