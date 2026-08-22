/**
 * Gera os icones do App do Colaborador a partir da geometria da marca.
 *
 * Sem dependencia nenhuma: o desenho e simples o bastante (um anel, uma
 * ponta e um quadrado arredondado) para ser rasterizado direto, e o PNG e
 * montado na mao com o zlib que ja vem no Node. Assim os icones voltam a
 * ser gerados em qualquer maquina com `node scripts/gerar-icones.mjs`,
 * sem instalar conversor de SVG.
 *
 * A MARCA
 *
 * Um "C" de Colaborador desenhado como o ciclo da rota: sai, entrega e
 * volta -- e o ultimo trecho vira dourado e termina em ponta, porque o
 * ciclo sempre avanca. Nao fecha de proposito: dia fechado nao existe.
 *
 * As cores sao as mesmas do app (globals.css): azul #0b4da2 e ouro
 * #ffc72c. A marca identifica o APP, nao a revenda -- a logo da empresa
 * e conteudo, sobe pelo Admin e aparece no cabecalho.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const AZUL = [11, 77, 162];
const OURO = [255, 199, 44];
const BRANCO = [255, 255, 255];

/* ---- Geometria, num quadrado de referencia 100x100 ---------------- */

const CX = 50, CY = 50, R = 32, TRACO = 15;
const INICIO = 55;   // onde o C comeca, no alto a direita
const VIRADA = 250;  // onde o branco vira ouro
const FIM = 300;     // onde o traco acaba e a ponta comeca

const ponto = (graus) => {
  const r = (graus * Math.PI) / 180;
  return [CX + R * Math.cos(r), CY - R * Math.sin(r)];
};

/** Angulo do ponto em relacao ao centro, em graus de 0 a 360. */
function anguloDe(x, y) {
  const a = (Math.atan2(CY - y, x - CX) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

const dist = (x, y, [px, py]) => Math.hypot(x - px, y - py);

/** O ponto cai no miolo do traco do anel? */
const naFaixa = (x, y) => Math.abs(Math.hypot(x - CX, y - CY) - R) <= TRACO / 2;

/** Tampa redonda das pontas do traco. */
const naTampa = (x, y, graus) => dist(x, y, ponto(graus)) <= TRACO / 2;

/** A ponta de seta: triangulo apoiado na tangente do fim do traco. */
const SETA = (() => {
  const r = (FIM * Math.PI) / 180;
  const [px, py] = ponto(FIM);
  const d = [-Math.sin(r), -Math.cos(r)];   // tangente, sentido do traco
  const perp = [-d[1], d[0]];
  const COMPRIMENTO = 16, MEIA_BASE = 13;
  return [
    [px + d[0] * COMPRIMENTO, py + d[1] * COMPRIMENTO],
    [px + perp[0] * MEIA_BASE, py + perp[1] * MEIA_BASE],
    [px - perp[0] * MEIA_BASE, py - perp[1] * MEIA_BASE],
  ];
})();

function noTriangulo(x, y, [a, b, c]) {
  // Produto vetorial de (p - r) com (q - r): o sinal diz de que lado da
  // reta qr o ponto esta. Dentro do triangulo os tres dao o mesmo sinal.
  const lado = (p, q, r) =>
    (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);

  const p = [x, y];
  const d1 = lado(p, a, b), d2 = lado(p, b, c), d3 = lado(p, c, a);

  const negativo = d1 < 0 || d2 < 0 || d3 < 0;
  const positivo = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negativo && positivo);
}

/** Quadrado de cantos arredondados, para o ladrilho do icone. */
function noLadrilho(x, y, lado, raio) {
  const dx = Math.max(raio - x, 0, x - (lado - raio));
  const dy = Math.max(raio - y, 0, y - (lado - raio));
  return Math.hypot(dx, dy) <= raio;
}

/**
 * Cor de um ponto, em coordenadas de 0 a 100.
 *
 * A ordem importa e e a mesma do desenho: ladrilho, ouro, branco por
 * cima (por isso a emenda em VIRADA fica branca e limpa) e a seta por
 * ultimo, cobrindo a tampa redonda do fim do traco.
 */
function corDoPonto(x, y, { ladrilho, escalaLadrilho, cantos = 22 }) {
  let cor = null;

  if (ladrilho) {
    // cantos = 0 e o caso do maskable: quem arredonda e o sistema.
    if (cantos > 0 && !noLadrilho(x, y, 100, cantos)) return null;
    cor = AZUL;
  }

  const g = escalaLadrilho;
  const mx = ladrilho ? (x - 50) / g + 50 : x;
  const my = ladrilho ? (y - 50) / g + 50 : y;

  const ang = anguloDe(mx, my);
  const naLinha = naFaixa(mx, my);

  if ((naLinha && ang >= VIRADA && ang <= FIM) || naTampa(mx, my, FIM)) cor = OURO;
  if ((naLinha && ang >= INICIO && ang <= VIRADA) || naTampa(mx, my, INICIO) || naTampa(mx, my, VIRADA)) cor = BRANCO;
  if (noTriangulo(mx, my, SETA)) cor = OURO;

  return cor;
}

/* ---- Rasterizacao -------------------------------------------------- */

const AMOSTRAS = 4; // 4x4 por pixel: suficiente para a borda nao serrilhar

function desenhar(tamanho, opcoes) {
  const px = Buffer.alloc(tamanho * tamanho * 4);

  for (let py = 0; py < tamanho; py++) {
    for (let pxi = 0; pxi < tamanho; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const x = ((pxi + (sx + 0.5) / AMOSTRAS) / tamanho) * 100;
          const y = ((py + (sy + 0.5) / AMOSTRAS) / tamanho) * 100;
          const cor = corDoPonto(x, y, opcoes);
          if (cor) { r += cor[0]; g += cor[1]; b += cor[2]; a += 255; }
        }
      }

      const total = AMOSTRAS * AMOSTRAS;
      const cobertos = a / 255;
      const i = (py * tamanho + pxi) * 4;
      if (cobertos > 0) {
        px[i] = Math.round(r / cobertos);
        px[i + 1] = Math.round(g / cobertos);
        px[i + 2] = Math.round(b / cobertos);
        px[i + 3] = Math.round((cobertos / total) * 255);
      }
    }
  }

  return px;
}

