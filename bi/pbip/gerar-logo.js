// O C do logo do app, sem o quadrado azul, para o cabecalho das paginas
// do BI (12/09/2026, pedido do dono: "somente o C da logo, como se fosse
// em PNG").
//
// Sai de src/app/icon.svg -- o mesmo desenho do icone do celular -- com o
// <rect> de fundo removido. Sobre a faixa azul do cabecalho (o mesmo
// #0B4DA2 do icone), o C branco e a seta amarela ficam como no app.
//
// Rodar so quando o icone mudar:  node bi/pbip/gerar-logo.js
// Usa o sharp que o Next ja instala em node_modules.
const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '..', '..', 'node_modules', 'sharp'));

const svg = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'app', 'icon.svg'), 'utf8')
  .replace(/<rect[^>]*\/>\s*/, '')
  // Recorte justo no desenho: o C e a seta vao de ~10 a ~90 no viewBox de
  // 100. 256 px para ficar nitido no 48 x 48 do cabecalho.
  .replace(/viewBox="[^"]*"/, 'viewBox="6 6 88 88" width="256" height="256"');

// O SVG e o que o BI usa desde 15/09/2026 (nitidez -- ver gerar-imagens.js),
// no tamanho do cabecalho; o PNG continua saindo, de reserva.
fs.writeFileSync(path.join(__dirname, '..', 'logo-app-c.svg'),
  svg.replace('width="256" height="256"', 'width="48" height="48"'));
console.log('bi/logo-app-c.svg');

sharp(Buffer.from(svg)).png()
  .toFile(path.join(__dirname, '..', 'logo-app-c.png'))
  .then((i) => console.log(`bi/logo-app-c.png  ${i.width}x${i.height}  ${i.size} bytes`));
