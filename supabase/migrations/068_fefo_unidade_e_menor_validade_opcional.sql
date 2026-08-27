-- ==================================================================
-- 068 - FEFO: unidade de medida na quantidade, menor validade opcional
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Dois ajustes pedidos pelo dono (27/08/2026) depois do primeiro teste:
--
-- 1) "quantidade" sozinha era ambigua. 12 do que -- paletes, caixas,
--    garrafas? Sem a unidade, duas ocorrencias do mesmo produto nao dao
--    para somar nem comparar.
--
-- 2) "menor validade no estoque" passa a ser OPCIONAL. Quem acha a
--    quebra no corredor nem sempre sabe qual e a menor data do estoque
--    inteiro -- exigir isso transformaria o campo no gargalo do
--    formulario, e o custo seria a pessoa desistir de avisar. Quando
--    souber, informa; quando nao souber, o controle completa depois.

-- Ja existe ocorrencia gravada, entao a coluna nova entra com default.
-- 'caixa' e a unidade mais comum no armazem; o formulario sempre manda
-- a escolha, o default serve so para a linha que ja existia.
alter table public.pa_fefo_ocorrencias
  add column if not exists unidade text not null default 'caixa';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pa_fefo_unidade_valida'
  ) then
    alter table public.pa_fefo_ocorrencias
      add constraint pa_fefo_unidade_valida
      check (unidade in ('palete', 'caixa', 'unidade'));
  end if;
end $$;

comment on column public.pa_fefo_ocorrencias.unidade is
  'Unidade da quantidade encontrada: palete, caixa ou unidade.';

-- Menor validade deixa de ser obrigatoria.
alter table public.pa_fefo_ocorrencias
  alter column menor_validade drop not null;

-- A checagem de coerencia continua valendo quando as DUAS datas
-- existirem: em SQL, comparacao com NULL da NULL, e CHECK so reprova o
-- que da FALSE -- entao a linha sem menor validade passa direto, sem
-- precisar afrouxar a regra para quem preenche as duas.
comment on constraint pa_fefo_datas_coerentes on public.pa_fefo_ocorrencias is
  'So compara quando a menor validade foi informada; sem ela, a linha passa.';

notify pgrst, 'reload schema';
