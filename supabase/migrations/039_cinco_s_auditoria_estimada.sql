-- ==================================================================
-- 039 - AUDITORIA COM REGISTRO ESTIMADO
-- Execute no Supabase: SQL Editor > New query > colar > Ctrl+A > Run
-- ==================================================================
-- Alguns meses de 2026 tiveram auditoria de fato, mas a planilha que
-- guardava o resultado se perdeu. A operacao quer o historico completo
-- para enxergar a evolucao do ano inteiro, e para isso esses meses
-- entram com o total estimado pela media da propria area.
--
-- A coluna abaixo e o que separa esse numero de uma medicao de verdade.
-- Sem ela, daqui a um ano ninguem -- nem quem pediu -- saberia dizer
-- qual mes foi medido e qual foi calculado, e uma auditoria externa
-- encontraria registro de trabalho sem evidencia nenhuma por tras.
--
-- Com a coluna, o BI mostra a serie completa e continua sabendo separar:
-- basta filtrar `estimada = false` para ver so o que foi medido.

alter table public.cinco_s_auditorias
  add column if not exists estimada boolean not null default false;

comment on column public.cinco_s_auditorias.estimada is
  'true = totais calculados pela media da area porque o registro original se perdeu. NAO houve medicao item a item. Auditoria feita pelo app e sempre false.';

-- Indice parcial: as consultas que separam medido de estimado sao raras
-- e pequenas, e quase toda leitura do BI ignora a coluna. Um indice
-- completo custaria escrita em toda auditoria para servir a poucas
-- consultas -- este so indexa as poucas linhas estimadas.
create index if not exists cinco_s_auditorias_estimadas_idx
  on public.cinco_s_auditorias (revenda_id, competencia)
  where estimada;

notify pgrst, 'reload schema';
