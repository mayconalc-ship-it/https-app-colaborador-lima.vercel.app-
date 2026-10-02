-- ==================================================================
-- 157 - Base de fornecedores e RACI da manutencao (DPO 2.2, V.3 e V.4)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- Depende da 156 (Check de Manutencao). Pode rodar mais de uma vez.
-- ==================================================================
-- V.3: base de fornecedores disponivel para TODA a unidade consultar;
--      o time inclui e atualiza os contatos.
-- V.4: RACI vigente entre as areas da unidade e os fornecedores
--      externos; a base traz contato, ANS, tipo de servico e custo; ha
--      rotina para os itens criticos; o ANS e revisto com o fornecedor
--      quando o servico nao foi adequado.
--
-- Tabelas:
--   manut_fornecedores     a base (aba "Base de fornecedores" da planilha)
--   manut_raci_papeis      as colunas: areas da unidade e fornecedores
--   manut_raci_atividades  as linhas: o que precisa ser feito
--   manut_raci_celulas     a letra (R/A/C/I) de cada papel em cada linha
--   manut_raci_revisoes    quando a matriz foi revista (vale 90 dias)
--
-- A RACI nasce como SUGESTAO: so passa a "vigente" depois da primeira
-- revisao registrada no app pelo time.
-- ==================================================================

-- ------------------------------------------------------------------
-- 1) Base de fornecedores
-- ------------------------------------------------------------------
create table if not exists public.manut_fornecedores (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 120),
  categoria text not null default 'manutencao' check (categoria in ('manutencao', 'seguranca', 'rota', 'outro')),
  tipo_servico text not null check (char_length(tipo_servico) between 2 and 160),
  telefone text not null check (char_length(telefone) between 3 and 40),
  cidade text check (cidade is null or char_length(cidade) <= 80),
  frequencia text not null default 'raro' check (frequencia in ('comum', 'raro')),
  -- ANS = acordo de nivel de servico ("atende em ate 4 h").
  ans text check (ans is null or char_length(ans) <= 300),
  custo text check (custo is null or char_length(custo) <= 200),
  -- Atende item critico do checklist: precisa de ANS na base.
  critico boolean not null default false,
  situacao_ans text not null default 'em_dia' check (situacao_ans in ('em_dia', 'revisar')),
  motivo_revisao text check (motivo_revisao is null or char_length(motivo_revisao) <= 500),
  ans_revisada_em date,
  observacao text check (observacao is null or char_length(observacao) <= 500),
  ativo boolean not null default true,
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_por_nome text,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  constraint manut_fornecedor_unico unique (revenda_id, nome)
);
create index if not exists manut_fornecedores_revenda_idx on public.manut_fornecedores (revenda_id, categoria, nome);

-- ------------------------------------------------------------------
-- 2) RACI
-- ------------------------------------------------------------------
create table if not exists public.manut_raci_papeis (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 60),
  tipo text not null default 'area' check (tipo in ('area', 'fornecedor')),
  ordem smallint not null default 0,
  ativo boolean not null default true,
  constraint manut_raci_papel_unico unique (revenda_id, nome)
);

create table if not exists public.manut_raci_atividades (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null check (char_length(nome) between 3 and 200),
  -- Rotina de item critico (V.4): aparece destacada na matriz.
  critica boolean not null default false,
  ordem smallint not null default 0,
  ativo boolean not null default true,
  constraint manut_raci_atividade_unica unique (revenda_id, nome)
);

create table if not exists public.manut_raci_celulas (
  atividade_id uuid not null references public.manut_raci_atividades(id) on delete cascade,
  papel_id uuid not null references public.manut_raci_papeis(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  letra text not null check (letra in ('R', 'A', 'C', 'I')),
  atualizado_por_nome text,
  atualizado_em timestamptz not null default now(),
  primary key (atividade_id, papel_id)
);
create index if not exists manut_raci_celulas_revenda_idx on public.manut_raci_celulas (revenda_id);

create table if not exists public.manut_raci_revisoes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  revisada_em date not null default current_date,
  revisada_por uuid references auth.users(id) on delete set null,
  revisada_por_nome text not null,
  observacao text check (observacao is null or char_length(observacao) <= 500),
  criado_em timestamptz not null default now()
);
create index if not exists manut_raci_revisoes_revenda_idx on public.manut_raci_revisoes (revenda_id, revisada_em desc);

-- So o servidor (service role) le e grava; ele confere revenda e acesso.
alter table public.manut_fornecedores enable row level security;
alter table public.manut_raci_papeis enable row level security;
alter table public.manut_raci_atividades enable row level security;
alter table public.manut_raci_celulas enable row level security;
alter table public.manut_raci_revisoes enable row level security;

-- ------------------------------------------------------------------
-- 3) A base de Barreiras, da aba "Base de fornecedores" da planilha.
--    Os criticos (energia, agua, predial) entram SEM ANS de proposito:
--    o app cobra o time de preencher com o fornecedor.
-- ------------------------------------------------------------------
insert into public.manut_fornecedores
  (revenda_id, nome, categoria, tipo_servico, telefone, cidade, frequencia, critico, atualizado_por_nome)
