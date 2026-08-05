"use client";

import { useEffect, useState } from "react";
import { MOTIVOS, motivoObrigatorio } from "@/lib/pesquisa";
import { responderPesquisa, situacaoDaPesquisa } from "@/app/pesquisa/actions";

/** Texto de apoio que muda conforme a nota, para a pergunta fazer sentido. */
function pedidoDaNota(nota: number) {
  if (nota <= 2) return "O que aconteceu? (obrigatório)";
  if (nota === 3) return "O que podemos melhorar?";
  return "Quer deixar um comentário?";
}

/**
 * Pesquisa de satisfação do app.
 *
 * Aparece por cima de tudo no início do acesso, quando o admin ativou a
 * pesquisa, a data está dentro do período e a pessoa ainda não respondeu
 * naquele ciclo. Quem decide isso é o servidor -- o navegador só pergunta.
 *
 * Não há "fechar": a ideia é que todo mundo responda uma vez por ciclo.
 * Fechando o app sem responder, a pesquisa volta no próximo acesso.
 */
export function PesquisaSatisfacao() {
  const [titulo, setTitulo] = useState<string | null>(null);
  const [nota, setNota] = useState(0);
  const [passando, setPassando] = useState(0); // estrela sob o cursor
  const [motivos, setMotivos] = useState<string[]>([]);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Uma consulta por carregamento de página, não por navegação.
  useEffect(() => {
    let ativo = true;
    situacaoDaPesquisa()
      .then((s) => {
        if (ativo && s.mostrar) setTitulo(s.titulo);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  // Trava a rolagem do fundo enquanto a pesquisa está na frente.
  useEffect(() => {
    if (!titulo) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [titulo]);

  if (!titulo) return null;

  function alternarMotivo(id: string) {
    setMotivos((atuais) =>
      atuais.includes(id) ? atuais.filter((m) => m !== id) : [...atuais, id],
    );
  }

  async function enviar() {
    setErro(null);
    setEnviando(true);

    const r = await responderPesquisa({ nota, motivos, comentario });

    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível enviar.");
      return;
    }

    setPronto(true);
    // Um instante para a pessoa ler o agradecimento antes de liberar o app.
    setTimeout(() => setTitulo(null), 1600);
  }

  const faltaMotivo = motivoObrigatorio(nota) && motivos.length === 0;
  const faltaComentario =
    motivoObrigatorio(nota) && comentario.trim() === "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {pronto ? (
          <div className="p-8 text-center">
            <p className="text-5xl">🙌</p>
            <p className="mt-3 text-lg font-bold text-slate-900">
              Obrigado pela sua avaliação!
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Sua opinião ajuda a melhorar o app.
            </p>
          </div>
        ) : (
          <div className="p-6">
            <h2 className="text-center text-lg font-bold text-slate-900">
              ⭐ O que você está achando do nosso app?
            </h2>
            <p className="mt-1 text-center text-sm text-slate-500">
              Sua opinião é importante para construirmos um app cada vez
              melhor.
            </p>

            {/* Estrelas */}
            <div
              className="mt-5 flex justify-center gap-1"
              onMouseLeave={() => setPassando(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNota(n)}
                  onMouseEnter={() => setPassando(n)}
                  aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
                  aria-pressed={nota === n}
                  className="p-1 text-4xl leading-none transition-transform hover:scale-110"
                >
                  <span
                    className={
                      n <= (passando || nota) ? "text-gold" : "text-slate-300"
                    }
                  >
                    {n <= (passando || nota) ? "★" : "☆"}
                  </span>
                </button>
              ))}
            </div>

            {nota > 0 && (
              <>
                {/* Motivos: só para nota baixa, onde a causa importa. */}
                {nota <= 2 && (
                  <div className="mt-5">
                    <p className="mb-2 text-sm font-semibold text-slate-800">
                      O que mais te atrapalhou?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {MOTIVOS.map((m) => {
                        const ativo = motivos.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            aria-pressed={ativo}
                            onClick={() => alternarMotivo(m.id)}
                            className={`rounded-full border px-3 py-2 text-sm transition ${
                              ativo
                                ? "border-primary bg-primary-soft font-semibold text-primary"
                                : "border-slate-200 text-slate-700"
                            }`}
                          >
                            {m.rotulo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-5">
                  <label
                    htmlFor="comentario-pesquisa"
                    className="mb-1 block text-sm font-semibold text-slate-800"
                  >
                    {pedidoDaNota(nota)}{" "}
                    {nota >= 3 && (
                      <span className="font-normal text-slate-400">
                        (opcional)
                      </span>
                    )}
                  </label>
                  <textarea
                    id="comentario-pesquisa"
                    rows={3}
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="Conte um pouco mais..."
                    className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
                  />
                </div>
              </>
            )}

            {erro && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {erro}
              </p>
            )}

            <button
              type="button"
              onClick={enviar}
              disabled={nota === 0 || faltaMotivo || faltaComentario || enviando}
              className="mt-5 w-full rounded-xl bg-primary py-4 font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando
                ? "Enviando..."
                : nota === 0
                  ? "Escolha de 1 a 5 estrelas"
                  : faltaMotivo
                    ? "Escolha pelo menos um motivo"
                    : faltaComentario
                      ? "Conte para nós o que podemos melhorar"
                      : "Enviar avaliação"}
            </button>

            <p className="mt-3 text-center text-xs text-slate-400">
              Leva menos de 30 segundos e aparece só uma vez.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
