-- ==================================================================
-- 165 - Chamados de Manutencao (abertura por app e por QR Code)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (05/10/2026): trazer para o app o formulario
-- "CHAMADO DE MANUTENCAO" do Microsoft Forms, que hoje e aberto pelo QR
-- Code colado nas areas. Os campos sao os mesmos do Forms: unidade, area,
-- solicitante, telefone, tipo de O.S. e a descricao.
--
-- O que muda em relacao ao Forms:
--   * a unidade sai do proprio QR (e do vinculo, no app): ninguem escolhe
--     a revenda errada;
--   * cada AREA pode ter o seu QR: quem escaneia ja chega com a area
--     preenchida (o Forms tinha um QR so, e a pessoa rolava 29 opcoes);
--   * o chamado tem NUMERO, PRAZO e ANDAMENTO -- quem abriu acompanha e,
--     no fim, confirma se resolveu e da uma nota.
--
-- E o que o DPO cobra da manutencao (Checklist Global, migration 156):
--   8.1 ferramenta de abertura divulgada e gestao dos QR Codes;
--   8.2 prazo de execucao, priorizacao e chamado fechado indevidamente;
--   9.1 pesquisa de nivel de servico (a nota do solicitante);
--   9.2 chamados fechados no prazo e % de reabertos;
--   9.3 feedback de chamados (o aviso a quem abriu).
--
-- Tabelas:
--   chamados_config  prazos por prioridade e o token do QR geral da revenda
--   chamados_locais  as areas do Forms, cada uma com o codigo do seu QR
--   chamados         o chamado (numero sequencial por revenda)
--   chamados_eventos a linha do tempo (mudanca de status, comentario...)
--   chamados_fotos   fotos da abertura e da conclusao (bucket PRIVADO)
--
-- Permissao (texto livre nas tabelas de permissao):
--   "chamados"          a revenda ligou -> TODO MUNDO abre chamado. Na
--                       lideranca: ver = painel da Gestao, editar =
--                       locais/QR/prazos, excluir = apagar chamado de teste
--   "chamados-atender"  o time da manutencao, pessoa a pessoa (Acessos
--                       por Pessoa): a fila e o atendimento.
--
-- A PAGINA DO QR E ABERTA (sem login), como o Forms: /os/<codigo>. A
-- trava e o codigo do endereco, conferido no servidor -- e o mesmo
-- desenho da votacao por link (/votar, migration 132).
-- ==================================================================

insert into storage.buckets (id, name, public)
values ('chamados', 'chamados', false)
on conflict (id) do update set public = false;

-- ------------------------------------------------------------------
-- 1) Configuracao por revenda
-- ------------------------------------------------------------------
create table if not exists public.chamados_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  -- O QR GERAL da unidade (sem area): /os/<token_publico>.
  token_publico text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  -- Prazo de atendimento por prioridade, em horas corridas. Valores de
  -- partida; quem ajusta e a lideranca em Admin > Chamados.
  prazo_risco_horas integer not null default 4 check (prazo_risco_horas between 1 and 2160),
  prazo_urgente_horas integer not null default 24 check (prazo_urgente_horas between 1 and 2160),
  prazo_normal_horas integer not null default 72 check (prazo_normal_horas between 1 and 2160),
  atualizado_em timestamptz,
  atualizado_por_nome text
);

-- ------------------------------------------------------------------
-- 2) Locais (as areas do Forms)
-- ------------------------------------------------------------------
create table if not exists public.chamados_locais (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- O que vinha antes da barra no Forms ("Armazem/Picking"). '' = sem grupo.
  grupo text not null default '' check (char_length(grupo) <= 60),
  nome text not null check (char_length(nome) between 1 and 80),
  ordem smallint not null default 0,
  -- O codigo do QR desta area: /os/<codigo>. Trocar o codigo invalida o
  -- QR impresso (e o caminho para quando um cartaz vaza para fora).
  codigo text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint chamados_local_unico unique (revenda_id, grupo, nome)
);

