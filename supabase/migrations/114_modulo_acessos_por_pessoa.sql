-- ==================================================================
-- 114 - ACESSOS POR PESSOA delegavel (modulo "acessos")
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (11/09/2026): liberar Acessos por Pessoa para a
-- lideranca de Barreiras, "somente Barreiras ou das duas revendas".
--
-- A tela era so do dono. Agora tambem abre para a lideranca que tem o
-- modulo "acessos" NAQUELA revenda -- a permissao e por revenda, como
-- todas. Dada so em Barreiras, a pessoa so entra e so mexe em Barreiras;
-- dada nas duas (e com vinculo nas duas), mexe nas duas.
--
-- Dentro da revenda ha um ALCANCE, conferido no servidor: a lideranca so
-- concede e so retira o que ela mesma tem ali, nao repassa esta gestao,
-- nao mexe em si nem em quem tambem gerencia, nao "espelha" perfil e so
-- rebaixa quem nao tem permissao em outra revenda.
--
-- Esta migration so LIGA o modulo nas revendas ativas. Ninguem ganha
-- acesso aqui: quem libera, pessoa por pessoa, e o dono, na ficha da
-- pessoa em Acessos por Pessoa (gaveta Pessoas).

insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'acessos', true
from public.revendas r
where r.ativa
on conflict (revenda_id, modulo) do update set ativo = true;

-- Confira: uma linha por revenda ativa, ativo = true.
select r.nome, rm.modulo, rm.ativo
from public.revenda_modulos rm
join public.revendas r on r.id = rm.revenda_id
where rm.modulo = 'acessos'
order by r.nome;
