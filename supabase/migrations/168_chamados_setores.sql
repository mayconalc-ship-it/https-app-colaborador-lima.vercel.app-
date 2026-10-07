-- ==================================================================
-- 168 - Chamados para Manutencao: as areas em SETORES
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- (DEPOIS da 167 -- e depois de abrir o formulario uma vez, para as
-- areas do 5S ja estarem na lista; em 07/10/2026 isso ja aconteceu)
-- ==================================================================
-- Pedido do dono (07/10/2026): "nao quero que tenha um botao de area do
-- 5S. Preciso organizar, colocando Armazem, Externo, ADM". A aba "Areas
-- do 5S" saiu do formulario (codigo); aqui cada area vai para o setor.
--
-- 1) Areas do 5S que sao o MESMO lugar de uma que o chamado ja tinha
--    viram uma so (a do chamado passa a apontar para a do 5S, a copia
--    sai) -- so se a copia ainda nao tem chamado:
--      Repack                   -> Armazem . Sala de Repack
--      Sala de MarketPlace      -> Armazem . MKT Place
--      Retorno de Rota (Saroba) -> Armazem . Retorno de Rota
--      Sala Log                 -> Sala Logistica (a do predio, ADM)
-- 2) O setor e a ordem de cada area. Portaria entra em Externo; os dois
--    banheiros dela ganham "da Portaria" no nome, para nao confundir com
--    o Banheiro do Armazem. Posto de Combustivel e Estacao de GLP saem do
--    Armazem para Externo.
--
-- Area que nao estiver na lista (ou area nova do 5S) fica em "Demais
-- areas" ate alguem escolher o setor em Admin > Chamados.
-- ==================================================================

-- 1) Juntar
do $$
declare r record;
begin
  for r in
    select c.id as copia_id, c.cinco_s_area_id, a.id as alvo_id
    from (values
      ('Repack', 'Armazém', 'Sala de Repack'),
      ('Sala de MarketPlace', 'Armazém', 'MKT Place'),
      ('Retorno de Rota (Saroba)', 'Armazém', 'Retorno de Rota'),
      ('Sala Log', '', 'Sala Logística')
    ) as p(nome_5s, grupo_alvo, nome_alvo)
    join public.chamados_locais c on c.veio_do_5s and c.nome = p.nome_5s
    join public.chamados_locais a
      on a.revenda_id = c.revenda_id and not a.veio_do_5s
     and a.grupo = p.grupo_alvo and a.nome = p.nome_alvo and a.cinco_s_area_id is null
    where not exists (select 1 from public.chamados ch where ch.local_id = c.id)
  loop
    delete from public.chamados_locais where id = r.copia_id;
    update public.chamados_locais set cinco_s_area_id = r.cinco_s_area_id where id = r.alvo_id;
  end loop;
end $$;

-- 2) Setores. do_5s = area que veio do cadastro do 5S (sem grupo hoje).
update public.chamados_locais l
set grupo = v.setor,
    ordem = v.ordem,
    nome = coalesce(v.nome_novo, l.nome)
from (values
  -- Armazem
  ('Armazém', 'Picking', false, 'Armazém', 1, null),
  ('Armazém', 'Sala de Repack', false, 'Armazém', 2, null),
  ('Armazém', 'Sala dos Conferentes', false, 'Armazém', 3, null),
  ('Armazém', 'Retorno de Rota', false, 'Armazém', 4, null),
  ('Armazém', 'Red Zone Central', false, 'Armazém', 5, null),
  ('Armazém', 'Câmara Fria', false, 'Armazém', 6, null),
  ('Armazém', 'Tenda', false, 'Armazém', 7, null),
  ('Armazém', 'MKT Place', false, 'Armazém', 8, null),
  ('', 'Armazém 1', true, 'Armazém', 9, null),
  ('', 'Armazém 2', true, 'Armazém', 10, null),
  ('', 'Ativo de Giro', true, 'Armazém', 11, null),
  ('', 'PNC e B1', true, 'Armazém', 12, null),
  ('', 'Sala de EPIS', true, 'Armazém', 13, null),
  ('', 'Estac. Empilhadeiras', true, 'Armazém', 14, null),
  ('Armazém', 'Sala Logística', false, 'Armazém', 15, null),
  ('Armazém', 'Banheiro', false, 'Armazém', 16, null),
  -- ADM
  ('', 'Sala ADM', false, 'ADM', 101, null),
  ('', 'Sala Logística', false, 'ADM', 102, null),
  ('', 'Sala de Reunião', false, 'ADM', 103, null),
  ('', 'Sala de Vendas', false, 'ADM', 104, null),
  ('', 'Sala CPD', false, 'ADM', 105, null),
  ('', 'Sala do Caixa', false, 'ADM', 106, null),
  ('', 'Auditorio', true, 'ADM', 107, null),
  ('', 'Refeitório', false, 'ADM', 108, null),
  ('', 'Vestiário Masculino', false, 'ADM', 109, null),
  ('', 'Vestiário Feminino', false, 'ADM', 110, null),
  ('', 'Vestiario/Banheiro', true, 'ADM', 111, null),
  -- Externo
  ('', 'Portaria', true, 'Externo', 201, null),
  ('Portaria', 'Guarita', false, 'Externo', 202, null),
  ('Portaria', 'Banheiro Externo', false, 'Externo', 203, 'Banheiro Externo da Portaria'),
  ('Portaria', 'Banheiro Interno', false, 'Externo', 204, 'Banheiro Interno da Portaria'),
  ('', 'Estacionamento Externo', false, 'Externo', 205, null),
  ('', 'Estacionamento Interno', false, 'Externo', 206, null),
  ('', 'Estac. Caminhões', true, 'Externo', 207, null),
  ('', 'Oficina', false, 'Externo', 208, null),
  ('', 'Sala peças Frota', true, 'Externo', 209, null),
  ('', 'Casa do Gerador', false, 'Externo', 210, null),
  ('', 'Casa de Bomba', false, 'Externo', 211, null),
  ('Armazém', 'Posto de Combustível', false, 'Externo', 212, null),
  ('Armazém', 'Estação de GLP', false, 'Externo', 213, null),
  ('', 'P.A''s', false, 'Externo', 214, null)
) as v(grupo_atual, nome_atual, do_5s, setor, ordem, nome_novo)
where l.nome = v.nome_atual
  and l.veio_do_5s = v.do_5s
  and l.grupo = v.grupo_atual;

-- Confira: quantas areas em cada setor, por revenda. "(sem setor)" tem
-- de vir vazio (ou so com area nova do 5S).
select r.nome as revenda, coalesce(nullif(l.grupo, ''), '(sem setor)') as setor, count(*) as areas,
       string_agg(l.nome, ', ' order by l.ordem) as quais
from public.chamados_locais l
join public.revendas r on r.id = l.revenda_id
where l.ativo
group by r.nome, l.grupo
order by r.nome, min(l.ordem);
