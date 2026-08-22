-- Logo da revenda: a marca da empresa passa a ser CONTEUDO, nao codigo.
--
-- Ate agora o cabecalho do app trazia a logo de uma empresa especifica,
-- gravada como arquivo no repositorio. Com mais de uma revenda isso deixa
-- de fazer sentido: cada unidade tem a sua, e o app precisa mostrar a de
-- quem esta usando -- do mesmo jeito que ja faz com comunicado, escala e
-- padrao.
--
-- Quem nao subir nada continua funcionando: o cabecalho cai na marca do
-- proprio app, que e o "C" azul e dourado. Por isso a coluna aceita nulo
-- e nao tem valor padrao.
--
-- A URL aponta para o bucket "conteudo", na pasta da propria revenda --
-- mesmo lugar e mesma convencao dos outros arquivos que o Admin sobe.

alter table public.revendas
  add column if not exists logo_url text;

comment on column public.revendas.logo_url is
  'Logo da empresa, mostrada no cabecalho do app. Nulo = usa a marca do App do Colaborador.';
