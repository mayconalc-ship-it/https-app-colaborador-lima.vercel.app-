-- ==================================================================
-- 099 - Relato de Anomalia: gatilhos por indicador e o proprio relato
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (05/09/2026): gatilho por indicador com
-- "Media + desvio padrao x 2", editavel; quando dispara, chega
-- notificacao e abre uma pendencia para a lideranca registrar o relato
-- de anomalia -- que e o 5 porques daquele indicador.
--
-- O formulario e o "Relato de Anomalia - PDV 2994" que ele anexou,
-- campo a campo: sintoma, participantes, 5 porques, padronizacao (8
-- perguntas), plano de acao e assinatura do gestor.
--
-- TRES TABELAS, e a divisao segue o tempo de vida de cada coisa:
--   pa_gatilhos_anomalia   configuracao. Muda quando alguem decide.
--   pa_relatos_anomalia    o documento. Nasce de um disparo e e assinado.
--   pa_relato_acoes        o plano. Muda depois do relato fechar.

-- ------------------------------------------------------------------
-- 1) O GATILHO, POR INDICADOR
-- ------------------------------------------------------------------
create table if not exists public.pa_gatilhos_anomalia (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,

  -- A chave do indicador em lib/metas.ts ("avaria_pct", "rating_nota_media"...).
  -- Texto e nao FK porque o catalogo de metas mora no CODIGO: e la que
  -- cada indicador declara rotulo, sufixo e SENTIDO, e duplicar isso numa
  -- tabela criaria duas verdades que divergem no primeiro cadastro.
  indicador text not null,

  ativo boolean not null default true,

  -- Quantos desvios padrao. 2 e o pedido; editavel porque indicador
  -- barulhento pede 3 e indicador critico pode pedir menos.
  sigmas numeric(4,2) not null default 2 check (sigmas > 0 and sigmas <= 6),

  -- O limite escrito a mao MANDA na formula quando preenchido.
  --
  -- Nao e um extra: medido em 05/09/2026, a % de avaria de Sao Felix tem
  -- media 32% e desvio 34 -- o limite estatistico daria 100,9%, acima do
  -- maximo possivel, e o gatilho NUNCA dispararia. Indicador sem linha de
  -- base pede regra de negocio, nao formula.
  limite_manual numeric(12,3),

  -- Quantas medicoes a serie precisa ter. Fica por indicador porque a
  -- frequencia muda: diario junta 20 pontos em um mes, mensal leva quase
  -- dois anos.
  minimo_pontos smallint not null default 20 check (minimo_pontos >= 2),

  -- Quem e cobrado quando dispara. Nulo = a lideranca do modulo.
  responsavel_id uuid,
  responsavel_nome text,

  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint pa_gatilho_unico unique (revenda_id, indicador)
);

create index if not exists pa_gatilhos_anomalia_revenda_idx
  on public.pa_gatilhos_anomalia (revenda_id, ativo);

-- ------------------------------------------------------------------
-- 2) O RELATO
-- ------------------------------------------------------------------
create table if not exists public.pa_relatos_anomalia (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  gatilho_id uuid references public.pa_gatilhos_anomalia(id) on delete set null,

  -- O QUE DISPAROU, congelado no momento do disparo.
  --
  -- Copia, e nao consulta: a media e o desvio mudam a cada dia novo, e um
  -- relato que recalcula o proprio limite deixaria de explicar por que foi
  -- aberto. Seis meses depois, o auditor precisa ver o numero que valia
  -- naquele dia.
  indicador text not null,
  indicador_rotulo text not null,
  dia_do_disparo date not null,
  valor numeric(12,3) not null,
  limite numeric(12,3) not null,
  media numeric(12,3),
  desvio numeric(12,3),
  regra text not null check (regra in ('pico', 'deriva', 'manual')),
  explicacao text not null,

  -- CABECALHO DO PAPEL
  area text,
  sala text,
  natureza text check (natureza in ('unica', 'repetitiva')),
  ic_iv text,
  sintoma text,
  participantes text[] not null default '{}',

  -- ANALISE DA CAUSA -- os cinco porques, na ordem.
  porques text[] not null default '{}',

  -- PADRONIZACAO -- as 8 perguntas sim/nao, por id (ver
  -- PERGUNTAS_PADRONIZACAO em lib/relato-anomalia.ts). JSONB porque a
  -- lista pode ganhar uma pergunta sem migration, e porque nenhuma delas
  -- e consultada isoladamente.
  padronizacao jsonb not null default '{}'::jsonb,

  -- FECHAMENTO
  status text not null default 'aberto'
    check (status in ('aberto', 'em_analise', 'plano_definido', 'concluido', 'eficacia_verificada')),
  responsavel_nome text,
  gestor_nome text,
  assinatura_gestor text,
  assinado_em timestamptz,
  finalizado_em date,

  -- A verificacao de eficacia -- o estado que o papel nao tem e o
  -- auditor pergunta.
  eficacia_verificada_em timestamptz,
  eficacia_observacao text,

  aberto_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now()
);

