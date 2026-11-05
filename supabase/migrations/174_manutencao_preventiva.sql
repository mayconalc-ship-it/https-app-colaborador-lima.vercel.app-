-- ==================================================================
-- 174 - MANUTENCAO PREVENTIVA: check por equipamento (comeca no Gerador)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Hoje a preventiva do gerador e um Microsoft Forms preenchido toda
-- semana pelo Darley, em Barreiras. Funciona para registrar, mas nao
-- para ACOMPANHAR: nas 49 respostas exportadas havia 7 jeitos de
-- escrever "em bom estado", um "L3: 22" truncado (era 220), "Cheion" e
-- 48 celulas com "ID" na pergunta de litros. Nada disso vira serie
-- historica -- e serie historica e o ponto de uma preventiva: ver a
-- bateria caindo ANTES de o gerador nao pegar.
--
-- Por isso cada pergunta tem um TIPO, e a resposta cai na coluna certa
-- em vez de num campo de texto. A regra de qual coluna usar mora em
-- lib/manutencao-preventiva.ts, junto com a validacao da tela.
--
-- Desenho espelha o Check Global (manut_itens -> manut_avaliacoes ->
-- manut_respostas), com uma camada a mais: MODELO. O gerador e o
-- primeiro de varios checklists de preventiva, entao o modelo e que
-- carrega as perguntas, e execucao aponta para o modelo.

-- ------------------------------------------------------------------
-- 1) MODELOS: um por equipamento
-- ------------------------------------------------------------------
create table if not exists public.manut_prev_modelos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null,
  equipamento text not null default '',
  emoji text,
  -- De quantos em quantos dias a preventiva deve acontecer. O gerador e
  -- semanal (o Forms mostra segundas, as vezes sextas).
  periodicidade_dias smallint not null default 7 check (periodicidade_dias between 1 and 365),
  ordem smallint not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint manut_prev_modelo_unico unique (revenda_id, nome)
);

-- ------------------------------------------------------------------
-- 2) ITENS: as perguntas de cada modelo
-- ------------------------------------------------------------------
create table if not exists public.manut_prev_itens (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.manut_prev_modelos(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  ordem smallint not null,
  pergunta text not null,
  ajuda text,
  -- sim_nao  -> valor_bool
  -- numero   -> valor_numero (com unidade e casas decimais)
  -- trifasico-> valor_numeros[3], as fases L1/L2/L3
  -- opcao    -> valor_texto, limitado a `opcoes`
  -- nota     -> valor_numero de 1 a 5
  -- texto    -> valor_texto livre
  tipo text not null check (tipo in ('sim_nao', 'numero', 'trifasico', 'opcao', 'nota', 'texto')),
  opcoes text[] not null default '{}',
  unidade text,
  casas_decimais smallint not null default 0 check (casas_decimais between 0 and 3),
  obrigatorio boolean not null default true,
  -- Pergunta condicional: so aparece quando a resposta do item apontado
  -- estiver em `depende_valores` ('true'/'false' no sim_nao, ou o texto
  -- da opcao). Resolve o "Quantos litros?", que vinha com "ID" em 48 de
  -- 49 respostas por estar sempre visivel no Forms.
  depende_item_id uuid references public.manut_prev_itens(id) on delete set null,
  depende_valores text[] not null default '{}',
  ativo boolean not null default true,
  constraint manut_prev_item_ordem unique (modelo_id, ordem),
  constraint manut_prev_opcao_tem_lista check (tipo <> 'opcao' or cardinality(opcoes) > 0)
);

-- ------------------------------------------------------------------
-- 3) EXECUCOES: cada vez que a preventiva e feita
-- ------------------------------------------------------------------
create table if not exists public.manut_prev_execucoes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  modelo_id uuid not null references public.manut_prev_modelos(id) on delete restrict,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'finalizada')),
  iniciada_por uuid references auth.users(id) on delete set null,
  iniciada_por_nome text not null,
  iniciada_em timestamptz not null default now(),
  finalizada_por uuid references auth.users(id) on delete set null,
  finalizada_por_nome text,
  finalizada_em timestamptz,
  observacao text check (observacao is null or char_length(observacao) <= 1000)
);

-- Uma execucao aberta por modelo e por pessoa: evita duas abas gerando
-- duas preventivas pela metade.
create unique index if not exists manut_prev_execucao_aberta_unica
  on public.manut_prev_execucoes (modelo_id, iniciada_por)
  where status = 'em_andamento';

create index if not exists manut_prev_execucoes_hist_idx
  on public.manut_prev_execucoes (revenda_id, modelo_id, finalizada_em desc);

