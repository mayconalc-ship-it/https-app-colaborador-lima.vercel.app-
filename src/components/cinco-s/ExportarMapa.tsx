"use client";

import { useState } from "react";

/**
 * EXPORTAR O MAPA DA AUDITORIA CRUZADA COMO IMAGEM (pedido do dono,
 * 21/09/2026). O SVG já está na página; aqui ele vira PNG no próprio
 * navegador -- sem servidor, sem biblioteca -- com o título e o mês em
 * cima, pronto para colar no WhatsApp, no PPT ou no DPO.
 *
 * Funciona também no celular: o desenho fica escondido na tela pequena
 * (lá aparece a lista), mas continua na página e é ele que é exportado.
 */
export function ExportarMapa({ alvoId, titulo, arquivo }: { alvoId: string; titulo: string; arquivo: string }) {
  const [estado, setEstado] = useState<"parado" | "gerando" | "erro">("parado");

  async function exportar() {
    const svg = document.getElementById(alvoId) as SVGSVGElement | null;
    if (!svg) return;
    setEstado("gerando");
    try {
      const [, , largura, altura] = (svg.getAttribute("viewBox") ?? "0 0 720 400").split(/\s+/).map(Number);
      const copia = svg.cloneNode(true) as SVGSVGElement;
      copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      copia.setAttribute("width", String(largura));
      copia.setAttribute("height", String(altura));
      // A fonte da página não vai junto no arquivo: fixa uma que todo aparelho tem.
      copia.setAttribute("font-family", "Segoe UI, Roboto, Helvetica, Arial, sans-serif");
      const xml = new XMLSerializer().serializeToString(copia);
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      const img = new Image();
      await new Promise<void>((ok, falha) => {
        img.onload = () => ok();
        img.onerror = () => falha(new Error("imagem"));
        img.src = url;
      });

      const escala = 2; // nítida no zoom e na impressão
      const cabecalho = 56;
      const margem = 24;
      const canvas = document.createElement("canvas");
      canvas.width = (largura + margem * 2) * escala;
      canvas.height = (altura + cabecalho + margem) * escala;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.scale(escala, escala);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, largura + margem * 2, altura + cabecalho + margem);
      ctx.fillStyle = "#063573";
      ctx.font = "bold 20px Segoe UI, Roboto, Helvetica, Arial, sans-serif";
      ctx.fillText(titulo, margem, 34);
      ctx.fillStyle = "#64748b";
      ctx.font = "12px Segoe UI, Roboto, Helvetica, Arial, sans-serif";
      ctx.fillText("App do Colaborador · BI 5S", margem, 50);
      ctx.drawImage(img, margem, cabecalho, largura, altura);

      const blob: Blob | null = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
      if (!blob) throw new Error("png");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = arquivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      setEstado("parado");
    } catch {
      setEstado("erro");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={exportar}
        disabled={estado === "gerando"}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary disabled:opacity-50"
      >
        {estado === "gerando" ? "Gerando..." : "🖼️ Baixar imagem"}
      </button>
      {estado === "erro" && <span className="text-xs text-red-600">Não foi possível gerar a imagem.</span>}
    </span>
  );
}
