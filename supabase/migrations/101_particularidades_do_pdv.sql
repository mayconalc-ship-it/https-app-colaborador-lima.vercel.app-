-- ==================================================================
-- 101 - Particularidades do PDV: o que o cliente tem de diferente
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (06/09/2026): "informaria para o app o codigo do cliente
-- e iria sugerir atraves de categorias cadastraveis, por exemplo horario
-- de descarga (...) outro exemplo sao pdvs que foram bloqueados, ele
-- lancaria e no painel de pendencia faria o acompanhamento de quantos
-- dias faltam para desbloquear (...) daria para lembrar o motorista sobre
-- clientes que dao nota detratora".
--
-- O QUE A BASE DIZ, e o que isso decidiu no desenho:
--
-- 1) O CODIGO DO PDV JA EXISTE E E CONFIAVEL. Das 14.623 avaliacoes do
--    Rating (jan-set/2026), ZERO estao sem `cod_pdv` -- 1.216 PDVs
--    distintos. Entao a particularidade se pendura no CODIGO, e nao num
--    cadastro de cliente novo que alguem teria de manter em dia.
--
-- 2) O PROBLEMA E CONCENTRADO, e por isso o lembrete vale. So 1,0% das
--    avaliacoes sao detratoras, e apenas 17 PDVs tem 2 ou mais. Sao
--    sempre os mesmos: BAR LINHA DIRETA (15 detratoras em 30 entregas),
--    "o frango assado" (8 de 8, media 1,6), DISTR TORANDO (2 de 2, media
--    1,0). Avisar sobre 17 clientes o motorista le; avisar sobre 1.216
--    ele ignora no terceiro dia.
--
-- 3) NAO DA PARA ADIVINHAR OS PDVs DO DIA PELO NUMERO DO MAPA -- medido,
--    e o resultado foi claro. O numero do mapa REPETE (so 10,5% aparecem
--    num unico dia: e uma rota fixa), mas os CLIENTES de cada dia mudam:
--    dos PDVs atendidos no ultimo dia de cada mapa, apenas 27,7% ja
--    tinham aparecido naquele mapa antes, e em 56% dos mapas NENHUM
--    tinha. Pior: 88,2% dos PDVs do historico NAO estavam na carga do
--    dia. Um alerta montado assim seria 9 em cada 10 avisos errados, e
--    alerta que erra 9 de 10 e alerta que ninguem le.
--
--    Por isso o alerta da pre-rota casa por REGIAO (cidade e bairro, que
--    e o que a planilha do roteirizador traz hoje) e diz o que e: "ha
--    particularidades nos bairros deste mapa". A lista exata do dia so
--    existe quando o roteirizador exportar os clientes por mapa -- e a
--    tabela ja esta pronta para isso (ver `pa_pdv_do_mapa`).

-- ------------------------------------------------------------------
-- 1) AS CATEGORIAS -- cadastraveis, como o dono pediu
-- ------------------------------------------------------------------
create table if not exists public.pa_pdv_categorias (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null,
  emoji text,
  -- A frase que explica o que entra nesta categoria. Sem ela, duas
  -- pessoas cadastram a mesma coisa em categorias diferentes e o
  -- historico deixa de comparar -- o mesmo motivo da ajuda no checklist
  -- da blitz (migration 100).
  ajuda text,

  -- QUANTO A PARTICULARIDADE PESA. Nem tudo e triangulo: "avisar antes de
  -- chegar" e uma informacao util, "cachorro solto" e seguranca. Tres
  -- niveis, e a tela usa cor e icone diferentes -- alerta que grita
  -- sempre vira alerta que nao se ouve.
  severidade text not null default 'atencao'
    check (severidade in ('info', 'atencao', 'critico')),

  -- ESTA CATEGORIA EXIGE PRAZO? "PDV bloqueado" sem data de fim vira
  -- bloqueio eterno que ninguem revisa; "horario de descarga" nao tem
  -- prazo nenhum. Quem decide e o cadastro, nao o codigo.
  exige_prazo boolean not null default false,
  -- E EXIGE HORARIO? ("descarregar so ate as 11h")
  exige_horario boolean not null default false,

  -- Aparece para quem esta NA ROTA (o triangulo do pedido) ou e so para
  -- quem acompanha? Nem toda particularidade e do motorista.
  alerta_na_rota boolean not null default true,

  ordem smallint not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),

  constraint pa_pdv_categoria_unica unique (revenda_id, nome)
);

