-- ==================================================================
-- 035 - PROGRAMA 5S
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O modulo inteiro do 5S: cadastro de areas e responsaveis, planejamento
-- das auditorias, checklist, nao conformidades, plano de acao e o BI.
--
-- Duas decisoes valem para tudo o que vem abaixo:
--
-- 1) SEGURANCA -- mesmo desenho do resto do projeto (ver 014, 015 e 021).
--    Toda tabela nasce com RLS ligada. As tabelas administrativas ficam
--    SEM politica nenhuma: quem tem a chave publica do app nao le nem
--    escreve, e todo acesso passa por acao de servidor que ja conferiu
--    requireModulo("5s", ...). As duas tabelas que o colaborador toca de
--    fato pela tela ganham politica de leitura recortada por revenda,
--    igual as de comunicados e padroes.
--
-- 2) PERFORMANCE -- o BI NAO varre respostas.
--    Uma auditoria tem 25 respostas. Somar "quantos Sim" percorrendo
--    respostas significaria ler 250 mil linhas para 10 mil auditorias,
--    toda vez que alguem abrisse o dashboard. Em vez disso, o momento da
--    FINALIZACAO consolida: grava os totais na propria auditoria e uma
--    linha por senso em cinco_s_auditoria_sensos. Dai em diante o BI le
--    1 linha por auditoria (ou 5, para o radar) -- numeros que nao
--    crescem com o tamanho do checklist.
--
--    O calculo mora em UMA funcao SQL (cinco_s_consolidar). Nao existe
--    segunda formula em lugar nenhum -- nem no frontend.

-- ------------------------------------------------------------------
-- 0) VOCABULARIO
-- ------------------------------------------------------------------
-- Os cinco sensos, na ordem e com os nomes que a planilha usa. Ficam
-- como texto com check em vez de enum: enum no Postgres nao aceita
-- reordenacao nem renome sem migracao dolorosa, e aqui a ordem importa
-- (e a ordem do radar e a do checklist).
--
--   utilizacao   Seiri     1.1 a 1.4
--   organizacao  Seiton    2.1 a 2.6
--   limpeza      Seiso     3.1 a 3.5
--   conservacao  Seiketsu  4.1 a 4.5
--   disciplina   Shitsuke  5.1 a 5.5

-- ------------------------------------------------------------------
-- 1) AREAS
-- ------------------------------------------------------------------
create table if not exists public.cinco_s_areas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null,
  descricao text,
  local text,
  ativa boolean not null default true,
  ordem int not null default 100,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null
);

-- Duas areas com o mesmo nome NA MESMA revenda seriam a mesma area
-- cadastrada duas vezes -- e o BI passaria a somar cada uma pela metade.
-- Entre revendas o nome pode repetir a vontade: "Armazem 1" existe nas
-- duas e sao lugares diferentes.
drop index if exists cinco_s_areas_nome_unico;
create unique index cinco_s_areas_nome_unico
  on public.cinco_s_areas (revenda_id, lower(nome));

create index if not exists cinco_s_areas_revenda_idx
  on public.cinco_s_areas (revenda_id) where ativa;

-- ------------------------------------------------------------------
-- 2) DONO DA AREA
-- ------------------------------------------------------------------
-- Tabela propria, e nao uma coluna dono_id na area, por causa de um
-- requisito explicito: trocar o dono NAO pode apagar o historico. Com
-- coluna, o UPDATE sobrescreve e a auditoria de marco passa a dizer que
-- o dono sempre foi o atual. Aqui a troca fecha um periodo e abre outro,
-- e cada auditoria continua sabendo quem respondia pela area NO DIA.
--
-- Uma pessoa pode ser dona de varias areas -- e o caso normal.
create table if not exists public.cinco_s_area_donos (
  id bigint generated always as identity primary key,
  area_id uuid not null references public.cinco_s_areas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  desde date not null default current_date,
  ate date,
  criado_em timestamptz not null default now()
);

create index if not exists cinco_s_area_donos_area_idx
  on public.cinco_s_area_donos (area_id) where ate is null;
create index if not exists cinco_s_area_donos_pessoa_idx
  on public.cinco_s_area_donos (colaborador_id) where ate is null;

