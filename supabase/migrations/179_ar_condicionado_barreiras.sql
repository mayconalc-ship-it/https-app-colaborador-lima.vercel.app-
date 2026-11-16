-- ==================================================================
-- 179 - AR-CONDICIONADO DE BARREIRAS: cadastro dos 16 aparelhos
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- Depende da 178. Pode rodar mais de uma vez (nao duplica).
-- ==================================================================
-- Lista enviada pelo dono em 16/11/2026. Os codigos AC-01..AC-16 foram
-- dados aqui, na ordem da lista: os aparelhos ainda nao tem etiqueta.
-- Imprimir e colar o codigo em cada um, ou trocar o codigo no Modo
-- Lideranca para o que ja estiver colado.
--
-- Capacidade: "9 BTUs" na lista = 9.000 BTUs. Sala de Vendas veio sem
-- capacidade e Caixa/RH sem marca -- ficaram em branco, para completar
-- no Modo Lideranca.
--
-- Os bebedouros (armazem e refeitorio) NAO entram: nao sao ar-condicionado
-- e nao ha checklist de bebedouro.

insert into public.manut_prev_equipamentos (revenda_id, modelo_id, codigo, local, marca, capacidade)
select m.revenda_id, m.id, a.codigo, a.local, a.marca, a.capacidade
from public.manut_prev_modelos m
join public.revendas r on r.id = m.revenda_id
cross join (values
  ('AC-01', 'Portaria',            'Philco',     '9.000 BTUs'),
  ('AC-02', 'Portaria',            'Electrolux', '22.000 BTUs'),
  ('AC-03', 'Auditório',           'Midea',      '33.000 BTUs'),
  ('AC-04', 'Sala de Vendas',      'Philco',     null),
  ('AC-05', 'Sala Ismael',         'Gree',       '12.000 BTUs'),
  ('AC-06', 'Sala Guilherme',      'Midea',      '22.000 BTUs'),
  ('AC-07', 'Caixa / RH',          null,         '22.000 BTUs'),
  ('AC-08', 'CPD',                 'Gree',       '9.000 BTUs'),
  ('AC-09', 'CPD',                 'Gree',       '9.000 BTUs'),
  ('AC-10', 'Sala de Reunião ADM', 'Agratto',    '9.000 BTUs'),
  ('AC-11', 'ADM RH',              'Midea',      '33.000 BTUs'),
  ('AC-12', 'Matinal',             'Midea',      '33.000 BTUs'),
  ('AC-13', 'Sala de Reunião',     'Midea',      '24.000 BTUs'),
  ('AC-14', 'Refeitório',          'Gree',       '24.000 BTUs'),
  ('AC-15', 'Logística',           'Gree',       '24.000 BTUs'),
  ('AC-16', 'Repack',              'Agratto',    '12.000 BTUs')
) as a(codigo, local, marca, capacidade)
where r.nome = 'Revenda Lima Barreiras'
  and m.nome = 'Preventiva do Ar-condicionado'
on conflict (modelo_id, codigo) do nothing;

-- Sala de Vendas (AC-04) e Repack (AC-16) vieram marcados como feitos.
-- Entram como preventiva finalizada HOJE, sem respostas -- so para o
-- prazo comecar a contar daqui. A observacao diz de onde veio.
insert into public.manut_prev_execucoes
  (revenda_id, modelo_id, equipamento_id, status, iniciada_por_nome, iniciada_em,
   finalizada_por_nome, finalizada_em, observacao, alertas)
select e.revenda_id, e.modelo_id, e.id, 'finalizada', 'Lista da manutenção', now(),
       'Lista da manutenção', now(),
       'Feita antes do app (marcada na lista de 16/11/2026). Sem checklist preenchido.', 0
from public.manut_prev_equipamentos e
join public.manut_prev_modelos m on m.id = e.modelo_id
join public.revendas r on r.id = e.revenda_id
where r.nome = 'Revenda Lima Barreiras'
  and m.nome = 'Preventiva do Ar-condicionado'
  and e.codigo in ('AC-04', 'AC-16')
  and not exists (
    select 1 from public.manut_prev_execucoes x
    where x.equipamento_id = e.id and x.status = 'finalizada'
  );

-- Conferencia: 16 aparelhos, 2 com preventiva feita.
select e.codigo, e.local, e.marca, e.capacidade,
       (select max(x.finalizada_em) from public.manut_prev_execucoes x where x.equipamento_id = e.id) as ultima
from public.manut_prev_equipamentos e
join public.revendas r on r.id = e.revenda_id
where r.nome = 'Revenda Lima Barreiras'
order by e.codigo;
