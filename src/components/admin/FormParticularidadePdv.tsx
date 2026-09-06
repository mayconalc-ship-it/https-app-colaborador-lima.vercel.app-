"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { procurarPdv, salvarParticularidade } from "@/app/admin/pdv-particularidades/actions";
import { ROTULO_SEVERIDADE, type Severidade } from "@/lib/pdv-particularidades";

type Categoria = {
  id: string;
  nome: string;
  emoji: string | null;
  ajuda: string | null;
  severidade: Severidade;
  exigePrazo: boolean;
  exigeHorario: boolean;
  alertaNaRota: boolean;
};

type Achado = {
  codPdv: string;
  nomePdv: string | null;
  cidade: string | null;
  avaliacoes: number;
  media: number | null;
  detratoras: number;
};

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

const DIAS = [
  { n: 2, r: "seg" },
  { n: 3, r: "ter" },
  { n: 4, r: "qua" },
  { n: 5, r: "qui" },
  { n: 6, r: "sex" },
  { n: 7, r: "sáb" },
  { n: 1, r: "dom" },
];

/**
 * O CADASTRO DE UMA PARTICULARIDADE.
 *
 * DUAS COISAS MUDAM A TELA CONFORME A ESCOLHA, e é o que evita um
 * formulário com dez campos vazios:
 *
 *   - a CATEGORIA decide o que aparece. "PDV bloqueado" mostra as datas e
 *     as exige; "Horário de descarga" mostra o horário. Os campos que não
 *     valem para aquela categoria não ficam desabilitados: eles somem --
 *     campo cinza continua ocupando a tela e fazendo a pessoa pensar
 *     nele;
 *
 *   - o CLIENTE, escolhido na lista, preenche nome e cidade sozinho e
 *     mostra a nota que ele já deu. Quem vai cadastrar "cliente detrator"
 *     precisa desse número na frente para saber se é caso disso.
 *
 * A BUSCA É AJUDA, NÃO TRAVA: dá para digitar um código que o Rating
 * nunca viu. Exigir que o cliente exista na base de avaliações impediria
 * justamente o cadastro do cliente novo, que é quando a particularidade
 * mais importa.
 */