create index if not exists pa_pdv_categorias_revenda_idx
  on public.pa_pdv_categorias (revenda_id, ativo, ordem);

-- ------------------------------------------------------------------
-- 2) A PARTICULARIDADE de um PDV
-- ------------------------------------------------------------------
create table if not exists public.pa_pdv_particularidades (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  categoria_id uuid not null references public.pa_pdv_categorias(id) on delete restrict,

  -- O CODIGO E A CHAVE, e vai normalizado (sem zeros a esquerda, como o
  -- mapa em lib/rotas.ts): a planilha traz "000507" e a pessoa digita
  -- "507". Sem normalizar, o mesmo PDV vira dois.
  cod_pdv text not null,
  -- O nome e a regiao vao GRAVADOS junto, e nao so referenciados: e o que
  -- permite mostrar "BAR LINHA DIRETA, CORIBE/CENTRO" sem depender de o
  -- Rating ter aquele PDV, e e o que casa o alerta com os bairros do
  -- mapa na pre-rota.
  nome_pdv text,
  cidade text,
  bairro text,

  -- O QUE O MOTORISTA LE. Uma frase, escrita para ser lida na porta do
  -- cliente -- nao um campo de observacao livre que vira paragrafo.
  aviso text not null,
  detalhe text,

  -- Para as categorias com horario ("descarga so ate as 11h").
  hora_de time,
  hora_ate time,
  -- 1=domingo ... 7=sabado. Vazio = todo dia.
  dias_semana smallint[],

  -- Para as categorias com prazo (o PDV bloqueado do pedido). O painel de
  -- pendencias conta os dias que faltam a partir de `ate`.
  de date,
  ate date,

  status text not null default 'ativa'
    check (status in ('ativa', 'resolvida', 'expirada')),

  -- DE ONDE VEIO. 'rating' e a sugestao automatica dos PDVs detratores
  -- reincidentes: a particularidade nasce proposta, e alguem confirma.
  -- Sem esta marca, ninguem sabe distinguir o que a operacao afirmou do
  -- que o app deduziu.
  origem text not null default 'manual'
    check (origem in ('manual', 'rating', 'devolucao')),

  criado_por uuid references auth.users(id) on delete set null,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por_nome text,
  resolucao text
);

create index if not exists pa_pdv_part_pdv_idx
  on public.pa_pdv_particularidades (revenda_id, cod_pdv, status);
create index if not exists pa_pdv_part_regiao_idx
  on public.pa_pdv_particularidades (revenda_id, status, cidade, bairro);
create index if not exists pa_pdv_part_prazo_idx
  on public.pa_pdv_particularidades (revenda_id, status, ate);

-- A MESMA PARTICULARIDADE NAO ENTRA DUAS VEZES enquanto estiver aberta.
-- Indice PARCIAL: so vale para 'ativa'. Resolvida a de agosto, a mesma
-- categoria pode ser aberta de novo em setembro -- o que se impede e a
-- duplicata viva, nao o historico.
create unique index if not exists pa_pdv_part_aberta_unica
  on public.pa_pdv_particularidades (revenda_id, cod_pdv, categoria_id)
  where status = 'ativa';

-- ------------------------------------------------------------------
-- 3) OS PDVs DE UM MAPA -- a ponte que ainda nao existe
-- ------------------------------------------------------------------
-- Fica VAZIA por enquanto, e de proposito. Medido acima: o historico do
-- Rating nao serve para prever os clientes do dia (88,2% de falso
-- alarme). O alerta exato depende de o roteirizador exportar a lista de
-- clientes por mapa; no dia em que isso existir, o importador grava aqui
-- e o alerta deixa de ser por regiao e passa a ser por cliente, sem mexer
-- em mais nada.
create table if not exists public.pa_pdv_do_mapa (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  data date not null,
  mapa text not null,
  cod_pdv text not null,
  nome_pdv text,
  cidade text,
  bairro text,
  sequencia smallint,
  importado_em timestamptz not null default now(),
  primary key (revenda_id, data, mapa, cod_pdv)
);

create index if not exists pa_pdv_do_mapa_idx
  on public.pa_pdv_do_mapa (revenda_id, mapa, data desc);

