-- ==================================================================
-- 107 - Base de clientes (telefone) e o "ja avisei" do monitoramento
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Dois pedidos do dono (07/09/2026), no mesmo assunto: o monitoramento de
-- rota falando com o PDV antes da entrega.
--
--   1. "telefone do PDV eu tenho dentro da base de clientes (...) seria
--      melhor linkar ela a busca dos pdvs, pois ela estara completa e
--      atualizada (...) colocaria no google drive e incluiria o link no
--      app para fazer a conexao".
--   2. "marcar ja avisei por cliente/data".
--
-- POR QUE A BASE INTEIRA NAO ENTRA AQUI. A planilha tem ~10 MB e todas as
-- informacoes do cliente. O app guarda so as colunas que ele usa --
-- codigo, nome, telefone, cidade, bairro, endereco -- e descarta o resto
-- na leitura. Copiar a planilha inteira para o Postgres criaria uma
-- segunda verdade sobre o cliente, que envelhece sozinha e ninguem sabe
-- qual das duas vale; guardar o recorte mantem o Drive como dono do dado.

-- ------------------------------------------------------------------
-- 1) A BASE DE CLIENTES
-- ------------------------------------------------------------------
create table if not exists public.pa_pdv_clientes (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- Ja normalizado (sem zeros a esquerda), que e a forma como o resto do
  -- app procura cliente. Guardar "0002178" obrigaria toda consulta a
  -- normalizar dos dois lados -- e a primeira que esquecesse nao acharia
  -- nada, calada.
  cod_pdv text not null,
  nome text,
  -- So digitos, com DDI e DDD: "5577999998888". E o formato que o link do
  -- WhatsApp exige, e guardar formatado obrigaria a limpar em toda leitura.
  telefone text,
  cidade text,
  bairro text,
  endereco text,
  atualizado_em timestamptz not null default now(),
  primary key (revenda_id, cod_pdv)
);

comment on table public.pa_pdv_clientes is
  'Recorte da base de clientes do Drive: so o que o app usa. O dono do dado continua sendo a planilha -- aqui e copia, refeita a cada importacao.';
comment on column public.pa_pdv_clientes.telefone is
  'So digitos, com DDI e DDD (5577999998888). Vazio quando a planilha nao traz, ou quando o numero nao tem tamanho de telefone brasileiro.';

create index if not exists idx_pa_pdv_clientes_nome
  on public.pa_pdv_clientes (revenda_id, nome);

alter table public.pa_pdv_clientes enable row level security;

-- Leitura para quem esta logado; escrita so pela service role (o import).
-- Mesmo desenho das outras bases importadas.
drop policy if exists "pa_pdv_clientes_leitura" on public.pa_pdv_clientes;
create policy "pa_pdv_clientes_leitura" on public.pa_pdv_clientes
  for select to authenticated using (true);

-- ------------------------------------------------------------------
-- 2) O LINK DA PLANILHA
-- ------------------------------------------------------------------
create table if not exists public.pa_pdv_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  clientes_link text,
  clientes_importado_em timestamptz,
  clientes_total integer,
  atualizado_em timestamptz not null default now()
);

comment on column public.pa_pdv_config.clientes_link is
  'Link do Drive para a planilha (ou pasta) da base de clientes. Uma linha por revenda: a base de Sao Felix nao e a de Barreiras.';

alter table public.pa_pdv_config enable row level security;
drop policy if exists "pa_pdv_config_leitura" on public.pa_pdv_config;
create policy "pa_pdv_config_leitura" on public.pa_pdv_config
  for select to authenticated using (true);

-- ------------------------------------------------------------------
-- 3) O "JA AVISEI"
-- ------------------------------------------------------------------
-- Por PARTICULARIDADE e por DATA DE ENTREGA, e nao por cliente e dia.
-- Um cliente pode ter duas particularidades no mesmo dia -- horario e
-- bloqueio, por exemplo -- e sao dois avisos diferentes, um resolvido pelo
-- monitoramento e o outro pelo comercial. Marcar "avisei o cliente" nos
-- dois de uma vez esconderia o segundo sem ninguem ter tratado.
create table if not exists public.pa_pdv_avisos_enviados (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  particularidade_id uuid not null references public.pa_pdv_particularidades(id) on delete cascade,
  -- A data da ENTREGA, nao a de hoje: avisar na vespera e o objetivo do
  -- modulo, e a marca precisa valer para o dia da entrega.
  data date not null,
  cod_pdv text not null,
  avisado_por uuid references public.profiles(id) on delete set null,
  avisado_por_nome text,
  avisado_em timestamptz not null default now(),
  observacao text,
  unique (revenda_id, particularidade_id, data)
);

comment on table public.pa_pdv_avisos_enviados is
  'Registro de que o monitoramento falou com o PDV sobre uma particularidade, para a entrega daquela data. Evita a segunda ligacao e mostra o que foi feito na preventiva.';

create index if not exists idx_pa_pdv_avisos_data
  on public.pa_pdv_avisos_enviados (revenda_id, data);

alter table public.pa_pdv_avisos_enviados enable row level security;
drop policy if exists "pa_pdv_avisos_leitura" on public.pa_pdv_avisos_enviados;
create policy "pa_pdv_avisos_leitura" on public.pa_pdv_avisos_enviados
  for select to authenticated using (true);

notify pgrst, 'reload schema';

-- Confira: as tres tabelas existem e estao vazias.
select 'pa_pdv_clientes' as tabela, count(*) from public.pa_pdv_clientes
union all
select 'pa_pdv_config', count(*) from public.pa_pdv_config
union all
select 'pa_pdv_avisos_enviados', count(*) from public.pa_pdv_avisos_enviados;
