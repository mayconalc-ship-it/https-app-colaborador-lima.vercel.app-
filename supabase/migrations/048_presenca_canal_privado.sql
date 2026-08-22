-- Canal de presenca: fechar a porta e separar por revenda.
--
-- O QUE ESTAVA ERRADO
--
-- O canal "presenca-app" era criado sem `private: true`, e canal publico no
-- Realtime nao passa por RLS nenhuma. Ou seja: bastava a chave publica --
-- que viaja dentro do JavaScript do site, a vista de todos -- para entrar
-- nele e ler nome completo e cargo de quem estivesse com o app aberto.
-- Testado de fora, sem login nenhum, em 21/08/2026: devolveu a lista.
--
-- E o canal era UM SO para o app inteiro, entao Barreiras e Sao Felix
-- passariam a se enxergar assim que a segunda revenda entrasse.
--
-- O DESENHO NOVO
--
-- Um canal por revenda, chamado "presenca:<uuid da revenda>", e privado.
-- Canal privado consulta as politicas abaixo antes de deixar alguem entrar
-- ou se anunciar.
--
-- O separador e ":" e nao "-" de proposito: o uuid da revenda ja tem "-"
-- no meio, entao dividir por "-" quebraria o nome no lugar errado.
--
-- ORDEM: esta migration entra ANTES do deploy. Enquanto o app antigo
-- estiver no ar ele usa canal publico, que nao consulta politica nenhuma --
-- entao aplicar isto sozinho nao muda nada nem quebra nada.

-- ------------------------------------------------------------------
-- 1) De qual revenda e este topico?
-- ------------------------------------------------------------------
-- Devolve NULL para qualquer nome de topico que nao seja exatamente
-- "presenca:<uuid>". NULL no `in (...)` nao da verdadeiro, entao o
-- comportamento padrao e NEGAR -- que e o que se quer numa politica.

create or replace function public.revenda_do_topico(topico text)
returns uuid
language sql
stable
as $$
  select substring(topico from '^presenca:([0-9a-fA-F-]{36})$')::uuid
$$;

revoke all on function public.revenda_do_topico(text) from public;
grant execute on function public.revenda_do_topico(text) to authenticated;

-- ------------------------------------------------------------------
-- 2) Quem pode entrar e se anunciar
-- ------------------------------------------------------------------
-- Duas politicas porque presenca faz as duas coisas: LE quem esta online
-- (select) e ANUNCIA a si mesmo (insert). Faltando a de insert, a pessoa
-- veria os outros mas nao apareceria para ninguem.
--
-- O dono passa em qualquer revenda pelo mesmo motivo das outras tabelas:
-- ele administra o app inteiro e troca de revenda pelo seletor, sem
-- precisar de vinculo em cada uma.
--
-- `extension = 'presence'` limita a politica a presenca: mesmo que um dia
-- alguem crie um canal de broadcast com nome parecido, ele nao entra de
-- carona nesta permissao.

drop policy if exists "le presenca da propria revenda" on realtime.messages;
create policy "le presenca da propria revenda"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'presence'
    and (
      public.ehowner_atual()
      or public.revenda_do_topico((select realtime.topic()))
           in (select public.revendas_do_usuario())
    )
  );

drop policy if exists "anuncia presenca na propria revenda" on realtime.messages;
create policy "anuncia presenca na propria revenda"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and (
      public.ehowner_atual()
      or public.revenda_do_topico((select realtime.topic()))
           in (select public.revendas_do_usuario())
    )
  );

-- ------------------------------------------------------------------
-- O que isto NAO resolve
-- ------------------------------------------------------------------
-- O teto de 200 conexoes simultaneas do plano gratuito continua de pe:
-- separar em dois canais nao reduz o numero de CONEXOES, so o numero de
-- mensagens que cada uma recebe (que cresce ao quadrado do tamanho do
-- grupo, entao dividir em dois ja corta bastante).
--
-- Se as conexoes virarem problema de fato, o caminho e trocar a presenca
-- por uma consulta a uso_sessoes.ultima_atividade -- que o app ja grava a
-- cada 15 segundos de uso -- e aposentar o websocket permanente.
