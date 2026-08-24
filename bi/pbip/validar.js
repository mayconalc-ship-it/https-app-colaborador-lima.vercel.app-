// Confere o PBIP gerado antes de abrir no Power BI Desktop.
//
// O erro que este script existe para pegar: um campo escrito errado em
// paginas.js nao quebra a geracao -- ele produz um JSON perfeitamente
// valido que o Desktop abre e mostra como visual vazio, sem dizer por
// que. Achar isso a mao, em 8 paginas, e o pior jeito de gastar uma
// tarde.
//
// Rode: node bi/pbip/validar.js

const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const BI = path.resolve(RAIZ, '..');
const NOME = 'BI App do Colaborador';
const { tabelas } = require('./modelo');

let erros = 0;
const falha = (msg) => { console.log('  FALHA  ' + msg); erros++; };

// --- os $schema dos arquivos de definicao ------------------------------
// O Desktop valida cada um por expressao regular e recusa o projeto
// inteiro quando um nao bate -- com uma mensagem que nao diz qual era o
// valor certo. Cada padrao abaixo foi confirmado contra o Desktop.
const SCHEMAS = [
  [NOME + '.pbip',
    /^https:\/\/developer\.microsoft\.com\/json-schemas\/fabric\/pbip\/pbipProperties\/1\.[0-9]+\.[0-9]+\/schema\.json$/],
  // Aceita 1.x e 2.x: o Desktop atual escreve 2.0.0, e foi o gerador
  // gravando 1.0.0 que fez o relatorio abrir com a tela em branco.
  // Travar esta regra em 1.x era o que fazia o validador acusar o
  // arquivo CERTO como errado -- e passar o errado como certo.
  [path.join(NOME + '.Report', 'definition.pbir'),
    /^https:\/\/developer\.microsoft\.com\/json-schemas\/fabric\/item\/report\/definitionProperties\/[12]\.[0-9]+\.[0-9]+\/schema\.json$/],
  [path.join(NOME + '.SemanticModel', 'definition.pbism'),
    /^https:\/\/developer\.microsoft\.com\/json-schemas\/fabric\/item\/semanticModel\/definitionProperties\/1\.[0-9]+\.[0-9]+\/schema\.json$/],
];

for (const [rel, padrao] of SCHEMAS) {
  const p = path.join(RAIZ, rel);
  if (!fs.existsSync(p)) { falha(`${rel}: nao existe`); continue; }
  let j;
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { falha(`${rel}: JSON invalido -- ${e.message}`); continue; }
  if (!padrao.test(j.$schema || '')) falha(`${rel}: $schema fora do padrao -- "${j.$schema}"`);
}

// --- referencias cruzadas do TMDL --------------------------------------
// O Desktop reporta tudo isto como um "Cannot resolve all the paths while
// de-serializing Database" generico, sem dizer o valor certo. Aqui a
// falha aponta o objeto.
(function conferirTmdl() {
  const defs = path.join(RAIZ, NOME + '.SemanticModel', 'definition');
  if (!fs.existsSync(defs)) { falha('SemanticModel/definition nao existe'); return; }

  const arquivosTmdl = [];
  (function varrer(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) varrer(p);
      else if (e.name.endsWith('.tmdl')) arquivosTmdl.push(p);
    }
  })(defs);

  const declarado = { table: new Set(), expression: new Set(), queryGroup: new Set(), cultureInfo: new Set() };
  const textos = new Map();
  for (const p of arquivosTmdl) {
    const t = fs.readFileSync(p, 'utf8');
    textos.set(p, t);
    for (const linha of t.split(/\r?\n/)) {
      const m = linha.match(/^(table|expression|queryGroup|cultureInfo)\s+('([^']+)'|\S+)/);
      if (m) declarado[m[1]].add(m[3] || m[2]);
    }
  }

  // "ref <tipo> <nome>" no model.tmdl tem de encontrar o objeto.
  const modelo = textos.get(path.join(defs, 'model.tmdl')) || '';
  for (const linha of modelo.split(/\r?\n/)) {
    const m = linha.match(/^ref\s+(table|expression|queryGroup|cultureInfo)\s+('([^']+)'|\S+)/);
    if (!m) continue;
    const nome = m[3] || m[2];
    if (!declarado[m[1]].has(nome)) falha(`model.tmdl: "ref ${m[1]} ${nome}" nao encontra o objeto`);
  }

  // Propriedade "queryGroup:" tem de apontar para um queryGroup declarado.
  for (const [p, t] of textos) {
    for (const linha of t.split(/\r?\n/)) {
      const m = linha.match(/^\s+queryGroup:\s*(.+?)\s*$/);
      if (m && !declarado.queryGroup.has(m[1])) {
        falha(`${path.basename(p)}: queryGroup "${m[1]}" nao foi declarado`);
      }
    }
  }

  // Todo relacionamento aponta para tabela.coluna que existe.
  const rels = textos.get(path.join(defs, 'relationships.tmdl')) || '';
  for (const m of rels.matchAll(/^\s+(from|to)Column:\s*(\S+)\.(\S+)\s*$/gm)) {
    if (!declarado.table.has(m[2])) falha(`relationships.tmdl: tabela "${m[2]}" nao existe`);
  }
})();

