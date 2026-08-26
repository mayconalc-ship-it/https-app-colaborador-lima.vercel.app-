-- ==================================================================
-- 063 - CARRETAS: descarga e conferencia em paralelo, avaria por item
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Ate aqui, "assumir" o atendimento e preencher os itens da descarga
-- era UM clique so, feito pela mesma pessoa (o conferente). Na operacao
-- real sao duas coisas diferentes, feitas por gente diferente, em
-- paralelo: o empilhador descarrega o caminhao (DESCARGA); o conferente
-- confere o que chegou, contando produto no chao (CONFERENCIA). Um pode
-- comecar sem o outro ter comecado.
--
-- status continua existindo pro Monitor (colunas do kanban), mas quem
-- decide qual botao aparece na tela e a presenca/ausencia de cada
-- timestamp novo, nao mais um status linear so.
--
-- Verificado antes de escrever isto: ZERO atendimentos nao-finalizados
-- no banco agora -- nao ha "meio do fluxo antigo" pra migrar, so
-- finalizados (historico, intocado como sempre).

alter table public.atendimentos_carretas
  add column if not exists inicio_descarga_em timestamptz,
  add column if not exists inicio_conferencia_em timestamptz,
  add column if not exists fim_conferencia_em timestamptz,
  add column if not exists retorno_decidido_em timestamptz;

comment on column public.atendimentos_carretas.inicio_descarga_em is
  'Quando o empilhador clicou "Iniciar descarga" -- inicio da fase de descarga, independente da conferencia.';
comment on column public.atendimentos_carretas.inicio_conferencia_em is
  'Quando o conferente clicou "Conferir carga" -- inicio da conferencia dos itens, independente da descarga.';
comment on column public.atendimentos_carretas.fim_conferencia_em is
  'Quando o conferente terminou de preencher os itens e clicou "Finalizar conferencia".';
comment on column public.atendimentos_carretas.retorno_decidido_em is
  'Quando o conferente decidiu se a carreta volta vazia ou com AG -- e ate aqui que o TMA conta (nao mais so ate o fim da descarga).';

alter table public.atendimentos_carretas drop constraint if exists atendimentos_carretas_status_check;
alter table public.atendimentos_carretas add constraint atendimentos_carretas_status_check
  check (status in ('aguardando_conferente', 'em_andamento', 'aguardando_retorno', 'em_carga', 'finalizado'));

alter table public.atendimento_carretas_itens
  add column if not exists quantidade_avariada numeric(10,2)
    check (quantidade_avariada is null or quantidade_avariada >= 0);

comment on column public.atendimento_carretas_itens.quantidade is
  'Quantidade RECEBIDA (boa + avariada) -- nome da coluna ficou o mesmo pra nao migrar dado; "avariada" e a coluna nova.';
comment on column public.atendimento_carretas_itens.quantidade_avariada is
  'Avariada, dentro do total recebido (quantidade). Null nos itens registrados antes desta mudanca -- nao dava pra saber retroativamente.';

notify pgrst, 'reload schema';
