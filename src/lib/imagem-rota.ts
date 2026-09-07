"use client";

import type { RotaEncontrada } from "@/app/minha-rota/actions";
import {
  aferir,
  formatarCaixas,
  formatarDataBr,
  formatarKm,
  formatarPercentual,
  formatarPeso,
  formatarTempo,
  type Metas,
} from "@/lib/rotas";

/**
 * Desenha a pré-rota num canvas e devolve como imagem, para compartilhar.
 *
 * Escolhido no lugar de uma biblioteca de "print da tela" (html2canvas e
 * afins): aqui já temos os dados estruturados, então desenhar direto é
 * mais leve (zero dependência nova), mais previsível entre aparelhos e
 * nunca captura por engano um botão ou menu que não devia aparecer.
 */

const COR = {
  primaria: "#0b4da2",
  primariaEscura: "#063573",
  dourado: "#ffc72c",
  texto: "#1e293b",
  textoFraco: "#64748b",
  fundo: "#ffffff",
  fundoSuave: "#f8fafc",
  linha: "#e2e8f0",
  verde: "#22c55e",
  ambar: "#fbbf24",
  vermelho: "#ef4444",
};

function corDaFaixa(cor: string) {
  if (cor.includes("green")) return COR.verde;
  if (cor.includes("amber")) return COR.ambar;
  if (cor.includes("red")) return COR.vermelho;
  return "#cbd5e1";
}

/** A cor da tarja do aviso -- a mesma escala da tela. */
const COR_SEVERIDADE: Record<string, string> = {
  critico: COR.vermelho,
  atencao: COR.ambar,
  info: COR.primaria,
};

/** Quantos avisos cabem na imagem antes de virar rolagem de WhatsApp. */
const MAXIMO_DE_AVISOS = 6;

/**
 * Quebra o texto na largura disponível, medindo no próprio canvas.
 *
 * Feito à mão porque canvas não quebra linha: sem isto, um aviso de duas
 * frases sai cortado no meio da palavra -- e o pedaço que some é sempre o
 * fim, que é onde está o que fazer.
 */
