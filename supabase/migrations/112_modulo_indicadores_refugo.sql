-- ==================================================================
-- 112 - Modulo INDICADORES DO REFUGO (Sao Felix e Barreiras)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (11/09/2026): a analise do relatorio 03.11.34.05 -- por
-- data, placa, incidencia do veiculo, motorista, conferente, item, tipo de
-- refugo e tipo de sorteio -- dentro do app, para liberar por pessoa em
-- Acessos por Pessoa, junto do submodulo Refugo.
--
-- Nao cria tabela: le as mesmas afericoes que o Refugo ja importa
-- (refugo_afericoes). So cadastra o modulo nas duas revendas -- sem a
-- linha em revenda_modulos a coluna nao aparece em Acessos por Pessoa e a
-- tela responde "sem acesso" para todo mundo.
--
-- Ninguem ganha acesso aqui: a liberacao e pessoa por pessoa, pelo dono.

insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'refugo-indicadores', true
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id, modulo) do update set ativo = true;

-- Confira: duas linhas, uma por revenda, ativo = true.
select r.nome, rm.modulo, rm.ativo
from public.revenda_modulos rm
join public.revendas r on r.id = rm.revenda_id
where rm.modulo = 'refugo-indicadores'
order by r.nome;
