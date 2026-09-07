-- ==================================================================
-- 105 - Relato de anomalia: area, sala e IC/IV cadastraveis,
--       e a assinatura do gestor auditavel
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedidos do dono (07/09/2026), depois de preencher um relato de verdade:
--   "a area precisa ser cadastravel e com menu suspenso, a sala do mesmo
--    jeito (...) IC/IV precisa ser cadastravel, e ja pode utilizar os
--    mesmos que ja possui e que ja tem gatilho mapeado (...) assinatura do
--    gestor ela e auditavel? ou so replica o nome dele?"
--
-- A RESPOSTA HONESTA SOBRE A ASSINATURA ERA: SO PELA METADE. O app ja
-- gravava o horario exato e o id de quem estava logado -- mas o NOME era
-- texto livre, entao dava para digitar o nome de outra pessoa, e o papel
-- impresso mostraria esse nome. Pior: o id de quem assinou era gravado na
-- coluna `criado_por`, sobrescrevendo quem ABRIU o relato. Duas
-- informacoes diferentes na mesma coluna nao respondem nenhuma das duas.
--
-- Agora quem assina tem coluna propria, e o nome passa a vir do CADASTRO
-- de quem esta logado -- nao do que se digita.

-- ------------------------------------------------------------------
-- 1) O CATALOGO -- area, sala e IC/IV numa tabela so
-- ------------------------------------------------------------------
-- UMA TABELA COM `tipo`, e nao tres tabelas iguais. Sao tres listas de
-- texto com o mesmo comportamento (nome, ativo, ordem); tres tabelas
-- seriam tres migrations, tres telas e tres consultas para a mesma coisa.
create table if not exists public.pa_relato_catalogos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  tipo text not null check (tipo in ('area', 'sala', 'ic_iv')),
  nome text not null,
  -- O IC/IV pode apontar para um indicador do app (ver CATALOGO_DE_METAS).
  -- Quando aponta, a tela mostra se aquele indicador tem gatilho ligado --
  -- que e o que liga o relato a um disparo de verdade.
  indicador text,
  ordem smallint not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint pa_relato_catalogo_unico unique (revenda_id, tipo, nome)
);

create index if not exists pa_relato_catalogos_idx
  on public.pa_relato_catalogos (revenda_id, tipo, ativo, ordem);

-- ------------------------------------------------------------------
-- 2) SEMENTE -- do que ja existe, e so disso
-- ------------------------------------------------------------------
-- NAO INVENTEI AREA NENHUMA. O que entra e o que a operacao ja escreveu:
-- as areas do cadastro de colaboradores e o que o dono digitou nos relatos
-- que ja preencheu. Semear uma lista imaginada garantiria que a primeira
-- coisa que alguem faz na tela e apagar as minhas.
insert into public.pa_relato_catalogos (revenda_id, tipo, nome)
select distinct r.id, 'area', trim(p.area)
from public.revendas r
cross join public.profiles p
where p.area is not null and trim(p.area) <> ''
on conflict (revenda_id, tipo, nome) do nothing;

insert into public.pa_relato_catalogos (revenda_id, tipo, nome)
select distinct a.revenda_id, 'area', trim(a.area)
from public.pa_relatos_anomalia a
where a.area is not null and trim(a.area) <> ''
on conflict (revenda_id, tipo, nome) do nothing;

insert into public.pa_relato_catalogos (revenda_id, tipo, nome)
select distinct a.revenda_id, 'sala', trim(a.sala)
from public.pa_relatos_anomalia a
where a.sala is not null and trim(a.sala) <> ''
on conflict (revenda_id, tipo, nome) do nothing;

insert into public.pa_relato_catalogos (revenda_id, tipo, nome)
select distinct a.revenda_id, 'ic_iv', trim(a.ic_iv)
from public.pa_relatos_anomalia a
where a.ic_iv is not null and trim(a.ic_iv) <> ''
on conflict (revenda_id, tipo, nome) do nothing;

-- ------------------------------------------------------------------
-- 3) A ASSINATURA COM DONO
-- ------------------------------------------------------------------
alter table public.pa_relatos_anomalia
  add column if not exists assinado_por uuid,
  add column if not exists assinado_por_nome text;

comment on column public.pa_relatos_anomalia.assinado_por is
  'Quem estava logado ao assinar. E ESTE o registro auditavel -- assinatura_gestor guarda o nome que apareceu no papel, e gestor_nome, o gestor responsavel pela area.';

-- O que ja foi assinado antes desta migration tinha o id de quem assinou
-- gravado em `criado_por` (era o unico lugar). Traz para a coluna certa em
-- vez de deixar o historico sem dono -- e nao apaga `criado_por`, porque
-- nao da para saber, hoje, quais linhas ele ainda descreve corretamente.
update public.pa_relatos_anomalia
   set assinado_por = criado_por,
       assinado_por_nome = assinatura_gestor
 where assinado_em is not null
   and assinado_por is null;

-- ------------------------------------------------------------------
-- 4) RLS
-- ------------------------------------------------------------------
alter table public.pa_relato_catalogos enable row level security;

drop policy if exists "le pa_relato_catalogos da propria revenda" on public.pa_relato_catalogos;
create policy "le pa_relato_catalogos da propria revenda"
  on public.pa_relato_catalogos for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

grant select on public.pa_relato_catalogos to authenticated;
grant all on public.pa_relato_catalogos to service_role;

notify pgrst, 'reload schema';

-- Confira: o que foi semeado, por tipo.
select tipo, count(*) as itens, string_agg(nome, ' · ' order by nome) as lista
  from public.pa_relato_catalogos
 group by tipo
 order by tipo;