/* ---- PNG na mao ---------------------------------------------------- */

const TABELA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const nome = Buffer.from(tipo, "ascii");
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([nome, dados])));
  return Buffer.concat([tamanho, nome, dados, crc]);
}

function png(tamanho, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8;  // 8 bits por canal
  ihdr[9] = 6;  // RGBA
  // 10, 11, 12 ficam em zero: compressao, filtro e entrelacamento padrao

  // Cada linha leva um byte de filtro na frente; 0 = sem filtro.
  const linhas = Buffer.alloc(tamanho * (tamanho * 4 + 1));
  for (let y = 0; y < tamanho; y++) {
    const destino = y * (tamanho * 4 + 1);
    linhas[destino] = 0;
    pixels.copy(linhas, destino + 1, y * tamanho * 4, (y + 1) * tamanho * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", deflateSync(linhas, { level: 9 })),
    bloco("IEND", Buffer.alloc(0)),
  ]);
}

/* ---- Saida --------------------------------------------------------- */

const ARQUIVOS = [
  // Icone do app: ladrilho azul, marca em tamanho cheio.
  ["public/icon-192.png", 192, { ladrilho: true, escalaLadrilho: 1 }],
  ["public/icon-512.png", 512, { ladrilho: true, escalaLadrilho: 1 }],
  ["src/app/apple-icon.png", 180, { ladrilho: true, escalaLadrilho: 1 }],

  // Maskable: o Android recorta ate 20% de cada borda, entao o fundo
  // sangra ate o limite (cantos: 0) e a marca encolhe para dentro da
  // area segura.
  ["public/icon-maskable-512.png", 512, { ladrilho: true, escalaLadrilho: 0.68, cantos: 0 }],
];

for (const [caminho, tamanho, opcoes] of ARQUIVOS) {
  const completo = join(RAIZ, caminho);
  mkdirSync(dirname(completo), { recursive: true });
  writeFileSync(completo, png(tamanho, desenhar(tamanho, opcoes)));
  console.log(`${caminho} (${tamanho}px)`);
}