-- Um dono vigente por area. Dois donos ativos fariam "as minhas areas"
-- devolver a mesma area duas vezes.
drop index if exists cinco_s_area_donos_vigente_unico;
create unique index cinco_s_area_donos_vigente_unico
  on public.cinco_s_area_donos (area_id) where ate is null;

-- ------------------------------------------------------------------
-- 3) AUDITORES
-- ------------------------------------------------------------------
-- Nao e cadastro de pessoa: e uma marca sobre quem JA existe em
-- profiles. Duplicar usuario aqui seria criar um segundo cadastro de
-- gente para manter em dia -- exatamente o que o requisito proibe.
create table if not exists public.cinco_s_auditores (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  primary key (revenda_id, colaborador_id)
);

create index if not exists cinco_s_auditores_revenda_idx
  on public.cinco_s_auditores (revenda_id) where ativo;

-- Auditor habilitado para uma area especifica. Vazio para a area =
-- qualquer auditor ativo pode audita-la, que e o comportamento de hoje
-- na planilha. Preenchido = so estes.
create table if not exists public.cinco_s_area_auditores (
  area_id uuid not null references public.cinco_s_areas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  primary key (area_id, colaborador_id)
);

-- ------------------------------------------------------------------
-- 4) PERGUNTAS DO CHECKLIST
-- ------------------------------------------------------------------
-- Sao dado, nao codigo: a operacao precisa poder corrigir um texto sem
-- deploy. Mas a resposta guarda o ID da pergunta, entao editar o texto
-- nao reescreve a historia -- o ranking de perguntas criticas continua
-- somando a mesma pergunta.
create table if not exists public.cinco_s_perguntas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  senso text not null check (senso in (
    'utilizacao', 'organizacao', 'limpeza', 'conservacao', 'disciplina'
  )),
  -- "1.1", "2.6". E o que a operacao usa para conversar sobre o item.
  codigo text not null,
  texto text not null,
  ordem int not null,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

drop index if exists cinco_s_perguntas_codigo_unico;
create unique index cinco_s_perguntas_codigo_unico
  on public.cinco_s_perguntas (revenda_id, codigo);

create index if not exists cinco_s_perguntas_ordem_idx
  on public.cinco_s_perguntas (revenda_id, ordem) where ativa;