-- ------------------------------------------------------------------
-- 3) O chamado
-- ------------------------------------------------------------------
create table if not exists public.chamados (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- Preenchido pelo gatilho abaixo: 1, 2, 3... por revenda.
  numero integer not null,
  -- O endereco de acompanhamento de quem abriu sem login: /os/acompanhar/<codigo>.
  codigo text not null unique default substr(md5(gen_random_uuid()::text), 1, 12),
  local_id uuid references public.chamados_locais(id) on delete set null,
  -- O nome da area NO DIA (fato): renomear o local nao reescreve o historico.
  local_nome text not null check (char_length(local_nome) between 1 and 150),
  tipo text not null check (tipo in ('alvenaria', 'eletrica', 'hidraulica', 'jardinagem', 'limpeza', 'mobiliario', 'outros')),
  prioridade text not null default 'normal' check (prioridade in ('normal', 'urgente', 'risco')),
  descricao text not null check (char_length(descricao) between 5 and 2000),
  solicitante_nome text not null check (char_length(solicitante_nome) between 2 and 120),
  solicitante_telefone text not null check (char_length(solicitante_telefone) between 8 and 20),
  -- Quem abriu pelo app (ou pelo QR com o app logado). Nulo = sem login.
  solicitante_id uuid references auth.users(id) on delete set null,
  origem text not null default 'app' check (origem in ('app', 'qr')),
  status text not null default 'aberto'
    check (status in ('aberto', 'em_atendimento', 'aguardando', 'concluido', 'cancelado')),
  responsavel_id uuid references auth.users(id) on delete set null,
  responsavel_nome text,
  prazo_em timestamptz not null,
  aberto_em timestamptz not null default now(),
  -- A primeira vez que alguem assumiu: o tempo de RESPOSTA.
  atendimento_em timestamptz,
  concluido_em timestamptz,
  solucao text check (solucao is null or char_length(solucao) <= 2000),
  -- O retorno de quem abriu. 'nao_resolvido' reabre o chamado.
  confirmacao text check (confirmacao in ('resolvido', 'nao_resolvido')),
  confirmado_em timestamptz,
  avaliacao smallint check (avaliacao between 1 and 5),
  avaliacao_comentario text check (avaliacao_comentario is null or char_length(avaliacao_comentario) <= 500),
  reaberturas smallint not null default 0,
  atualizado_em timestamptz not null default now(),
  constraint chamados_numero_unico unique (revenda_id, numero)
);

-- O numero do protocolo. Trava por revenda dentro da transacao: dois
-- chamados abertos no mesmo segundo nao pegam o mesmo numero.
create or replace function public.chamados_numerar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('chamados:' || new.revenda_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero
    from public.chamados
    where revenda_id = new.revenda_id;
  end if;
  return new;
end;
$$;

drop trigger if exists chamados_numerar on public.chamados;
create trigger chamados_numerar
  before insert on public.chamados
  for each row execute function public.chamados_numerar();

-- ------------------------------------------------------------------
-- 4) Linha do tempo e fotos
-- ------------------------------------------------------------------
create table if not exists public.chamados_eventos (
  id bigint generated always as identity primary key,
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  tipo text not null
    check (tipo in ('aberto', 'status', 'comentario', 'prioridade', 'confirmado', 'reaberto', 'avaliado')),
  status_para text,
  texto text check (texto is null or char_length(texto) <= 2000),
  autor_id uuid references auth.users(id) on delete set null,
  autor_nome text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.chamados_fotos (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  etapa text not null default 'abertura' check (etapa in ('abertura', 'conclusao')),
  caminho text not null,
  bytes integer,
  enviada_por_nome text not null,
  criado_em timestamptz not null default now()
);

create index if not exists chamados_locais_revenda_idx on public.chamados_locais (revenda_id, ordem);
create index if not exists chamados_revenda_status_idx on public.chamados (revenda_id, status, prazo_em);
create index if not exists chamados_revenda_aberto_idx on public.chamados (revenda_id, aberto_em desc);
create index if not exists chamados_solicitante_idx on public.chamados (solicitante_id, aberto_em desc);
create index if not exists chamados_eventos_chamado_idx on public.chamados_eventos (chamado_id, criado_em);
create index if not exists chamados_fotos_chamado_idx on public.chamados_fotos (chamado_id);

-- Leitura e escrita so pelo servidor (service role), que confere a
-- revenda e o modulo. RLS ligada sem politica = nenhum acesso direto.
alter table public.chamados_config enable row level security;
alter table public.chamados_locais enable row level security;
alter table public.chamados enable row level security;
alter table public.chamados_eventos enable row level security;
alter table public.chamados_fotos enable row level security;

-- ------------------------------------------------------------------
-- 5) Semente: config e as areas do Forms, nas duas revendas
--    (o Forms era um so para todas as unidades; area que nao existir
--    numa revenda e desligada em Admin > Chamados)
-- ------------------------------------------------------------------
insert into public.chamados_config (revenda_id)
select r.id from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix (Samavi)
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id) do nothing;

