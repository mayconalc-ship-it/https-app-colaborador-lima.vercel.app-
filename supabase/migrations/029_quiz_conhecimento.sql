-- ==================================================================
-- 029 - QUIZ DE CONHECIMENTO / DESAFIO DO MES
-- Execute no Supabase: SQL Editor > New query > colar > Run
-- ==================================================================
-- Transforma os padroes que ja estao no app em desafio mensal, com
-- classificacao em formato de tabela de campeonato.
--
-- Tres ideias, e so tres:
--   1) BANCO DE QUESTOES - pergunta com alternativas, presa ao padrao
--      de onde saiu. Vive por conta propria: uma questao boa serve em
--      mais de uma rodada.
--   2) RODADA - o desafio de um mes, de UMA area. E ela que escolhe
--      quais questoes do banco entram e quando abre e fecha.
--   3) PARTICIPACAO - a tentativa de uma pessoa numa rodada. Uma so,
--      e a pontuacao dela e calculada no servidor.
--
-- A area vem de profiles.area, que ja existe e ja esta preenchida
-- ("DISTRIBUICAO URBANA" / "APOIO LOGISTICO"). Nao se cria vinculo
-- novo: o codigo normaliza esse texto para DU/AL, os mesmos codigos
-- que a Escala e a RV ja usam.
--
-- SEGURANCA, em uma frase: nenhuma tabela daqui tem politica de
-- leitura. Toda consulta passa por acao de servidor com a chave de
-- administrador -- e e isso que impede alguem de ler a coluna
-- "correta" com a chave publica que vai dentro do JavaScript do app.

-- ------------------------------------------------------------------
-- 1) CONFIGURACAO POR REVENDA
-- ------------------------------------------------------------------
-- Hoje guarda so quantas posicoes o colaborador ve na tabela. Nasce
-- como tabela, e nao como constante no codigo, porque o pedido e
-- justamente que o Admin mude isso sem ninguem publicar nada.
create table if not exists public.quiz_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  -- G4 + 4 logo abaixo. Minimo 3 para as tres medalhas continuarem
  -- fazendo sentido.
  posicoes_visiveis int not null default 8
    check (posicoes_visiveis between 3 and 50),
  atualizado_em timestamptz not null default now()
);

insert into public.quiz_config (revenda_id)
select id from public.revendas
on conflict (revenda_id) do nothing;

-- ------------------------------------------------------------------
-- 2) RODADAS
-- ------------------------------------------------------------------
-- Uma rodada por mes e por area. "temporada" e o ano do campeonato:
-- e por ele que a classificacao acumulada soma as rodadas.
--
-- padrao_id aponta para o arquivo de origem, mas padrao_nome guarda o
-- nome por escrito. Se o padrao for substituido no acervo, a rodada
-- antiga continua sabendo dizer sobre o que ela era.
create table if not exists public.quiz_rodadas (
  id bigint generated always as identity primary key,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null,
  temporada int not null,
  mes int not null check (mes between 1 and 12),
  area text not null check (area in ('DU', 'AL')),
  pilar text,
  padrao_id bigint references public.padroes(id) on delete set null,
  padrao_nome text,
  -- O app nao tem entidade "atividade": o que existe e o topico
  -- (padroes.caminho) e o arquivo. Este campo guarda esse recorte em
  -- texto, que e como o Admin descreve a atividade da rodada.
  atividade text,
  inicio date not null,
  fim date not null,
  total_perguntas int not null default 10 check (total_perguntas between 1 and 50),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'publicada', 'encerrada')),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  publicada_em timestamptz,
  encerrada_em timestamptz,
  -- Carimbos dos lembretes automaticos. Sao eles que tornam o disparo
  -- idempotente: o cron roda a cada 15 min e so avisa a rodada cujo
  -- carimbo ainda esta nulo.
  lembrete_meio_em timestamptz,
  lembrete_fim_em timestamptz,
  check (fim >= inicio)
);

create index if not exists quiz_rodadas_revenda_idx
  on public.quiz_rodadas (revenda_id, area, status);
create index if not exists quiz_rodadas_periodo_idx
  on public.quiz_rodadas (revenda_id, area, inicio desc);
create index if not exists quiz_rodadas_temporada_idx
  on public.quiz_rodadas (revenda_id, area, temporada, mes);

-- De proposito NAO ha unique (revenda, area, mes): desafio semanal e
-- desafio surpresa ja estao previstos, e uma trava mensal aqui
-- impediria os dois. Quem cuida de periodo sobreposto e a acao que
-- publica -- ela recusa duas rodadas abertas ao mesmo tempo na mesma
-- area.

