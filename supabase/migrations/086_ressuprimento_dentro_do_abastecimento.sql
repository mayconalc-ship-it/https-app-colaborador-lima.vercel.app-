-- ==================================================================
-- 086 - RESSUPRIMENTO E ABASTECIMENTO SAO A MESMA COISA
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Correcao de desenho, pedida em 02/09/2026. A 085 criou o ressuprimento
-- como um modulo a parte, com card proprio na vitrine e concessao propria
-- ("pa-ressuprimento"). Estava errado: pedir, transportar e abastecer sao
-- ETAPAS DA MESMA ATIVIDADE, e separar em dois cards obrigaria a operacao
-- a entender uma divisao que so existia no codigo.
--
-- Duas mudancas:
--
--   1. A solicitacao passa a informar o TIPO, igual a sessao de
--      abastecimento: COMPLETO e a varredura da manha, que tem de estar
--      fechada as 10h; PONTUAL e a reposicao esporadica de um SKU que
--      zerou no meio da separacao. Sao ritmos diferentes, e sem
--      distinguir os dois a media de tempo de um contamina a do outro --
--      uma varredura de 2 horas e normal, um chamado pontual de 2 horas
--      e um problema.
--
--   2. O modulo "pa-ressuprimento" e desligado. Quem abastece o picking
--      ja tem "pa-picking", e e essa a concessao que passa a abrir as
--      tres abas; quem transporta continua entrando por "pa-empilhadeira".
--
-- Nao ha migracao de dados: a 085 foi rodada hoje e as duas tabelas estao
-- vazias (conferido antes de escrever esta).

alter table public.pa_ressuprimentos
  add column if not exists tipo text not null default 'completo'
  check (tipo in ('completo', 'pontual'));

comment on column public.pa_ressuprimentos.tipo is
  'completo = varredura da manha, fechada ate as 10h; pontual = reposicao esporadica. Mesmos valores de pa_abastecimentos.tipo -- a sessao herda o tipo da solicitacao que a originou.';

-- -------------------- DESLIGA O MODULO SEPARADO --------------------
-- Desligado, nao apagado: a linha em revenda_modulos guarda o registro de
-- que ele existiu, e apagar nao devolveria nada em troca. Com ativo=false
-- ele some da vitrine e da Gestao de Acessos por conta propria.
update public.revenda_modulos
   set ativo = false
 where modulo = 'pa-ressuprimento';

-- Se alguem chegou a receber a concessao entre ontem e hoje, ela vira
-- letra morta (o catalogo do app nao conhece mais este modulo). Sai para
-- nao ficar uma linha orfa na tabela de permissoes.
delete from public.lideranca_permissoes where modulo = 'pa-ressuprimento';
delete from public.colaborador_modulos_extra where modulo = 'pa-ressuprimento';

notify pgrst, 'reload schema';

-- Confira: a coluna nova e o modulo desligado.
select 'tipo na solicitacao' as item, count(*)::text as valor
  from information_schema.columns
 where table_name = 'pa_ressuprimentos' and column_name = 'tipo'
union all
select 'pa-ressuprimento ainda ativo', count(*)::text
  from public.revenda_modulos
 where modulo = 'pa-ressuprimento' and ativo;
