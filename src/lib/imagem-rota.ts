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

  // Altura calculada em duas passadas: primeiro medimos, depois desenhamos.
  const linhasRegiao = rota.cidades.length;
  const ALTURA =
    120 + // cabeçalho
    90 + // veículo/motorista
    120 + // indicadores
    (metas.caixas ? 56 : 0) +
    230 + // duas barras de ocupação
    70 + // título da região
    linhasRegiao * 52 +
    60 + // total
    70; // rodapé

  const canvas = document.createElement("canvas");
  const escala = 2; // nitidez em tela retina, sem pesar o layout
  canvas.width = LARGURA * escala;
  canvas.height = ALTURA * escala;
  const contexto = canvas.getContext("2d");
  if (!contexto) return null;
  // Const separada: TypeScript não propaga o "if (!ctx) return" para dentro
  // das funções aninhadas mais abaixo (barra()), então fixamos o tipo aqui.
  const ctx: CanvasRenderingContext2D = contexto;
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