// --- report.json -------------------------------------------------------
(function conferirReport() {
  const p = path.join(RAIZ, NOME + '.Report', 'definition', 'report.json');
  if (!fs.existsSync(p)) { falha('report.json nao existe'); return; }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));

  // Cada tema declarado precisa de reportVersionAtImport -- e obrigatorio
  // e o Desktop recusa o arquivo inteiro sem ele.
  for (const [papel, tema] of Object.entries(j.themeCollection || {})) {
    const v = tema.reportVersionAtImport;
    if (!v || !v.visual || !v.report || !v.page) {
      falha(`report.json: ${papel} sem reportVersionAtImport completo`);
    }
    // Tema registrado precisa existir como arquivo e estar no pacote.
    if (tema.type === 'RegisteredResources') {
      const pacote = (j.resourcePackages || []).find((r) => r.type === 'RegisteredResources');
      const item = (pacote ? pacote.items : []).find((i) => i.name === tema.name);
      if (!item) falha(`report.json: ${papel} "${tema.name}" nao esta em resourcePackages`);
      else {
        const arq = path.join(RAIZ, NOME + '.Report', 'StaticResources', 'RegisteredResources', item.path);
        if (!fs.existsSync(arq)) falha(`report.json: arquivo do tema nao existe -- ${item.path}`);
      }
    }
  }
})();

// --- o que o modelo oferece -------------------------------------------
const colunasPorTabela = new Map();
for (const t of tabelas) {
  colunasPorTabela.set(
    t.nome,
    new Set(t.colunas.trim().split(/\s+/).map((p) => p.split(':')[0])),
  );
}

const medidas = new Set(
  fs.readFileSync(path.join(BI, '07-medidas.dax'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*MEASURE\s+'_Medidas'\[(.+?)\]\s*=/))
    .filter(Boolean)
    .map((m) => m[1]),
);

// --- percorre os visuais ----------------------------------------------
const dirPaginas = path.join(RAIZ, NOME + '.Report', 'definition', 'pages');
const arquivos = [];
(function varrer(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) varrer(p);
    else if (e.name.endsWith('.json')) arquivos.push(p);
  }
})(dirPaginas);

let visuais = 0;
let campos = 0;

function conferirCampo(f, onde) {
  campos++;
  const alvo = f.Aggregation ? f.Aggregation.Expression : f;
  if (alvo.Measure) {
    const nome = alvo.Measure.Property;
    const ent = alvo.Measure.Expression.SourceRef.Entity;
    if (ent !== '_Medidas') falha(`${onde}: medida "${nome}" fora de _Medidas`);
    else if (!medidas.has(nome)) falha(`${onde}: medida inexistente "${nome}"`);
    return;
  }
  if (alvo.Column) {
    const tab = alvo.Column.Expression.SourceRef.Entity;
    const col = alvo.Column.Property;
    if (!colunasPorTabela.has(tab)) falha(`${onde}: tabela inexistente "${tab}"`);
    else if (!colunasPorTabela.get(tab).has(col)) falha(`${onde}: "${tab}" nao tem coluna "${col}"`);
    return;
  }
  falha(`${onde}: expressao de campo nao reconhecida`);
}

