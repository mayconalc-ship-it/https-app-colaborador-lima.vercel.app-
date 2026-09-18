-- ==================================================================
-- 126 - QR CODE DE CONTINGENCIA E COMPROVANTES DE PAGAMENTO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (18/09/2026): quando o pagamento por QR Code do sistema
-- cai, o cliente paga no QR Code de contingencia (o PIX do CNPJ da
-- empresa). O motorista precisa ter esse QR no app e registrar o
-- comprovante: procura o mapa (como na pre-rota), acha o cliente, e tira
-- FOTO do comprovante -- obrigatoria, quantas quiser.
--
-- AS FOTOS SAO PRIVADAS. O bucket `conteudo` do app e publico (comunicado,
-- padrao, foto do 5S). Comprovante de pagamento de cliente nao e: fica num
-- bucket proprio, sem leitura publica, e a tela mostra por link assinado
-- que expira. Toda escrita passa pelo servidor (service role).

-- ------------------------------------------------------------------
-- O bucket privado
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do update set public = false;

-- ------------------------------------------------------------------
-- A configuracao: o QR e os dados do recebedor, um por revenda
-- ------------------------------------------------------------------
create table if not exists public.qr_contingencia_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  -- Caminho da imagem do QR dentro do bucket `comprovantes`.
  qr_caminho text,
  favorecido text check (favorecido is null or char_length(favorecido) <= 120),
  cnpj text check (cnpj is null or char_length(cnpj) <= 20),
  -- O "copia e cola" do PIX, para o cliente que paga pelo proprio celular.
  chave_pix text check (chave_pix is null or char_length(chave_pix) <= 600),
  instrucoes text check (instrucoes is null or char_length(instrucoes) <= 400),
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text
);

-- O CNPJ informado pelo dono (18/09/2026), ja preenchido nas duas
-- revendas. Falta so a IMAGEM do QR, que se envia pela tela (Modo
-- Lideranca > QR de Contingencia). Se Barreiras receber em outro CNPJ,
-- troca-se la mesmo.
insert into public.qr_contingencia_config (revenda_id, cnpj, atualizado_por_nome)
select r.id, '54751517000222', 'migration 126'
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe',
  'fc365d16-ccbd-4322-ae02-e992a36861e8'
)
on conflict (revenda_id) do nothing;

-- ------------------------------------------------------------------
-- O comprovante: um pagamento de um cliente
-- ------------------------------------------------------------------
create table if not exists public.qr_comprovantes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- O dia da operacao (fuso de Sao Paulo), gravado pelo servidor.
  data date not null,
  mapa text check (mapa is null or char_length(mapa) <= 20),
  cod_pdv text not null check (char_length(cod_pdv) between 1 and 20),
  cliente_nome text check (cliente_nome is null or char_length(cliente_nome) <= 160),
  cliente_cidade text check (cliente_cidade is null or char_length(cliente_cidade) <= 80),
  valor numeric(12,2) check (valor is null or (valor > 0 and valor <= 1000000)),
  observacao text check (observacao is null or char_length(observacao) <= 300),
  colaborador_id uuid references auth.users(id) on delete set null,
  colaborador_nome text not null,
  criado_em timestamptz not null default now()
);

create index if not exists qr_comprovantes_revenda_data_idx
  on public.qr_comprovantes (revenda_id, data desc);
create index if not exists qr_comprovantes_mapa_idx
  on public.qr_comprovantes (revenda_id, mapa);

-- As fotos: uma ou mais por comprovante (a obrigatoriedade e conferida na
-- acao, antes de gravar -- o comprovante so nasce junto das fotos).
create table if not exists public.qr_comprovante_fotos (
  id uuid primary key default gen_random_uuid(),
  comprovante_id uuid not null references public.qr_comprovantes(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  caminho text not null,
  criado_em timestamptz not null default now()
);

create index if not exists qr_comprovante_fotos_comprovante_idx
  on public.qr_comprovante_fotos (comprovante_id);

-- RLS ligada e SEM politica: so o servidor le e escreve. Dado financeiro
-- de cliente nao sai pelo navegador de ninguem sem passar pela checagem.
alter table public.qr_contingencia_config enable row level security;
alter table public.qr_comprovantes enable row level security;
alter table public.qr_comprovante_fotos enable row level security;

-- ------------------------------------------------------------------
-- Liga o modulo nas duas revendas
-- ------------------------------------------------------------------
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'qr-contingencia', true
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id, modulo) do update set ativo = true;

-- Acesso de partida: quem ja consulta a pre-rota (Minha Rota) ganha o
-- QR de contingencia -- e o mesmo publico, motorista e ajudante. Depois,
-- libera-se ou retira-se pessoa a pessoa em Acessos por Pessoa.
insert into public.colaborador_modulos_extra (colaborador_id, revenda_id, modulo, liberado_por)
select e.colaborador_id, e.revenda_id, 'qr-contingencia', e.liberado_por
from public.colaborador_modulos_extra e
where e.modulo = 'rotas'
on conflict (colaborador_id, revenda_id, modulo) do nothing;

notify pgrst, 'reload schema';

-- Confira: o bucket privado, o modulo nas duas revendas e quantas pessoas
-- ja receberam o acesso.
select 'bucket comprovantes publico?' as item, public::text as valor from storage.buckets where id = 'comprovantes'
union all
select 'modulo ligado em ' || r.nome, rm.ativo::text
from public.revenda_modulos rm join public.revendas r on r.id = rm.revenda_id
where rm.modulo = 'qr-contingencia'
union all
select 'pessoas com acesso em ' || r.nome, count(*)::text
from public.colaborador_modulos_extra e join public.revendas r on r.id = e.revenda_id
where e.modulo = 'qr-contingencia'
group by r.nome;
