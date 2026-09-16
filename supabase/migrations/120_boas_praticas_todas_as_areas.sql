-- ==================================================================
-- 120 - BOAS PRATICAS: o programa vale para TODAS as areas
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (15/09/2026): "acrescente todas as areas, o programa ira
-- abranger a todos".
--
-- Marcar DU e AL nao resolveria: o app so traduz essas duas do texto do
-- cadastro (ver areaDoColaborador). Em Sao Felix ha gente com FINANCEIRO e
-- GENTE, que nao vira nem DU nem AL e ficaria de fora -- e amanha uma area
-- nova cairia no mesmo buraco.
--
-- Por isso um interruptor: com ele ligado, participa TODO MUNDO da
-- revenda, inclusive quem esta sem area reconhecida. A lista de areas
-- continua guardada para quando o programa voltar a ser por area.

alter table public.boas_praticas_config
  add column if not exists todas_areas boolean not null default false;

-- A lista de areas deixa de ser obrigatoria: com "todas" ligado ela nao
-- significa nada, e exigir pelo menos uma so atrapalharia.
alter table public.boas_praticas_config
  drop constraint if exists boas_praticas_config_areas_check;
alter table public.boas_praticas_config
  add constraint boas_praticas_config_areas_check
  check (areas <@ array['DU', 'AL']::text[]);

-- Liga nas duas revendas, e devolve a lista cheia (Sao Felix estava so
-- com AL) para o dia em que o interruptor for desligado.
update public.boas_praticas_config
set todas_areas = true,
    areas = array['DU', 'AL']::text[],
    atualizado_em = now()
where revenda_id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
);

-- Confira: duas linhas com todas_areas = true.
select r.nome, c.todas_areas, c.areas, c.sugestoes_ate, c.votacao_ate, c.divulgacao_em
from public.boas_praticas_config c
join public.revendas r on r.id = c.revenda_id
order by r.nome;
