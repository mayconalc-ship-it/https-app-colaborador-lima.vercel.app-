-- ==================================================================
-- 053 - ACESSO POR MODULO, GENERALIZADO -- fecha por padrao
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Ate aqui `colaborador_modulos_extra` so existia para o Ativo de Giro:
-- todo o resto do "Conteudo do app" era visivel para QUALQUER pessoa da
-- revenda, sem checagem individual. Esta migracao nao muda uma linha de
-- schema -- a tabela ja e generica desde a 020/021 (colaborador_id,
-- revenda_id, modulo). O que muda e o CODIGO que passa a checar essa
-- tabela para todo modulo, nao so o Ativo de Giro (ver MODULOS_OPCIONAIS
-- em lib/acessos.ts).
--
-- E e exatamente por isso que esta migracao existe: a partir do momento
-- em que o codigo passar a exigir a concessao, quem nao tiver uma linha
-- aqui para de ver o modulo. Sem este INSERT, TODO MUNDO perderia acesso
-- a Jornal, Padroes, Escala etc. no minuto em que o deploy for pro ar --
-- SAO FELIX E BARREIRAS JUNTAS, cada uma com o que ja tem hoje.
--
-- A regra e simples porque o estado de hoje e simples: se a revenda tem
-- o modulo ligado (revenda_modulos.ativo), QUALQUER pessoa vinculada a
-- ela ja consegue ver -- entao a "heranca" e um cross join dos dois,
-- um insert so, sem logica condicional por pessoa. Dali em diante,
-- restringir vira o Admin desmarcando quem nao deveria ter, na tabela
-- de "Usuarios e Acessos".
--
-- O Ativo de Giro fica de fora do cross join -- ele ja e restrito de
-- verdade hoje (nem todo mundo tem), e um cross join geral desfaria essa
-- restricao dando acesso a quem nunca teve.

insert into public.colaborador_modulos_extra (colaborador_id, revenda_id, modulo)
select cr.colaborador_id, cr.revenda_id, rm.modulo
from public.colaborador_revendas cr
join public.revenda_modulos rm
  on rm.revenda_id = cr.revenda_id
 and rm.ativo = true
where rm.modulo in (
  'comunicados', 'ranking', 'padroes', 'sonho', 'rotas',
  'escala', 'rv', 'quiz', 'feedbacks', 'produtividade-armazem'
)
on conflict (colaborador_id, revenda_id, modulo) do nothing;

notify pgrst, 'reload schema';
