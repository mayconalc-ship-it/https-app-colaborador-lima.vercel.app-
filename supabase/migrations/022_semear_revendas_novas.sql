-- ==================================================================
-- 022 - CONFIGURACAO INICIAL DE CADA REVENDA
-- Execute no Supabase: SQL Editor > New query > colar > Run
-- ==================================================================
-- A 021 nao criou linha de configuracao nenhuma para Barreiras de
-- proposito: varias telas ainda buscavam a "linha unica" com
-- .eq("id", 1).single(), e uma segunda linha faria a consulta devolver
-- duas e quebrar Sao Felix.
--
-- Agora o codigo filtra por revenda em todo lugar, entao da para semear
-- sem risco. As tabelas que o app cria sozinho na primeira visita
-- (menu_itens e padroes_pilares) ficam de fora: elas nascem quando
-- alguem abre a tela, e semear aqui so tiraria a chance de a revenda
-- comecar com um menu diferente.

-- ------------------------------------------------------------------
-- 1) ESCALA -- uma linha por area, senao a tela abre sem nada para editar
-- ------------------------------------------------------------------
insert into public.escala_trabalho (revenda_id, area, rotulo)
select r.id, a.area, a.rotulo
from public.revendas r
cross join (values
  ('DU', 'Distribuição Urbana'),
  ('AL', 'Armazém Logístico')
) as a(area, rotulo)
on conflict (revenda_id, area) do nothing;

-- ------------------------------------------------------------------
-- 2) RV -- a linha existe vazia; o link da planilha entra pela tela
-- ------------------------------------------------------------------
insert into public.rv_config (revenda_id, area, rotulo)
select r.id, a.area, a.rotulo
from public.revendas r
cross join (values
  ('DU', 'Distribuição Urbana'),
  ('AL', 'Armazém Logístico')
) as a(area, rotulo)
on conflict (revenda_id, area) do nothing;

-- ------------------------------------------------------------------
-- 3) FATORES DO ATIVO DE GIRO
-- ------------------------------------------------------------------
-- Caixas por palete e por lastro sao do formato da garrafa, nao da
-- revenda -- comecam iguais em todas. Se Barreiras paletizar diferente,
-- o Admin corrige na tela e so a linha dela muda.
insert into public.ag_fatores (revenda_id, formato, palete, lastro)
select r.id, f.formato, f.palete, f.lastro
from public.revendas r
cross join (values
  ('600ml', 42, 7),
  ('300ml', 90, 10),
  ('1000ml', 50, 10),
  ('Verde', 42, 7)
) as f(formato, palete, lastro)
on conflict (revenda_id, formato) do nothing;

-- ------------------------------------------------------------------
-- 4) NOTIFICACOES -- avisos ligados e lembrete no horario padrao
-- ------------------------------------------------------------------
insert into public.notificacao_config (revenda_id, modulo, ativa)
select r.id, m, true
from public.revendas r
cross join unnest(array[
  'comunicados','padroes','ranking','sonho','escala','rv','feedback','rotas'
]) as m
on conflict (revenda_id, modulo) do nothing;

insert into public.notificacao_ajustes (revenda_id)
select r.id from public.revendas r
on conflict (revenda_id) do nothing;

-- ------------------------------------------------------------------
-- 5) PESQUISA E ROTAS -- linha de configuracao, desligada
-- ------------------------------------------------------------------
-- A pesquisa nasce inativa: quem decide quando perguntar e o Admin.
insert into public.pesquisa_config (revenda_id)
select r.id from public.revendas r
on conflict (revenda_id) do nothing;

insert into public.rotas_config (revenda_id)
select r.id from public.revendas r
on conflict (revenda_id) do nothing;

-- ------------------------------------------------------------------
-- 6) DE QUAL REVENDA E O EVENTO DE USO
-- ------------------------------------------------------------------
-- O registro de uso e gravado pelo NAVEGADOR, que nao deveria decidir a
-- que revenda a sessao pertence -- se decidisse, bastaria forjar o envio
-- para sujar a metrica da outra unidade. Entao quem carimba e o banco,
-- pela revenda principal da pessoa.
--
-- Para quem responde por duas revendas, o evento fica sempre na
-- principal. E uma aproximacao consciente: a tela de Uso do App ja
-- monta os numeros a partir de QUEM pertence a revenda, e nao desta
-- coluna, entao ela continua certa de qualquer forma.
create or replace function public.carimbar_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.colaborador_id := auth.uid();
  new.criado_em := now();

  select coalesce(p.nome, 'Colaborador') into new.nome
    from public.profiles p where p.id = auth.uid();
  if new.nome is null then new.nome := 'Colaborador'; end if;

  select cr.revenda_id into new.revenda_id
    from public.colaborador_revendas cr
   where cr.colaborador_id = auth.uid()
   order by cr.principal desc
   limit 1;

  return new;
end;
$$;

notify pgrst, 'reload schema';
