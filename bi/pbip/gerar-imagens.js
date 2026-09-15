// AS IMAGENS DA CAPA "INICIO" E DA NAVEGACAO POR AREA (14/09/2026).
//
// Cartao, quadradinho e botao sao PNG, e nao forma + caixa de texto do
// Power BI, por dois motivos:
//   * o clique: imagem com visualLink/PageNavigation ja navega no Desktop
//     e no Service (e o C do logo). Forma com texto por cima teria o texto
//     roubando o clique, e o botao em branco por cima e outra peca sem
//     exemplo real aqui;
//   * o desenho: canto arredondado, sombra, icone e as cores do app, que a
//     formatacao do Power BI nao da sem propriedade nova para adivinhar.
//
// Emoji NAO entra nas imagens: o renderizador desta maquina os desenha em
// preto. Os icones sao vetor, no traco dos icones do app.
//
// Rodar quando mudar uma area, rotulo ou resumo (blocos, em paginas.js):
//   node bi/pbip/gerar-imagens.js
// Saida: bi/imagens/*.svg (o que o BI usa, desde 15/09/2026) + *.png de
// reserva, em 3x + manifesto.json (tamanho de exibicao de cada uma, que o
// gerador usa para posicionar).
const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '..', '..', 'node_modules', 'sharp'));
const { blocos } = require('./paginas');

const DEST = path.join(__dirname, '..', 'imagens');
// 3x e nao 2x (14/09/2026): numa tela grande o Power BI amplia a pagina
// inteira ("ajustar a pagina"), e com 2x os quadradinhos borravam.
const ESCALA = 3;
const COR = {
  azul: '#0B4DA2', azulEscuro: '#063573', azulSuave: '#E7EEFA',
  ouro: '#FFC72C', ouroSuave: '#FFF4D6', ouroTexto: '#7A5600',
  texto: '#0F172A', cinza: '#475569', borda: '#CBD5E1', linha: '#E2E8F0',
};
const FONTE = "'Segoe UI', Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Icones em traco, grade de 24 x 24.
const ICONES = {
  caminhao: '<path d="M1.5 5.5h11.5v10.5H1.5z"/><path d="M13 9h4.5l3.5 3.5V16H13z"/><circle cx="5.5" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  caixa: '<path d="M12 2.5l8.5 4.5v10L12 21.5 3.5 17V7z"/><path d="M3.5 7L12 11.5 20.5 7"/><path d="M12 11.5v10"/>',
  grafico: '<path d="M3 21h18"/><rect x="5" y="11" width="3.2" height="7" rx="1"/><rect x="10.4" y="5" width="3.2" height="13" rx="1"/><rect x="15.8" y="13" width="3.2" height="5" rx="1"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  empilhadeira: '<path d="M2.5 16V9h6l2.5 4h3v3"/><path d="M17 3v14"/><path d="M17 17h5"/><circle cx="5.5" cy="18" r="2"/><circle cx="12" cy="18" r="2"/>',
  pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14c2.9 0 5 1.9 5 5"/>',
  brilho: '<path d="M11 3l2 5.5 5.5 2-5.5 2L11 18l-2-5.5-5.5-2 5.5-2z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  pergunta: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.8 2.8 0 1 1 4 2.5c-.8.4-1.3 1-1.3 1.9v.4"/><path d="M12 17h.01"/>',
  casa: '<path d="M3 11l9-7.5 9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
};
const icone = (nome, x, y, tam, cor, esp = 2) =>
  `<g transform="translate(${x} ${y}) scale(${tam / 24})" fill="none" stroke="${cor}" ` +
  `stroke-width="${esp}" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome]}</g>`;

// O C do app (src/app/icon.svg sem o quadrado), no tamanho pedido.
const logoC = (x, y, tam, opacidade = 1) =>
  `<g transform="translate(${x} ${y}) scale(${tam / 88}) translate(-6 -6)" opacity="${opacidade}">` +
  '<path d="M 39.06 80.07 A 32 32 0 0 0 66 77.71" fill="none" stroke="#ffc72c" stroke-width="15" stroke-linecap="round"/>' +
  '<path d="M 68.35 23.79 A 32 32 0 1 0 39.06 80.07" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round"/>' +
  '<path d="M 79.86 69.71 L 72.50 88.97 L 59.50 66.45 Z" fill="#ffc72c"/></g>';

const texto = (x, y, s, px, peso, cor, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${FONTE}" font-size="${px}" font-weight="${peso}" fill="${cor}" ${extra}>${esc(s)}</text>`;

// Largura REAL do texto: desenha sozinho em fundo transparente e apara.
async function largura(s, px, peso) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${px * 3}">` +
    texto(4, px * 2, s, px, peso, '#000') + '</svg>';
  const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
  return info.width;
}

