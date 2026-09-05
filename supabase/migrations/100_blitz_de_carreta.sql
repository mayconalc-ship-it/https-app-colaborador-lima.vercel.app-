-- ==================================================================
-- 100 - Blitz de carreta: checklist com foto por item NOK
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (05/09/2026): "com base nas carretas com maiores
-- indices de % de avarias, ao ser registrada essa carreta na portaria ao
-- ir para o conferente, ela caia na blitz e que venha uma especie de
-- check list com perguntas referente as condicoes da carreta e para cada
-- item NOK o conferente registre uma foto evidenciando essa nao
-- conformidade, apos finalizar esse check, va para esse painel de
-- pendencias e a lideranca ira tratar".
--
-- A BLITZ OLHA TRES COISAS, NESTA ORDEM: A CARRETA, O MOTORISTA E A
-- TRANSPORTADORA. Ajuste do dono (05/09/2026): "eu iria pela carreta, pois
-- a grande maioria das avarias se da as mas condicoes da asa delta e grade.
-- Mas faz sentido o cruzamento com motorista tambem, pois a depender da
-- conducao ele pode nao ter cuidado com a carga."
-- Basta uma das tres estourar o limite. O relato de ocorrencia continua
-- sendo escrito para a TRANSPORTADORA -- e ela quem responde pela frota e
-- pelo motorista (ver lib/blitz.ts).

-- ------------------------------------------------------------------
-- 1) O CHECKLIST -- as perguntas, cadastraveis
-- ------------------------------------------------------------------
-- Cadastro, e nao lista fixa no codigo: as condicoes que se conferem
-- mudam com a estacao e com o que a operacao descobre. Mesmo desenho dos
-- motivos de FEFO (067), pelo mesmo motivo -- a operacao acha o caso novo
-- antes de alguem pedir deploy.
create table if not exists public.pa_blitz_itens (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  pergunta text not null,
  -- A frase que diz o que olhar. Sem ela, dois conferentes marcam NOK
  -- por criterios diferentes e o historico deixa de comparar.
  ajuda text,
  -- O BLOCO a que a pergunta pertence ("Asa delta e grade", "Assoalho e
  -- estrutura", "Carga", "Documento e seguranca"). Doze perguntas numa
  -- lista corrida no celular, na doca, viram rolagem; agrupadas, o
  -- conferente confere andando pela carreta na ordem em que ele anda.
  grupo text,
  ordem smallint not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint pa_blitz_item_unico unique (revenda_id, pergunta)
);

create index if not exists pa_blitz_itens_revenda_idx
  on public.pa_blitz_itens (revenda_id, ativo, ordem);

-- ------------------------------------------------------------------
-- 2) A BLITZ de um atendimento
-- ------------------------------------------------------------------
create table if not exists public.pa_blitz (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  atendimento_id uuid not null references public.atendimentos_carretas(id) on delete cascade,

  -- POR QUE ESTA CARRETA CAIU NA BLITZ, congelado.
  -- A media muda a cada carga nova; seis meses depois, o relato de
  -- ocorrencia precisa dizer qual era o numero NO DIA -- e e ele que
  -- sustenta a conversa com o transportador.
  --
  -- QUAL DAS TRES ESTOUROU, e com que nome: sem isto o relato diria
  -- "avaria acima do limite" sem dizer se o problema e a placa, o
  -- motorista ou a frota -- que sao tres acoes diferentes.
  gatilho_dimensao text check (gatilho_dimensao in ('carreta', 'motorista', 'transportadora')),
  gatilho_nome text,
  -- A transportadora vai SEMPRE, mesmo quando quem estourou foi a placa:
  -- e para ela que a ocorrencia e escrita.
  transportadora_nome text,
  media_avaria_pct numeric(6,2),
  limite_pct numeric(6,2),
  carretas_consideradas smallint,

  status text not null default 'pendente'
    check (status in ('pendente', 'concluida', 'tratada')),
  conferente_id uuid,
  conferente_nome text,
  iniciada_em timestamptz,
  concluida_em timestamptz,

  -- A TRATATIVA da lideranca.
  tratada_em timestamptz,
  tratada_por_nome text,
  tratativa text,

  criado_em timestamptz not null default now(),

  -- Uma blitz por atendimento. Abrir a segunda seria duplicar o
  -- checklist da mesma carreta.
  constraint pa_blitz_atendimento_unico unique (atendimento_id)
);

