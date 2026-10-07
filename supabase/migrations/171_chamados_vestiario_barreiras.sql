-- ==================================================================
-- 171 - Chamados para Manutencao: um "Vestiario" so em Barreiras
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (07/10/2026): "junte os vestiarios em Barreiras
-- tambem". Mesmo desenho da 170 em Sao Felix: o Vestiario Masculino vira
-- "Vestiario", os chamados do Feminino (nenhum hoje) passam para ele e o
-- Feminino sai. Vale para qualquer revenda que ainda tenha os dois.
-- ==================================================================

do $$
declare
  r record;
  fica uuid;
  sai uuid;
begin
  for r in select id from public.revendas loop
    select id into fica from public.chamados_locais where revenda_id = r.id and nome = 'Vestiário Masculino';
    select id into sai from public.chamados_locais where revenda_id = r.id and nome = 'Vestiário Feminino';
    -- Ja existe um "Vestiario" no mesmo setor: nao renomeia por cima.
    if fica is not null and sai is not null and not exists (
      select 1 from public.chamados_locais v
      where v.revenda_id = r.id and v.nome = 'Vestiário'
        and v.grupo = (select grupo from public.chamados_locais where id = fica)
    ) then
      update public.chamados set local_id = fica where local_id = sai;
      delete from public.chamados_locais where id = sai;
      update public.chamados_locais set nome = 'Vestiário' where id = fica;
    end if;
  end loop;
end $$;

-- Confira: um "Vestiario" por revenda, nenhum Masculino/Feminino.
select r.nome as revenda, l.grupo as setor, l.nome as area, l.ativo
from public.chamados_locais l
join public.revendas r on r.id = l.revenda_id
where l.nome like 'Vesti%'
order by r.nome, l.nome;
