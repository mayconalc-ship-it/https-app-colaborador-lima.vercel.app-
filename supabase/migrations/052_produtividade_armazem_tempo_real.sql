-- ==================================================================
-- 052 - PRODUTIVIDADE DO ARMAZEM: reepack e despejo com tempo real
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Ate aqui, reepack e despejo nao tinham "inicio/fim" de verdade: a
-- pessoa digitava quantos MINUTOS achava que tinha levado, e o inicio
-- era reconstruido a partir disso. Rapido de preencher, mas o numero
-- vinha da memoria de quem lancou, nao de um cronometro.
--
-- Agora os dois viram INICIAR / FINALIZAR, igual a Empilhadeira e o
-- Picking: "Iniciar" grava o timestamp do servidor na hora do toque;
-- "Finalizar" grava outro na hora do outro toque, e SO ENTAO a pessoa
-- informa quantas unidades/pacotes fez. Por isso quantidade e fim
-- precisam aceitar nulo -- e null significa "em andamento", nao "sem
-- valor".
--
-- A trava por baixo é a mesma regra critica da Empilhadeira: indice
-- unico parcial impede uma pessoa ter DOIS lancamentos abertos ao
-- mesmo tempo (nao dá pra estar reempacotando duas coisas ao mesmo
-- tempo) -- e funciona mesmo com dois toques quase simultaneos.

alter table public.pa_reepack_lancamentos
  alter column quantidade drop not null,
  alter column fim drop not null;

alter table public.pa_reepack_lancamentos
  drop constraint if exists pa_reepack_lancamentos_quantidade_check;
alter table public.pa_reepack_lancamentos
  add constraint pa_reepack_lancamentos_quantidade_check
  check (quantidade is null or quantidade > 0);

drop index if exists pa_reepack_aberto_unico;
create unique index pa_reepack_aberto_unico
  on public.pa_reepack_lancamentos (colaborador_id) where fim is null;

alter table public.pa_despejo_lancamentos
  alter column litros drop not null,
  alter column fim drop not null;

alter table public.pa_despejo_lancamentos
  drop constraint if exists pa_despejo_lancamentos_litros_check;
alter table public.pa_despejo_lancamentos
  add constraint pa_despejo_lancamentos_litros_check
  check (litros is null or litros > 0);

drop index if exists pa_despejo_aberto_unico;
create unique index pa_despejo_aberto_unico
  on public.pa_despejo_lancamentos (colaborador_id) where fim is null;

notify pgrst, 'reload schema';
