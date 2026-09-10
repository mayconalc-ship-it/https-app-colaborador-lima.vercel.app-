-- ==================================================================
-- 111 - Perfil de Acesso tem TIPO: Colaborador ou Lideranca
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Defeito GRAVE relatado pelo dono (10/09/2026): "criei o perfil de
-- motorista, selecionei os modulos que esse perfil pode ter acesso, inclui
-- o colaborador de Barreiras ADOLFO (MOTORISTA-ENTREGADOR I). Ao testar,
-- ele ficou com o acesso de lideranca, podendo entrar no Modo Lideranca e
-- realizar edicao ou exclusao".
--
-- A CAUSA. O perfil so sabia gravar PERMISSAO DE MODO LIDERANCA
-- (lideranca_permissoes), e aplicar um perfil promovia a pessoa a
-- "lideranca" em silencio, porque sem esse papel as permissoes ficam
-- inertes. Os 9 modulos marcados (Comunicados, Escala, Ranking, Padroes,
-- Desafio...) sao exatamente os MODULOS DO APP que se liberam por pessoa
-- (colaborador_modulos_extra) -- a intencao era "o que o motorista ve no
-- app", e o perfil entregou "o que ele gerencia no Modo Lideranca".
--
-- O CONSERTO: o perfil passa a ter um de dois tipos, escolhido ao criar.
--
--   colaborador -- os modulos que a pessoa VE NO APP. Grava em
--                  colaborador_modulos_extra. NUNCA muda o papel.
--   lideranca   -- o que a pessoa VE, CRIA, EDITA e EXCLUI no Modo
--                  Lideranca. So promove um colaborador com confirmacao
--                  explicita de quem aplica.
--
-- Todos os perfis existentes nascem "lideranca" -- e o que eles sao hoje.
-- A excecao e o "Motorista" de Barreiras, convertido abaixo.

alter table public.perfis_acesso
  add column if not exists tipo text not null default 'lideranca';

alter table public.perfis_acesso drop constraint if exists perfis_acesso_tipo_check;
alter table public.perfis_acesso
  add constraint perfis_acesso_tipo_check check (tipo in ('lideranca', 'colaborador'));

comment on column public.perfis_acesso.tipo is
  'colaborador = modulos que a pessoa ve no app (colaborador_modulos_extra), nunca muda o papel. lideranca = permissoes do Modo Lideranca (lideranca_permissoes); promover colaborador exige confirmacao de quem aplica.';

-- Os modulos de um perfil de COLABORADOR. Tabela propria, e nao
-- perfil_permissoes com acao "ver": la "ver" quer dizer "abrir a tela de
-- gestao", e foi justamente essa ambiguidade que causou o defeito.
create table if not exists public.perfil_modulos_app (
  perfil_id uuid not null references public.perfis_acesso(id) on delete cascade,
  modulo text not null,
  primary key (perfil_id, modulo)
);

comment on table public.perfil_modulos_app is
  'Modulos do app de um perfil do tipo colaborador. Aplicar grava em colaborador_modulos_extra -- nunca em lideranca_permissoes.';

-- Mesmo desenho da 084: RLS ligada e sem politica -- quem le e escreve e
-- o servidor, com o cliente de servico, depois de conferir a permissao.
alter table public.perfil_modulos_app enable row level security;
grant all on public.perfil_modulos_app to service_role;

-- ------------------------------------------------------------------
-- O "MOTORISTA" DE BARREIRAS vira o que ele deveria ter sido
-- ------------------------------------------------------------------
-- Os 9 "ver" que ele tinha passam a ser modulos do app, e as permissoes de
-- lideranca dele somem. Ninguem esta vinculado a ele hoje (o Adolfo foi
-- desvinculado e voltou a colaborador na correcao de 10/09/2026), entao
-- converter nao mexe no acesso de ninguem.
update public.perfis_acesso
   set tipo = 'colaborador'
 where id = '08a81063-a4f0-408c-826d-b0e76dabfeea';

insert into public.perfil_modulos_app (perfil_id, modulo)
select perfil_id, modulo
  from public.perfil_permissoes
 where perfil_id = '08a81063-a4f0-408c-826d-b0e76dabfeea'
   and acao = 'ver'
   and modulo in (
     'ativo-giro', 'comunicados', 'ranking', 'padroes', 'sonho', 'rotas', 'escala', 'rv',
     'quiz', 'feedbacks', '5s', 'pa-reepack', 'pa-despejo', 'pa-empilhadeira',
     'pa-recebimento', 'pa-cinco-s', 'pa-picking', 'pa-bate-palete', 'carretas-portaria',
     'carretas-conferencia', 'carretas-descarga', 'fefo', 'fefo-controle', 'rating',
     'refugo', 'devolucao', 'meus-indicadores'
   )
on conflict do nothing;

delete from public.perfil_permissoes
 where perfil_id = '08a81063-a4f0-408c-826d-b0e76dabfeea';

notify pgrst, 'reload schema';

-- Confira: o tipo de cada perfil, e o que o Motorista virou.
select p.nome,
       p.tipo,
       (select count(*) from public.perfil_permissoes pp where pp.perfil_id = p.id) as permissoes_lideranca,
       (select count(*) from public.perfil_modulos_app pm where pm.perfil_id = p.id) as modulos_do_app
  from public.perfis_acesso p
 order by p.tipo, p.nome;