-- ------------------------------------------------------------------
-- 3) BANCO DE QUESTOES
-- ------------------------------------------------------------------
-- A questao pertence ao banco, nao a rodada. E o que permite
-- reaproveitar sem recadastrar e medir acerto/erro ao longo do ano.
--
-- vezes_usada / acertos / erros sao contadores mantidos pelo servidor
-- a cada resposta. Ficam aqui, e nao numa consulta agregada, porque a
-- pergunta "qual questao o time mais erra?" precisa ser barata: ela e
-- o indicador que diz qual padrao reforcar.
create table if not exists public.quiz_questoes (
  id bigint generated always as identity primary key,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  pergunta text not null,
  tipo text not null default 'multipla'
    check (tipo in ('multipla', 'vf', 'situacao', 'procedimento')),
  explicacao text not null default '',
  dificuldade text not null default 'media'
    check (dificuldade in ('facil', 'media', 'dificil')),
  status text not null default 'ativa' check (status in ('ativa', 'inativa')),
  area text not null check (area in ('DU', 'AL')),
  pilar text,
  padrao_id bigint references public.padroes(id) on delete set null,
  padrao_nome text,
  atividade text,
  vezes_usada int not null default 0,
  acertos int not null default 0,
  erros int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null
);

create index if not exists quiz_questoes_busca_idx
  on public.quiz_questoes (revenda_id, area, status);
create index if not exists quiz_questoes_padrao_idx
  on public.quiz_questoes (revenda_id, padrao_id);

-- Pergunta repetida e o defeito mais provavel de um banco alimentado
-- aos poucos. A comparacao ignora caixa e espaco das pontas: e assim
-- que a repeticao costuma entrar.
create unique index if not exists quiz_questoes_sem_repeticao
  on public.quiz_questoes (revenda_id, area, md5(lower(btrim(pergunta))));

-- ------------------------------------------------------------------
-- 4) ALTERNATIVAS
-- ------------------------------------------------------------------
-- Tabela separada porque duas alternativas corretas e um erro que o
-- banco pode impedir sozinho -- e impede, no indice abaixo.
create table if not exists public.quiz_alternativas (
  id bigint generated always as identity primary key,
  questao_id bigint not null references public.quiz_questoes(id) on delete cascade,
  texto text not null,
  correta boolean not null default false,
  -- Ordem de cadastro. NAO e a ordem de exibicao: quem embaralha e o
  -- servidor, a cada participacao.
  ordem int not null default 0
);

create index if not exists quiz_alternativas_questao_idx
  on public.quiz_alternativas (questao_id, ordem);

create unique index if not exists quiz_alternativas_uma_correta
  on public.quiz_alternativas (questao_id) where correta;

-- ------------------------------------------------------------------
-- 5) QUAIS QUESTOES ENTRAM NA RODADA
-- ------------------------------------------------------------------
create table if not exists public.quiz_rodada_questoes (
  rodada_id bigint not null references public.quiz_rodadas(id) on delete cascade,
  questao_id bigint not null references public.quiz_questoes(id) on delete cascade,
  ordem int not null default 0,
  primary key (rodada_id, questao_id)
);

create index if not exists quiz_rodada_questoes_ordem_idx
  on public.quiz_rodada_questoes (rodada_id, ordem);

-- ------------------------------------------------------------------
-- 6) PARTICIPACAO
-- ------------------------------------------------------------------
-- Uma tentativa por pessoa por rodada -- garantido pela chave unica, e
-- nao por checagem no codigo, que duas abas abertas driblariam.
--
-- colaborador_nome e area sao copia do cadastro no momento em que a
-- pessoa comecou. A tabela do campeonato precisa continuar legivel
-- depois que alguem muda de area ou sai da empresa.
create table if not exists public.quiz_participacoes (
  id bigint generated always as identity primary key,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  rodada_id bigint not null references public.quiz_rodadas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,
  area text not null check (area in ('DU', 'AL')),
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'concluida')),
  pontos int not null default 0,
  acertos int not null default 0,
  respondidas int not null default 0,
  -- Soma do tempo gasto pergunta a pergunta. Nao vale ponto nenhum:
  -- so desempata.
  tempo_ms bigint not null default 0,
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz,
  unique (rodada_id, colaborador_id)
);

create index if not exists quiz_participacoes_classificacao_idx
  on public.quiz_participacoes (rodada_id, status, pontos desc, acertos desc, tempo_ms);
create index if not exists quiz_participacoes_pessoa_idx
  on public.quiz_participacoes (colaborador_id, revenda_id);

