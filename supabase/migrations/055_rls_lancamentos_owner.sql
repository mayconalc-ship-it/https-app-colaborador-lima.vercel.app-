-- ==================================================================
-- 055 - RLS dos lancamentos de Reepack/Despejo/Picking: falta o Dono
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- A politica de LEITURA (049) sempre deixou o Dono ver tudo:
--   using (ehowner_atual() or revenda_id in (revendas_do_usuario()))
-- Mas insercao/edicao/exclusao so checavam "revenda_id in
-- (revendas_do_usuario())" -- que vem de colaborador_revendas. O Dono
-- nao esta necessariamente vinculado como colaborador em toda revenda
-- que administra (confirmado: Maycon so tem vinculo com Sao Felix, e
-- levou "new row violates row-level security policy" tentando lancar
-- um reepack de teste em Barreiras). Corrige as tres tabelas de
-- lancamento simples para o Dono poder lancar em qualquer revenda,
-- igual ja podia ler.

do $$
declare t text;
begin
  foreach t in array array[
    'pa_reepack_lancamentos', 'pa_despejo_lancamentos', 'pa_reabastecimentos_picking'
  ]
  loop
    execute format('drop policy if exists "insere %I proprio" on public.%I', t, t);
    execute format(
      'create policy "insere %I proprio" on public.%I for insert to authenticated
         with check (colaborador_id = auth.uid() and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario())))',
      t, t
    );

    execute format('drop policy if exists "edita %I proprio" on public.%I', t, t);
    execute format(
      'create policy "edita %I proprio" on public.%I for update to authenticated
         using (colaborador_id = auth.uid() and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario())))
         with check (colaborador_id = auth.uid() and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario())))',
      t, t
    );

    execute format('drop policy if exists "exclui %I proprio" on public.%I', t, t);
    execute format(
      'create policy "exclui %I proprio" on public.%I for delete to authenticated
         using (colaborador_id = auth.uid() and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario())))',
      t, t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