-- ------------------------------------------------------------------
-- 4) SEMENTE das categorias -- o que a operacao ja enfrenta
-- ------------------------------------------------------------------
-- As duas primeiras sao as do pedido. As outras saem do que aparece nos
-- motivos das avaliacoes detratoras e nas devolucoes: entrega atrasada,
-- produto errado, avaria, PDV fechado. Sao um PONTO DE PARTIDA para o
-- time revisar na tela de cadastro; nao foram validadas com eles.
insert into public.pa_pdv_categorias
  (revenda_id, nome, emoji, ajuda, severidade, exige_prazo, exige_horario, alerta_na_rota, ordem)
select r.id, c.nome, c.emoji, c.ajuda, c.severidade, c.exige_prazo, c.exige_horario, c.alerta_na_rota, c.ordem
from public.revendas r
cross join (
  values
    ('Horario de descarga', '⏰',
     'O cliente so recebe em determinada faixa. Ex.: "so ate as 11h", "nao recebe no horario de almoco".',
     'atencao', false, true, true, 1),
    ('PDV bloqueado', '🚫',
     'Cliente bloqueado para entrega. Exige a data de liberacao -- o painel conta os dias que faltam.',
     'critico', true, false, true, 2),
    ('Cliente detrator', '⭐',
     'Ja avaliou a entrega como detratora mais de uma vez. Diz ao motorista o que deu errado das outras vezes.',
     'atencao', false, false, true, 3),
    ('Acesso e estacionamento', '🅿️',
     'Rua estreita, sem onde parar, carreta nao entra, entrega so de moto ou a pe.',
     'atencao', false, false, true, 4),
    ('Descarga', '📦',
     'Nao tem ajudante, tem escada, precisa de carrinho, o deposito e longe da porta.',
     'info', false, false, true, 5),
    ('Pagamento', '💰',
     'So dinheiro, so pix, precisa de nota separada, paga com o dono presente.',
     'atencao', false, false, true, 6),
    ('Avisar antes de chegar', '📞',
     'Cliente pede ligacao ou mensagem antes da chegada.',
     'info', false, false, true, 7),
    ('Seguranca', '⚠️',
     'Cachorro solto, area de risco, entrar so acompanhado, evitar determinado horario.',
     'critico', false, false, true, 8),
    ('Vasilhame', '♻️',
     'Nao devolve vasilhame, exige conferencia na frente do cliente, costuma faltar casco.',
     'info', false, false, true, 9),
    ('Conferencia rigorosa', '🔍',
     'Cliente confere item a item. Ja gerou divergencia -- vale conferir junto e registrar.',
     'atencao', false, false, true, 10),
    ('Observacao da lideranca', '📌',
     'Recado que nao se encaixa nas outras. Aparece para quem acompanha; marque se deve ir para a rota.',
     'info', false, false, false, 11)
) as c(nome, emoji, ajuda, severidade, exige_prazo, exige_horario, alerta_na_rota, ordem)
on conflict (revenda_id, nome) do nothing;

-- ------------------------------------------------------------------
-- 5) MODULO
-- ------------------------------------------------------------------
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'pdv-particularidades', true
from public.revendas r
on conflict (revenda_id, modulo) do update set ativo = true;

-- ------------------------------------------------------------------
-- 6) RLS
-- ------------------------------------------------------------------
alter table public.pa_pdv_categorias enable row level security;
alter table public.pa_pdv_particularidades enable row level security;
alter table public.pa_pdv_do_mapa enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pa_pdv_categorias', 'pa_pdv_particularidades', 'pa_pdv_do_mapa']
  loop
    execute format('drop policy if exists "le %I da propria revenda" on public.%I', t, t);
    execute format(
      'create policy "le %I da propria revenda" on public.%I for select to authenticated
         using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))',
      t, t
    );
  end loop;
end $$;

grant select on public.pa_pdv_categorias, public.pa_pdv_particularidades, public.pa_pdv_do_mapa to authenticated;
grant all on public.pa_pdv_categorias, public.pa_pdv_particularidades, public.pa_pdv_do_mapa to service_role;

notify pgrst, 'reload schema';

-- Confira: as categorias semeadas e as tabelas vazias.
select
  (select count(*) from public.pa_pdv_categorias) as categorias,
  (select count(*) from public.pa_pdv_particularidades) as particularidades,
  (select count(*) from public.pa_pdv_do_mapa) as pdvs_por_mapa;