-- ------------------------------------------------------------------
-- 5) AUDITORIAS
-- ------------------------------------------------------------------
-- O ciclo de vida em uma linha:
--   planejada -> em_andamento -> finalizada    (cancelada sai de qualquer uma)
--
-- As colunas de total no fim da tabela sao o coracao da performance do
-- BI. Elas NAO sao preenchidas pelo app: quem as escreve e a funcao
-- cinco_s_consolidar, no banco, na finalizacao. Coluna calculada por
-- fora acabaria divergindo das respostas na primeira pressa.
create table if not exists public.cinco_s_auditorias (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  area_id uuid not null references public.cinco_s_areas(id) on delete cascade,
  auditor_id uuid not null references auth.users(id) on delete restrict,

  -- Quem respondia pela area quando esta auditoria aconteceu. Congelado
  -- de proposito: e o que faz a troca de dono nao reescrever o passado.
  dono_id uuid references auth.users(id) on delete set null,

  status text not null default 'planejada' check (status in (
    'planejada', 'em_andamento', 'finalizada', 'cancelada'
  )),

  planejada_para date not null,
  iniciada_em timestamptz,
  finalizada_em timestamptz,
  observacao text,

  -- Competencia do indicador. Deriva de planejada_para e nao da data em
  -- que o auditor finalizou: uma auditoria de marco feita com atraso no
  -- dia 2 de abril continua sendo o resultado de marco. Gerada pelo
  -- banco para nao depender de ninguem lembrar de preencher.
  competencia date generated always as (date_trunc('month', planejada_para)::date) stored,

  -- ---- consolidado (escrito por cinco_s_consolidar) ----
  total_ok smallint not null default 0,
  total_nok smallint not null default 0,
  total_na smallint not null default 0,
  -- 0 a 100, com uma casa. numeric e nao float: o BI soma e compara
  -- estes valores, e float acumularia diferenca invisivel.
  conformidade numeric(5,2),

  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

-- Os tres caminhos que o BI e as telas realmente percorrem.
create index if not exists cinco_s_auditorias_bi_idx
  on public.cinco_s_auditorias (revenda_id, competencia desc, status);
create index if not exists cinco_s_auditorias_area_idx
  on public.cinco_s_auditorias (area_id, competencia desc);
create index if not exists cinco_s_auditorias_auditor_idx
  on public.cinco_s_auditorias (auditor_id, competencia desc);
-- "o que esta pendente" e a pergunta mais feita da tela de planejamento;
-- o indice parcial deixa ela custar quase nada mesmo com anos de base.
create index if not exists cinco_s_auditorias_pendentes_idx
  on public.cinco_s_auditorias (revenda_id, planejada_para)
  where status in ('planejada', 'em_andamento');

-- Uma auditoria planejada por area por mes. Sem isto, dois gestores
-- planejando no mesmo dia criariam duas auditorias da mesma area e o
-- indicador de aderencia passaria a contar 2 previstas onde ha 1.
drop index if exists cinco_s_auditorias_unica_no_mes;
create unique index cinco_s_auditorias_unica_no_mes
  on public.cinco_s_auditorias (area_id, competencia)
  where status <> 'cancelada';

-- ------------------------------------------------------------------
-- 6) RESPOSTAS
-- ------------------------------------------------------------------
-- 'sim' = conforme, 'nao' = nao conforme, 'na' = nao se aplica.
-- Os mesmos tres valores da planilha, so que sem acento e sem grafia
-- livre -- e o check impede que "Nao"/"NAO"/"N" entrem e virem uma
-- quarta categoria silenciosa no indicador.
create table if not exists public.cinco_s_respostas (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references public.cinco_s_auditorias(id) on delete cascade,
  pergunta_id uuid not null references public.cinco_s_perguntas(id) on delete restrict,
  valor text not null check (valor in ('sim', 'nao', 'na')),
  observacao text,
  foto_url text,
  respondida_em timestamptz not null default now()
);

-- Uma resposta por pergunta por auditoria. E o que permite ao checklist
-- salvar item a item (upsert) sem duplicar quando a pessoa volta e troca
-- a resposta -- e o que garante que o consolidado nunca conte duas vezes.
drop index if exists cinco_s_respostas_unica;
create unique index cinco_s_respostas_unica
  on public.cinco_s_respostas (auditoria_id, pergunta_id);

-- O ranking de perguntas criticas do BI percorre exatamente este indice.
create index if not exists cinco_s_respostas_pergunta_idx
  on public.cinco_s_respostas (pergunta_id, valor);

-- ------------------------------------------------------------------
-- 7) CONSOLIDADO POR SENSO
-- ------------------------------------------------------------------
-- O radar dos cinco sensos, ja somado. Cinco linhas por auditoria em
-- vez de vinte e cinco -- e, mais importante, sem precisar saber a qual
-- senso cada pergunta pertence na hora de desenhar o grafico.
create table if not exists public.cinco_s_auditoria_sensos (
  auditoria_id uuid not null references public.cinco_s_auditorias(id) on delete cascade,
  senso text not null check (senso in (
    'utilizacao', 'organizacao', 'limpeza', 'conservacao', 'disciplina'
  )),
  ok smallint not null default 0,
  nok smallint not null default 0,
  na smallint not null default 0,
  conformidade numeric(5,2),
  primary key (auditoria_id, senso)
);

