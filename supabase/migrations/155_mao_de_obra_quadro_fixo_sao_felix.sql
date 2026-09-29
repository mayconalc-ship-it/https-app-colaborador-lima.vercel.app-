-- ==================================================================
-- 155 - MAO DE OBRA: QUADRO FIXO E PUXADA DE SAO FELIX (29/09/2026)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedidos do dono (29/09/2026):
--   "Operador de empilhadeira nao pode mexer, deve ficar sempre com 4"
--   "Conferente em dezembro tambem mantem o mesmo numero"
--   Outubro igual ao realizado, novembro +1 e dezembro +1 no armazem.
--
-- 1. fixo_operador = 4 em TODOS os meses de Sao Felix (e no padrao).
-- 2. fixo_conferente = 4 de outubro a dezembro.
-- 3. Puxada FF volta a distribuicao do proprio PPR: 10% noite, 30% manha
--    (a tarde fica com 60%) -- de outubro a dezembro.
-- O PPR continua calculando: a memoria de calculo mostra "PPR calcula X,
-- fixado em 4". Cada mudanca entra no historico de alteracoes.
-- ==================================================================

-- O historico, antes de mudar (valor anterior lido do proprio registro).
insert into public.mao_obra_historico (revenda_id, onde, competencia, campo, rotulo, valor_anterior, valor_novo, alterado_por_nome)
select cm.revenda_id, 'parametros', cm.competencia, x.campo, x.rotulo, x.antes, x.depois, 'Migration 155 (pedido do dono)'
from public.mao_obra_config_mes cm
cross join lateral (values
  ('fixo_operador', 'Quadro fixo — Operadores de empilhadeira',
     coalesce(cm.armazem->>'fixo_operador', '0') || ' un', '4 un', true),
  ('fixo_conferente', 'Quadro fixo — Conferentes',
     coalesce(cm.armazem->>'fixo_conferente', '0') || ' un', '4 un', cm.competencia >= '2026-10-01'),
  ('pux_ff_noite', 'Puxada — % puxada FF à noite',
     round(coalesce((cm.armazem->>'pux_ff_noite')::numeric, 0.1) * 100, 3)::text || '%', '10%', cm.competencia >= '2026-10-01'),
  ('pux_ff_manha', 'Puxada — % puxada FF de manhã',
     round(coalesce((cm.armazem->>'pux_ff_manha')::numeric, 0.3) * 100, 3)::text || '%', '30%', cm.competencia >= '2026-10-01')
) as x(campo, rotulo, antes, depois, vale)
where cm.revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and x.vale;

-- 1. Operador fixo em 4 em todos os meses e no padrao.
update public.mao_obra_config_mes
set armazem = armazem || '{"fixo_operador": 4}'::jsonb,
    atualizado_em = now(),
    atualizado_por_nome = 'Migration 155 (pedido do dono)'
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe';

update public.mao_obra_config
set armazem = armazem || '{"fixo_operador": 4}'::jsonb
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe';

-- 2 e 3. Conferente fixo e a puxada do PPR, de outubro a dezembro.
update public.mao_obra_config_mes
set armazem = armazem || '{"fixo_conferente": 4, "pux_ff_noite": 0.1, "pux_ff_manha": 0.3}'::jsonb
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
  and competencia between '2026-10-01' and '2026-12-01';

-- Confira.
select to_char(competencia, 'YYYY-MM') as mes,
       armazem->>'fixo_operador' as operador_fixo,
       armazem->>'fixo_conferente' as conferente_fixo,
       armazem->>'pux_ff_noite' as puxada_noite,
       armazem->>'pux_ff_manha' as puxada_manha,
       armazem->>'aj_pallets_dia' as pallets_por_ajudante
from public.mao_obra_config_mes
where revenda_id = '7afe4da5-e846-4b02-947f-96843a2791fe'
order by competencia;
