import React from "react";

// Captura endereços começando por http(s):// ou www.
const PADRAO_URL = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

// Pontuação colada no fim da frase não faz parte do endereço.
const PONTUACAO_FINAL = /[.,;:!?)\]}]+$/;

function normalizar(bruto: string) {
  const semPontuacao = bruto.replace(PONTUACAO_FINAL, "");
  const href = semPontuacao.startsWith("www.")
    ? `https://${semPontuacao}`
    : semPontuacao;
  return {
    href,
    exibicao: semPontuacao,
    sobra: bruto.slice(semPontuacao.length),
    // Só liberamos http/https: evita javascript: e afins vindos do texto.
    seguro: /^https?:\/\//i.test(href),
  };
}

function encurtar(url: string) {
  const semProtocolo = url.replace(/^https?:\/\//i, "");
  return semProtocolo.length > 45
    ? `${semProtocolo.slice(0, 45)}…`
    : semProtocolo;
}

/**
 * Transforma endereços escritos no texto em links clicáveis.
 * Quando o parágrafo é só um link, vira um botão grande — bem mais fácil de
 * acertar no celular do que um link fino no meio da frase.
 */
export function TextoComLinks({
  texto,
  rotuloBotao = "Abrir link",
}: {
  texto: string;
  rotuloBotao?: string;
}) {
  const partes = texto.split(PADRAO_URL);
  const somenteUmLink =
    partes.filter((p) => p.trim() !== "").length === 1 &&
    PADRAO_URL.test(texto.trim()) &&
    texto.trim().split(/\s+/).length === 1;

  // O regex tem flag "g": precisa zerar antes de reutilizar.
  PADRAO_URL.lastIndex = 0;

  if (somenteUmLink) {
    const { href, seguro } = normalizar(texto.trim());
    if (seguro) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-white hover:bg-primary-dark"
        >
          🔗 {rotuloBotao}
        </a>
      );
    }
  }

  return (
    <>
      {partes.map((parte, i) => {
        if (i % 2 === 0) return <React.Fragment key={i}>{parte}</React.Fragment>;

        const { href, exibicao, sobra, seguro } = normalizar(parte);
        if (!seguro) return <React.Fragment key={i}>{parte}</React.Fragment>;

        return (
          <React.Fragment key={i}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline decoration-primary/40 underline-offset-2"
            >
              {encurtar(exibicao)}
            </a>
            {sobra}
          </React.Fragment>
        );
      })}
    </>
  );
}
