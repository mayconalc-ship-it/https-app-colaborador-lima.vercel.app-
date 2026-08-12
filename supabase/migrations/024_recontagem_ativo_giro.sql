-- ==================================================================
-- 024 - RECONTAGEM DO ATIVO DE GIRO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Quando a conciliacao acusa uma diferenca, o controle pede para o time
-- contar de novo um pedaco especifico -- um tipo+formato+status, ou so um
-- formato inteiro (deixando tipo e/ou status em branco = "qualquer").
--
-- O pedido fica pendente ate uma contagem NOVA bater com ele (mesma
-- revenda, mesmo formato, e tipo/status batendo ou o pedido aceitando
-- "qualquer"). Ninguem marca "concluido" a mao: a acao que registra a
-- contagem fecha o pedido sozinha. Mesmo espirito das pendencias do sino
-- (015_notificacoes.sql) -- pergunta feita na hora as tabelas que ja
-- existem, sem tarefa agendada para manter nada em dia.

create table if not exists public.ag_recontagens (
  id bigint generated always as identity primary key,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- null = qualquer tipo/status serve para fechar o pedido.
  tipo text check (tipo in ('Kit AG', 'GFE sem Garrafa')),
  formato text not null check (formato in ('600ml', '300ml', '1000ml', 'Verde')),
  status text check (status in ('Cheio', 'Vazio', 'Trânsito Rota', 'Trânsito Fábrica')),
  observacao text,
  solicitado_por uuid not null references auth.users(id) on delete cascade,
  solicitado_nome text not null,
  criado_em timestamptz not null default now(),
  atendida_em timestamptz,
  atendida_por uuid references auth.users(id) on delete set null,
  atendida_contagem_id bigint references public.ag_contagens(id) on delete set null,
  cancelada_em timestamptz
);

-- So os pedidos em aberto sao consultados a toda hora -- no banner do
-- colaborador e no painel do controle. Indice parcial: fica pequeno para
-- sempre, mesmo com anos de pedidos ja atendidos acumulados.
create index if not exists ag_recontagens_pendentes_idx
  on public.ag_recontagens (revenda_id)
  where atendida_em is null and cancelada_em is null;

grant select on public.ag_recontagens to authenticated;
grant all on public.ag_recontagens to service_role;

alter table public.ag_recontagens enable row level security;

drop policy if exists "le a propria revenda" on public.ag_recontagens;
create policy "le a propria revenda" on public.ag_recontagens
  for select to authenticated
  using (
    public.ehowner_atual()
    or revenda_id in (select public.revendas_do_usuario())
  );

-- Escrita (pedir, cancelar, marcar atendida) so pelo service role -- as
-- acoes de servidor conferem a permissao ("editar" no modulo) antes de
-- gravar. Mesmo desenho de ag_parque e ag_fatores.

-- ------------------------------------------------------------------
-- "ativo-giro" vira modulo notificavel (sino + push)
-- ------------------------------------------------------------------
insert into public.notificacao_config (revenda_id, modulo, ativa)
select revenda_id, 'ativo-giro', true
from public.revenda_modulos
where modulo = 'ativo-giro'
on conflict (revenda_id, modulo) do nothing;

notify pgrst, 'reload schema';