-- ------------------------------------------------------------------
-- 8) NAO CONFORMIDADES / PLANO DE ACAO
-- ------------------------------------------------------------------
-- Uma tabela so para as duas coisas, de proposito. Na planilha a "acao"
-- era um texto solto por auditoria, desligado do item que a motivou --
-- e por isso ninguem conseguia responder "esta NC foi resolvida?". Aqui
-- o problema e a acao sao a MESMA linha, e por isso a pergunta tem
-- resposta.
--
-- Ciclo: aberta -> em_andamento -> concluida -> validada
-- (a validacao pode reprovar e devolver para em_andamento)
create table if not exists public.cinco_s_nao_conformidades (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  auditoria_id uuid not null references public.cinco_s_auditorias(id) on delete cascade,
  resposta_id uuid references public.cinco_s_respostas(id) on delete set null,
  area_id uuid not null references public.cinco_s_areas(id) on delete cascade,
  pergunta_id uuid references public.cinco_s_perguntas(id) on delete set null,
  -- Copiado da pergunta na criacao. O BI filtra e agrupa por senso o
  -- tempo todo; sem a copia, todo filtro viraria um join a mais.
  senso text not null check (senso in (
    'utilizacao', 'organizacao', 'limpeza', 'conservacao', 'disciplina'
  )),

  descricao text not null,
  evidencia_url text,

  responsavel_id uuid references auth.users(id) on delete set null,
  prazo date,
  prioridade text not null default 'media'
    check (prioridade in ('baixa', 'media', 'alta')),
  status text not null default 'aberta'
    check (status in ('aberta', 'em_andamento', 'concluida', 'validada')),

  acao text,
  concluido_em timestamptz,
  evidencia_conclusao_url text,
  comentario_encerramento text,
  validado_por uuid references auth.users(id) on delete set null,
  validado_em timestamptz,

  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

create index if not exists cinco_s_nc_revenda_idx
  on public.cinco_s_nao_conformidades (revenda_id, status, prazo);
create index if not exists cinco_s_nc_area_idx
  on public.cinco_s_nao_conformidades (area_id, status);
create index if not exists cinco_s_nc_responsavel_idx
  on public.cinco_s_nao_conformidades (responsavel_id, status);
create index if not exists cinco_s_nc_auditoria_idx
  on public.cinco_s_nao_conformidades (auditoria_id);
-- "Quais estao atrasadas?" e o cartao que a lideranca mais olha. O
-- indice parcial responde sem tocar no que ja foi resolvido.
create index if not exists cinco_s_nc_abertas_idx
  on public.cinco_s_nao_conformidades (revenda_id, prazo)
  where status in ('aberta', 'em_andamento');

-- Historico da tratativa. Linha nova a cada mudanca de status ou
-- comentario -- e o que permite mostrar "quem fez o que, quando", e o
-- que atende ao requisito de nao perder o rastro.
create table if not exists public.cinco_s_nc_historico (
  id bigint generated always as identity primary key,
  nc_id uuid not null references public.cinco_s_nao_conformidades(id) on delete cascade,
  ator_id uuid references auth.users(id) on delete set null,
  ator_nome text not null,
  de_status text,
  para_status text,
  comentario text,
  criado_em timestamptz not null default now()
);

create index if not exists cinco_s_nc_historico_idx
  on public.cinco_s_nc_historico (nc_id, criado_em desc);

-- ------------------------------------------------------------------
-- 9) atualizado_em automatico
-- ------------------------------------------------------------------
create or replace function public.cinco_s_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists cinco_s_auditorias_touch on public.cinco_s_auditorias;
create trigger cinco_s_auditorias_touch
  before update on public.cinco_s_auditorias
  for each row execute function public.cinco_s_touch();

drop trigger if exists cinco_s_nc_touch on public.cinco_s_nao_conformidades;
create trigger cinco_s_nc_touch
  before update on public.cinco_s_nao_conformidades
  for each row execute function public.cinco_s_touch();

-- ------------------------------------------------------------------
-- 10) A REGRA DE CALCULO -- unica no sistema inteiro
-- ------------------------------------------------------------------
-- conformidade = Sim / (Sim + Nao). O "N/A" fica FORA do denominador.
--
-- E a mesma formula da planilha que a operacao usa hoje, e a escolha
-- importa: contar N/A como acerto premiaria a area que marcou "nao se
-- aplica" em tudo; contar como erro puniria o armazem por nao ter ramal
-- de telefone. Fora do denominador, o indicador responde so pelo que
-- foi de fato avaliado.
--
-- Sem itens avaliados (tudo N/A) devolve NULL, e nao zero: "nao houve o
-- que medir" e "mediu e deu zero" sao coisas diferentes, e um zero
-- falso derrubaria a media da area no grafico.
create or replace function public.cinco_s_taxa(ok int, nok int)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(ok, 0) + coalesce(nok, 0) = 0 then null
    else round((ok::numeric * 100) / (ok + nok), 2)
  end;