insert into public.chamados_locais (revenda_id, grupo, nome, ordem)
select r.id, l.grupo, l.nome, l.ordem
from public.revendas r
cross join (
  values
    ('Armazém', 'Sala Logística', 1),
    ('Armazém', 'Banheiro', 2),
    ('Armazém', 'Sala de Repack', 3),
    ('Armazém', 'Sala dos Conferentes', 4),
    ('Armazém', 'Retorno de Rota', 5),
    ('Armazém', 'Red Zone Central', 6),
    ('Armazém', 'Picking', 7),
    ('Armazém', 'Câmara Fria', 8),
    ('Armazém', 'Tenda', 9),
    ('Armazém', 'Posto de Combustível', 10),
    ('Armazém', 'Estação de GLP', 11),
    ('Armazém', 'MKT Place', 12),
    ('', 'Oficina', 13),
    ('', 'Casa do Gerador', 14),
    ('', 'Casa de Bomba', 15),
    ('', 'Vestiário Masculino', 16),
    ('', 'Vestiário Feminino', 17),
    ('', 'Sala Logística', 18),
    ('', 'Sala de Reunião', 19),
    ('', 'Sala ADM', 20),
    ('', 'Sala de Vendas', 21),
    ('', 'Sala CPD', 22),
    ('', 'Sala do Caixa', 23),
    ('', 'Refeitório', 24),
    ('Portaria', 'Banheiro Externo', 25),
    ('Portaria', 'Banheiro Interno', 26),
    ('Portaria', 'Guarita', 27),
    ('', 'Estacionamento Externo', 28),
    ('', 'Estacionamento Interno', 29)
) as l(grupo, nome, ordem)
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix (Samavi)
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id, grupo, nome) do nothing;

-- ------------------------------------------------------------------
-- 6) Liga os dois modulos. "chamados-atender" PRECISA da linha aqui:
--    revenda_modulos e conferido ANTES da liberacao da pessoa.
-- ------------------------------------------------------------------
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, m.modulo, true
from public.revendas r
cross join (values ('chamados'), ('chamados-atender')) as m(modulo)
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix (Samavi)
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id, modulo) do update set ativo = true;

notify pgrst, 'reload schema';

-- Confira: bucket privado, 29 locais por revenda, config e os dois modulos.
select 'bucket chamados publico?' as item, public::text as valor from storage.buckets where id = 'chamados'
union all
select 'locais em ' || r.nome, count(*)::text
from public.chamados_locais l join public.revendas r on r.id = l.revenda_id
group by r.nome
union all
select 'config em ' || r.nome, 'ok'
from public.chamados_config c join public.revendas r on r.id = c.revenda_id
union all
select rm.modulo || ' em ' || r.nome, rm.ativo::text
from public.revenda_modulos rm join public.revendas r on r.id = rm.revenda_id
where rm.modulo in ('chamados', 'chamados-atender');
