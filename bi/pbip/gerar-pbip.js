// ==================================================================
// GERADOR DO PROJETO POWER BI (PBIP) DO APP DO COLABORADOR
// ==================================================================
// Rode:  node bi/pbip/gerar-pbip.js
// Saida: bi/pbip/BI App do Colaborador.{pbip,SemanticModel,Report}
//
// Por que um gerador e nao os arquivos versionados direto: sao ~60
// arquivos JSON/TMDL cuja unica fonte da verdade e a camada semantica.
// Quando uma view ganhar coluna, o caminho e mexer em modelo.js e rodar
// isto de novo -- editar 60 arquivos a mao e como esse tipo de projeto
// apodrece.
//
// As medidas NAO sao redigitadas aqui: elas sao lidas de 07-medidas.dax,
// que continua sendo o unico lugar onde a regra de calculo mora.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// O Desktop com o projeto aberto REGRAVA a pasta inteira ao salvar, com
// o que ele tem em memoria. Se o gerador rodar enquanto ele esta aberto,
// o proximo Salvar desfaz tudo -- e sem erro nenhum, o que faz parecer
// que o gerador nao funcionou. Ja aconteceu uma vez; a trava e barata.
function exigirDesktopFechado() {
  if (process.argv.includes('--forcar')) return;
  let saida = '';
  try {
    saida = execSync('tasklist /FI "IMAGENAME eq PBIDesktop.exe" /NH', { encoding: 'utf8' });
  } catch {
    return; // sem tasklist (outro SO) -- segue sem a trava
  }
  if (!/PBIDesktop/i.test(saida)) return;
  console.error('\nO Power BI Desktop esta aberto.\n');
  console.error('Feche-o ANTES de gerar. Se ele estiver com este projeto e voce');
  console.error('salvar depois, ele regrava a pasta com o estado antigo e a');
  console.error('geracao e perdida em silencio.\n');
  console.error('Se tiver certeza de que nao e este projeto: --forcar\n');
  process.exit(1);
}
exigirDesktopFechado();

const RAIZ = __dirname;
const BI = path.resolve(RAIZ, '..');
const NOME = 'BI App do Colaborador';
const DEST = path.join(RAIZ, NOME + '.SemanticModel');
const DEST_REL = path.join(RAIZ, NOME + '.Report');

const { tabelas, ocultas } = require('./modelo');
const { paginas, filtros } = require('./paginas');

// Os acabamentos se dividem em dois grupos:
//
//   VERIFICADOS  -- a forma do JSON foi extraida do .pbix de Planos de
//   Acao, que e da mesma versao do Desktop. Baixo risco.
//     - filtro de pagina (filterConfig Categorical)
//     - pageBinding
//
//   DERIVADOS    -- nao existem naquele arquivo; a forma vem do schema.
//   Se o Desktop recusar o projeto, rode com --simples para gerar sem
//   eles e recuperar em segundos, em vez de perder uma ida ao Desktop.
//     - syncGroup das segmentacoes
//     - filtro Advanced com comparacao (corte de >= 5 respostas)
//     - fillRule de gradiente nas barras de divergencia
//     - pageBinding do tipo Drillthrough
//
// Sintoma conhecido: o projeto ABRE e o modelo carrega, mas SALVAR
// estoura NullReferenceException em GetEnhancedReportDocument. E o
// Desktop falhando ao serializar o relatorio de volta para PBIR -- ou
// seja, ele aceitou ler algo que nao sabe escrever. Rode --simples.
// --simples desliga as quatro de uma vez. As individuais servem para
// isolar a culpada: ligue UMA, abra e salve. Se salvar, ela e inocente.
//
//   node gerar-pbip.js --simples --com-sync
//
// Testar uma por vez custa 4 ciclos no pior caso; adivinhar custa os
// mesmos 4 sem aprender nada no caminho.
const arg = (n) => process.argv.includes(n);
const SIMPLES = arg('--simples');
const ACAB = {
  sync:       arg('--com-sync')      || (!SIMPLES && !arg('--sem-sync')),
  corte:      arg('--com-corte')     || (!SIMPLES && !arg('--sem-corte')),
  gradiente:  arg('--com-gradiente') || (!SIMPLES && !arg('--sem-gradiente')),
  drill:      arg('--com-drill')     || (!SIMPLES && !arg('--sem-drill')),
};

// Servidor padrao = Session Pooler, e NAO a Direct Connection.
//
// db.<ref>.supabase.co resolve so em AAAA (IPv6). A rede do escritorio
// nao tem IPv6, e o conector PostgreSQL responde "Este host nao e
// conhecido" -- que parece nome errado, mas e falta de rota. O pooler
// tem IPv4 e foi confirmado alcancavel na porta 5432.
//
// Confirme a REGIAO no painel do Supabase (botao Connect > Session
// pooler): sa-east-1 e o esperado para operacao no Brasil, mas o projeto
// pode ter sido criado em outra. Regiao errada autentica com "Tenant or
// user not found".
//
// ATENCAO ao usuario: pelo pooler ele e "powerbi_readonly.<project-ref>",
// com o sufixo. Isso e digitado no dialogo de credenciais do Power BI,
// nao aqui.
const PROJECT_REF = 'lezoymdvhhndhoxuumcc';
const SERVIDOR_PADRAO = 'aws-0-sa-east-1.pooler.supabase.com:5432';
const BANCO_PADRAO = 'postgres';