create index if not exists pa_blitz_revenda_idx
  on public.pa_blitz (revenda_id, status, criado_em desc);

-- ------------------------------------------------------------------
-- 3) AS RESPOSTAS -- e a foto do que esta NOK
-- ------------------------------------------------------------------
create table if not exists public.pa_blitz_respostas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  blitz_id uuid not null references public.pa_blitz(id) on delete cascade,
  item_id uuid references public.pa_blitz_itens(id) on delete set null,

  -- O TEXTO DA PERGUNTA VAI JUNTO, e nao so a FK: o catalogo muda, e um
  -- relato de ocorrencia que cita "item 3" deixa de ser lido no dia em
  -- que a pergunta 3 virar outra coisa.
  pergunta text not null,
  resposta text not null check (resposta in ('ok', 'nok', 'na')),
  observacao text,
  foto_url text,
  criado_em timestamptz not null default now(),

  constraint pa_blitz_resposta_unica unique (blitz_id, item_id)
);

create index if not exists pa_blitz_respostas_blitz_idx
  on public.pa_blitz_respostas (blitz_id);

-- A FOTO E OBRIGATORIA NO NOK, e a regra fica no BANCO tambem.
-- A tela ja exige, mas tela e sugestao: sem esta trava, um NOK sem
-- evidencia entra por qualquer outro caminho -- e NOK sem foto e a
-- palavra do conferente contra a do transportador.
alter table public.pa_blitz_respostas
  drop constraint if exists pa_blitz_nok_tem_foto;
alter table public.pa_blitz_respostas
  add constraint pa_blitz_nok_tem_foto
  check (resposta <> 'nok' or (foto_url is not null and foto_url <> ''));

-- ------------------------------------------------------------------
-- 4) A MARCA NO ATENDIMENTO
-- ------------------------------------------------------------------
-- A portaria decide na hora do registro, e o conferente le. Coluna no
-- atendimento (e nao consulta pela pa_blitz) porque a tela do conferente
-- precisa saber ANTES de existir blitz nenhuma -- e para o Monitor poder
-- destacar a carreta sem um join a mais.
alter table public.atendimentos_carretas
  add column if not exists blitz_exigida boolean not null default false;

comment on column public.atendimentos_carretas.blitz_exigida is
  'Marcado na portaria quando a transportadora esta acima do limite de avaria. O conferente ve o checklist da blitz antes de liberar.';

