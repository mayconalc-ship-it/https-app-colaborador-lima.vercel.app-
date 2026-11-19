-- ==================================================================
-- 183 - GESTOR LOG ONLINE, etapa 2: o "carteiro" dos relatorios
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- Depende da 182. Pode rodar mais de uma vez.
-- ==================================================================
-- Pedido do dono (19/11/2026): os relatorios do Promax ficam na pasta do
-- servidor (\\192.168.4.250\Compartilhado\Barreiras) e o Edge nao deixa
-- o Gestor LOG lembrar pasta de rede. Um programa num computador da
-- empresa (o carteiro) olha a pasta e manda cada relatorio novo ou
-- alterado para esta caixa de entrada. Quem abre o Gestor LOG online com
-- permissao de editar processa a caixa sozinho, pelo mesmo caminho da
-- pasta do computador.
--
-- Uma linha pendente por relatorio (revenda + nome): versao nova do mesmo
-- arquivo substitui a anterior ainda nao processada. Processada, a linha
-- fica (para mostrar "ultimo recebido") e o arquivo sai do bucket.

create table if not exists public.gestor_log_entrada (
  id            bigserial primary key,
  rev           text not null check (rev in ('SF', 'BAR')),
  nome          text not null,
  caminho       text not null,
  tamanho       bigint,
  modificado    bigint,
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz,
  processado_por_nome text
);

-- so uma pendente por relatorio
create unique index if not exists gestor_log_entrada_pendente
  on public.gestor_log_entrada (rev, nome) where processado_em is null;

alter table public.gestor_log_entrada enable row level security;

notify pgrst, 'reload schema';

select 'gestor_log_entrada' as tabela, count(*) as linhas from public.gestor_log_entrada;