// ------------------------------------------------------------------
// utilidades
// ------------------------------------------------------------------

// Ids estaveis: derivados do nome, para que rodar o gerador duas vezes
// nao produza um diff inteiro de GUIDs novos.
const hash = (s) => crypto.createHash('sha1').update('appcolab:' + s).digest('hex');
const id20 = (s) => hash(s).slice(0, 20);
const guid = (s) => {
  const h = hash(s);
  return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32)].join('-');
};

const escrever = (arquivo, conteudo) => {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, conteudo, 'utf8');
  contador++;
};
let contador = 0;

const json = (o) => JSON.stringify(o, null, 2);

// O Windows recusa apagar pasta que alguem esta segurando -- o Power BI
// com o projeto aberto, ou um terminal com o cwd la dentro. O erro cru
// (EPERM num rmSync) nao diz nada disso.
function limpar(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e;
    console.error(`\nNao consegui limpar:\n  ${dir}\n`);
    console.error('Alguem esta segurando essa pasta. Quase sempre e o Power BI');
    console.error('Desktop com o projeto aberto -- feche e rode de novo.\n');
    process.exit(1);
  }
}

const TIPOS = { s: 'string', i: 'int64', n: 'decimal', d: 'double', t: 'dateTime', b: 'boolean' };
const NUMERICOS = new Set(['int64', 'decimal', 'double']);

// ------------------------------------------------------------------
// 1) MEDIDAS -- lidas de 07-medidas.dax
// ------------------------------------------------------------------

