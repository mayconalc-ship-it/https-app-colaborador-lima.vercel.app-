-- ==================================================================
-- 054 - PRODUTIVIDADE DO ARMAZEM: reepack/despejo por produto
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Ate aqui, Reepack e Despejo pediam para escolher uma EMBALAGEM generica
-- (ex.: "Lata 350ml C/12") e o litro do despejo saia de um fator que o
-- Admin digitava a mao (litros_por_pacote, migration 051).
--
-- A partir de agora a pessoa escolhe o PRODUTO especifico (ex.: "Skol
-- Lata 350ml C/12 NPAL"), e o litro sai do Fator Hecto que ja vem pronto
-- do SAP -- sem digitacao manual, sem risco de erro de conta. O Fator
-- Hecto e hectolitros POR CAIXA: litros_por_caixa = fator_hecto * 100.
-- Confirmado batendo com um produto real: Antarctica Pilsen 600ml tem
-- Fator=12 (unidades por caixa) e Fator Hecto=0,072 -> 12 x 0,6L = 7,2L
-- = 0,072hL. Fecha.
--
-- Embalagem nao desaparece: continua existindo para a meta de tempo por
-- tipo (tempo_padrao_*_segundos), so que agora e o PRODUTO que aponta
-- para a embalagem dele (pa_produtos.embalagem_id), nao mais a pessoa
-- escolhendo os dois campos na hora do lancamento.

alter table public.pa_produtos
  add column if not exists fator_hecto numeric(10,6),
  add column if not exists unidades_por_caixa integer,
  add column if not exists embalagem_id uuid references public.pa_embalagens(id) on delete set null;

comment on column public.pa_produtos.fator_hecto is
  'Hectolitros por caixa, direto do SAP (coluna "Fator Hecto"). litros_por_caixa = fator_hecto * 100.';
comment on column public.pa_produtos.unidades_por_caixa is
  'Unidades por caixa, direto do SAP (coluna "Fator").';
comment on column public.pa_produtos.embalagem_id is
  'Qual embalagem (catalogo pa_embalagens) este produto usa -- alimenta a meta de tempo por tipo. So produtos com fator_hecto + embalagem_id preenchidos aparecem para escolha no Reepack/Despejo.';

alter table public.pa_reepack_lancamentos
  add column if not exists produto_id uuid references public.pa_produtos(id) on delete restrict,
  add column if not exists litros_calculados numeric(10,2);

comment on column public.pa_reepack_lancamentos.litros_calculados is
  'Calculado no lancamento: quantidade (caixas) x fator_hecto do produto NAQUELE momento x 100. Nao recalcula se o fator mudar depois -- mesmo desenho do litros do despejo (051).';

alter table public.pa_despejo_lancamentos
  add column if not exists produto_id uuid references public.pa_produtos(id) on delete restrict;

comment on column public.pa_despejo_lancamentos.quantidade_pacotes is
  'Caixas do produto despejadas. Antes de 054 era generico por embalagem; agora vem do produto escolhido.';

create index if not exists pa_reepack_produto_idx
  on public.pa_reepack_lancamentos (produto_id, inicio desc);
create index if not exists pa_despejo_produto_idx
  on public.pa_despejo_lancamentos (produto_id, inicio desc);
create index if not exists pa_produtos_embalagem_idx
  on public.pa_produtos (embalagem_id) where ativo;

notify pgrst, 'reload schema';
