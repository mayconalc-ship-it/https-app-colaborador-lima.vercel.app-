// A CAPA "INICIO" E A NAVEGACAO POR AREA (14/09/2026, pedido do dono:
// "organizar melhor, e atraves de cliques ir navegando pelos BIs").
//
//   * Inicio: o topo com o C, o cartao "Dados atualizados em" e um cartao
//     por area (blocos, em paginas.js) que leva a primeira pagina dela.
//   * Em cada pagina de area: uma faixa branca abaixo do cabecalho com o
//     selo da area e um quadradinho por pagina dela -- o da pagina aberta
//     aceso e sem clique, os outros levando a pagina. O resto da pagina
//     desce DESLOC px, e a pagina cresce o mesmo tanto (768 em vez de 720):
//     nada que ja estava na tela perde espaco.
//   * No cabecalho de toda pagina (menos no "sobre"), o botao Inicio.
//
// Todo clique e imagem com visualLink/PageNavigation -- a mesma forma do C
// do logo, que ja navega no Desktop e no Service. As imagens saem de
// gerar-imagens.js; o manifesto diz o tamanho de cada uma.
const fs = require('fs');
const path = require('path');

const PASTA = path.join(__dirname, '..', 'imagens');
const MANIFESTO = JSON.parse(fs.readFileSync(path.join(PASTA, 'manifesto.json'), 'utf8'));
// A EXTENSAO EM USO (15/09/2026, pedido do dono: capa e quadradinhos
// "embacados"). SVG e vetor: nitido em qualquer tela. O PNG de reserva
// continua saindo de gerar-imagens.js -- voltar para ele e trocar aqui (e o
// LOGO em gerar-pbip.js).
const EXT = '.svg';
const IMAGENS = Object.keys(MANIFESTO).filter((a) => a.endsWith(EXT));
const DESLOC = 48;
const NOME_INICIO = '🏠 Início';
// Visuais do cabecalho que NAO descem com a faixa de navegacao.
const DO_CABECALHO = [':faixa', ':logo', ':titulo', ':aviso-logo', ':inicio-botao'];