// Quebra por largura medida, no maximo `max` linhas (a ultima ganha "…").
async function quebrar(s, px, peso, larguraMax, max) {
  const palavras = s.split(' ');
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (!atual || (await largura(tentativa, px, peso)) <= larguraMax) atual = tentativa;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  if (linhas.length > max) {
    const cortadas = linhas.slice(0, max);
    cortadas[max - 1] = cortadas[max - 1].replace(/\s*·?\s*$/, '') + ' …';
    return cortadas;
  }
  return linhas;
}

// Largura de AVANCO do texto -- a que o navegador usa para posicionar --, e
// nao so a da tinta: "|texto|" menos "||" tira as bordas das barras.
async function avanco(s, px, peso) {
  return (await largura(`|${s}|`, px, peso)) - (await largura('||', px, peso));
}

// Cada <text> ganha textLength com a largura medida aqui. Assim o texto
// ocupa o MESMO espaco em qualquer aparelho, com ou sem Segoe UI -- no
// celular sem a fonte, o rotulo nao estoura o quadradinho.
async function travarLarguras(corpo) {
  const re = /<text ([^>]*)>([^<]*)<\/text>/g;
  let saida = '';
  let ultimo = 0;
  let m;
  while ((m = re.exec(corpo))) {
    const attrs = m[1];
    const px = Number(/font-size="([\d.]+)"/.exec(attrs)[1]);
    const peso = Number(/font-weight="(\d+)"/.exec(attrs)[1]);
    const conteudo = m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const w = await avanco(conteudo, px, peso);
    saida += corpo.slice(ultimo, m.index) +
      `<text ${attrs} textLength="${w}" lengthAdjust="spacingAndGlyphs">${m[2]}</text>`;
    ultimo = re.lastIndex;
  }
  return saida + corpo.slice(ultimo);
}

// SVG, E NAO SO PNG (15/09/2026, pedido do dono: capa e navegacao
// "embacadas"). O PNG, mesmo em 3x, e REDUZIDO pelo navegador para caber
// na tela ("ajustar a pagina") -- e reducao em fator quebrado amacia texto
// fino e borda. O SVG e vetor: o navegador desenha no tamanho exato da
// tela, nitido em qualquer monitor e em qualquer zoom.
//
// O PNG continua saindo ao lado, de reserva: voltar para ele e trocar EXT
// em navegacao.js.
//
// Os ids (gradiente, sombra, recorte) ganham o nome do arquivo: se o Power
// BI puser dois SVG na mesma pagina do navegador, "#s" de um cartao nao
// pode pegar a sombra do outro.
const manifesto = {};
async function salvar(nome, w, h, corpo) {
  const base = nome.replace(/\.png$/, '');
  const sufixo = base.replace(/[^a-z0-9]+/gi, '-');
  const unico = corpo
    .replace(/id="([^"]+)"/g, `id="$1-${sufixo}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1-${sufixo})`);
  const vetor = await travarLarguras(unico);
  const abre = (lw, lh) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${lw}" height="${lh}" viewBox="0 0 ${w} ${h}">`;
  fs.writeFileSync(path.join(DEST, `${base}.svg`), `${abre(w, h)}${vetor}</svg>\n`);
  await sharp(Buffer.from(`${abre(w * ESCALA, h * ESCALA)}${vetor}</svg>`)).png()
    .toFile(path.join(DEST, `${base}.png`));
  manifesto[`${base}.svg`] = { w, h };
  manifesto[`${base}.png`] = { w, h };
}

