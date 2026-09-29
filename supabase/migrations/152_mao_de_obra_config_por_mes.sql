-- ==================================================================
-- 152 - MAO DE OBRA: CONFIGURACAO CONGELADA POR MES (29/09/2026)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono: "cada mes seja congelado a configuracao daquele mes,
-- caso contrario ela mexe nos outros meses". Ate aqui os parametros da
-- operacao (tempos, percentuais, HL por mapa, curva de venda) eram UM
-- registro por revenda: mudar em outubro recalculava setembro, agosto...
-- e o quadro ja formalizado deixava de bater com o que foi enviado.
--
-- Agora cada mes tem a SUA copia. Salvar em Configurar altera so o mes
-- escolhido. Mes sem copia propria usa a do ultimo mes anterior que tem;
-- e antes de salvar, o app congela nos meses seguintes a configuracao que
-- eles estavam usando -- assim nenhum outro mes muda.
--
-- mao_obra_config continua existindo: vira o padrao para mes que nao
-- tem nenhuma configuracao antes dele.
-- ==================================================================

create table if not exists public.mao_obra_config_mes (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1),
  percentual_montagem numeric(6,4) not null,
  perc_blitz_carregamento numeric(6,4) not null,
  perc_blitz_refugo numeric(6,4) not null,
  perc_blitz_puxada numeric(6,4) not null,
  tempo_reposicao_picking numeric(8,6) not null,
  tempo_carregamento_caminhao numeric(8,6) not null,
  tma numeric(8,6) not null,
  hl_carreta numeric(10,2) not null,
  jornada numeric(8,6) not null,
  tempo_blitz numeric(8,6) not null,
  hl_por_mapa numeric(10,2) not null,
  sellout_seg numeric(6,3) not null default 0 check (sellout_seg between 0 and 100),
  sellout_ter numeric(6,3) not null default 0 check (sellout_ter between 0 and 100),
  sellout_qua numeric(6,3) not null default 0 check (sellout_qua between 0 and 100),
  sellout_qui numeric(6,3) not null default 0 check (sellout_qui between 0 and 100),
  sellout_sex numeric(6,3) not null default 0 check (sellout_sex between 0 and 100),
  sellout_sab numeric(6,3) not null default 0 check (sellout_sab between 0 and 100),
  sellout_dom numeric(6,3) not null default 0 check (sellout_dom between 0 and 100),
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text,
  primary key (revenda_id, competencia)
);

-- RLS: so o servidor le e escreve, como as outras tabelas do modulo.
alter table public.mao_obra_config_mes enable row level security;

-- Congela a configuracao de hoje em TODOS os meses ja lancados: e com ela
-- que cada um desses meses foi calculado ate agora.
insert into public.mao_obra_config_mes (
  revenda_id, competencia,
  percentual_montagem, perc_blitz_carregamento, perc_blitz_refugo, perc_blitz_puxada,
  tempo_reposicao_picking, tempo_carregamento_caminhao, tma, hl_carreta, jornada,
  tempo_blitz, hl_por_mapa,
  sellout_seg, sellout_ter, sellout_qua, sellout_qui, sellout_sex, sellout_sab, sellout_dom,
  atualizado_em, atualizado_por_nome
)
select
  m.revenda_id, m.competencia,
  c.percentual_montagem, c.perc_blitz_carregamento, c.perc_blitz_refugo, c.perc_blitz_puxada,
  c.tempo_reposicao_picking, c.tempo_carregamento_caminhao, c.tma, c.hl_carreta, c.jornada,
  c.tempo_blitz, c.hl_por_mapa,
  c.sellout_seg, c.sellout_ter, c.sellout_qua, c.sellout_qui, c.sellout_sex, c.sellout_sab, c.sellout_dom,
  now(), 'Congelada na migration 152 (configuracao vigente em 29/09/2026)'
from public.mao_obra_meses m
join public.mao_obra_config c on c.revenda_id = m.revenda_id
on conflict (revenda_id, competencia) do nothing;

notify pgrst, 'reload schema';

-- Confira: um registro por mes lancado, em cada revenda.
select r.nome, count(*) as meses_congelados,
       min(cm.competencia) as de, max(cm.competencia) as ate
from public.mao_obra_config_mes cm
join public.revendas r on r.id = cm.revenda_id
group by r.nome
order by r.nome;