function quebrar(
  ctx: CanvasRenderingContext2D,
  texto: string,
  largura: number,
  fonte: string,
): string[] {
  ctx.font = fonte;
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(tentativa).width <= largura || !atual) atual = tentativa;
    else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function arredondado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function gerarImagemPreRota(
  rota: RotaEncontrada,
  metas: Metas,
): Promise<Blob | null> {
  const LARGURA = 900;
  const MARGEM = 40;
  const LARGURA_UTIL = LARGURA - MARGEM * 2;

  const canvas = document.createElement("canvas");
  const escala = 2; // nitidez em tela retina, sem pesar o layout
  const contexto = canvas.getContext("2d");
  if (!contexto) return null;
  // Const separada: TypeScript não propaga o "if (!ctx) return" para dentro
  // das funções aninhadas mais abaixo (barra()), então fixamos o tipo aqui.
  const ctx: CanvasRenderingContext2D = contexto;

  /*
    OS AVISOS DOS CLIENTES ENTRAM NA IMAGEM (07/09/2026, pedido do dono).

    A imagem é o que roda no WhatsApp do motorista -- é ela que ele abre
    antes de sair, não a tela. Um aviso que só existe no app é um aviso que
    chega a quem já estava olhando o app.

    Vêm prontos de `avisosDoMapa`, que já tirou o que não é do motorista
    (o PDV bloqueado é assunto comercial) e o que não vale hoje. Aqui é só
    desenho -- nenhuma regra nova, para a imagem não poder discordar da
    tela.

    MEDIDOS ANTES DE DESENHAR: a altura da imagem depende de quantas linhas
    cada aviso ocupa, e canvas não quebra texto sozinho. Por isso o
    contexto nasce antes do tamanho.
  */
  const larguraDoTexto = LARGURA_UTIL - 28;
  const avisos = rota.avisos.slice(0, MAXIMO_DE_AVISOS).map((a) => {
    const titulo = [a.emoji, a.nomePdv ?? `Cliente ${a.codPdv}`].filter(Boolean).join(" ");
    const rodape = [a.horario && `⏰ ${a.horario}`, a.dias && `📅 ${a.dias}`]
      .filter(Boolean)
      .join("   ");
    const linhas = quebrar(
      ctx,
      a.aviso,
      larguraDoTexto,
      "15px system-ui, -apple-system, sans-serif",
    );
    return {
      titulo,
      cidade: [a.cidade, a.bairro].filter(Boolean).join(" · "),
      cor: COR_SEVERIDADE[a.severidade] ?? COR.primaria,
      linhas,
      rodape,
      altura: 12 + 20 + linhas.length * 20 + (rodape ? 20 : 0) + 12,
    };
  });
  const sobraram = rota.avisos.length - avisos.length;
  const alturaDosAvisos =
    avisos.length === 0
      ? 0
      : 46 + // título do bloco
        avisos.reduce((s, a) => s + a.altura + 8, 0) +
        (sobraram > 0 ? 24 : 0) +
        (rota.precisaoDosAvisos === "regiao" ? 26 : 0) +
        10;

  // Altura calculada em duas passadas: primeiro medimos, depois desenhamos.
  const linhasRegiao = rota.cidades.length;
  const ALTURA =
    120 + // cabeçalho
    alturaDosAvisos +
    90 + // veículo/motorista
    120 + // indicadores
    (metas.caixas ? 56 : 0) +
    230 + // duas barras de ocupação
    70 + // título da região
    linhasRegiao * 52 +
    60 + // total
    70; // rodapé

  canvas.width = LARGURA * escala;
  canvas.height = ALTURA * escala;
  ctx.scale(escala, escala);

  // Fundo
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, LARGURA, ALTURA);

  let y = 0;

  // ---- Cabeçalho ----
  ctx.fillStyle = COR.primaria;
  ctx.fillRect(0, 0, LARGURA, 64);
  ctx.fillStyle = COR.dourado;
  ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("🚚  PRÉ-ROTA", MARGEM, 32);

  if (rota.classificacao) {
    ctx.font = "600 15px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText(rota.classificacao, LARGURA - MARGEM, 32);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = COR.primariaEscura;
  ctx.fillRect(0, 64, LARGURA, 56);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 20px system-ui, -apple-system, sans-serif";
  ctx.fillText(`📅 ${formatarDataBr(rota.data)}`, MARGEM, 92);
  ctx.textAlign = "right";
  ctx.fillText(`🗺️ Mapa ${rota.mapa}`, LARGURA - MARGEM, 92);
  ctx.textAlign = "left";
  y = 120;

  /* ---- Avisos dos clientes ----
     LOGO ABAIXO DO CABEÇALHO, e não no fim: a prévia do WhatsApp corta a
     imagem no topo, e é a prévia que a pessoa vê sem abrir. Um aviso no
     rodapé de uma imagem de 1.100px é um aviso que depende de alguém
     rolar. */
  if (avisos.length > 0) {
    const topo = y;
    ctx.fillStyle = "#fffbeb";
    ctx.fillRect(0, topo, LARGURA, alturaDosAvisos);

    ctx.fillStyle = "#92400e";
    ctx.font = "700 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      `⚠️ ATENÇÃO NESTES CLIENTES (${rota.avisos.length})`,
      MARGEM,
      y + 28,
    );
    y += 46;

    for (const a of avisos) {
      arredondado(ctx, MARGEM, y, LARGURA_UTIL, a.altura, 8);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // A tarja da severidade: numa lista de quatro, é ela que diz qual
      // ler primeiro sem obrigar a ler todas.
      ctx.fillStyle = a.cor;
      ctx.fillRect(MARGEM, y + 6, 4, a.altura - 12);

      let linha = y + 12;
      ctx.fillStyle = COR.texto;
      ctx.font = "bold 16px system-ui, -apple-system, sans-serif";
      ctx.fillText(a.titulo, MARGEM + 14, linha + 10);
      if (a.cidade) {
        ctx.textAlign = "right";
        ctx.fillStyle = COR.textoFraco;
        ctx.font = "12px system-ui, -apple-system, sans-serif";
        ctx.fillText(a.cidade, LARGURA - MARGEM - 14, linha + 10);
        ctx.textAlign = "left";
      }
      linha += 20;

      ctx.fillStyle = COR.texto;
      ctx.font = "15px system-ui, -apple-system, sans-serif";
      for (const texto of a.linhas) {
        ctx.fillText(texto, MARGEM + 14, linha + 10);
        linha += 20;
      }

      if (a.rodape) {
        ctx.fillStyle = COR.primaria;
        ctx.font = "600 13px system-ui, -apple-system, sans-serif";
        ctx.fillText(a.rodape, MARGEM + 14, linha + 10);
      }

      y += a.altura + 8;
    }

    if (sobraram > 0) {
      ctx.fillStyle = "#92400e";
      ctx.font = "600 13px system-ui, -apple-system, sans-serif";
      ctx.fillText(`+ ${sobraram} aviso(s) — veja no app`, MARGEM, y + 12);
      y += 24;
    }

    // A HONESTIDADE DO AVISO POR REGIÃO. Sem esta linha a imagem promete
    // "este cliente" quando o que se sabe é "há um cliente assim nesta
    // região" -- e a primeira vez que a promessa falha o motorista para de
    // ler todas as outras.
    if (rota.precisaoDosAvisos === "regiao") {
      ctx.fillStyle = COR.textoFraco;
      ctx.font = "12px system-ui, -apple-system, sans-serif";
      ctx.fillText(
        "Avisos por região: confirme se é este o cliente antes de agir.",
        MARGEM,
        y + 12,
      );
      y += 26;
    }

    y = topo + alturaDosAvisos;
  }

  // ---- Veículo / Motorista ----
  ctx.fillStyle = COR.textoFraco;
  ctx.font = "600 12px system-ui, -apple-system, sans-serif";
  ctx.fillText("VEÍCULO", MARGEM, y + 14);
  ctx.fillStyle = COR.texto;
  ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
  ctx.fillText(rota.veiculo ?? "—", MARGEM, y + 42);
  if (rota.placa) {
    ctx.fillStyle = COR.primaria;
    ctx.font = "600 17px system-ui, -apple-system, sans-serif";
    ctx.fillText(rota.placa, MARGEM, y + 68);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = COR.textoFraco;
  ctx.font = "600 12px system-ui, -apple-system, sans-serif";
  ctx.fillText("MOTORISTA", LARGURA - MARGEM, y + 14);
  ctx.fillStyle = COR.texto;
  ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
  ctx.fillText(rota.motorista, LARGURA - MARGEM, y + 42);
  ctx.textAlign = "left";
  y += 90;

  // ---- Indicadores ----
  ctx.fillStyle = COR.fundoSuave;
  ctx.fillRect(0, y, LARGURA, 120);
  ctx.strokeStyle = COR.linha;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(LARGURA, y);
  ctx.moveTo(0, y + 120);
  ctx.lineTo(LARGURA, y + 120);
  ctx.stroke();

  const indicadores = [
    { emoji: "📏", valor: formatarKm(rota.kmPrev).replace(" km", ""), rotulo: "km" },
    { emoji: "⏱️", valor: formatarTempo(rota.tempoPrev), rotulo: "c/ almoço" },
    { emoji: "📍", valor: rota.entregas?.toString() ?? "—", rotulo: "entregas" },
    { emoji: "📦", valor: formatarCaixas(rota.caixas), rotulo: "caixas" },
  ];
  const colUtil = LARGURA_UTIL / 4;
  indicadores.forEach((ind, i) => {
    const cx = MARGEM + colUtil * i + colUtil / 2;
    ctx.textAlign = "center";
    ctx.font = "18px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = COR.texto;
    ctx.fillText(ind.emoji, cx, y + 32);
    ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
    ctx.fillText(ind.valor, cx, y + 66);
    ctx.font = "13px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = COR.textoFraco;
    ctx.fillText(ind.rotulo, cx, y + 92);
  });
  ctx.textAlign = "left";
  y += 120;

  // ---- Meta de caixas ----
  if (metas.caixas && rota.caixas !== null) {
    const af = aferir(rota.caixas, metas.caixas);
    ctx.fillStyle = corDaFaixa(af.fundo) + "22";
    ctx.fillRect(0, y, LARGURA, 56);
    ctx.fillStyle = COR.texto;
    ctx.font = "600 15px system-ui, -apple-system, sans-serif";
    ctx.fillText("📦 Caixas por viagem", MARGEM, y + 28);
    ctx.textAlign = "right";
    ctx.fillStyle = corDaFaixa(af.fundo);
    ctx.font = "bold 15px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      `${af.icone} ${af.rotulo} · meta ${formatarCaixas(metas.caixas)}`,
      LARGURA - MARGEM,
      y + 28,
    );
    ctx.textAlign = "left";
    y += 56;
  }

  // ---- Barras de ocupação ----
  function barra(rotulo: string, valor: number | null, complemento?: string) {
    const af = aferir(valor, metas.ocupacao);
    ctx.fillStyle = COR.texto;
    ctx.font = "600 15px system-ui, -apple-system, sans-serif";
    ctx.fillText(rotulo, MARGEM, y + 24);
    if (complemento) {
      ctx.fillStyle = COR.textoFraco;
      ctx.font = "12px system-ui, -apple-system, sans-serif";
      ctx.fillText(complemento, MARGEM, y + 42);
    }

    ctx.textAlign = "right";
    ctx.fillStyle = COR.texto;
    ctx.font = "bold 28px system-ui, -apple-system, sans-serif";
    ctx.fillText(formatarPercentual(valor), LARGURA - MARGEM, y + 30);
    ctx.font = "600 12px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = corDaFaixa(af.fundo);
    ctx.fillText(`${af.icone} ${af.rotulo}`, LARGURA - MARGEM, y + 46);
    ctx.textAlign = "left";

    const topoBarra = y + 56;
    arredondado(ctx, MARGEM, topoBarra, LARGURA_UTIL, 14, 7);
    ctx.fillStyle = COR.linha;
    ctx.fill();

    const largura = Math.min(100, Math.max(0, valor ?? 0));
    if (largura > 0) {
      arredondado(ctx, MARGEM, topoBarra, (LARGURA_UTIL * largura) / 100, 14, 7);
      ctx.fillStyle = corDaFaixa(af.fundo);
      ctx.fill();
    }

    const posMeta = MARGEM + (LARGURA_UTIL * Math.min(100, metas.ocupacao)) / 100;
    ctx.strokeStyle = "rgba(30,41,59,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(posMeta, topoBarra - 3);
    ctx.lineTo(posMeta, topoBarra + 17);
    ctx.stroke();

    y += 100;
  }

  y += 15;
  barra("📦 Ocupação de caixas", rota.ocupacaoCaixas);
  barra("⚖️ Ocupação de peso", rota.ocupacaoPeso, formatarPeso(rota.peso));

  // ---- Região + entregas ----
  ctx.fillStyle = COR.fundoSuave;
  ctx.fillRect(0, y, LARGURA, 70 + linhasRegiao * 52 + 60);

  ctx.fillStyle = COR.textoFraco;
  ctx.font = "700 13px system-ui, -apple-system, sans-serif";
  ctx.fillText("🏙️ REGIÃO + ENTREGAS", MARGEM, y + 34);
  y += 60;

  const totalCidades = rota.cidades.reduce((s, c) => s + c.entregas, 0);
  const maiorCidade = Math.max(1, ...rota.cidades.map((c) => c.entregas));

  for (const c of rota.cidades) {
    arredondado(ctx, MARGEM, y, LARGURA_UTIL, 42, 8);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.fillStyle = COR.texto;
    ctx.font = "600 16px system-ui, -apple-system, sans-serif";
    ctx.fillText(c.cidade, MARGEM + 14, y + 21);

    ctx.textAlign = "right";
    ctx.fillStyle = COR.primaria;
    ctx.font = "bold 17px system-ui, -apple-system, sans-serif";
    ctx.fillText(String(c.entregas), LARGURA - MARGEM - 14, y + 21);
    ctx.textAlign = "left";

    // fio de proporção
    const largFio = (LARGURA_UTIL * c.entregas) / maiorCidade;
    ctx.fillStyle = "rgba(11,77,162,0.35)";
    ctx.fillRect(MARGEM, y + 38, largFio, 3);

    y += 52;
  }

  ctx.fillStyle = COR.primariaEscura;
  ctx.font = "700 15px system-ui, -apple-system, sans-serif";
  ctx.fillText("TOTAL", MARGEM, y + 30);
  ctx.textAlign = "right";
  ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${totalCidades} entregas`, LARGURA - MARGEM, y + 30);
  ctx.textAlign = "left";
  y += 60;

  // ---- Rodapé ----
  ctx.fillStyle = COR.linha;
  ctx.fillRect(0, y, LARGURA, 1);
  ctx.fillStyle = COR.textoFraco;
  ctx.font = "12px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  const agora = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  ctx.fillText(
    `App do Colaborador · LIMA Logística · gerado em ${agora}`,
    LARGURA / 2,
    y + 36,
  );
  ctx.textAlign = "left";

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
  });
}
