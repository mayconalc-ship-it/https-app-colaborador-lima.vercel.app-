"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { procurarPdv, salvarParticularidade } from "@/app/admin/pdv-particularidades/actions";
import {
  MAXIMO_DE_JANELAS,
  ROTULO_SEVERIDADE,
  type Severidade,
} from "@/lib/pdv-particularidades";

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
  const [nomePdv, setNomePdv] = useState("");
  const [cidade, setCidade] = useState("");
  const [escolhido, setEscolhido] = useState<Achado | null>(null);
  const [resultados, setResultados] = useState<Achado[]>([]);
  const [aberto, setAberto] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [quantasJanelas, setQuantasJanelas] = useState(1);
  const [pendente, iniciar] = useTransition();
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relogioCodigo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const categoria = categorias.find((c) => c.id === categoriaId) ?? null;

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  // A BUSCA NÃO ESCREVE NO CÓDIGO. Ela só oferece a lista; quem escreve é
  // a escolha (ou a pessoa, no campo do código). Foi exatamente isso que
  // deixava um nome digitado virar código.
  function digitar(valor: string) {
    setTermo(valor);
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
    setNomePdv(p.nomePdv ?? "");
    setCidade(p.cidade ?? "");
    setTermo(p.nomePdv ? `${p.codPdv} — ${p.nomePdv}` : p.codPdv);
    setAberto(false);
  }

  /**
   * O CÓDIGO ACEITA SÓ DÍGITO -- medido: os 1.216 PDVs do Rating são
   * todos numéricos. Filtrar na digitação é melhor do que recusar no
   * envio: a pessoa vê na hora que a letra não entra.
   *
   * E cada código digitado é CONFERIDO contra a base, para dizer de quem
   * ele é. Trocar 507 por 570 é o erro mais fácil de cometer aqui, e o
   * mais difícil de notar depois -- a particularidade fica no cliente
   * errado, calada.
   */
  function digitarCodigo(valor: string) {
    const so = valor.replace(/\D/g, "").slice(0, 10);
    setCodPdv(so);
    setEscolhido(null);
    if (relogioCodigo.current) clearTimeout(relogioCodigo.current);
    if (!so) {
      setConferindo(false);
      return;
    }
    setConferindo(true);
    relogioCodigo.current = setTimeout(async () => {
      try {
        const achados = await procurarPdv(so);
        const exato = achados.find((a) => a.codPdv === so) ?? null;
        setEscolhido(exato);
        // Só preenche o que ainda está vazio: quem corrigiu o nome à mão
        // não pode ver a correção sumir por causa de uma consulta.
        if (exato) {
          setNomePdv((atual) => atual || (exato.nomePdv ?? ""));
          setCidade((atual) => atual || (exato.cidade ?? ""));
        }
      } catch {
        setEscolhido(null);
      } finally {
        setConferindo(false);
      }
    }, 500);
  }

  return (
    <form action={salvarParticularidade} className="space-y-3">
      {/* ---- Procurar o cliente ---- */}
      {/*
        A BUSCA NÃO É MAIS O CAMPO DO CÓDIGO -- correção do dono
        (06/09/2026). Antes, o que se digitasse aqui virava o código: quem
        escrevesse o nome e não escolhesse da lista gravava um código que
        nunca casaria com cliente nenhum. Agora ela só PREENCHE os campos
        abaixo, e eles são a verdade do cadastro.
      */}
      <div ref={caixa} className="relative">
        <label className={rotulo} htmlFor="busca-pdv">
          🔎 Procurar o cliente (código ou nome)
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

        {aberto && termo.trim().length >= 2 && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {pendente ? (
              <p className="p-3 text-sm text-slate-400">Buscando...</p>
            ) : resultados.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">
                Nenhum cliente com esse código ou nome nas avaliações. Se for cliente novo, preencha
                o <strong>código</strong> abaixo à mão.
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
      </div>

      {/* ---- O que fica gravado: código e nome, separados ---- */}
      <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
        <div>
          <label className={rotulo} htmlFor="cod_pdv">
            Código do cliente *
          </label>
          <input
            id="cod_pdv"
            name="cod_pdv"
            value={codPdv}
            onChange={(e) => digitarCodigo(e.target.value)}
            inputMode="numeric"
            required
            placeholder="507"
            autoComplete="off"
            className={`${campo} tabular-nums`}
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="nome_pdv">
            Nome do cliente
          </label>
          <input
            id="nome_pdv"
            name="nome_pdv"
            value={nomePdv}
            onChange={(e) => setNomePdv(e.target.value)}
            placeholder="Preenchido pela busca — dá para corrigir"
            autoComplete="off"
            className={campo}
          />
        </div>
        <input type="hidden" name="cidade" value={cidade} />
      </div>

      {/*
        O QUE O APP SABE SOBRE ESSE CÓDIGO, dito na hora.

        Confirmação em verde quando o código existe nas avaliações; aviso
        em âmbar quando não existe. O aviso NÃO impede o cadastro: cliente
        novo, ou que nunca foi avaliado, é justamente quando a
        particularidade mais importa. Mas ele aparece, porque digitar 570
        no lugar de 507 é o erro mais fácil de cometer e o mais difícil de
        notar depois.
      */}
      {codPdv.length > 0 &&
        (conferindo ? (
          <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500">
            Conferindo o código…
          </p>
        ) : escolhido && escolhido.codPdv === codPdv ? (
          <p className="rounded-lg bg-green-50 px-2.5 py-1.5 text-xs text-green-900">
            ✅ <strong>{escolhido.nomePdv ?? escolhido.codPdv}</strong>
            {escolhido.cidade && ` · ${escolhido.cidade}`} · {escolhido.avaliacoes} entrega(s)
            avaliada(s)
            {escolhido.media !== null && ` · média ${escolhido.media}`}
            {escolhido.detratoras > 0 && (
              <span className="font-semibold text-red-700"> · {escolhido.detratoras} detratora(s)</span>
            )}
          </p>
        ) : (
          <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-snug text-amber-900">
            ⚠️ O código <strong>{codPdv}</strong> não aparece nas avaliações. Confira se não é outro
            número — se for cliente novo, pode seguir.
          </p>
        ))}

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
          {/*
            ATÉ QUATRO JANELAS -- pedido do dono (06/09/2026): "tem PDV que
            recebe das 08 às 11 e das 15 às 16h".

            Com uma janela só, quem cadastrava tinha duas saídas ruins:
            escrever "das 08 às 16" (que manda o motorista chegar às 12h e
            voltar) ou jogar o segundo horário no texto do aviso, onde
            nenhuma regra enxerga.

            A SEGUNDA NASCE VAZIA E SÓ APARECE QUANDO PEDIDA: a maioria dos
            clientes tem uma faixa só, e quatro pares de campos abertos de
            saída fariam a tela parecer mais trabalho do que é.
          */}
          <p className={rotulo}>Horário em que o cliente recebe</p>
          <div className="space-y-2">
            {Array.from({ length: quantasJanelas }).map((_, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-[10px] uppercase text-slate-400">
                    {i === 0 ? "A partir das" : "e das"}
                  </label>
                  <input name="janela_de" type="time" className={campo} />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-[10px] uppercase text-slate-400">Até as</label>
                  <input name="janela_ate" type="time" className={campo} />
                </div>
                {i === quantasJanelas - 1 && i > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuantasJanelas((n) => n - 1)}
                    className="shrink-0 pb-2 text-xs font-semibold text-slate-400 hover:text-red-600"
                  >
                    remover
                  </button>
                )}
              </div>
            ))}
          </div>
          {quantasJanelas < MAXIMO_DE_JANELAS && (
            <button
              type="button"
              onClick={() => setQuantasJanelas((n) => n + 1)}
              className="mt-2 text-xs font-semibold text-primary hover:underline"
            >
              + outro horário no dia
            </button>
          )}
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
            Para o cliente que fecha no almoço, use duas faixas. Deixar só o “até” também vale — vira
            “até as 11h”.
          </p>

          <div className="mt-3">
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