export function FormParticularidadePdv({
  categorias,
  hoje,
}: {
  categorias: Categoria[];
  hoje: string;
}) {
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "");
  const [termo, setTermo] = useState("");
  const [codPdv, setCodPdv] = useState("");
  const [escolhido, setEscolhido] = useState<Achado | null>(null);
  const [resultados, setResultados] = useState<Achado[]>([]);
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const categoria = categorias.find((c) => c.id === categoriaId) ?? null;

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  function digitar(valor: string) {
    setTermo(valor);
    setEscolhido(null);
    // O que a pessoa digitou É o código, até ela escolher outro na lista.
    setCodPdv(valor.trim());
    setAberto(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => {
      if (valor.trim().length < 2) {
        setResultados([]);
        return;
      }
      iniciar(async () => {
        try {
          setResultados(await procurarPdv(valor));
        } catch {
          setResultados([]);
        }
      });
    }, 400);
  }

  function escolher(p: Achado) {
    setEscolhido(p);
    setCodPdv(p.codPdv);
    setTermo(p.nomePdv ? `${p.codPdv} — ${p.nomePdv}` : p.codPdv);
    setAberto(false);
  }

  return (
    <form action={salvarParticularidade} className="space-y-3">
      {/* ---- O cliente ---- */}
      <div ref={caixa} className="relative">
        <label className={rotulo} htmlFor="busca-pdv">
          Cliente (código ou nome) *
        </label>
        <input
          id="busca-pdv"
          value={termo}
          onChange={(e) => digitar(e.target.value)}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAberto(false);
            // Enter na busca não pode enviar o formulário: a pessoa está
            // escolhendo o cliente, não terminando o cadastro.
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="Ex.: 507 ou BAR LINHA DIRETA"
          autoComplete="off"
          className={campo}
        />
        <input type="hidden" name="cod_pdv" value={codPdv} />
        <input type="hidden" name="nome_pdv" value={escolhido?.nomePdv ?? ""} />
        <input type="hidden" name="cidade" value={escolhido?.cidade ?? ""} />

        {aberto && termo.trim().length >= 2 && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {pendente ? (
              <p className="p-3 text-sm text-slate-400">Buscando...</p>
            ) : resultados.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">
                Nenhum cliente com esse código ou nome nas avaliações.{" "}
                <strong>Dá para cadastrar assim mesmo</strong> — o que você digitou vira o código.
              </p>
            ) : (
              resultados.map((p) => (
                <button
                  key={p.codPdv}
                  type="button"
                  onClick={() => escolher(p)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-primary-soft"
                >
                  <span className="font-semibold text-slate-800">{p.codPdv}</span>{" "}
                  <span className="text-slate-600">— {p.nomePdv ?? "sem nome"}</span>
                  <span className="block text-xs text-slate-400">
                    {p.cidade ?? "cidade não informada"} · {p.avaliacoes} avaliação(ões)
                    {p.media !== null && ` · média ${p.media}`}
                    {p.detratoras > 0 && (
                      <span className="font-semibold text-red-600"> · {p.detratoras} detratora(s)</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {escolhido && (
          <p className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
            <strong>{escolhido.nomePdv ?? escolhido.codPdv}</strong>
            {escolhido.cidade && ` · ${escolhido.cidade}`} · {escolhido.avaliacoes} entrega(s)
            avaliada(s)
            {escolhido.media !== null && ` · média ${escolhido.media}`}
            {escolhido.detratoras > 0 && (
              <span className="font-semibold text-red-700">
                {" "}
                · {escolhido.detratoras} detratora(s)
              </span>
            )}
          </p>
        )}
      </div>

      {/* ---- A categoria ---- */}
      <div>
        <label className={rotulo} htmlFor="categoria">
          Categoria *
        </label>
        <select
          id="categoria"
          name="categoria_id"
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          className={campo}
        >
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji ? `${c.emoji} ` : ""}
              {c.nome}
            </option>
          ))}
        </select>
        {categoria && (
          <p className="mt-1 text-xs leading-snug text-slate-500">
            {ROTULO_SEVERIDADE[categoria.severidade].icone}{" "}
            {ROTULO_SEVERIDADE[categoria.severidade].titulo}
            {!categoria.alertaNaRota && " · não vai para a rota, fica só para quem acompanha"}
            {categoria.ajuda && ` — ${categoria.ajuda}`}
          </p>
        )}
      </div>

      {/* ---- O aviso ---- */}
      <div>
        <label className={rotulo} htmlFor="aviso">
          Aviso — a frase que o motorista lê *
        </label>
        <input
          id="aviso"
          name="aviso"
          maxLength={160}
          required
          placeholder="Ex.: só recebe até as 11h; depois disso o depósito fecha."
          className={campo}
        />
        <p className="mt-1 text-xs text-slate-400">
          Uma frase, escrita para ser lida na porta do cliente. O detalhe longo vai no campo abaixo.
        </p>
      </div>

      {/* ---- Horário, só quando a categoria pede ---- */}
      {categoria?.exigeHorario && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={rotulo} htmlFor="hora_de">
                A partir das
              </label>
              <input id="hora_de" name="hora_de" type="time" className={campo} />
            </div>
            <div>
              <label className={rotulo} htmlFor="hora_ate">
                Até as
              </label>
              <input id="hora_ate" name="hora_ate" type="time" className={campo} />
            </div>
          </div>
          <div className="mt-2">
            <p className={rotulo}>Dias da semana (vazio = todo dia)</p>
            <div className="flex flex-wrap gap-2">
              {DIAS.map((d) => (
                <label
                  key={d.n}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700"
                >
                  <input type="checkbox" name="dias_semana" value={d.n} className="h-4 w-4" />
                  {d.r}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- Prazo, só quando a categoria pede ---- */}
      {categoria?.exigePrazo && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={rotulo} htmlFor="de">
                Desde
              </label>
              <input id="de" name="de" type="date" defaultValue={hoje} className={campo} />
            </div>
            <div>
              <label className={rotulo} htmlFor="ate">
                Libera em *
              </label>
              <input id="ate" name="ate" type="date" required className={campo} />
            </div>
          </div>
          <p className="mt-1.5 text-xs leading-snug text-amber-900">
            É desta data que o painel conta os dias que faltam. Sem ela, o bloqueio vira eterno e
            ninguém revisa — foi por isso que a categoria exige.
          </p>
        </div>
      )}

      <div>
        <label className={rotulo} htmlFor="detalhe">
          Detalhe (opcional)
        </label>
        <textarea id="detalhe" name="detalhe" rows={2} maxLength={500} className={campo} />
      </div>

      <BotaoEnviar
        textoEnviando="Salvando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-dark"
      >
        Cadastrar particularidade
      </BotaoEnviar>
    </form>
  );
}