-- ------------------------------------------------------------------
-- 7) RESPOSTAS
-- ------------------------------------------------------------------
-- Guarda o que foi respondido para a revisao no fim ("ver minhas
-- respostas") e para o indicador de questao mais errada.
--
-- A chave unica e a trava que impede responder a mesma pergunta duas
-- vezes -- inclusive com dois toques no mesmo botao.
create table if not exists public.quiz_respostas (
  id bigint generated always as identity primary key,
  participacao_id bigint not null references public.quiz_participacoes(id) on delete cascade,
  questao_id bigint not null references public.quiz_questoes(id) on delete cascade,
  alternativa_id bigint references public.quiz_alternativas(id) on delete set null,
  correta boolean not null,
  tempo_ms int not null default 0,
  respondida_em timestamptz not null default now(),
  unique (participacao_id, questao_id)
);

create index if not exists quiz_respostas_questao_idx
  on public.quiz_respostas (questao_id, correta);

-- ------------------------------------------------------------------
-- 8) CONQUISTAS
-- ------------------------------------------------------------------
-- Selo ganho numa rodada. Tabela de codigo + data, sem regra dentro:
-- a regra de cada selo mora no codigo, que e onde ela vai mudar.
create table if not exists public.quiz_conquistas (
  id bigint generated always as identity primary key,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  rodada_id bigint references public.quiz_rodadas(id) on delete cascade,
  codigo text not null,
  criado_em timestamptz not null default now(),
  unique (colaborador_id, rodada_id, codigo)
);

create index if not exists quiz_conquistas_pessoa_idx
  on public.quiz_conquistas (colaborador_id, revenda_id);

-- ------------------------------------------------------------------
-- 9) O FECHAMENTO
-- ------------------------------------------------------------------
-- RLS ligada e NENHUMA politica, em todas as oito. Mesmo desenho de
-- lideranca_permissoes e rv_config.
--
-- Aqui isso nao e zelo extra, e requisito: quem tem a chave publica
-- nao pode ler quiz_alternativas.correta -- seria o gabarito inteiro
-- antes de responder -- nem escrever em quiz_participacoes.pontos,
-- que seria a classificacao editada pelo navegador.
do $$
declare t text;
begin
  foreach t in array array[
    'quiz_config', 'quiz_rodadas', 'quiz_questoes', 'quiz_alternativas',
    'quiz_rodada_questoes', 'quiz_participacoes', 'quiz_respostas',
    'quiz_conquistas'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant all on public.%I to service_role', t);

    -- Limpa qualquer politica que uma execucao anterior tenha deixado.
    execute format(
      'do $inner$
       declare pol record;
       begin
         for pol in select policyname from pg_policies
           where schemaname = ''public'' and tablename = %L
         loop
           execute format(''drop policy %%I on public.%I'', pol.policyname);
         end loop;
       end $inner$', t, t
    );
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 10) CONTADORES DA QUESTAO
-- ------------------------------------------------------------------
-- Somar no banco, e nao no aplicativo, porque ler-somar-gravar perde
-- contagem quando duas pessoas respondem no mesmo segundo -- e e
-- exatamente isso que acontece num desafio que abre para o time todo
-- de uma vez.
create or replace function public.quiz_contabilizar(
  p_questao_id bigint,
  p_correta boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.quiz_questoes
     set vezes_usada = vezes_usada + 1,
         acertos = acertos + case when p_correta then 1 else 0 end,
         erros   = erros   + case when p_correta then 0 else 1 end
   where id = p_questao_id;
$$;

revoke all on function public.quiz_contabilizar(bigint, boolean) from public;
grant execute on function public.quiz_contabilizar(bigint, boolean) to service_role;

-- ------------------------------------------------------------------
-- 11) LIGAR O MODULO
-- ------------------------------------------------------------------
-- Nasce ligado nas duas revendas. Nao ha risco em ligar: sem rodada
-- publicada a tela so diz que ainda nao ha desafio, e o Admin
-- desliga em Revendas se nao quiser o modulo ali.
insert into public.revenda_modulos (revenda_id, modulo)
select id, 'quiz' from public.revendas
on conflict (revenda_id, modulo) do nothing;

-- O cartao no menu do colaborador.
--
-- So para quem JA tem menu proprio no banco. A revenda que ainda usa
-- o menu padrao do codigo recebe o cartao pelo proprio MENU_PADRAO --
-- semear aqui criaria a primeira linha dela e apagaria todos os
-- outros cartoes da tela inicial.
insert into public.menu_itens (revenda_id, chave, titulo, emoji, href, ordem, visivel)
select m.revenda_id, 'quiz', 'Desafio do Mês', '🏆', '/desafio',
       coalesce(max(m.ordem), 0) + 1, true
from public.menu_itens m
group by m.revenda_id
on conflict (revenda_id, chave) do nothing;

notify pgrst, 'reload schema';