// --- o topo da capa -----------------------------------------------------
async function topo() {
  const W = 1280, H = 200;
  await salvar('inicio-topo.png', W, H,
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    `<stop offset="0" stop-color="${COR.azul}"/><stop offset="1" stop-color="${COR.azulEscuro}"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
    // O C grande, apagado, atras do cartao de atualizacao: a marca sem gritar.
    logoC(760, -40, 300, 0.07) +
    logoC(44, 44, 112) +
    texto(184, 96, 'BI App do Colaborador', 40, 700, '#FFFFFF') +
    texto(186, 130, 'Lima Logística · escolha uma área para começar', 18, 400, COR.azulSuave) +
    `<rect x="186" y="148" width="148" height="28" rx="14" fill="${COR.ouro}"/>` +
    texto(260, 167, 'Painel de gestão', 13, 700, COR.azulEscuro, 'text-anchor="middle"'));
}

// --- o cartao de cada area, na capa -------------------------------------
async function cartao(b) {
  const W = 306, H = 222, M = 8, IW = W - 2 * M, IH = H - 2 * M;
  const qtd = b.paginas.length;
  const selo = `${qtd} ${qtd === 1 ? 'página' : 'páginas'}`;
  const wSelo = (await largura(selo, 12, 600)) + 22;
  let pxTitulo = 21;
  while ((await largura(b.nome, pxTitulo, 700)) > IW - 36 && pxTitulo > 16) pxTitulo--;
  const resumo = await quebrar(b.resumo, 13.5, 400, IW - 36, 1);
  const lista = b.paginas.map(([, r]) => r).filter((r) => !r.includes('·')).join(' · ');
  const paginas = await quebrar(lista, 12.5, 600, IW - 36, 2);
  await salvar(`secao-${b.chave}.png`, W, H,
    '<defs><filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="5"/></filter>' +
    `<clipPath id="c"><rect x="${M}" y="${M}" width="${IW}" height="${IH}" rx="18"/></clipPath></defs>` +
    `<rect x="${M + 2}" y="${M + 5}" width="${IW - 4}" height="${IH - 2}" rx="18" fill="${COR.texto}" opacity="0.10" filter="url(#s)"/>` +
    `<rect x="${M}" y="${M}" width="${IW}" height="${IH}" rx="18" fill="#FFFFFF" stroke="${COR.linha}"/>` +
    `<rect x="${M}" y="${M}" width="${IW}" height="5" fill="${COR.ouro}" clip-path="url(#c)"/>` +
    `<rect x="${M + 18}" y="${M + 22}" width="52" height="52" rx="14" fill="${COR.azulSuave}"/>` +
    icone(b.icone, M + 31, M + 35, 26, COR.azul, 2) +
    `<rect x="${W - M - 18 - wSelo}" y="${M + 35}" width="${wSelo}" height="26" rx="13" fill="${COR.ouroSuave}"/>` +
    texto(W - M - 18 - wSelo / 2, M + 52, selo, 12, 600, COR.ouroTexto, 'text-anchor="middle"') +
    texto(M + 18, M + 104, b.nome, pxTitulo, 700, COR.texto) +
    resumo.map((l, i) => texto(M + 18, M + 128 + i * 18, l, 13.5, 400, COR.cinza)).join('') +
    paginas.map((l, i) => texto(M + 18, M + 154 + i * 17, l, 12.5, 600, COR.azul)).join('') +
    texto(W - M - 18, M + IH - 14, 'Abrir →', 13, 700, COR.azul, 'text-anchor="end"'));
}

// --- a faixa de navegacao de cada area ------------------------------------
// MAIS NITIDOS (14/09/2026, pedido do dono): 36 px de altura, texto em
// negrito, e o quadradinho apagado deixou de ser branco com borda cinza --
// sobre a faixa branca ele sumia. Agora: fundo azul-claro, borda azul
// visivel, texto azul-escuro. O aceso continua azul cheio.
async function selo(b) {
  const H = 36, wT = await largura(b.nome, 14, 700), W = 42 + wT + 16;
  await salvar(`chip-${b.chave}.png`, W, H,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${COR.azulSuave}"/>` +
    icone(b.icone, 13, 9, 18, COR.azulEscuro, 2.3) +
    texto(42, 23.5, b.nome, 14, 700, COR.azulEscuro));
}

async function abas(b) {
  const H = 36;
  for (const [i, [, rotulo]] of b.paginas.entries()) {
    const W = (await largura(rotulo, 14.5, 700)) + 38;
    await salvar(`aba-${b.chave}-${i}-on.png`, W, H,
      `<rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="18" fill="${COR.azul}" ` +
      `stroke="${COR.azulEscuro}" stroke-width="1.5"/>` +
      texto(W / 2, 23.5, rotulo, 14.5, 700, '#FFFFFF', 'text-anchor="middle"'));
    await salvar(`aba-${b.chave}-${i}-off.png`, W, H,
      `<rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="18" fill="#F1F6FD" ` +
      `stroke="#8FB0DD" stroke-width="1.5"/>` +
      texto(W / 2, 23.5, rotulo, 14.5, 700, COR.azulEscuro, 'text-anchor="middle"'));
  }
}

// --- o botao Inicio, no cabecalho azul ------------------------------------
async function botaoInicio() {
  const H = 34, wT = await largura('Início', 14, 600), W = 40 + wT + 16;
  await salvar('botao-inicio.png', W, H,
    `<rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="17" fill="#FFFFFF" fill-opacity="0.14" ` +
    'stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="1.5"/>' +
    icone('casa', 13, 8, 18, '#FFFFFF', 2.2) +
    texto(40, 22, 'Início', 14, 600, '#FFFFFF'));
}

(async () => {
  fs.rmSync(DEST, { recursive: true, force: true });
  fs.mkdirSync(DEST, { recursive: true });
  await topo();
  await botaoInicio();
  for (const b of blocos) {
    if (!ICONES[b.icone]) throw new Error(`area ${b.chave}: icone "${b.icone}" nao existe`);
    await cartao(b);
    await selo(b);
    await abas(b);
  }
  fs.writeFileSync(path.join(DEST, 'manifesto.json'), JSON.stringify(manifesto, null, 2) + '\n');
  console.log(`${Object.keys(manifesto).length} imagens em bi/imagens`);
})();
