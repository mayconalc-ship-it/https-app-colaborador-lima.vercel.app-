-- ==================================================================
-- 065 - REPACK: separa Selecao/Triagem da Reembalagem (POP-ARM-001)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Ate aqui o modulo cronometrava UMA coisa so, chamada "reepack", que
-- na pratica misturava duas atividades bem diferentes do POP-ARM-001:
--
--   Etapa 1 - Selecao e Triagem: inspecionar o pallet avariado, separar
--             o que e descarte do que e recuperavel, lavar/secar e
--             inspecionar unidade por unidade.
--   Etapa 2 - Reembalagem (Repack): cortar o Shrink na medida e passar
--             a sopradora termica ate o pacote ficar pronto.
--
-- Somadas num numero so, a taxa de cx/h nao dizia nada: um lote muito
-- avariado gasta o tempo na Etapa 1, e isso aparecia como "repack
-- lento". Separadas, da pra cronometrar cada uma contra a propria
-- referencia -- que e justamente o que a cronoanalise esta medindo.
--
-- Uma coluna so. Lancamento antigo e repack (era o unico que existia),
-- entao o default ja deixa o historico certo, sem UPDATE nenhum.
--
-- O indice de "um lancamento aberto por pessoa"
-- (pa_reepack_aberto_unico, migration 052) NAO muda de proposito:
-- ninguem faz selecao e repack ao mesmo tempo -- e uma atividade por
-- vez, e a trava continua valendo para as duas juntas.

alter table public.pa_reepack_lancamentos
  add column if not exists etapa text not null default 'repack';

-- Constraint separada do add column para o script poder rodar de novo
-- sem estourar se alguem ja tiver aplicado parte dele.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pa_reepack_etapa_valida'
  ) then
    alter table public.pa_reepack_lancamentos
      add constraint pa_reepack_etapa_valida
      check (etapa in ('selecao', 'repack'));
  end if;
end $$;

comment on column public.pa_reepack_lancamentos.etapa is
  'Etapa do POP-ARM-001: selecao (Etapa 1 - Selecao e Triagem) ou repack (Etapa 2 - Reembalagem). Lancamentos anteriores a 27/08/2026 sao todos repack.';

-- O historico e a tela filtram por etapa o tempo todo; sem isto, cada
-- consulta varre a tabela inteira para depois jogar metade fora.
create index if not exists pa_reepack_revenda_etapa_idx
  on public.pa_reepack_lancamentos (revenda_id, etapa, inicio desc);

notify pgrst, 'reload schema';
