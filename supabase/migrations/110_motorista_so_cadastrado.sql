-- ==================================================================
-- 110 - Motorista da Portaria: so quem esta cadastrado
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (10/09/2026): "deixe informar os motoristas apenas se
-- eles tiverem cadastrado, deixe uma lista suspensa com os nomes
-- cadastrados, e caso queira colocar outro motorista, tera que cadastrar
-- pelo botao de + no mesmo campo, obrigatorio informar nome, CPF e quem
-- cadastrou".
--
-- A 061 tinha decidido o contrario, de proposito: motorista como TEXTO
-- LIVRE, "gente nova aparece antes de alguem lembrar de cadastrar". Medido
-- em 10/09/2026, o preco dessa escolha: em Sao Felix havia 1 motorista no
-- cadastro e 16 dos 17 atendimentos com nome digitado fora dele -- "Gilvan
-- santos", "Ivan santana", "Juliana". Nenhum com CPF. Um atendimento que
-- nao identifica o motorista nao serve para cruzar blitz, avaria ou
-- reincidencia -- e era para isso que o cadastro existia.
--
-- ------------------------------------------------------------------
-- 1) QUEM CADASTROU cada motorista
-- ------------------------------------------------------------------
-- Gravado pelo servidor a partir da sessao, e nao digitado: um campo
-- "quem cadastrou" preenchido a mao aceita qualquer nome, e a auditoria
-- vale exatamente o que vale o campo.

alter table public.pa_motoristas
  add column if not exists criado_por uuid references auth.users(id) on delete set null,
  add column if not exists criado_por_nome text;

comment on column public.pa_motoristas.criado_por_nome is
  'Quem cadastrou, gravado pelo servidor a partir da sessao -- nunca digitado. Nulo nos cadastros anteriores a 10/09/2026.';

-- ------------------------------------------------------------------
-- 2) O ATENDIMENTO APONTA PARA O MOTORISTA
-- ------------------------------------------------------------------
-- `motorista_nome` continua existindo e continua sendo gravado: e o que o
-- historico e os relatorios ja leem, e trocar a leitura de todos eles de
-- uma vez seria o tipo de mudanca que quebra uma tela esquecida.
--
-- `motorista_id` e o que a regra nova precisa: o servidor recusa o
-- registro se o id nao for de um motorista ATIVO desta revenda, e grava o
-- nome COMO ESTA NO CADASTRO -- nao como veio do formulario.
--
-- Nulo nos atendimentos antigos, de proposito: eles foram feitos com
-- texto livre, e inventar um vinculo por semelhanca de nome ("Ivan
-- santana" = "IVAN SANTANA DA SILVA"?) seria adivinhar.
--
-- `on delete set null`: excluir um motorista do cadastro nao pode apagar
-- nem travar o historico de quem ele ja atendeu.

alter table public.atendimentos_carretas
  add column if not exists motorista_id uuid references public.pa_motoristas(id) on delete set null;

create index if not exists atendimentos_carretas_motorista_idx
  on public.atendimentos_carretas (motorista_id)
  where motorista_id is not null;

notify pgrst, 'reload schema';

-- Confira: os motoristas cadastrados hoje, e quantos atendimentos ja
-- apontam para algum (zero ate a primeira chegada registrada depois disto).
select r.nome as revenda,
       count(distinct m.id) as motoristas_ativos,
       count(distinct m.id) filter (where m.cpf is null) as sem_cpf
  from public.revendas r
  left join public.pa_motoristas m on m.revenda_id = r.id and m.ativo
 group by r.nome
 order by r.nome;