-- ------------------------------------------------------------------
-- 4) RESPOSTAS
-- ------------------------------------------------------------------
create table if not exists public.manut_prev_respostas (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.manut_prev_execucoes(id) on delete cascade,
  item_id uuid not null references public.manut_prev_itens(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  valor_bool boolean,
  valor_numero numeric(10,3),
  valor_numeros numeric(10,3)[],
  valor_texto text check (valor_texto is null or char_length(valor_texto) <= 500),
  observacao text check (observacao is null or char_length(observacao) <= 500),
  atualizado_em timestamptz not null default now(),
  constraint manut_prev_resposta_unica unique (execucao_id, item_id)
);

create index if not exists manut_prev_respostas_item_idx
  on public.manut_prev_respostas (item_id);

-- ------------------------------------------------------------------
-- 5) RLS
-- ------------------------------------------------------------------
alter table public.manut_prev_modelos   enable row level security;
alter table public.manut_prev_itens     enable row level security;
alter table public.manut_prev_execucoes enable row level security;
alter table public.manut_prev_respostas enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'manut_prev_modelos', 'manut_prev_itens', 'manut_prev_execucoes', 'manut_prev_respostas'
  ]
  loop
    execute format('drop policy if exists "le %I da revenda" on public.%I', t, t);
    execute format(
      'create policy "le %I da revenda" on public.%I for select to authenticated
         using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))',
      t, t
    );
  end loop;
end $$;

-- Escrita so pelo servidor (service role), como o Check Global: a acao
-- confere a permissao antes. Catalogo (modelos/itens) idem.

-- ------------------------------------------------------------------
-- 6) SEMENTE: Preventiva do Gerador, a partir do Forms em uso
-- ------------------------------------------------------------------
insert into public.manut_prev_modelos (revenda_id, nome, equipamento, emoji, periodicidade_dias, ordem)
select r.id, 'Preventiva do Gerador', 'Gerador', E'⚡', 7, 1
from public.revendas r
on conflict (revenda_id, nome) do nothing;

-- Itens na ordem do Forms. Os condicionais entram depois, porque
-- precisam do id do item de que dependem.
insert into public.manut_prev_itens
  (modelo_id, revenda_id, ordem, pergunta, ajuda, tipo, opcoes, unidade, casas_decimais, obrigatorio)
select m.id, m.revenda_id, i.ordem, i.pergunta, i.ajuda, i.tipo, i.opcoes, i.unidade, i.casas, i.obrig
from public.manut_prev_modelos m
cross join (
  values
    (1, 'O gerador está com painel de comando ligado?', null,
     'sim_nao', '{}'::text[], null, 0, true),
    (2, 'O comando está na opção "manual" para realizar a preventiva?', null,
     'sim_nao', '{}'::text[], null, 0, true),
    (3, 'Fornecimento de rede trifásica da concessionária', 'Tensão de cada fase, em volts.',
     'trifasico', '{}'::text[], 'V', 0, true),
    (4, 'Tensão da bateria', 'Valor lido no multímetro, em volts.',
     'numero', '{}'::text[], 'V', 2, true),
    (5, 'Nível de água no reservatório', null,
     'opcao', '{Cheio,Incompleto,Baixo}'::text[], null, 0, true),
    (7, 'Nível do óleo do motor', null,
     'opcao', '{"Em bom estado","Precisa completar","Vencido por data","Precisa trocar"}'::text[], null, 0, true),
    (8, 'Nível do combustível', 'Quanto resta no tanque, em porcentagem.',
     'numero', '{}'::text[], '%', 0, true),
    (9, 'Foi necessário reabastecer?', null,
     'sim_nao', '{}'::text[], null, 0, true),
    (11, 'Funcionamento no teste de partida (10 minutos)', null,
     'opcao', '{Normal,"Falhou no início e normalizou","Falhando durante todo o teste"}'::text[], null, 0, true),
    (12, 'Tensão do gerador durante o teste', 'Tensão de cada fase, em volts.',
     'trifasico', '{}'::text[], 'V', 0, true),
    (13, 'Ao finalizar, o painel ficou na opção "automático"?', null,
     'sim_nao', '{}'::text[], null, 0, true),
    (14, 'Limpeza e organização do ambiente', 'Nota de 1 a 5.',
     'nota', '{}'::text[], null, 0, true)
) as i(ordem, pergunta, ajuda, tipo, opcoes, unidade, casas, obrig)
where m.nome = 'Preventiva do Gerador'
on conflict (modelo_id, ordem) do nothing;

-- Condicionais: litros de água (se o nível não estiver cheio) e litros
-- de combustível (se houve reabastecimento).
insert into public.manut_prev_itens
  (modelo_id, revenda_id, ordem, pergunta, ajuda, tipo, unidade, casas_decimais, obrigatorio,
   depende_item_id, depende_valores)
select m.id, m.revenda_id, 6, 'Quantos litros de água foram completados?', null,
       'numero', 'L', 1, true, pai.id, '{Incompleto,Baixo}'::text[]
from public.manut_prev_modelos m
join public.manut_prev_itens pai on pai.modelo_id = m.id and pai.ordem = 5
where m.nome = 'Preventiva do Gerador'
on conflict (modelo_id, ordem) do nothing;

insert into public.manut_prev_itens
  (modelo_id, revenda_id, ordem, pergunta, ajuda, tipo, unidade, casas_decimais, obrigatorio,
   depende_item_id, depende_valores)
select m.id, m.revenda_id, 10, 'Quantos litros foram abastecidos?', null,
       'numero', 'L', 1, true, pai.id, '{true}'::text[]
from public.manut_prev_modelos m
join public.manut_prev_itens pai on pai.modelo_id = m.id and pai.ordem = 9
where m.nome = 'Preventiva do Gerador'
on conflict (modelo_id, ordem) do nothing;

notify pgrst, 'reload schema';
