-- ==================================================================
-- 043 - AGREGADOS DO 5S: CONTAR NO BANCO, NAO NA MEMORIA
-- Execute no Supabase: SQL Editor > New query > colar > Ctrl+A > Run
-- ==================================================================
-- Tres telas do modulo estavam trazendo milhares de linhas para o
-- servidor do app so para contar quantas eram. Funciona com o volume de
-- hoje e para de funcionar em silencio: o numero cresce, a tela demora
-- mais a cada mes, e ninguem consegue apontar quando comecou.
--
-- O padrao errado, em uma frase: `select ...limit(5000)` seguido de um
-- laco em JavaScript somando um contador. O banco ja sabe contar, e
-- devolve 6 numeros em vez de 5.000 linhas.
--
-- As funcoes abaixo substituem esses tres lugares.

-- ------------------------------------------------------------------
-- 1) Cartoes do Plano de Acao
-- ------------------------------------------------------------------
-- A tela /5s/acoes mostra 6 contadores no topo. Antes: 5.000 linhas
-- trafegadas e um laco. Agora: uma linha com 6 colunas.
--
-- O recorte de acesso vem por parametro, e nao e opcional -- e o mesmo
-- que a tela aplica na listagem. p_areas nulo significa "gestor, ve
-- tudo"; array vazio significa "so o que for atribuido a pessoa".
create or replace function public.cinco_s_resumo_acoes(
  p_revenda uuid,
  p_areas uuid[] default null,
  p_pessoa uuid default null
)
returns table (
  total bigint,
  aberta bigint,
  em_andamento bigint,
  concluida bigint,
  validada bigint,
  atrasadas bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where n.status = 'aberta'),
    count(*) filter (where n.status = 'em_andamento'),
    count(*) filter (where n.status = 'concluida'),
    count(*) filter (where n.status = 'validada'),
    count(*) filter (
      where n.status in ('aberta', 'em_andamento')
        and n.prazo is not null and n.prazo < current_date
    )
  from public.cinco_s_nao_conformidades n
  where n.revenda_id = p_revenda
    and (
      p_areas is null
      or n.area_id = any (p_areas)
      or n.responsavel_id = p_pessoa
    );
$$;

revoke all on function public.cinco_s_resumo_acoes(uuid, uuid[], uuid) from public;
grant execute on function public.cinco_s_resumo_acoes(uuid, uuid[], uuid) to service_role;

-- ------------------------------------------------------------------
-- 2) Quantas auditorias cada auditor fez
-- ------------------------------------------------------------------
-- A aba Auditores trazia 5.000 auditorias para montar um mapa de
-- contagem em memoria. Sao duas contagens por pessoa -- o banco faz
-- isso num group by.
create or replace function public.cinco_s_contagem_auditores(p_revenda uuid)
returns table (auditor_id uuid, feitas bigint, pendentes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.auditor_id,
    count(*) filter (where a.status = 'finalizada'),
    count(*) filter (where a.status in ('planejada', 'em_andamento'))
  from public.cinco_s_auditorias a
  where a.revenda_id = p_revenda
    and a.auditor_id is not null
    and a.status <> 'cancelada'
  group by a.auditor_id;
$$;

revoke all on function public.cinco_s_contagem_auditores(uuid) from public;
grant execute on function public.cinco_s_contagem_auditores(uuid) to service_role;

-- ------------------------------------------------------------------
-- 3) O ultimo auditor de cada area
-- ------------------------------------------------------------------
-- O planejamento do mes e do ano precisam saber quem auditou cada area
-- por ultimo. Antes: 500 (ou 1.000) auditorias trazidas e um laco que
-- guardava a primeira ocorrencia de cada area.
--
-- `distinct on` resolve no banco: uma linha por area, ja a mais
-- recente. Alem de mais barato, corrige um defeito silencioso -- com o
-- limite de 500 linhas e o ano inteiro planejado, uma area com pouca
-- atividade podia ficar de fora da janela e perder o auditor dela.
create or replace function public.cinco_s_ultimo_auditor(p_revenda uuid)
returns table (area_id uuid, auditor_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (a.area_id) a.area_id, a.auditor_id
    from public.cinco_s_auditorias a
   where a.revenda_id = p_revenda
     and a.auditor_id is not null
     and a.status <> 'cancelada'
   order by a.area_id, a.planejada_para desc;
$$;

revoke all on function public.cinco_s_ultimo_auditor(uuid) from public;
grant execute on function public.cinco_s_ultimo_auditor(uuid) to service_role;

-- ------------------------------------------------------------------
-- 4) Indice que faltava
-- ------------------------------------------------------------------
-- O resumo do plano de acao filtra por responsavel OU por area. O
-- indice de area ja existe (035); o de responsavel existia so com
-- status junto, o que nao serve para a contagem que ignora status.
create index if not exists cinco_s_nc_revenda_responsavel_idx
  on public.cinco_s_nao_conformidades (revenda_id, responsavel_id);

notify pgrst, 'reload schema';