select 'fc365d16-ccbd-4322-ae02-e992a36861e8'::uuid, f.nome, f.categoria, f.tipo, f.telefone, f.cidade, f.frequencia, f.critico, 'Planilha da manutenção'
from (
  values
    ('TEC CLIMA AR-CONDICIONADO', 'manutencao', 'Conserto de ar-condicionado', '77 99802-7417', 'Barreiras', 'comum', false),
    ('OSMAR CONSTRUÇÃO', 'manutencao', 'Manutenção predial (geral)', '77 99804-2088', 'Barreiras', 'raro', true),
    ('BRANDÃO PARAFUSO', 'manutencao', 'Manutenção predial', '77 99850-7831', 'Barreiras', 'raro', false),
    ('CASA DA REFRIGERAÇÃO', 'manutencao', 'Conserto de ar-condicionado', '77 99161-0043', 'Barreiras', 'comum', false),
    ('IDEIA COMUNICAÇÃO E PINTURAS', 'manutencao', 'Manutenção predial (geral)', '77 9905-1020', 'Barreiras', 'raro', false),
    ('LUZ SOLAR ELÉTRICA', 'manutencao', 'Energia (elétrica)', '77 99855-0352', 'Barreiras', 'raro', true),
    ('EMBASA', 'manutencao', 'Água e saneamento', '77 3612-9300', 'Barreiras', 'raro', true),
    ('COELBA', 'manutencao', 'Energia (concessionária)', '77 3611-9997', 'Barreiras', 'raro', true),
    ('Polícia Militar', 'seguranca', 'Em caso de risco de assalto', '190', 'Barreiras', 'raro', false),
    ('SAMU', 'seguranca', 'Em caso de emergência médica', '192', 'Barreiras', 'raro', false),
    ('Bombeiros', 'seguranca', 'Em caso de risco de incêndio', '193', 'Barreiras', 'raro', false),
    ('Polícia Rodoviária Federal', 'seguranca', 'Em caso de risco de assalto na estrada', '191', 'Barreiras', 'raro', false),
    ('HOTEL LIMA', 'rota', 'Hotel / restaurante', '(77) 98120-4881', 'Luís Eduardo Magalhães', 'comum', false),
    ('POUSADA MENDONÇA', 'rota', 'Hotel / restaurante', '(77) 99702-4671', 'São Desidério', 'comum', false),
    ('POUSADA ESTRELA DALVA', 'rota', 'Hotel / restaurante', '(61) 99609-1556', 'Riachão das Neves', 'comum', false),
    ('POUSADA PINHEIRO', 'rota', 'Hotel', '(77) 98126-7079', 'Formosa do Rio Preto', 'comum', false),
    ('CASA DO ESPETO', 'rota', 'Restaurante', '(77) 99937-0464', 'Formosa do Rio Preto', 'comum', false),
    ('HOTEL CERRADO', 'rota', 'Hotel / restaurante', '(77) 99944-7117', 'Roda Velha', 'comum', false),
    ('POUSADA JABURU', 'rota', 'Hotel / restaurante', '(77) 98863-1332', 'Cotegipe', 'comum', false),
    ('POUSADA CEARÁ', 'rota', 'Hotel / restaurante', '(77) 99958-5680', 'Santa Rita de Cássia', 'comum', false),
    ('POUSADA PIONEIRA', 'rota', 'Hotel', '(77) 99868-2552', 'Mansidão', 'comum', false),
    ('SABOR DA CASA', 'rota', 'Restaurante', '(77) 99994-0961', 'Mansidão', 'comum', false),
    ('HOTEL DIVISA', 'rota', 'Hotel / restaurante', '(62) 99830-1842', 'Rosário', 'comum', false),
    ('POUSADA PORTAL', 'rota', 'Hotel', '(77) 99931-6228', 'Javi', 'comum', false),
    ('ESPETINHO SHOW', 'rota', 'Restaurante', '(77) 99912-9722', 'Javi', 'comum', false),
    ('HOTEL NUNES', 'rota', 'Hotel', '(77) 99976-7818', 'Cristópolis', 'comum', false)
) as f(nome, categoria, tipo, telefone, cidade, frequencia, critico)
where exists (select 1 from public.revendas r where r.id = 'fc365d16-ccbd-4322-ae02-e992a36861e8')
on conflict (revenda_id, nome) do nothing;

-- ------------------------------------------------------------------
-- 4) A RACI sugerida, nas duas revendas (o time ajusta e revisa)
-- ------------------------------------------------------------------
insert into public.manut_raci_papeis (revenda_id, nome, tipo, ordem)
select r.id, p.nome, p.tipo, p.ordem
from public.revendas r
cross join (
  values
    ('Gerente de Operações', 'area', 1),
    ('Manutenção', 'area', 2),
    ('Administrativo / Financeiro', 'area', 3),
    ('Armazém', 'area', 4),
    ('Fornecedor contratado', 'fornecedor', 5),
    ('Concessionária (energia / água)', 'fornecedor', 6)
) as p(nome, tipo, ordem)
where r.id in ('7afe4da5-e846-4b02-947f-96843a2791fe', 'fc365d16-ccbd-4322-ae02-e992a36861e8')
on conflict (revenda_id, nome) do nothing;