$$;

-- Consolida uma auditoria: totais gerais + uma linha por senso.
--
-- Roda no banco, em uma passada, dentro da transacao que finaliza. Fazer
-- isso no app custaria uma ida ao banco para ler as 25 respostas, o
-- calculo em JavaScript e outra ida para gravar -- com a chance de o
-- processo morrer no meio e deixar o consolidado mentindo sobre as
-- respostas.
create or replace function public.cinco_s_consolidar(p_auditoria uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Uma varredura das respostas desta auditoria, agrupada por senso.
  delete from public.cinco_s_auditoria_sensos where auditoria_id = p_auditoria;

  insert into public.cinco_s_auditoria_sensos (auditoria_id, senso, ok, nok, na, conformidade)
  select
    p_auditoria,
    p.senso,
    count(*) filter (where r.valor = 'sim'),
    count(*) filter (where r.valor = 'nao'),
    count(*) filter (where r.valor = 'na'),
    public.cinco_s_taxa(
      count(*) filter (where r.valor = 'sim')::int,
      count(*) filter (where r.valor = 'nao')::int
    )
  from public.cinco_s_respostas r
  join public.cinco_s_perguntas p on p.id = r.pergunta_id
  where r.auditoria_id = p_auditoria
  group by p.senso;

  -- O total geral sai da soma dos sensos, nao de uma segunda varredura
  -- das respostas. Alem de mais barato, garante que o cartao do topo e
  -- o radar nunca discordem: sao o mesmo numero, somado uma vez so.
  update public.cinco_s_auditorias a
     set total_ok  = coalesce(s.ok, 0),
         total_nok = coalesce(s.nok, 0),
         total_na  = coalesce(s.na, 0),
         conformidade = public.cinco_s_taxa(coalesce(s.ok, 0)::int, coalesce(s.nok, 0)::int)
    from (
      select sum(ok) as ok, sum(nok) as nok, sum(na) as na
        from public.cinco_s_auditoria_sensos
       where auditoria_id = p_auditoria
    ) s
   where a.id = p_auditoria;
end;
$$;

revoke all on function public.cinco_s_consolidar(uuid) from public;
grant execute on function public.cinco_s_consolidar(uuid) to service_role;

-- ------------------------------------------------------------------
-- 11) PERMISSOES DE TABELA
-- ------------------------------------------------------------------
grant all on public.cinco_s_areas to service_role;
grant all on public.cinco_s_area_donos to service_role;
grant all on public.cinco_s_auditores to service_role;
grant all on public.cinco_s_area_auditores to service_role;
grant all on public.cinco_s_perguntas to service_role;
grant all on public.cinco_s_auditorias to service_role;
grant all on public.cinco_s_respostas to service_role;
grant all on public.cinco_s_auditoria_sensos to service_role;
grant all on public.cinco_s_nao_conformidades to service_role;
grant all on public.cinco_s_nc_historico to service_role;

-- Leitura pela chave publica so onde a tela do colaborador precisa dela.
grant select on public.cinco_s_areas to authenticated;
grant select on public.cinco_s_perguntas to authenticated;

-- ------------------------------------------------------------------
-- 12) RLS
-- ------------------------------------------------------------------
alter table public.cinco_s_areas enable row level security;
alter table public.cinco_s_area_donos enable row level security;
alter table public.cinco_s_auditores enable row level security;
alter table public.cinco_s_area_auditores enable row level security;
alter table public.cinco_s_perguntas enable row level security;
alter table public.cinco_s_auditorias enable row level security;
alter table public.cinco_s_respostas enable row level security;
alter table public.cinco_s_auditoria_sensos enable row level security;
alter table public.cinco_s_nao_conformidades enable row level security;
alter table public.cinco_s_nc_historico enable row level security;

-- Limpa politicas de execucoes anteriores desta migracao.
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename like 'cinco\_s\_%'
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- Areas e perguntas: catalogo. Quem esta logado le o da propria revenda
-- -- mesma politica de comunicados e padroes (ver 021). Escrita nao tem
-- politica nenhuma: so pelo servidor, depois de conferir a permissao.
create policy "le areas da propria revenda"
  on public.cinco_s_areas for select to authenticated
  using (
    public.ehowner_atual()
    or revenda_id in (select public.revendas_do_usuario())
  );