function criar({ lit, idPagina, blocos }) {
  // Os nomes abaixo continuam escritos com .png; aqui viram a extensao em
  // uso -- um lugar so para trocar, em vez de doze.
  const emUso = (arquivo) => arquivo.replace(/\.png$/, EXT);

  const tam = (arquivo) => {
    const m = MANIFESTO[emUso(arquivo)];
    if (!m) throw new Error(`imagem ${emUso(arquivo)} fora do manifesto -- rode: node bi/pbip/gerar-imagens.js`);
    return m;
  };

  const imagem = (chave, arquivoPedido, x, y, destino) => {
    const arquivo = emUso(arquivoPedido);
    const { w, h } = tam(arquivo);
    return {
      chave, t: 'image', x, y, w, h, titulo: null,
      ...(destino ? { navegarPara: destino } : {}),
      objects: {
        general: [{ properties: { imageUrl: { expr: { ResourcePackageItem: {
          PackageName: 'RegisteredResources', PackageType: 1, ItemName: arquivo,
        } } } } }],
        imageScaling: [{ properties: { imageScalingType: lit("'Fit'") } }],
      },
    };
  };

  const faixaBranca = (chave, y, h) => ({
    chave, t: 'shape', x: 0, y, w: 1280, h, titulo: null,
    objects: {
      shape: [{ properties: { tileShape: lit("'rectangle'") } }],
      fill: [{ properties: { fillColor: { solid: { color: lit("'#FFFFFF'") } } },
        selector: { id: 'default' } }],
      outline: [{ properties: { show: lit('false') } }],
    },
  });

  // O botao Inicio, no canto direito do cabecalho azul.
  const larguraBotaoInicio = tam('botao-inicio.png').w;
  const botaoInicio = (pagina) => {
    const { w, h } = tam('botao-inicio.png');
    return imagem(`${pagina.nome}:inicio-botao`, 'botao-inicio.png', 1264 - w, Math.round((68 - h) / 2),
      idPagina(NOME_INICIO));
  };

  // A capa.
  function visuaisInicio() {
    const lista = [imagem('inicio:topo', 'inicio-topo.png', 0, 0)];
    lista.push({
      chave: 'inicio:atualizacao', t: 'cardVisual',
      x: 944, y: 54, w: 300, h: 92,
      titulo: '🕒 Dados atualizados em',
      fonteCartao: 16,
      dica:
        'O instante em que o modelo foi atualizado pela última vez, no horário de Brasília — '
        + 'não a hora em que você abriu o relatório. A atualização é agendada no Power BI Service '
        + 'e roda pelo gateway do escritório.',
      roles: { Data: ['@Atualizado em'] },
    });
    blocos.forEach((b, i) => {
      const { w, h } = tam(`secao-${b.chave}.png`);
      const x = 22 + (i % 4) * (w + 4);
      const y = 214 + Math.floor(i / 4) * (h + 6);
      lista.push(imagem(`inicio:secao:${b.chave}`, `secao-${b.chave}.png`, x, y, idPagina(b.paginas[0][0])));
    });
    lista.push({
      chave: 'inicio:rodape', t: 'textbox', x: 22, y: 676, w: 1236, h: 30, titulo: null,
      objects: { general: [{ properties: { paragraphs: [{ textRuns: [{
        value: 'Em cada página: os quadradinhos abaixo do título levam às outras páginas da área · '
          + '⌂ Início volta para cá · o C no canto do título explica como cada número é calculado.',
        textStyle: { fontSize: '10pt', color: '#64748B' },
      }] }] } }] },
      fundoTransparente: true,
    });
    return lista;
  }

  // A faixa da area + o resto da pagina descendo DESLOC px.
  function comNavegacao(pagina, lista) {
    const b = pagina.bloco;
    if (!b) return lista;
    const eCabecalho = (v) => DO_CABECALHO.some((s) => v.chave === pagina.nome + s);
    // Uma linha fina embaixo da faixa (14/09/2026): separa a navegacao do
    // conteudo, que antes emendava nela.
    const linha = faixaBranca(`${pagina.nome}:nav:linha`, 68 + DESLOC - 2, 2);
    linha.objects.fill = [{ properties: { fillColor: { solid: { color: lit("'#CBD5E1'") } } },
      selector: { id: 'default' } }];
    const nav = [faixaBranca(`${pagina.nome}:nav:faixa`, 68, DESLOC), linha];
    // Centrado na faixa pela altura real das imagens, e nao por um y fixo.
    const yNav = 68 + Math.round((DESLOC - 2 - tam(`chip-${b.chave}.png`).h) / 2);
    let x = 16;
    const chip = imagem(`${pagina.nome}:nav:area`, `chip-${b.chave}.png`, x, yNav);
    nav.push(chip);
    x += chip.w + 14;
    b.paginas.forEach(([nome], i) => {
      const atual = nome === pagina.nome;
      const im = imagem(`${pagina.nome}:nav:${i}`, `aba-${b.chave}-${i}-${atual ? 'on' : 'off'}.png`,
        x, yNav, atual ? null : idPagina(nome));
      nav.push(im);
      x += im.w + 8;
    });
    if (x - 8 > 1264) console.warn(`"${pagina.nome}": os quadradinhos da area passam da largura (${x - 8} px)`);
    return [
      ...lista.filter(eCabecalho),
      ...nav,
      ...lista.filter((v) => !eCabecalho(v)).map((v) => ({ ...v, y: v.y + DESLOC })),
    ];
  }

  return { visuaisInicio, comNavegacao, botaoInicio, larguraBotaoInicio, imagem };
}

module.exports = { criar, DESLOC, NOME_INICIO, MANIFESTO, PASTA, EXT, IMAGENS };
