-- ==================================================================
-- 148 - MAO DE OBRA: AJUDANTES EXTRAS, JUSTIFICATIVAS E ENVIO RETROATIVO
-- Execute no Supabase do App Colaborador ANTES do deploy deste commit.
-- ==================================================================
-- Pedidos do dono (28/09/2026):
--   1. Ajudantes extras da ENTREGA: o simulador punha 1 ajudante por carro
--      e nao havia como ter mais ajudante que motorista.
--   2. Justificativa do volume acima/abaixo do acordado (V.5).
--   3. Justificativa da contratacao ou reducao do QLP planejado (V.2).
--   4. Registrar envio com a DATA REAL em que foi feito, inclusive
--      passada: "enviei o mes de marco (abr, mai, jun), a data do envio
--      deve contar de marco".
--
-- Sobre o item 4: a data informada vira enviado_em; o momento em que o
-- registro foi feito no app fica em registrado_em, e retroativo = true.
-- As duas datas aparecem na tela. Um registro retroativo sem essa marca
-- seria uma evidencia que diz uma coisa e aconteceu outra -- com ela, o
-- auditor ve exatamente quando cada informacao entrou.
-- ==================================================================

alter table public.mao_obra_meses
  add column if not exists ajudante_extra_entrega integer,
  add column if not exists volume_justificativa_motivo text,
  add column if not exists volume_justificativa text,
  add column if not exists qlp_justificativa_motivo text,
  add column if not exists qlp_justificativa text;

alter table public.mao_obra_meses
  drop constraint if exists mao_obra_meses_justificativas_tamanho;
alter table public.mao_obra_meses
  add constraint mao_obra_meses_justificativas_tamanho check (
    (volume_justificativa is null or char_length(volume_justificativa) <= 500)
    and (qlp_justificativa is null or char_length(qlp_justificativa) <= 500)
    and (volume_justificativa_motivo is null or char_length(volume_justificativa_motivo) <= 80)
    and (qlp_justificativa_motivo is null or char_length(qlp_justificativa_motivo) <= 80)
  );

alter table public.mao_obra_envios
  add column if not exists registrado_em timestamptz not null default now(),
  add column if not exists retroativo boolean not null default false;

alter table public.mao_obra_projecoes
  add column if not exists retroativa boolean not null default false;

notify pgrst, 'reload schema';

-- Confira: as colunas novas.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'mao_obra_meses' and column_name in
          ('ajudante_extra_entrega', 'volume_justificativa_motivo', 'volume_justificativa', 'qlp_justificativa_motivo', 'qlp_justificativa'))
    or (table_name = 'mao_obra_envios' and column_name in ('registrado_em', 'retroativo'))
    or (table_name = 'mao_obra_projecoes' and column_name = 'retroativa'))
order by table_name, column_name;