create index if not exists pa_relatos_anomalia_revenda_idx
  on public.pa_relatos_anomalia (revenda_id, status, dia_do_disparo desc);

-- UM RELATO ABERTO POR INDICADOR, e essa e a trava que impede o painel
-- de virar spam: enquanto o desvio de ontem nao foi tratado, o de hoje
-- nao abre um segundo documento -- ele e o mesmo problema.
create unique index if not exists pa_relato_aberto_unico
  on public.pa_relatos_anomalia (revenda_id, indicador)
  where status in ('aberto', 'em_analise', 'plano_definido');

-- ------------------------------------------------------------------
-- 3) O PLANO DE ACAO
-- ------------------------------------------------------------------
-- Tabela propria, e nao JSONB: acao tem dono e prazo, e o painel precisa
-- listar "o que esta atrasado" ATRAVESSANDO os relatos. Dentro de um
-- jsonb isso viraria varredura em todo documento a cada abertura de tela.
create table if not exists public.pa_relato_acoes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  relato_id uuid not null references public.pa_relatos_anomalia(id) on delete cascade,

  ordem smallint not null default 0,
  topico text not null check (topico in ('imediata', 'corretiva', 'causa_raiz')),
  o_que text not null,
  como text,
  quem text not null,
  prazo date,
  status text not null default 'pendente'
    check (status in ('pendente', 'em_andamento', 'concluida')),
  concluida_em date,
  criado_em timestamptz not null default now()
);

create index if not exists pa_relato_acoes_relato_idx
  on public.pa_relato_acoes (relato_id, ordem);
-- O indice do painel: "o que esta atrasado", atravessando os relatos.
create index if not exists pa_relato_acoes_prazo_idx
  on public.pa_relato_acoes (revenda_id, status, prazo);

-- ------------------------------------------------------------------
-- 4) RLS
-- ------------------------------------------------------------------
-- Leitura por revenda: o relato de anomalia nao e segredo -- ele existe
-- para ser visto, e o time saber que o desvio esta sendo tratado e parte
-- do metodo. Escrita so pelo servidor, que ja confere requireModulo.
alter table public.pa_gatilhos_anomalia enable row level security;
alter table public.pa_relatos_anomalia enable row level security;
alter table public.pa_relato_acoes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pa_gatilhos_anomalia', 'pa_relatos_anomalia', 'pa_relato_acoes']
  loop
    execute format('drop policy if exists "le %I da propria revenda" on public.%I', t, t);
    execute format(
      'create policy "le %I da propria revenda" on public.%I for select to authenticated
         using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))',
      t, t
    );
  end loop;
end $$;

grant select on
  public.pa_gatilhos_anomalia, public.pa_relatos_anomalia, public.pa_relato_acoes
  to authenticated;
grant all on
  public.pa_gatilhos_anomalia, public.pa_relatos_anomalia, public.pa_relato_acoes
  to service_role;

-- ------------------------------------------------------------------
-- 5) LIGA O MODULO NAS REVENDAS
-- ------------------------------------------------------------------
-- Sem esta linha a tela existe e ninguem entra: `revendaTemModulo` le
-- `revenda_modulos`, e modulo sem registro e modulo desligado. Ligar
-- aqui evita o "criei a tela e ela some" -- que aconteceu ao subir esta
-- migration pela primeira vez.
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'relato-anomalia', true
from public.revendas r
on conflict (revenda_id, modulo) do update set ativo = true;

notify pgrst, 'reload schema';

-- Confira: as tres tabelas criadas, e o modulo ligado nas revendas.
select
  (select count(*) from public.pa_gatilhos_anomalia) as gatilhos,
  (select count(*) from public.pa_relatos_anomalia) as relatos,
  (select count(*) from public.pa_relato_acoes) as acoes,
  (select count(*) from public.revenda_modulos
    where modulo = 'relato-anomalia' and ativo) as revendas_com_o_modulo;
