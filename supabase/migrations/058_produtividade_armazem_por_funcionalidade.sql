-- ==================================================================
-- 058 - PRODUTIVIDADE DO ARMAZEM: acesso por funcionalidade
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Ate aqui "produtividade-armazem" era UM modulo opcional so: quem tinha
-- a concessao via colaborador_modulos_extra enxergava as seis
-- funcionalidades juntas (Reepack, Despejo, Empilhadeira, Recebimento,
-- 5S do Armazem, Picking). O dono pediu para liberar cada uma separada.
--
-- Mesmo padrao da migration 053 (generalizacao do acesso por modulo):
-- trocamos o codigo para checar seis modulos novos (pa-reepack,
-- pa-despejo, pa-empilhadeira, pa-recebimento, pa-cinco-s, pa-picking) e
-- esta migracao faz o backfill -- ninguem perde acesso no dia da virada.
--
-- Portaria/Conferencia de Carretas (migration 057) entram no mesmo grupo
-- visual (ver lib/acessos.ts, subGrupoDe) por serem, na pratica, mais
-- funcionalidades do chao do armazem -- e saem do menu principal (agora
-- se chega nelas pela vitrine de Produtividade do Armazem).

-- ------------------------------------------------------------------
-- 1) A REVENDA PRECISA "TER" CADA SUB-MODULO
-- ------------------------------------------------------------------
-- requireAcessoModulo() confere revenda_modulos ANTES de checar a pessoa
-- (ver lib/require-admin.ts) -- sem esta linha, pa-reepack nunca passaria
-- em revenda nenhuma, mesmo com a pessoa concedida.
insert into public.revenda_modulos (revenda_id, modulo)
select revenda_id, m
from public.revenda_modulos, unnest(array[
  'pa-reepack', 'pa-despejo', 'pa-empilhadeira', 'pa-recebimento', 'pa-cinco-s', 'pa-picking'
]) as m
where modulo = 'produtividade-armazem' and ativo
on conflict (revenda_id, modulo) do nothing;

-- ------------------------------------------------------------------
-- 2) QUEM JA TINHA "produtividade-armazem" GANHA AS SEIS
-- ------------------------------------------------------------------
insert into public.colaborador_modulos_extra (colaborador_id, revenda_id, modulo)
select colaborador_id, revenda_id, m
from public.colaborador_modulos_extra, unnest(array[
  'pa-reepack', 'pa-despejo', 'pa-empilhadeira', 'pa-recebimento', 'pa-cinco-s', 'pa-picking'
]) as m
where modulo = 'produtividade-armazem'
on conflict (colaborador_id, revenda_id, modulo) do nothing;

-- ------------------------------------------------------------------
-- 3) LIDERANCA COM QUALQUER PERMISSAO NO MODULO ANTIGO GANHA "ver" NAS SEIS
-- ------------------------------------------------------------------
-- "editar"/"criar"/"excluir" no modulo antigo continuam valendo (nao
-- mudou nada la -- e a permissao de administrar catalogos). O que faltava
-- era o "ver" nos seis modulos novos, que e o que abre cada TELA.
insert into public.lideranca_permissoes (colaborador_id, revenda_id, modulo, acao)
select distinct colaborador_id, revenda_id, m, 'ver'
from public.lideranca_permissoes, unnest(array[
  'pa-reepack', 'pa-despejo', 'pa-empilhadeira', 'pa-recebimento', 'pa-cinco-s', 'pa-picking'
]) as m
where modulo = 'produtividade-armazem'
on conflict (colaborador_id, revenda_id, modulo, acao) do nothing;

-- ------------------------------------------------------------------
-- 4) CARRETAS SAI DO MENU PRINCIPAL -- AGORA E CARTAO DENTRO DE
--    PRODUTIVIDADE DO ARMAZEM
-- ------------------------------------------------------------------
update public.menu_itens
   set visivel = false
 where chave in ('carretas-portaria', 'carretas-conferencia');

notify pgrst, 'reload schema';
