-- ==================================================================
-- 167 - Chamados para Manutencao: as areas do 5S e os e-mails
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (07/10/2026): "achei muito poucas areas para abertura
-- do chamado. Utilize as mesmas areas do modulo 5S." Decidido na
-- conversa: SOMAR as do 5S as 30 que ja existem (nao trocar), e a lista
-- passa a SEGUIR o 5S -- area nova cadastrada no 5S aparece no chamado
-- sem ninguem cadastrar de novo.
--
-- Como fica:
--   * cada area do 5S vira (ou aponta para) uma linha de chamados_locais.
--     Se o chamado ja tem area com o mesmo nome (Picking, Refeitorio,
--     Sala ADM...), as duas sao a MESMA: o painel nao divide os chamados
--     de um lugar em dois. Senao, nasce uma area nova, marcada
--     `veio_do_5s` -- o cadastro dela e o do 5S (nome e liga/desliga).
--   * quem faz isso e o app, na primeira vez que a lista e lida
--     (lerLocais em lib/chamados-server.ts), e de novo a cada area nova
--     no 5S. Aqui so as colunas.
--   * no formulario, a aba "Areas do 5S" mostra a lista do 5S inteira,
--     com os nomes do 5S; as abas de antes continuam iguais.
--
-- E-MAIL: o app nao tem servidor de e-mail (mesma decisao da Blitz e da
-- Mao de Obra -- o e-mail sai do Outlook de quem envia). A lideranca
-- cadastra em Admin > Chamados quem recebe, e cada chamado ganha o botao
-- "Enviar por e-mail", que abre o Outlook ja com destinatarios, assunto e
-- texto.
-- ==================================================================

alter table public.chamados_locais
  add column if not exists cinco_s_area_id uuid references public.cinco_s_areas(id) on delete set null,
  add column if not exists veio_do_5s boolean not null default false;

-- Uma area do 5S aponta para UMA area do chamado. Sem isto, duas telas
-- abertas ao mesmo tempo criariam a mesma area duas vezes.
create unique index if not exists chamados_locais_cinco_s_unico
  on public.chamados_locais (cinco_s_area_id)
  where cinco_s_area_id is not null;

alter table public.chamados_config
  add column if not exists emails text[] not null default '{}';

notify pgrst, 'reload schema';

-- Confira: as tres colunas novas.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'chamados_locais' and column_name in ('cinco_s_area_id', 'veio_do_5s'))
    or (table_name = 'chamados_config' and column_name = 'emails'))
order by table_name, column_name;
