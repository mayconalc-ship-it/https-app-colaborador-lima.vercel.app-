"use client";

/**
 * O cartaz do Desafio -- a imagem que vai para o grupo.
 *
 * Pedido do dono (09/09/2026): "gerar em imagem para que possamos
 * cobrar e informar nos grupos". Print de tela não serve: sai cortado,
 * sai com a barra do navegador, sai ilegível no celular de quem recebe,
 * e sai diferente a cada vez. O cartaz é desenhado uma vez, no tamanho
 * certo para WhatsApp (1080x1350), e sai sempre igual.
 *
 * É SVG puro convertido em PNG pelo canvas do próprio navegador -- sem
 * biblioteca nova. A regra que isso impõe: nada de `foreignObject` nem
 * de fonte externa, senão o canvas se recusa a exportar ("tainted") ou
 * exporta com a fonte errada. Por isso o texto é `<text>` com quebra de
 * linha calculada na mão, logo abaixo.
 */

import { useRef, useState } from "react";

const L = 1080;
const A = 1350;

/** Aproximação da largura de um texto, em px, para quebrar linha.
 *  0,52 do tamanho da fonte por caractere é o que mede uma sans-serif
 *  em texto misto -- suficiente para não estourar a margem. */
function quebrar(texto: string, tamanhoFonte: number, larguraMax: number, maxLinhas: number) {
  const porChar = tamanhoFonte * 0.52;
  const cabe = Math.max(8, Math.floor(larguraMax / porChar));
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";

  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (tentativa.length <= cabe) {
      atual = tentativa;
    } else {
      if (atual) linhas.push(atual);
      atual = p;
      if (linhas.length === maxLinhas) break;
    }
  }
  if (atual && linhas.length < maxLinhas) linhas.push(atual);

  // Corta com reticências em vez de deixar a última linha sair pela
  // borda: no cartaz não há rolagem, o que não coube não existe.
  if (linhas.length === maxLinhas && palavras.join(" ").length > linhas.join(" ").length) {
    linhas[maxLinhas - 1] = `${linhas[maxLinhas - 1].slice(0, cabe - 1)}…`;
  }

  // Rede final: uma PALAVRA sozinha maior que a linha não é quebrada
  // pelo laço acima (não há onde quebrar) e sairia pela borda do
  // cartaz. Um código de produto ou um e-mail colado no enunciado faz
  // isso. `<text>` de SVG não recorta nada sozinho.
  return linhas.map((l) => (l.length > cabe ? `${l.slice(0, cabe - 1)}…` : l));
}

export type PessoaDoPodio = { nome: string; pontos: number; acertos: number };

export type PerguntaCritica = {
  pergunta: string;
  pct: number;
  resposta: string;
  explicacao: string;
  origem: string;
};

