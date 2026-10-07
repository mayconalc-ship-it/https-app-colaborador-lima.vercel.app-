-- ==================================================================
-- 170 - Chamados para Manutencao: unifica as areas de nome parecido
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- (DEPOIS do deploy de 07/10/2026 que deixa desligar area do 5S so no
-- chamado -- sem ele, o Estac. Caminhoes religaria sozinho)
-- ==================================================================
-- Pedido do dono (07/10/2026): "unifique as areas com nomes parecidos".
-- Decidido na conversa, grupo a grupo:
--   1. Sala Logistica (Armazem) + Sala Logistica (ADM) -> fica a do ADM,
--      nas duas revendas;
--   2. Vestiario Masculino + Vestiario Feminino + Vestiario/Banheiro (5S)
--      -> uma so, "Vestiario", ligada a do 5S (Sao Felix);
--   3. Portaria (5S) + Guarita -> fica "Portaria" (Sao Felix);
--   4. Estac. Caminhoes (5S) sai da lista do chamado (desligada so aqui;
--      continua no 5S). Ficam Estacionamento Interno e Externo.
--
-- Unificar = os chamados da area que sai passam para a que fica (o nome
-- gravado em cada chamado, `local_nome`, nao muda: e o fato do dia) e a
-- area que sai e apagada. Se a que sai era a do 5S, a ligacao com o 5S
-- passa para a que fica -- senao o app a recriaria na proxima leitura.
-- ==================================================================

do $$
declare
  r record;
  fica uuid;
  sai uuid;
  area5s uuid;
begin
  for r in select id from public.revendas loop

    -- 1) Sala Logistica: fica a do ADM
    select id into fica from public.chamados_locais where revenda_id = r.id and grupo = 'ADM' and nome = 'Sala Logística';
    select id into sai from public.chamados_locais where revenda_id = r.id and grupo = 'Armazém' and nome = 'Sala Logística';
    if fica is not null and sai is not null then
      update public.chamados set local_id = fica where local_id = sai;
      select cinco_s_area_id into area5s from public.chamados_locais where id = sai;
      delete from public.chamados_locais where id = sai;
      if area5s is not null then
        update public.chamados_locais set cinco_s_area_id = area5s where id = fica and cinco_s_area_id is null;
      end if;
    end if;

    -- 2) Vestiarios: so onde existe o do 5S (Sao Felix). O Masculino vira
    --    "Vestiario" e recebe a ligacao com o 5S.
    select id, cinco_s_area_id into sai, area5s from public.chamados_locais
      where revenda_id = r.id and veio_do_5s and nome = 'Vestiario/Banheiro';
    select id into fica from public.chamados_locais where revenda_id = r.id and grupo = 'ADM' and nome = 'Vestiário Masculino';
    if sai is not null and fica is not null then
      update public.chamados set local_id = fica where local_id = sai;
      delete from public.chamados_locais where id = sai;
      update public.chamados set local_id = fica
        where local_id = (select id from public.chamados_locais where revenda_id = r.id and grupo = 'ADM' and nome = 'Vestiário Feminino');
      delete from public.chamados_locais where revenda_id = r.id and grupo = 'ADM' and nome = 'Vestiário Feminino';
      update public.chamados_locais set nome = 'Vestiário', cinco_s_area_id = area5s where id = fica;
    end if;

    -- 3) Portaria (5S) + Guarita: fica a Portaria
    select id into fica from public.chamados_locais where revenda_id = r.id and veio_do_5s and nome = 'Portaria';
    select id into sai from public.chamados_locais where revenda_id = r.id and not veio_do_5s and nome = 'Guarita';
    if fica is not null and sai is not null then
      update public.chamados set local_id = fica where local_id = sai;
      delete from public.chamados_locais where id = sai;
    end if;

    fica := null; sai := null; area5s := null;
  end loop;
end $$;

-- 4) Estac. Caminhoes: fora da lista do chamado (continua no 5S)
update public.chamados_locais set ativo = false where veio_do_5s and nome = 'Estac. Caminhões';

-- Confira: as areas ligadas de cada revenda, por setor.
select r.nome as revenda, l.grupo as setor, count(*) as areas, string_agg(l.nome, ', ' order by l.ordem) as quais
from public.chamados_locais l
join public.revendas r on r.id = l.revenda_id
where l.ativo
group by r.nome, l.grupo
order by r.nome, min(l.ordem);