for (const arq of arquivos) {
  let j;
  try { j = JSON.parse(fs.readFileSync(arq, 'utf8')); }
  catch (e) { falha(`${path.basename(arq)}: JSON invalido -- ${e.message}`); continue; }
  // filterConfig existe tanto em page.json quanto em visual.json, e um
  // campo errado ali nao acusa nada: o filtro simplesmente nao filtra.
  for (const f of (j.filterConfig || {}).filters || []) {
    conferirCampo(f.field, `${path.basename(path.dirname(arq))} [filtro ${f.type}]`);
    const ent = (f.filter || {}).From;
    if (ent && f.field.Column && ent[0].Entity !== f.field.Column.Expression.SourceRef.Entity) {
      falha(`${j.name}: filtro com From "${ent[0].Entity}" e campo de outra tabela`);
    }
  }

  // Literais dos filtros. Um valor de TEXTO sem aspas dentro do
  // Literal.Value nao e recusado por ninguem: o Desktop aceita o
  // arquivo, comeca a renderizar e estoura em
  //
  //   TypeError: e[i].accept is not a function  (visitIn)
  //
  // ...que derruba o relatorio INTEIRO, sem dizer coluna, valor nem
  // pagina. Aconteceu em 23/08/2026 com os dias da semana no filtro de
  // domingo do Ativo de Giro. Um literal valido e: texto entre
  // apostrofos, numero, numero com sufixo L ou D, true ou false.
  const LITERAL_OK = /^('.*'|-?\d+(\.\d+)?[LDM]?|true|false|null)$/s;
  for (const f of (j.filterConfig || {}).filters || []) {
    for (const onde of (f.filter || {}).Where || []) {
      const valores = ((onde.Condition || {}).In || {}).Values || [];
      for (const linha of valores) {
        for (const item of linha) {
          const v = (item.Literal || {}).Value;
          if (v === undefined) continue;
          if (!LITERAL_OK.test(v)) {
            falha(`${j.name}: literal de filtro sem aspas -- ${v} (texto precisa de 'aspas')`);
          }
        }
      }
    }
  }

  if (!j.visual) continue;
  visuais++;
  const onde = `${j.visual.visualType} ${j.name}`;

  const pos = j.position;
  if (pos.x < 0 || pos.y < 0 || pos.x + pos.width > 1280 || pos.y + pos.height > 720) {
    falha(`${onde}: sai do canvas (x=${pos.x} y=${pos.y} w=${pos.width} h=${pos.height})`);
  }

  const q = j.visual.query;
  if (!q) continue;
  for (const [papel, estado] of Object.entries(q.queryState || {})) {
    for (const proj of estado.projections || []) conferirCampo(proj.field, `${onde} [${papel}]`);
  }
  for (const s of (q.sortDefinition || {}).sort || []) conferirCampo(s.field, `${onde} [ordem]`);
}

// --- sobreposicao de visuais na mesma pagina ---------------------------
// Dois visuais empilhados sao invisiveis no PBIR e obvios na tela.
for (const dir of fs.readdirSync(dirPaginas, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const dv = path.join(dirPaginas, dir.name, 'visuals');
  if (!fs.existsSync(dv)) continue;
  const caixas = fs.readdirSync(dv).map((n) => {
    const j = JSON.parse(fs.readFileSync(path.join(dv, n, 'visual.json'), 'utf8'));
    return { t: j.visual.visualType, ...j.position };
  // A faixa do cabecalho e o titulo ficam sobrepostos de proposito.
  }).filter((c) => c.t !== 'shape' && c.t !== 'textbox');

  for (let i = 0; i < caixas.length; i++) {
    for (let k = i + 1; k < caixas.length; k++) {
      const a = caixas[i], b = caixas[k];
      const cobre = a.x < b.x + b.width && b.x < a.x + a.width
        && a.y < b.y + b.height && b.y < a.y + a.height;
      if (cobre) falha(`pagina ${dir.name}: ${a.t} e ${b.t} se sobrepoem`);
    }
  }
}

console.log(`\nVisuais ...... ${visuais}`);
console.log(`Campos ....... ${campos}`);
console.log(`Medidas ...... ${medidas.size} disponiveis`);
console.log(erros ? `\n${erros} problema(s).` : '\nSem problemas.');
process.exit(erros ? 1 : 0);