insert into public.manut_raci_atividades (revenda_id, nome, critica, ordem)
select r.id, a.nome, a.critica, a.ordem
from public.revendas r
cross join (
  values
    ('Fazer o Check de Manutenção trimestral (com fotos)', false, 1),
    ('Item crítico abaixo de 3: acionar e acompanhar o reparo de curto prazo', true, 2),
    ('Falta de energia ou de água: acionar a concessionária', true, 3),
    ('Abrir o chamado com o fornecedor (reparo ou preventiva)', false, 4),
    ('Executar o serviço de manutenção', false, 5),
    ('Aprovar o orçamento e o custo do serviço', false, 6),
    ('Conferir o serviço entregue', false, 7),
    ('Serviço não adequado: revisar o ANS com o fornecedor', false, 8),
    ('Manter a base de fornecedores atualizada', false, 9),
    ('Pagar o fornecedor', false, 10)
) as a(nome, critica, ordem)
where r.id in ('7afe4da5-e846-4b02-947f-96843a2791fe', 'fc365d16-ccbd-4322-ae02-e992a36861e8')
on conflict (revenda_id, nome) do nothing;

-- As letras sugeridas: um A e ao menos um R por linha.
insert into public.manut_raci_celulas (atividade_id, papel_id, revenda_id, letra, atualizado_por_nome)
select a.id, p.id, a.revenda_id, c.letra, 'Sugestão inicial'
from (
  values
    (1, 'Gerente de Operações', 'A'), (1, 'Manutenção', 'R'), (1, 'Armazém', 'C'), (1, 'Administrativo / Financeiro', 'I'),
    (2, 'Gerente de Operações', 'A'), (2, 'Manutenção', 'R'), (2, 'Fornecedor contratado', 'R'), (2, 'Administrativo / Financeiro', 'C'), (2, 'Armazém', 'I'),
    (3, 'Manutenção', 'A'), (3, 'Concessionária (energia / água)', 'R'), (3, 'Gerente de Operações', 'I'), (3, 'Armazém', 'I'),
    (4, 'Manutenção', 'R'), (4, 'Gerente de Operações', 'A'), (4, 'Armazém', 'C'), (4, 'Fornecedor contratado', 'I'),
    (5, 'Fornecedor contratado', 'R'), (5, 'Manutenção', 'A'), (5, 'Armazém', 'I'), (5, 'Gerente de Operações', 'I'),
    (6, 'Administrativo / Financeiro', 'R'), (6, 'Gerente de Operações', 'A'), (6, 'Manutenção', 'C'), (6, 'Fornecedor contratado', 'I'),
    (7, 'Manutenção', 'R'), (7, 'Gerente de Operações', 'A'), (7, 'Armazém', 'C'), (7, 'Fornecedor contratado', 'I'),
    (8, 'Manutenção', 'R'), (8, 'Gerente de Operações', 'A'), (8, 'Administrativo / Financeiro', 'C'), (8, 'Fornecedor contratado', 'C'),
    (9, 'Manutenção', 'R'), (9, 'Gerente de Operações', 'A'), (9, 'Administrativo / Financeiro', 'C'), (9, 'Armazém', 'I'),
    (10, 'Administrativo / Financeiro', 'R'), (10, 'Gerente de Operações', 'A'), (10, 'Manutenção', 'I'), (10, 'Fornecedor contratado', 'I')
) as c(ordem, papel, letra)
join public.manut_raci_atividades a on a.ordem = c.ordem
join public.manut_raci_papeis p on p.revenda_id = a.revenda_id and p.nome = c.papel
where a.revenda_id in ('7afe4da5-e846-4b02-947f-96843a2791fe', 'fc365d16-ccbd-4322-ae02-e992a36861e8')
  -- So a sugestao de partida: revenda que ja tem matriz fica como esta
  -- (rodar de novo nao devolve uma letra que o time apagou).
  and not exists (select 1 from public.manut_raci_celulas x where x.revenda_id = a.revenda_id)
on conflict (atividade_id, papel_id) do nothing;

notify pgrst, 'reload schema';

-- Confira: 26 fornecedores em Barreiras; 6 papeis, 10 atividades e 40 letras por revenda.
select 'fornecedores em ' || r.nome as item, count(*)::text as valor
from public.manut_fornecedores f join public.revendas r on r.id = f.revenda_id group by r.nome
union all
select 'papeis RACI em ' || r.nome, count(*)::text
from public.manut_raci_papeis p join public.revendas r on r.id = p.revenda_id group by r.nome
union all
select 'atividades RACI em ' || r.nome, count(*)::text
from public.manut_raci_atividades a join public.revendas r on r.id = a.revenda_id group by r.nome
union all
select 'letras RACI em ' || r.nome, count(*)::text
from public.manut_raci_celulas c join public.revendas r on r.id = c.revenda_id group by r.nome;