-- ------------------------------------------------------------------
-- 5) SEMENTE do checklist -- as condicoes que a operacao ja confere
-- ------------------------------------------------------------------
-- Nasce com perguntas de verdade para a primeira blitz nao cair numa
-- lista vazia. Cadastro novo (e mudanca de texto) entra pelo Admin.
--
-- ESCRITO NA CAUSA, E NA LINGUA DA DOCA. Ajuste do dono (05/09/2026): "o
-- check list eu faria com base realmente na causa (...) tipo, estiva, nao
-- sei o que significa". Entao:
--   - "Carga estivada corretamente" virou "Carga travada, sem palete
--     tombado nem vao sobrando" -- diz o que olhar, nao o termo tecnico;
--   - "Lona e amarracao" (uma pergunta so, generica demais) virou QUATRO:
--     grade, asa delta, lona e cinta. Sao as maiores causas de avaria da
--     operacao, e uma pergunta unica nao diz ao transportador o que
--     consertar;
--   - entraram os paletes, as pontas de ferro e o "sinal de que a carga
--     andou" -- este ultimo e a pista de CONDUCAO, que e o cruzamento com
--     o motorista.
-- Este texto e um PONTO DE PARTIDA para o time operacional revisar na
-- tela de cadastro; nao foi validado com eles.
insert into public.pa_blitz_itens (revenda_id, grupo, pergunta, ajuda, ordem)
select r.id, i.grupo, i.pergunta, i.ajuda, i.ordem
from public.revendas r
cross join (
  values
    -- ---- Onde a avaria nasce ----
    ('Asa delta e grade', 'Grades laterais completas e travadas?',
     'Grade faltando, entortada, pino ou trava quebrada. E por ai que o palete anda e a carga bate.', 1),
    ('Asa delta e grade', 'A asa delta abre e fecha travando por completo?',
     'Roldana emperrada, trilho torto, asa que nao fecha de vez: a carga vai batendo na lateral o caminho inteiro.', 2),
    ('Asa delta e grade', 'Lona sem rasgo e bem esticada?',
     'Rasgo, furo, ou lona bamba que chicoteia e vai raspando na carga.', 3),
    ('Asa delta e grade', 'Cintas e catracas suficientes e sem desgaste?',
     'Cinta puida ou cortada, catraca que nao prende, carga com menos cinta do que precisa.', 4),

    -- ---- O que a carga pisa e encosta ----
    ('Assoalho e estrutura', 'Assoalho sem tabua solta, prego ou parafuso para fora?',
     'Tabua bailando, prego levantado, buraco. Fura a embalagem de baixo e derruba o palete.', 5),
    ('Assoalho e estrutura', 'Carroceria sem ponta de ferro ou aresta cortante?',
     'Rebite solto, cantoneira torta, ferro exposto na lateral ou no teto.', 6),
    ('Assoalho e estrutura', 'Piso limpo e seco, sem resto de carga anterior?',
     'Caco de vidro, liquido derramado, papelao molhado, sujeira da viagem passada.', 7),
    ('Assoalho e estrutura', 'Sem infiltracao, umidade ou cheiro forte?',
     'Marca de agua no teto, mofo, cheiro de combustivel ou de produto de limpeza.', 8),

    -- ---- Como a carga veio ----
    ('Carga', 'Carga travada, sem palete tombado nem vao sobrando?',
     'Palete torto, carga encostada na porta, espaco vazio que deixa o palete andar na curva.', 9),
    ('Carga', 'Paletes em bom estado, sem tabua quebrada?',
     'Palete rachado, tabua faltando, palete que nao aguenta o proximo empilhamento.', 10),
    ('Carga', 'Carga sem sinal de que andou na viagem?',
     'Filme rasgado, caixa amassada no canto, garrafa quebrada no piso. E a pista de freada brusca ou de carga mal travada.', 11),

    -- ---- Documento e seguranca ----
    ('Documento e seguranca', 'Lacre inteiro e igual ao da nota?',
     'Lacre rompido, ausente, ou com numero diferente do documento.', 12),
    ('Documento e seguranca', 'Motorista com EPI e em condicoes de operar?',
     'Calcado fechado, colete, e condicao de trabalhar com seguranca.', 13)
) as i(grupo, pergunta, ajuda, ordem)
on conflict (revenda_id, pergunta) do nothing;

-- ------------------------------------------------------------------
-- 6) RLS
-- ------------------------------------------------------------------
alter table public.pa_blitz_itens enable row level security;
alter table public.pa_blitz enable row level security;
alter table public.pa_blitz_respostas enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pa_blitz_itens', 'pa_blitz', 'pa_blitz_respostas']
  loop
    execute format('drop policy if exists "le %I da propria revenda" on public.%I', t, t);
    execute format(
      'create policy "le %I da propria revenda" on public.%I for select to authenticated
         using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))',
      t, t
    );
  end loop;
end $$;

grant select on public.pa_blitz_itens, public.pa_blitz, public.pa_blitz_respostas to authenticated;
grant all on public.pa_blitz_itens, public.pa_blitz, public.pa_blitz_respostas to service_role;

notify pgrst, 'reload schema';

-- Confira: o checklist semeado e as tabelas vazias.
select
  (select count(*) from public.pa_blitz_itens) as perguntas_do_checklist,
  (select count(*) from public.pa_blitz) as blitz,
  (select count(*) from public.pa_blitz_respostas) as respostas;
