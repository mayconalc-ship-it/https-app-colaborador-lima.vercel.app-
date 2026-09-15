// SEGURANCA POR REVENDA NO BI (14/09/2026, pedido do dono).
//
// Uma funcao (role) por revenda. Quem o dono puser numa funcao, no Power
// BI Service (modelo semantico > Seguranca), ve so aquela revenda; quem
// estiver nas duas ve as duas.
//
// O FILTRO VAI EM CADA TABELA COM revenda_id, e nao so em dim_revenda.
// Filtrar so a dimensao dependeria de todo fato ter caminho de
// relacionamento ate ela -- e varios se ligam por dim_colaborador ou pela
// chave composta, nao pela revenda. Tabela por tabela, a seguranca nao
// depende do desenho do modelo, e os filtros de Colaborador e Area tambem
// passam a listar so a gente da revenda.
//
// Tabela com dado de PESSOA e sem revenda_id nao tem como ser filtrada:
// fica bloqueada inteira nas funcoes (BLOQUEADAS). Hoje e so a de sessoes
// de uso, que nenhuma pagina nem medida usa.
//
// O QUE A SEGURANCA NAO ALCANCA: quem e Administrador, Membro ou
// Colaborador do workspace ve tudo, sempre -- e regra do Power BI. Ela vale
// para quem recebe o relatorio compartilhado ou como Visualizador.
//
// Revenda nova: acrescente aqui (o id vem de public.revendas). Tabela nova
// com revenda_id entra sozinha; o validar.js falha se alguma escapar.
const FUNCOES = [
  { nome: 'Revenda São Félix', revendaId: '7afe4da5-e846-4b02-947f-96843a2791fe' },
  { nome: 'Revenda Barreiras', revendaId: 'fc365d16-ccbd-4322-ae02-e992a36861e8' },
];

const BLOQUEADAS = ['fato_uso_sessao'];

function tmdlDaFuncao(funcao, tabelas) {
  const comRevenda = tabelas.filter((t) =>
    t.colunas.trim().split(/\s+/).some((c) => c.split(':')[0] === 'revenda_id'));
  const linhas = [
    `/// Ve so a ${funcao.nome}. Membros: Power BI Service > modelo semantico > Seguranca.`,
    `role '${funcao.nome}'`,
    '\tmodelPermission: read',
    '',
    ...comRevenda.map((t) => `\ttablePermission ${t.nome} = ${t.nome}[revenda_id] = "${funcao.revendaId}"`),
    ...BLOQUEADAS.map((nome) => `\ttablePermission ${nome} = FALSE()`),
    '',
  ];
  return linhas.join('\n');
}

module.exports = { FUNCOES, BLOQUEADAS, tmdlDaFuncao };