create policy "le perguntas da propria revenda"
  on public.cinco_s_perguntas for select to authenticated
  using (
    public.ehowner_atual()
    or revenda_id in (select public.revendas_do_usuario())
  );

-- Todo o resto -- auditorias, respostas, nao conformidades, vinculos --
-- fica SEM politica. Nao e esquecimento: e a resposta ao requisito de
-- que auditor veja so o que lhe cabe e dono de area so as areas dele.
-- Esse recorte depende de saber QUEM esta pedindo e em que papel, e uma
-- politica de linha nao tem como decidir isso sem repetir, em SQL, o
-- mapa de permissoes que ja existe em lib/acessos.ts -- duas copias da
-- mesma regra que fatalmente divergiriam.
--
-- Com RLS ligada e zero politicas, o banco NEGA tudo para a chave
-- publica. Nem a tela, nem o console do navegador, nem uma chamada
-- direta ao PostgREST com o token de um colaborador leem uma linha
-- sequer. O unico caminho e a acao de servidor, que confere o papel
-- antes de usar a service role.

-- ------------------------------------------------------------------
-- 13) O MODULO NA REVENDA
-- ------------------------------------------------------------------
-- Sao Felix e quem faz 5S hoje -- e de la que vem a planilha. Barreiras
-- entra quando a operacao de la comecar, pela tela de Revendas.
insert into public.revenda_modulos (revenda_id, modulo)
select id, '5s' from public.revendas where slug = 'sao-felix'
on conflict (revenda_id, modulo) do nothing;

-- Aviso do 5S ligado por padrao, igual aos demais modulos.
insert into public.notificacao_config (revenda_id, modulo, ativa)
select id, '5s', true from public.revendas
on conflict (revenda_id, modulo) do nothing;

-- Cartao no menu do colaborador. Nasce visivel, mas o modulo so aparece
-- para quem for auditor, dono de area ou gestor -- quem nao for nao ve
-- cartao nenhum (ver temAcessoModulo / a checagem da tela /5s).
insert into public.menu_itens (revenda_id, chave, titulo, emoji, href, ordem, visivel)
select id, '5s', 'Programa 5S', '🧹', '/5s', 12, true
from public.revendas
on conflict (revenda_id, chave) do nothing;