function lerMedidas() {
  const bruto = fs.readFileSync(path.join(BI, '07-medidas.dax'), 'utf8');
  const linhas = bruto.split(/\r?\n/);
  const medidas = [];
  let atual = null;

  for (const linha of linhas) {
    const abertura = linha.match(/^\s*MEASURE\s+'_Medidas'\[(.+?)\]\s*=\s*(.*)$/);
    if (abertura) {
      if (atual) medidas.push(atual);
      atual = { nome: abertura[1], corpo: [] };
      if (abertura[2].trim()) atual.corpo.push(abertura[2].trim());
      continue;
    }
    if (/^\s*EVALUATE\b/.test(linha)) { if (atual) medidas.push(atual); atual = null; break; }
    if (!atual) continue;
    // Comentario de bloco entre medidas nao entra no corpo da proxima.
    if (atual.corpo.length === 0 && /^\s*\/\//.test(linha)) continue;
    atual.corpo.push(linha);
  }
  if (atual) medidas.push(atual);

  return medidas.map((m) => {
    // tira linhas vazias e comentarios soltos do fim
    while (m.corpo.length && !m.corpo[m.corpo.length - 1].trim()) m.corpo.pop();
    while (m.corpo.length && /^\s*\/\//.test(m.corpo[m.corpo.length - 1])) m.corpo.pop();
    while (m.corpo.length && !m.corpo[m.corpo.length - 1].trim()) m.corpo.pop();
    return { nome: m.nome, corpo: m.corpo };
  }).filter((m) => m.corpo.length);
}

// "Medidas de % formatadas como porcentagem com 1 casa" -- item da
// checagem final de layout-relatorio.md, resolvido aqui em vez de a mao
// medida por medida.
// Medidas que devolvem TEXTO. Format string numerico nelas nao quebra o
// visual, mas e sujeira -- e num cartao com sufixo herdado do tema, chega
// a atrapalhar.
const MEDIDAS_TEXTO = new Set(['Rota mais crítica', 'Causa raiz mais frequente']);

// Razoes que o nome nao denuncia: "Aproveitamento médio" cairia na regra
// de media e sairia como 0,8 em vez de 80,0%.
const MEDIDAS_PERCENTUAL = new Set(['Aproveitamento médio']);

function formatoDe(nome) {
  if (MEDIDAS_TEXTO.has(nome)) return null;
  if (MEDIDAS_PERCENTUAL.has(nome)) return '0.0%';
  if (nome.startsWith('%') || nome.startsWith('Δ ') || nome.startsWith('Taxa')) return '0.0%';
  if (/Horas|segundos|\(s\)|média|médio/i.test(nome)) return '0.0';
  return '#,0';
}

// ------------------------------------------------------------------
// 2) SEMANTIC MODEL (TMDL)
// ------------------------------------------------------------------

function colunasDe(tabela) {
  return tabela.colunas.trim().split(/\s+/).map((par) => {
    const [nome, t] = par.split(':');
    return { nome, tipo: TIPOS[t] };
  });
}

// A expressao M. Import direto da view; a chave composta so e adicionada
// onde o relacionamento com dim_colaborador precisa dela.
function expressaoM(tabela) {
  const l = [
    'let',
    '    Origem = PostgreSQL.Database(Servidor, Banco),',
    `    Dados = Origem{[Schema="bi",Item="${tabela.view}"]}[Data]`,
  ];
  if (tabela.chaveComposta) {
    l[2] += ',';
    // Text.From(null) levanta erro, entao o null vira "" -- a linha
    // simplesmente nao casa com a dimensao, que e o comportamento certo.
    l.push('    ComChave = Table.AddColumn(Dados, "chave", each');
    l.push('        (if [revenda_id] = null then "" else Text.From([revenda_id]))');
    l.push('        & "|" &');
    l.push('        (if [colaborador_id] = null then "" else Text.From([colaborador_id])),');
    l.push('        type text)');
    l.push('in');
    l.push('    ComChave');
  } else {
    l.push('in');
    l.push('    Dados');
  }
  return l;
}

function tmdlTabela(tabela, medidas) {
  const out = [];
  out.push(`table ${tabela.nome}`);
  if (tabela.tabelaDeDatas) out.push('\tdataCategory: Time');
  out.push(`\tlineageTag: ${guid('t:' + tabela.nome)}`);
  if (tabela.descricao) {
    out.length = 0;
    out.push(`/// ${tabela.descricao}`);
    out.push(`table ${tabela.nome}`);
    if (tabela.tabelaDeDatas) out.push('\tdataCategory: Time');
    out.push(`\tlineageTag: ${guid('t:' + tabela.nome)}`);
  }
  out.push('');

  for (const m of medidas) {
    out.push(`\tmeasure '${m.nome}' =`);
    for (const linha of m.corpo) out.push('\t\t\t' + linha.replace(/^\s{0,4}/, ''));
    const fmt = formatoDe(m.nome);
    if (fmt) out.push(`\t\tformatString: ${fmt}`);
    out.push(`\t\tlineageTag: ${guid('m:' + m.nome)}`);
    out.push('');
  }

  for (const c of colunasDe(tabela)) {
    out.push(`\tcolumn ${c.nome}`);
    if (tabela.tabelaDeDatas === c.nome) out.push('\t\tisKey');
    out.push(`\t\tdataType: ${c.tipo}`);
    if (ocultas.has(c.nome)) out.push('\t\tisHidden');
    if (c.tipo === 'dateTime') out.push('\t\tformatString: dd/MM/yyyy');
    out.push(`\t\tlineageTag: ${guid('c:' + tabela.nome + '.' + c.nome)}`);
    // summarizeBy none em tudo: soma automatica de "nota" ou "posicao" e
    // a origem classica do numero sem sentido no cartao.
    out.push('\t\tsummarizeBy: none');
    out.push(`\t\tsourceColumn: ${c.nome}`);
    if (tabela.urlImagem === c.nome) out.push('\t\tdataCategory: ImageUrl');
    // WebUrl faz a celula virar link clicavel na tabela, em vez de texto.
    if (tabela.urlWeb === c.nome) out.push('\t\tdataCategory: WebUrl');
    out.push('');
    out.push('\t\tannotation SummarizationSetBy = Automatic');
    out.push('');
  }

  out.push(`\tpartition ${tabela.nome} = m`);
  out.push('\t\tmode: import');
  out.push('\t\tsource =');
  for (const linha of expressaoM(tabela)) out.push('\t\t\t\t' + linha);
  out.push('');
  out.push('\tannotation PBI_ResultType = Table');
  out.push('');
  return out.join('\n');
}

function tmdlMedidasTabela(medidas) {
  const out = [];
  out.push('/// Guarda-chuva das medidas. A coluna e so o suporte da tabela.');
  out.push("table '_Medidas'");
  out.push(`\tlineageTag: ${guid('t:_Medidas')}`);
  out.push('');
  for (const m of medidas) {
    out.push(`\tmeasure '${m.nome}' =`);
    for (const linha of m.corpo) out.push('\t\t\t' + linha.replace(/^\s{0,4}/, ''));
    const fmt = formatoDe(m.nome);
    if (fmt) out.push(`\t\tformatString: ${fmt}`);
    out.push(`\t\tlineageTag: ${guid('m:' + m.nome)}`);
    out.push('');
  }
  out.push('\tcolumn Coluna1');
  out.push('\t\tdataType: string');
  out.push('\t\tisHidden');
  out.push(`\t\tlineageTag: ${guid('c:_Medidas.Coluna1')}`);
  out.push('\t\tsummarizeBy: none');
  out.push('\t\tsourceColumn: Coluna1');
  out.push('');
  out.push('\t\tannotation SummarizationSetBy = Automatic');
  out.push('');
  out.push("\tpartition '_Medidas' = m");
  out.push('\t\tmode: import');
  out.push('\t\tsource =');
  out.push('\t\t\t\tlet');
  out.push('\t\t\t\t    Tabela = #table({"Coluna1"}, {{""}})');
  out.push('\t\t\t\tin');
  out.push('\t\t\t\t    Tabela');
  out.push('');
  out.push('\tannotation PBI_ResultType = Table');
  out.push('');
  return out.join('\n');
}

function relacionamentos() {
  const rels = [];
  const add = (de, deCol, para, paraCol) => {
    rels.push({ nome: guid(`r:${de}.${deCol}->${para}.${paraCol}`), de, deCol, para, paraCol });
  };

  for (const t of tabelas) {
    if (t.nome === 'dim_calendario') continue;
    if (t.data) add(t.nome, t.data, 'dim_calendario', 'data');
    // dim_colaborador carrega a chave composta por ser o lado UM dela.
    // Sem esta guarda ela se relacionaria consigo mesma.
    if (t.nome === 'dim_colaborador') continue;
    // Um fato e OU ligado por chave composta (e herda a revenda pela
    // dim_colaborador) OU ligado direto na revenda. Nunca os dois -- dois
    // caminhos entre dim_revenda e o mesmo fato e ambiguidade, e o Power
    // BI resolve isso desativando um relacionamento em silencio.
    if (t.chaveComposta) add(t.nome, 'chave', 'dim_colaborador', 'chave');
    else if (t.revendaDireta) add(t.nome, 'revenda_id', 'dim_revenda', 'revenda_id');
  }
  add('dim_colaborador', 'revenda_id', 'dim_revenda', 'revenda_id');

  const out = rels.map((r) => [
    `relationship ${r.nome}`,
    `\tfromColumn: ${r.de}.${r.deCol}`,
    `\ttoColumn: ${r.para}.${r.paraCol}`,
    '',
  ].join('\n'));
  return { texto: out.join('\n'), total: rels.length };
}

function gerarModelo(medidas) {
  limpar(DEST);

  const nomesTabelas = ['_Medidas', ...tabelas.map((t) => t.nome)];

  escrever(path.join(DEST, '.platform'), json({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
    metadata: { type: 'SemanticModel', displayName: NOME },
    config: { version: '2.0', logicalId: guid('sm:' + NOME) },
  }));

  escrever(path.join(DEST, 'definition.pbism'), json({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json',
    version: '4.2',
    settings: {},
  }));

  escrever(path.join(DEST, 'definition', 'database.tmdl'),
    'database\n\tcompatibilityLevel: 1567\n');

  // Servidor e Banco como parametros: trocar de revenda, de projeto ou do
  // Direct Connection para o Session Pooler vira edicao de um campo, e
  // nao busca-e-substitui em 26 consultas.
  // Sem "queryGroup" aqui: um queryGroup precisa existir como objeto
  // declarado no modelo, e referenciar um que nao existe faz o Desktop
  // recusar o projeto inteiro com "Cannot resolve all the paths while
  // de-serializing Database". A pasta de parametros no editor era so
  // conforto visual e nao vale o risco.
  escrever(path.join(DEST, 'definition', 'expressions.tmdl'), [
    `expression Servidor = "${SERVIDOR_PADRAO}" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]`,
    `\tlineageTag: ${guid('e:Servidor')}`,
    '',
    '\tannotation PBI_ResultType = Text',
    '',
    `expression Banco = "${BANCO_PADRAO}" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]`,
    `\tlineageTag: ${guid('e:Banco')}`,
    '',
    '\tannotation PBI_ResultType = Text',
    '',
  ].join('\n'));

  const rel = relacionamentos();
  escrever(path.join(DEST, 'definition', 'relationships.tmdl'), rel.texto);

  escrever(path.join(DEST, 'definition', 'tables', '_Medidas.tmdl'), tmdlMedidasTabela(medidas));
  for (const t of tabelas) {
    escrever(path.join(DEST, 'definition', 'tables', t.nome + '.tmdl'), tmdlTabela(t, []));
  }

  const modelo = [
    'model Model',
    '\tculture: pt-BR',
    '\tdefaultPowerBIDataSourceVersion: powerBI_V3',
    '\tdiscourageImplicitMeasures',
    '\tsourceQueryCulture: pt-BR',
    '\tdataAccessOptions',
    '\t\tlegacyRedirects',
    '\t\treturnErrorValuesAsNull',
    '',
    '\tannotation PBI_QueryOrder = ' + JSON.stringify(['Servidor', 'Banco', ...nomesTabelas]),
    '',
    '\tannotation __PBI_TimeIntelligenceEnabled = 0',
    '',
    'ref expression Servidor',
    'ref expression Banco',
    ...nomesTabelas.map((n) => `ref table ${n.includes('_Medidas') ? "'_Medidas'" : n}`),
    '',
  ].join('\n');
  escrever(path.join(DEST, 'definition', 'model.tmdl'), modelo);

  return { relacionamentos: rel.total, tabelas: nomesTabelas.length };
}

// ------------------------------------------------------------------
// 3) REPORT (PBIR)
// ------------------------------------------------------------------

const S = {
  visual: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.11.0/schema.json',
  page: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json',
  pages: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json',
  report: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.3.0/schema.json',
  versao: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json',
};

const lit = (v) => ({ expr: { Literal: { Value: v } } });
const txt = (s) => lit(`'${String(s).replace(/'/g, "''")}'`);

// 'tabela.coluna' | 'tabela.coluna#soma' | '@Medida'
function campo(ref) {
  if (ref.startsWith('@')) {
    const nome = ref.slice(1);
    return {
      field: { Measure: { Expression: { SourceRef: { Entity: '_Medidas' } }, Property: nome } },
      queryRef: `_Medidas.${nome}`,
      nativeQueryRef: nome,
    };
  }
  // Function 0 = Sum, 2 = Count. Sao as duas unicas agregacoes que o
  // layout precisa; o resto vira medida em 07-medidas.dax, onde a regra
  // fica visivel e comentada.
  const AGG = { '#soma': 0, '#contagem': 2 };
  const sufixo = Object.keys(AGG).find((s) => ref.endsWith(s));
  const soma = Boolean(sufixo);
  const limpo = sufixo ? ref.slice(0, -sufixo.length) : ref;
  const ponto = limpo.indexOf('.');
  const tabela = limpo.slice(0, ponto);
  const coluna = limpo.slice(ponto + 1);
  const col = { Column: { Expression: { SourceRef: { Entity: tabela } }, Property: coluna } };
  if (soma) {
    const fn = AGG[sufixo];
    return {
      field: { Aggregation: { Expression: col, Function: fn } },
      queryRef: `${fn === 0 ? 'Sum' : 'Count'}(${tabela}.${coluna})`,
      nativeQueryRef: coluna,
    };
  }
  return { field: col, queryRef: `${tabela}.${coluna}`, nativeQueryRef: coluna };
}

const PAPEL_ATIVO = new Set(['Category', 'Rows', 'Columns', 'Series']);

function partes(ref) {
  const i = ref.indexOf('.');
  return { tabela: ref.slice(0, i), coluna: ref.slice(i + 1) };
}

// Filtro categorico "coluna IN (valores)". Forma extraida do .pbix de
// referencia -- e a mesma usada pelo painel Filtros do proprio Desktop.
function filtroCategorico(ref, valores) {
  const { tabela, coluna } = partes(ref);
  return {
    name: id20('flt:' + ref + ':' + valores.join(',')),
    field: { Column: { Expression: { SourceRef: { Entity: tabela } }, Property: coluna } },
    type: 'Categorical',
    filter: {
      Version: 2,
      From: [{ Name: 'f', Entity: tabela, Type: 0 }],
      Where: [{
        Condition: {
          In: {
            Expressions: [{ Column: { Expression: { SourceRef: { Source: 'f' } }, Property: coluna } }],
            Values: valores.map((v) => [{ Literal: { Value: String(v) } }]),
          },
        },
      }],
    },
  };
}

// Filtro "contagem da coluna >= minimo". ComparisonKind 3 e
// GreaterThanOrEqual; Function 2 e Count.
function filtroContagemMinima(ref, minimo) {
  const { tabela, coluna } = partes(ref);
  const agg = (fonte) => ({
    Aggregation: {
      Expression: { Column: { Expression: { SourceRef: fonte }, Property: coluna } },
      Function: 2,
    },
  });
  return {
    name: id20('flt:min:' + ref + ':' + minimo),
    field: agg({ Entity: tabela }),
    type: 'Advanced',
    filter: {
      Version: 2,
      From: [{ Name: 'f', Entity: tabela, Type: 0 }],
      Where: [{
        Condition: {
          Comparison: {
            ComparisonKind: 3,
            Left: agg({ Source: 'f' }),
            Right: { Literal: { Value: `${minimo}L` } },
          },
        },
      }],
    },
  };
}

// Gradiente sequencial por valor. A rampa e a de layout-relatorio.md --
// e a mesma em todo visual de magnitude, de proposito: rampa que muda de
// cor entre visuais obriga a reler a escala toda vez.
function gradienteSequencial() {
  return [{
    properties: {
      fillRule: {
        linearGradient2: {
          min: { color: { expr: { Literal: { Value: "'#E7EEFA'" } } } },
          max: { color: { expr: { Literal: { Value: "'#063573'" } } } },
        },
      },
    },
  }];
}

function visualJson(v, ordemZ) {
  const nomeVisual = id20(v.chave);
  const queryState = {};
  for (const [papel, refs] of Object.entries(v.roles || {})) {
    queryState[papel] = {
      projections: refs.map((r) => {
        const p = campo(r);
        if (PAPEL_ATIVO.has(papel)) p.active = true;
        return p;
      }),
    };
  }

  const visual = { visualType: v.t };
  if (Object.keys(queryState).length) visual.query = { queryState };
  if (v.ordem) {
    visual.query = visual.query || { queryState: {} };
    visual.query.sortDefinition = {
      sort: [{ field: campo(v.ordem.campo).field, direction: v.ordem.dir }],
    };
  }
  if (v.objects) visual.objects = v.objects;

  // --- formatacao padrao por tipo de visual -------------------------
  // Aplicada aqui, e nao visual a visual em paginas.js: formatacao que
  // se repete em 118 visuais tem que ter um lugar so. Mudar o negrito
  // dos rotulos deveria ser uma linha, nao 118.
  const fmt = (chave, props, seletor) => {
    visual.objects = visual.objects || {};
    if (visual.objects[chave]) return; // paginas.js manda mais que o padrao
    const item = { properties: props };
    if (seletor) item.selector = seletor;
    visual.objects[chave] = [item];
  };

  if (v.t === 'cardVisual') {
    // Barra de destaque no lugar da borda: a borda desenha uma caixa
    // fechada em volta de cada numero e a faixa de KPI vira uma grade.
    // A barra marca o cartao sem cerca-lo.
    fmt('accentBar', { show: lit('true') }, { id: 'default' });
    // Sao DUAS bordas diferentes e eu tinha desligado so uma: "border" e
    // a do cartao, "outline" e o contorno da forma. A terceira, do
    // container, fica em visualContainerObjects mais abaixo. Enquanto
    // qualquer uma das tres estiver ligada, a caixa continua desenhada.
    fmt('border', { show: lit('false') }, { id: 'default' });
    fmt('outline', { show: lit('false') }, { id: 'default' });
    // O rotulo interno repetiria o titulo do container -- duas vezes a
    // mesma palavra dentro de 240 px.
    fmt('label', { show: lit('false') }, { id: 'default' });
  }

  const COM_ROTULO = ['columnChart', 'clusteredColumnChart', 'barChart',
    'clusteredBarChart', 'lineChart', 'stackedAreaChart', 'funnel', 'scatterChart'];
  if (COM_ROTULO.includes(v.t)) {
    fmt('labels', { show: lit('true'), bold: lit('true') });
  }

  if (v.t === 'lineChart') {
    // Interpolação cardinal a 70%: a curva suaviza sem inventar
    // ondulação entre pontos, que é o que a cardinalidade alta faz.
    fmt('lineStyles', {
      lineChartType: lit("'smooth'"),
      interpolationSmooth: lit("'cardinal'"),
      interpolationSmoothParam: lit('70D'),
      strokeWidth: lit('2D'),
    });
  }

  // Gradiente por valor (acabamento 5).
  if (v.gradiente && ACAB.gradiente) {
    visual.objects = visual.objects || {};
    visual.objects.dataPoint = gradienteSequencial();
  }

  // Segmentacoes sincronizadas (acabamento 2). O grupo leva o nome do
  // campo: e o que faz o mesmo filtro se reencontrar em todas as paginas.
  if (v.grupoSincronia && ACAB.sync) {
    visual.syncGroup = { groupName: v.grupoSincronia, fieldChanges: true, filterChanges: true };
  }

  visual.visualContainerObjects = {
    title: [{ properties: v.titulo
      ? { show: lit('true'), text: txt(v.titulo), fontSize: lit('11D') }
      : { show: lit('false') } }],
  };
  if (v.t === 'cardVisual') {
    // A terceira borda: a do container do visual, que existe
    // independente das do cartao.
    visual.visualContainerObjects.border = [{ properties: { show: lit('false') } }];
  }

  // Caixa de texto do Power BI nasce com fundo BRANCO opaco. Para um
  // titulo em branco sobre a faixa azul, isso apaga o texto: fica uma
  // tarja branca vazia atravessando o cabecalho, e sobra so o emoji,
  // que tem cor propria. O sintoma engana -- parece forma sobreposta
  // que nao foi removida, quando e o fundo do proprio texto.
  if (v.fundoTransparente) {
    visual.visualContainerObjects.background = [{ properties: { show: lit('false') } }];
  }

  // Cabecalho do visual explicito. E ele que traz os icones de foco,
  // tela cheia e "mais opcoes" no modo de leitura -- sem eles ninguem
  // consegue ampliar um grafico apertado nem exportar os dados, e o
  // relatorio vira somente-olhar. Formas e caixas de texto ficam de
  // fora: cabecalho em cima de uma faixa decorativa e ruido.
  if (!['shape', 'textbox'].includes(v.t)) {
    visual.visualContainerObjects.visualHeader = [{ properties: { show: lit('true') } }];
  }
  visual.drillFilterOtherVisuals = true;

  const saida = {
    $schema: S.visual,
    name: nomeVisual,
    position: {
      x: v.x, y: v.y, z: ordemZ, height: v.h, width: v.w, tabOrder: ordemZ,
    },
    visual,
  };

  // Corte minimo de amostra (acabamento 3).
  if (v.corteMinimo && ACAB.corte) {
    saida.filterConfig = {
      filters: [filtroContagemMinima(v.corteMinimo.campo, v.corteMinimo.minimo)],
    };
  }

  return saida;
}

// Cabecalho: faixa azul + titulo. Identico em todas as paginas -- e o que
// faz o conjunto parecer um produto e nao oito arquivos.
function cabecalho(pagina) {
  return [
    {
      // Faixa colada no topo e cheia: y=0 e h=64, e nao y=16 e h=48.
      // Sem os 16 px de respiro em cima, ela vira cabecalho de verdade
      // em vez de tarja flutuando no meio do branco.
      chave: pagina.nome + ':faixa', t: 'shape', x: 0, y: 0, w: 1280, h: 68,
      objects: {
        shape: [{ properties: { tileShape: lit("'rectangle'") } }],
        fill: [{ properties: { fillColor: { solid: { color: lit("'#0B4DA2'") } } },
          selector: { id: 'default' } }],
        outline: [{ properties: { show: lit('false') } }],
      },
    },
    {
      // O titulo vai DIRETO sobre o azul.
      //
      // Antes havia uma pastilha branca atras dele, dimensionada por uma
      // estimativa de largura por caractere. Duas coisas davam errado:
      // a estimativa nunca acertava para todos os titulos, e o resultado
      // eram duas formas com o mesmo nome empilhadas, uma sobrando da
      // outra. A faixa ja e a superficie do titulo -- a pastilha era uma
      // segunda superficie resolvendo um problema que ela mesma criava.
      //
      // Branco sobre o azul da marca da contraste de 8,6:1, bem acima do
      // minimo de 4,5:1, entao nao ha por que intermediar com pastilha.
      // 52 px de altura, e nao 40: uma linha de 20pt precisa de ~37 px
      // mais folga, e com 40 o Power BI corta a parte de baixo das
      // letras -- o titulo aparece pela metade, sem aviso nenhum.
      chave: pagina.nome + ':titulo', t: 'textbox',
      x: 28, y: 8, w: 1000, h: 52,
      objects: {
        general: [{ properties: { paragraphs: [{ textRuns: [{
          value: pagina.nome,
          textStyle: { fontWeight: 'bold', fontSize: '20pt', color: '#FFFFFF' },
        }] }] } }],
      },
      // FUNDO DESLIGADO -- sem isto o titulo some.
      //
      // A caixa de texto do Power BI nasce com fundo BRANCO opaco. Com
      // texto branco em cima, o resultado e uma tarja branca vazia
      // atravessando a faixa azul: sobra so o emoji, que tem cor propria
      // e por isso continua visivel. Foi exatamente o que aconteceu na
      // primeira tentativa, e o sintoma engana -- parece pastilha que
      // nao foi removida, quando e o fundo do proprio texto.
      fundoTransparente: true,
    },
  ];
}

// 13,5 px por caractere e nao 11,5: a media anterior era do glifo, nao do
// avanco real com espacamento, e o titulo encostava na borda direita da
// pastilha. Sobrar 20 px numa pastilha nao incomoda ninguem; faltar 5
// corta a ultima letra.
function larguraPastilha(nome) {
  const emojis = (nome.match(/\p{Extended_Pictographic}/gu) || []).length;
  return Math.round(56 + (nome.length + emojis) * 13.5);
}

function visuaisFiltro(pagina) {
  // 4 filtros em 1280 com margem 16 e vao 12: (1280-32-36)/4 = 303.
  const largura = 303;
  return filtros.map((f, i) => ({
    chave: `${pagina.nome}:filtro:${f.titulo}`,
    t: 'slicer',
    x: 16 + i * 315, y: 72, w: largura, h: 72,
    titulo: null,
    grupoSincronia: f.campo,
    roles: { Values: [f.campo] },
    objects: {
      data: [{ properties: { mode: lit(`'${f.modo || 'Dropdown'}'`) } }],
      header: [{ properties: { show: lit('true'), text: txt(f.titulo), textSize: lit('10D') } }],
    },
  }));
}

function gerarRelatorio() {
  limpar(DEST_REL);

  escrever(path.join(DEST_REL, '.platform'), json({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
    metadata: { type: 'Report', displayName: NOME },
    config: { version: '2.0', logicalId: guid('rp:' + NOME) },
  }));

  // definitionProperties 2.0.0, e nao 1.0.0.
  //
  // Esta linha ja custou uma tarde: com 1.0.0 o Desktop ABRE o projeto,
  // carrega o modelo inteiro e mostra as tabelas no painel de dados --
  // e deixa a tela do relatorio em branco, sem nenhuma pagina e sem
  // nenhuma mensagem de erro. Parece relatorio vazio, e nao arquivo
  // recusado.
  //
  // O jeito de descobrir qual versao a instalacao usa e deixar o Desktop
  // salvar o projeto uma vez e ler o que ele escreveu aqui. Se um dia o
  // relatorio voltar a abrir vazio depois de uma atualizacao do Power
  // BI, e aqui que se olha primeiro.
  escrever(path.join(DEST_REL, 'definition.pbir'), json({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json',
    version: '4.0',
    datasetReference: { byPath: { path: `../${NOME}.SemanticModel` } },
  }));

  // O tema entra como recurso registrado: assim ele ja vem aplicado e
  // ninguem precisa lembrar de Exibir > Temas > Procurar temas.
  const tema = fs.readFileSync(path.join(BI, 'tema-powerbi.json'), 'utf8');
  escrever(path.join(DEST_REL, 'StaticResources', 'RegisteredResources', 'tema-powerbi.json'), tema);

  escrever(path.join(DEST_REL, 'definition', 'version.json'),
    json({ $schema: S.versao, version: '2.0.0' }));

  escrever(path.join(DEST_REL, 'definition', 'report.json'), json({
    $schema: S.report,
    // reportVersionAtImport e OBRIGATORIO no customTheme -- sem ele o
    // Desktop recusa o report.json. Os valores sao os do .pbix de
    // referencia (mesma versao do Desktop) e nao acompanham o $schema
    // acima: "report" aqui e 3.4.0 mesmo com o schema em 3.3.0.
    themeCollection: {
      customTheme: {
        name: 'tema-powerbi.json',
        reportVersionAtImport: { visual: '2.11.0', report: '3.4.0', page: '2.3.1' },
        type: 'RegisteredResources',
      },
    },
    resourcePackages: [{
      name: 'RegisteredResources', type: 'RegisteredResources',
      items: [{ name: 'tema-powerbi.json', path: 'tema-powerbi.json', type: 'CustomTheme' }],
    }],
    settings: {
      useStylableVisualContainerHeader: true,
      // Contraparte no nivel do relatorio do visualHeader de cada visual.
      // Se esta ficar true, nenhum cabecalho aparece no modo de leitura,
      // por mais que cada visual peca o seu.
      hideVisualContainerHeader: false,
      defaultDrillFilterOtherVisuals: true,
      useEnhancedTooltips: true,
      useDefaultAggregateDisplayName: true,
    },
  }));

  const ordem = [];
  for (const pagina of paginas) {
    const nomePagina = id20('p:' + pagina.nome);
    ordem.push(nomePagina);
    const dir = path.join(DEST_REL, 'definition', 'pages', nomePagina);

    const pg = {
      $schema: S.page,
      name: nomePagina,
      displayName: pagina.nome,
      displayOption: 'FitToPage',
      height: 720,
      width: 1280,
    };
    // A pagina de detalhe fica oculta: ela e destino de drill-through, e
    // nao um item de navegacao.
    if (pagina.oculta) pg.visibility = 'HiddenInViewMode';

    // Filtro obrigatorio no nivel da pagina (acabamento 1). Este e o
    // unico acabamento que nao e cosmetico: sem ele a pagina do AG
    // compara contagem antiga com o saldo de parque de hoje.
    if (pagina.filtroPagina) {
      pg.filterConfig = {
        filters: [filtroCategorico(pagina.filtroPagina.campo, pagina.filtroPagina.valores)],
      };
    }

    // Destino de drill-through (acabamento 4): a pagina passa a receber o
    // contexto do colaborador clicado em qualquer visual das outras.
    //
    // Entra no --simples porque tambem e derivado: o .pbix de referencia
    // tem pageBinding, mas do tipo "Default". O tipo "Drillthrough" e a
    // forma do filtro que o acompanha vieram do schema, nao de um arquivo
    // que o Desktop ja tenha aceitado.
    if (pagina.drillthrough && ACAB.drill) {
      const { tabela, coluna } = partes(pagina.drillthrough);
      pg.pageBinding = { name: id20('pb:' + pagina.nome), type: 'Drillthrough' };
      pg.filterConfig = {
        filters: [{
          name: id20('dt:' + pagina.drillthrough),
          field: { Column: { Expression: { SourceRef: { Entity: tabela } }, Property: coluna } },
          type: 'Drillthrough',
        }],
      };
    }

    escrever(path.join(dir, 'page.json'), json(pg));

    const lista = [
      ...cabecalho(pagina),
      ...(pagina.oculta ? [] : visuaisFiltro(pagina)),
      ...(pagina.kpis || []).map((k, i) => ({
        chave: `${pagina.nome}:kpi:${k[0]}`,
        t: 'cardVisual',
        // y acompanha os filtros, que ficaram mais altos.
        x: [16, 268, 520, 772, 1024][i], y: 152, w: 240, h: 96,
        titulo: k[0],
        roles: { Data: [k[1]] },
      })),
      ...pagina.visuais.map((v) => ({ ...v, chave: `${pagina.nome}:${v.titulo}` })),
    ];

    if (pagina.nota) {
      lista.push({
        chave: pagina.nome + ':nota',
        t: 'textbox', x: 16, y: 672, w: 1248, h: 30, titulo: null,
        objects: {
          general: [{ properties: { paragraphs: [{ textRuns: [{
            value: pagina.nota,
            textStyle: { fontSize: '8pt', color: '#64748B' },
          }] }] } }],
        },
      });
    }

    lista.forEach((v, i) => {
      const j = visualJson(v, (i + 1) * 1000);
      escrever(path.join(dir, 'visuals', j.name, 'visual.json'), json(j));
    });
  }

  escrever(path.join(DEST_REL, 'definition', 'pages', 'pages.json'), json({
    $schema: S.pages,
    pageOrder: ordem,
    activePageName: ordem[0],
  }));

  return ordem.length;
}

// ------------------------------------------------------------------
// 4) EXECUCAO
// ------------------------------------------------------------------

const medidas = lerMedidas();
const m = gerarModelo(medidas);
const totalPaginas = gerarRelatorio();

// O schema do .pbip NAO segue o padrao "fabric/item/<tipo>" dos demais
// arquivos: ele mora em "fabric/pbip/pbipProperties". O Desktop valida
// isso por expressao regular e recusa o projeto inteiro se nao bater.
escrever(path.join(RAIZ, NOME + '.pbip'), json({
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json',
  version: '1.0',
  artifacts: [{ report: { path: `${NOME}.Report` } }],
  settings: { enableAutoRecovery: true },
}));

console.log(`Tabelas .............. ${m.tabelas}`);
console.log(`Medidas .............. ${medidas.length}  (lidas de 07-medidas.dax)`);
console.log(`Relacionamentos ...... ${m.relacionamentos}`);
console.log(`Paginas .............. ${totalPaginas}`);
console.log(`Arquivos escritos .... ${contador}`);
console.log('Acabamentos .......... ' + Object.entries(ACAB)
  .map(([k, v]) => (v ? k : `${k}(off)`)).join('  '));
console.log(`\nAbra no Power BI Desktop:\n  ${path.join(RAIZ, NOME + '.pbip')}`);
console.log('\nCredenciais na primeira atualizacao:');
console.log(`  Servidor  ${SERVIDOR_PADRAO}`);
console.log(`  Banco     ${BANCO_PADRAO}`);
console.log(`  Usuario   powerbi_readonly.${PROJECT_REF}   <- o sufixo e obrigatorio no pooler`);