export function CartazDoDesafio({
  titulo,
  area,
  periodo,
  participacao,
  concluiram,
  elegiveis,
  taxaAcerto,
  totalPerguntas,
  podio,
  perguntaCritica,
  rodadaNoAr,
}: {
  titulo: string;
  area: string;
  periodo: string;
  participacao: number | null;
  concluiram: number;
  elegiveis: number;
  taxaAcerto: number | null;
  totalPerguntas: number;
  podio: PessoaDoPodio[];
  /** A pergunta mais errada COM a resposta certa -- o que o cartaz ensina. */
  perguntaCritica: PerguntaCritica | null;
  /** Rodada ainda aberta: mandar o cartaz entrega o gabarito. */
  rodadaNoAr: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cor = (pct: number | null) =>
    pct === null ? "#94a3b8" : pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";

  const medalhas = ["🥇", "🥈", "🥉"];

  // Duas linhas para a pergunta e três para a resposta: a resposta é o
  // que o cartaz existe para ensinar, então é ela que ganha o espaço.
  const linhasDaPergunta = perguntaCritica ? quebrar(perguntaCritica.pergunta, 30, 900, 2) : [];
  const linhasDaResposta = perguntaCritica ? quebrar(perguntaCritica.resposta, 28, 860, 3) : [];
  const linhaDaExplicacao = perguntaCritica?.explicacao
    ? quebrar(perguntaCritica.explicacao, 22, 860, 1)[0]
    : null;

  async function baixar() {
    const svg = svgRef.current;
    if (!svg) return;
    setBaixando(true);
    setErro(null);
    try {
      const textoSvg = new XMLSerializer().serializeToString(svg);
      const blobSvg = new Blob([textoSvg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blobSvg);

      const img = new Image();
      await new Promise<void>((ok, falhou) => {
        img.onload = () => ok();
        img.onerror = () => falhou(new Error("imagem"));
        img.src = url;
      });

      // 2x: o cartaz é lido no celular, e o WhatsApp recomprime. Sair em
      // 1080 de largura vira 720 na tela de quem recebe.
      const canvas = document.createElement("canvas");
      canvas.width = L * 2;
      canvas.height = A * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const blobPng: Blob | null = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
      if (!blobPng) throw new Error("png");

      const urlPng = URL.createObjectURL(blobPng);
      const a = document.createElement("a");
      a.href = urlPng;
      a.download = `desafio-${area.toLowerCase()}-${periodo.replace("/", "-")}.png`;
      a.click();
      URL.revokeObjectURL(urlPng);
    } catch {
      setErro("Não deu para gerar a imagem neste navegador. Tente pelo Chrome do computador.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">📣 Cartaz para o grupo</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Baixe e mande no grupo. Sai sempre no mesmo tamanho e legível no celular — print de tela
            não sai.
          </p>
        </div>
        <button
          type="button"
          onClick={baixar}
          disabled={baixando}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {baixando ? "Gerando…" : "⬇️ Baixar imagem (PNG)"}
        </button>
      </div>

      {erro && <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{erro}</p>}

      {/* O CARTAZ TRAZ O GABARITO.
          Enquanto a rodada está no ar, mandá-lo no grupo entrega a
          resposta a quem ainda não jogou e a classificação do mês deixa
          de valer. O aviso fica aqui e não no cartaz -- quem decide
          publicar é quem lê esta tela. */}
      {rodadaNoAr && perguntaCritica && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          ⚠️ <strong>Esta rodada ainda está no ar.</strong> O cartaz mostra a resposta certa — mandar
          agora entrega o gabarito a quem não respondeu, e a classificação do mês deixa de valer.
          Encerre a rodada antes de publicar, ou mande só depois do prazo.
        </p>
      )}

      {/* O SVG é o que vira PNG -- o que se vê aqui é exatamente o que
          sai no arquivo, então não há surpresa depois de baixar. */}
      <div className="overflow-x-auto rounded-xl bg-slate-100 p-3">
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${L} ${A}`}
          width={L}
          height={A}
          className="mx-auto h-auto w-full max-w-[420px]"
          fontFamily="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        >
          <defs>
            <linearGradient id="fundoCartaz" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
          </defs>

          <rect width={L} height={A} fill="url(#fundoCartaz)" />

          {/* Cabeçalho */}
          <text x="70" y="120" fill="#facc15" fontSize="30" fontWeight="700" letterSpacing="6">
            DESAFIO DO MÊS
          </text>
          <text x="70" y="185" fill="#ffffff" fontSize="52" fontWeight="800">
            {area} · {periodo}
          </text>
          {quebrar(titulo, 32, 940, 2).map((linha, i) => (
            <text key={i} x="70" y={240 + i * 42} fill="#cbd5e1" fontSize="32">
              {linha}
            </text>
          ))}

          {/* Os dois números */}
          <rect x="70" y="330" width="440" height="200" rx="24" fill="#1e293b" />
          <text x="290" y="392" fill="#94a3b8" fontSize="26" fontWeight="600" textAnchor="middle">
            PARTICIPAÇÃO
          </text>
          <text
            x="290"
            y="470"
            fill={cor(participacao)}
            fontSize="86"
            fontWeight="800"
            textAnchor="middle"
          >
            {participacao === null ? "—" : `${participacao}%`}
          </text>
          <text x="290" y="508" fill="#cbd5e1" fontSize="24" textAnchor="middle">
            {concluiram} de {elegiveis} entregaram
          </text>

          <rect x="570" y="330" width="440" height="200" rx="24" fill="#1e293b" />
          <text x="790" y="392" fill="#94a3b8" fontSize="26" fontWeight="600" textAnchor="middle">
            TAXA DE ACERTO
          </text>
          <text x="790" y="470" fill={cor(taxaAcerto)} fontSize="86" fontWeight="800" textAnchor="middle">
            {taxaAcerto === null ? "—" : `${taxaAcerto}%`}
          </text>
          <text x="790" y="508" fill="#cbd5e1" fontSize="24" textAnchor="middle">
            em {totalPerguntas} perguntas
          </text>

          {/* Pódio */}
          <text x="70" y="600" fill="#facc15" fontSize="30" fontWeight="700" letterSpacing="4">
            PÓDIO
          </text>
          {podio.length === 0 && (
            <text x="70" y="660" fill="#94a3b8" fontSize="28">
              Ninguém concluiu ainda.
            </text>
          )}
          {podio.map((p, i) => (
            <g key={p.nome}>
              <rect x="70" y={630 + i * 82} width="940" height="68" rx="16" fill="#1e293b" />
              <text x="100" y={676 + i * 82} fontSize="36">
                {medalhas[i]}
              </text>
              <text x="160" y={676 + i * 82} fill="#ffffff" fontSize="32" fontWeight="600">
                {quebrar(p.nome, 32, 600, 1)[0] ?? p.nome}
              </text>
              <text x="980" y={676 + i * 82} fill="#facc15" fontSize="32" fontWeight="700" textAnchor="end">
                {p.pontos} pts
              </text>
            </g>
          ))}

          {/* ---- O QUE O CARTAZ ENSINA ----
              Aqui ficava a lista de quem não entregou. Trocada pela
              resposta certa: o cartaz vai para o grupo, e um cartaz que
              ensina o procedimento chega a todo mundo -- inclusive a
              quem acertou por sorte. A cobrança nominal continua na
              tela, que é onde ela é feita de líder para pessoa. */}
          {perguntaCritica && (
            <>
              <text x="70" y="935" fill="#f87171" fontSize="28" fontWeight="700" letterSpacing="4">
                A PERGUNTA QUE MAIS ERRAMOS · {perguntaCritica.pct}% DE ACERTO
              </text>
              {linhasDaPergunta.map((linha, i) => (
                <text key={i} x="70" y={985 + i * 40} fill="#e2e8f0" fontSize="30">
                  {linha}
                </text>
              ))}

              <rect x="70" y="1075" width="940" height="215" rx="24" fill="#064e3b" opacity="0.85" />
              <text x="100" y="1125" fill="#6ee7b7" fontSize="28" fontWeight="700" letterSpacing="3">
                ✅ A RESPOSTA CERTA
              </text>
              {linhasDaResposta.map((linha, i) => (
                <text key={i} x="100" y={1172 + i * 36} fill="#ffffff" fontSize="28" fontWeight="600">
                  {linha}
                </text>
              ))}
              {/* 30px ABAIXO DA ÚLTIMA LINHA da resposta, não a partir do
                  topo do bloco: com três linhas, a conta pelo topo punha
                  a explicação fora do retângulo e por cima do rodapé --
                  e SVG não recorta nem avisa, só desenha por cima. */}
              {linhaDaExplicacao && (
                <text
                  x="100"
                  y={1172 + (linhasDaResposta.length - 1) * 36 + 30}
                  fill="#a7f3d0"
                  fontSize="22"
                >
                  {linhaDaExplicacao}
                </text>
              )}
            </>
          )}

          <text x="70" y={A - 40} fill="#64748b" fontSize="22">
            App do Colaborador · Lima Logística
          </text>
        </svg>
      </div>
    </section>
  );
}