-- ------------------------------------------------------------------
-- 14) AS 25 PERGUNTAS
-- ------------------------------------------------------------------
-- Vindas da planilha "Analise_Auditoria 5S", na ordem original e com o
-- texto original. Tres delas (1.1, 2.3 e 4.4) chegaram cortadas em 199
-- caracteres pelo proprio export do Microsoft Forms e terminam em "...".
-- Ficam como vieram: completar por conta propria seria inventar
-- pergunta de auditoria. A tela de cadastro permite corrigir o texto sem
-- perder historico -- a resposta aponta para o ID, nao para o texto.
insert into public.cinco_s_perguntas (revenda_id, senso, codigo, texto, ordem)
select r.id, p.senso, p.codigo, p.texto, p.ordem
from public.revendas r
cross join (values
  ('utilizacao', '1.1', 'A área está livre de equipamentos e/ou objetos (ex. máquinas, cadeiras, mesas, trava paletes, cones de sinalização, quadros de gestão à vista) quebrados e/ou sem utilização na áre...', 1),
  ('utilizacao', '1.2', 'A área está livre de Cópias desnecessárias (Padrões vencidos, Books sem utilização) de materiais de consulta?', 2),
  ('utilizacao', '1.3', 'A área está livre de objetos desnecessários nos armários, gavetas equipamentos?', 3),
  ('utilizacao', '1.4', 'Os objetos pessoais estão nos lugares corretos? (Não deve ter objetos pessoais nos postos de trabalho)', 4),

  ('organizacao', '2.1', 'Existe identificação de materiais (mesas, salas, cadeiras, armarios)', 5),
  ('organizacao', '2.2', 'Os telefones estão identificados com o número do ramal?', 6),
  ('organizacao', '2.3', 'Os arquivos da Rede (Pastas de trabalho) estão organizados e de fácil acesso. Mostrando uma organização lógica, com nomes, para que todos consigam acessar (respeitando os limites...', 7),
  ('organizacao', '2.4', 'O desktop do funcionário está devidamente organizado?', 8),
  ('organizacao', '2.5', 'Os padrões da área se encontram em local de fácil acesso, conhecido por todos? Os padrões estão organizados, quaisquer padrões podem ser encontrados facilmente?', 9),
  ('organizacao', '2.6', 'Os itens da area estão nos seus locais destinados? Existem placas/identificações para todos os itens?', 10),

  ('limpeza', '3.1', 'Existe cronograma de limpeza na área? Está sendo cumprido?', 11),
  ('limpeza', '3.2', 'O lixo é recolhido com frequência?', 12),
  ('limpeza', '3.3', 'As mesas e o piso estão limpos?', 13),
  ('limpeza', '3.4', 'De modo geral a área passa a impressão de ser um ambiente limpo?', 14),
  ('limpeza', '3.5', 'A área está livre de alimentos ou restos de alimentos?', 15),

  ('conservacao', '4.1', 'Os equipamentos, utensílios, ferramentas e materiais estão em bom estado de conservação?', 16),
  ('conservacao', '4.2', 'As luminárias estão funcionando e estão em bom estado de conservação?', 17),
  ('conservacao', '4.3', 'Existem AUSÊNCIA cabos de energia ou outros tipo de cabos soltos pela area?', 18),
  ('conservacao', '4.4', 'O piso da área está em bom estado? (sem buracos, cerâmica faltando e/ou quebradas, etc). As paredes da área estão em bom estado (pintura não deve estar descascando, não deve ter ...', 19),
  ('conservacao', '4.5', 'As tomadas e interruptores estão em bom estado e funcionando?', 20),

  ('disciplina', '5.1', 'A operação conhece a sua responsabilidade na área? Sabe explicar o quadro de 5S? Qual a área sob sua responsabilidade e quais as atividades de 5S que precisa executar?', 21),
  ('disciplina', '5.2', 'Existe um quadro de gestão à vista com o resultado da ultima auditoria de 5s e ele esta atualizado?', 22),
  ('disciplina', '5.3', 'Todos os quadros de gestão à vista estão preenchidos e atualizados?', 23),
  ('disciplina', '5.4', 'As não conformidades levantadas nas auditorias passadas foram tratadas?', 24),
  ('disciplina', '5.5', 'As ações da ultima auditoria de 5s estão escritas no quadro de 5s da area e estão atualizadas?', 25)
) as p(senso, codigo, texto, ordem)
on conflict (revenda_id, codigo) do nothing;

-- ------------------------------------------------------------------
-- 15) AS 19 AREAS QUE JA EXISTEM
-- ------------------------------------------------------------------
-- Da aba "Donos de area" da planilha. So para Sao Felix, que e a
-- operacao que ja roda o programa. O vinculo com o dono NAO e semeado
-- aqui: la os donos estao como apelido ("Barbara F.", "Jose (Neto)") e
-- casar apelido com cadastro no palpite atribuiria area a pessoa errada.
-- A tela de cadastro faz esse de-para uma vez, com quem conhece o time.
insert into public.cinco_s_areas (revenda_id, nome, ordem)
select r.id, a.nome, a.ordem
from public.revendas r
cross join (values
  ('Portaria', 1),
  ('Sala de EPIS', 2),
  ('Sala de MarketPlace', 3),
  ('Sala Adm', 4),
  ('Estac. Caminhões', 5),
  ('Estac. Empilhadeiras', 6),
  ('Retorno de Rota (Saroba)', 7),
  ('Auditorio', 8),
  ('Vestiario/Banheiro', 9),
  ('Sala Log', 10),
  ('Refeitório', 11),
  ('Armazém 1', 12),
  ('Picking', 13),
  ('Sala Dos Conferentes', 14),
  ('Armazém 2', 15),
  ('Ativo de Giro', 16),
  ('Repack', 17),
  ('PNC e B1', 18),
  ('Sala peças Frota', 19)
) as a(nome, ordem)
where r.slug = 'sao-felix'
on conflict do nothing;

notify pgrst, 'reload schema';
