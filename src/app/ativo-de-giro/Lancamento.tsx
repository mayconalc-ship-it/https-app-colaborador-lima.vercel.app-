"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  formatarData,
  rotuloRecontagem,
  totalEmCaixas,
  type Combinacao,
  type Contagem,
  type Fatores,
  type LinhaContagem,
  type Recontagem,
} from "@/lib/ativo-giro";
import { FormContagem } from "./FormContagem";
import { ContagemItem } from "./ContagemItem";
import { ExportarContagens } from "./ExportarContagens";
import { registrarContagem } from "./actions";

/**
 * Uma linha que a tela já mostra e o servidor ainda não confirmou.
 *
 * O `FormData` fica guardado de propósito: é o que permite reenviar sem
 * pedir para a pessoa digitar tudo de novo.
 */
type Envio = {
  chave: string;
  linha: LinhaContagem;
  dados: FormData;
  situacao: "enviando" | "salva" | "erro";
  /** A linha de verdade, com id, assim que o banco responde. */
  contagem?: Contagem;
  mensagem?: string;
};

/**
 * Quanto tempo de silêncio antes de ressincronizar a lista com o servidor.
 *
 * Ressincronizar a cada linha desperdiçaria as cinco consultas da página
 * quinze vezes numa rajada de contagem -- exatamente o custo que o
 * lançamento otimista existe para eliminar. Esperar o fim da rajada
 * gasta isso uma vez só. O preço é que a contagem lançada por OUTRA
 * pessoa neste minuto pode demorar alguns segundos a mais para aparecer
 * aqui; a sua própria já está na tela desde o toque.
 */
const ESPERA_SINCRONIA = 4000;

let contador = 0;
function novaChave() {
  contador += 1;
  return `envio-${Date.now()}-${contador}`;
}

/**
 * O lado cliente da aba "Contagem": o formulário e a lista, juntos.
 *
 * Precisam morar no mesmo componente porque a lista mostra o que o
 * formulário acabou de lançar antes de o servidor confirmar. O que vem do
 * servidor continua chegando por prop -- este componente só acrescenta o
 * que ainda está em trânsito.
 */
export function Lancamento({
  fatores,
  ultima,
  contagens,
  hoje,
  recontagens,
}: {
  fatores: Fatores;
  ultima: Combinacao;
  /** As contagens já confirmadas, vindas do servidor. */
  contagens: Contagem[];
  hoje: string;
  /** Pedidos de recontagem ainda em aberto, da revenda inteira. */
  recontagens: Recontagem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [foco, setFoco] = useState<{
    valores: Partial<Combinacao>;
    sinal: number;
  } | null>(null);

  /**
   * Aceitar um pedido não muda o banco -- só empurra os campos que o
   * pedido fixou para dentro do formulário, pronto para digitar a
   * quantidade. Tipo/status ficam livres quando o pedido pediu "qualquer"
   * (formato inteiro).
   */
  function recontar(r: Recontagem) {
    setFoco({
      valores: {
        ...(r.tipo ? { tipo: r.tipo } : {}),
        formato: r.formato,
        ...(r.status ? { status: r.status } : {}),
      },
      sinal: Date.now(),
    });
    document
      .getElementById("form-contagem")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Quando a linha confirmada aparece na lista do servidor, a cópia local
  // vira duplicata e sai. O ajuste acontece durante a renderização, e não
  // num efeito: é o próprio React que recomenda isso para estado que
  // deriva de props, e evita o quadro extra em que a linha apareceria
  // duas vezes.
  const jaNoServidor = new Set(contagens.map((c) => c.id));
  const emTransito = envios.filter(
    (e) => !(e.contagem && jaNoServidor.has(e.contagem.id)),
  );
  if (emTransito.length !== envios.length) setEnvios(emTransito);

  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    [],
  );

  function agendarSincronia() {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => {
      relogio.current = null;
      router.refresh();
    }, ESPERA_SINCRONIA);
  }

  function anotar(chave: string, mudanca: Partial<Envio>) {
    setEnvios((atual) =>
      atual.map((e) => (e.chave === chave ? { ...e, ...mudanca } : e)),
    );
  }

  /**
   * Cada envio só mexe na PRÓPRIA linha, achada pela chave. É o que deixa
   * vários lançamentos correrem ao mesmo tempo sem uma resposta atrasada
   * sobrescrever a linha errada.
   */
  async function despachar(chave: string, dados: FormData) {
    try {
      const r = await registrarContagem(dados);
      if (r.situacao === "ok") {
        anotar(chave, { situacao: "salva", contagem: r.contagem });
        agendarSincronia();
      } else {
        anotar(chave, { situacao: "erro", mensagem: r.mensagem });
        toast.erro(r.mensagem);
      }
    } catch {
      // Rede caiu, aba dormiu, servidor engasgou: a linha fica na tela
      // marcada em vermelho. Nada some sem a pessoa ver.
      anotar(chave, {
        situacao: "erro",
        mensagem: "Não deu para falar com o servidor. Toque em Reenviar.",
      });
    }
  }

  function aoLancar(dados: FormData, linha: LinhaContagem) {
    const chave = novaChave();
    setEnvios((atual) => [
      { chave, linha, dados, situacao: "enviando" },
      ...atual,
    ]);
    void despachar(chave, dados);
  }

  function reenviar(envio: Envio) {
    anotar(envio.chave, { situacao: "enviando", mensagem: undefined });
    void despachar(envio.chave, envio.dados);
  }

  function descartar(chave: string) {
    setEnvios((atual) => atual.filter((e) => e.chave !== chave));
  }

  // O resumo de WhatsApp e o CSV levam só o que existe no banco. Linha a
  // caminho ou com erro não entra: o resumo é o que a revenda vai tratar
  // como verdade, e ele não pode prometer o que ainda não foi gravado.
  const confirmadas = emTransito
    .map((e) => e.contagem)
    .filter((c): c is Contagem => Boolean(c));
  const minhasDeHoje = [...confirmadas, ...contagens].filter(
    (c) => c.data === hoje,
  );

  const vazio = emTransito.length === 0 && contagens.length === 0;

  return (
    <section>
      {recontagens.length > 0 && (
        <div className="mb-4 space-y-2">
          {recontagens.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-gold bg-amber-50 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-900">
                  🔁 Recontagem pedida
                </p>
                <p className="text-xs text-amber-700">
                  {rotuloRecontagem(r)} — pedido por {r.solicitadoNome}
                </p>
                {r.observacao && (
                  <p className="mt-1 text-xs text-amber-700">{r.observacao}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => recontar(r)}
                className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
              >
                Recontar agora
              </button>
            </div>
          ))}
        </div>
      )}

      <div id="form-contagem">
        <FormContagem
          fatores={fatores}
          ultima={ultima}
          aoLancar={aoLancar}
          foco={foco}
        />
      </div>

      <h2 className="mt-8 mb-3 text-lg font-bold text-slate-900">
        Minhas contagens
      </h2>

      {vazio ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Você ainda não registrou nenhuma contagem.
        </p>
      ) : (
        <ul className="space-y-2">
          {emTransito.map((e) =>
            e.situacao === "salva" && e.contagem ? (
              // Confirmada: vira uma linha comum, que aceita editar e
              // excluir como qualquer outra.
              <ContagemItem
                key={e.chave}
                contagem={e.contagem}
                fatores={fatores}
              />
            ) : (
              <LinhaEmTransito
                key={e.chave}
                envio={e}
                fatores={fatores}
                aoReenviar={() => reenviar(e)}
                aoDescartar={() => descartar(e.chave)}
              />
            ),
          )}
          {contagens.map((c) => (
            <ContagemItem key={c.id} contagem={c} fatores={fatores} />
          ))}
        </ul>
      )}

      {minhasDeHoje.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-lg font-bold text-slate-900">
            Compartilhar contagem de hoje
          </h2>
          <ExportarContagens
            contagens={minhasDeHoje}
            fatores={fatores}
            data={hoje}
          />
        </>
      )}
    </section>
  );
}

/**
 * A linha enquanto ela ainda não é do banco: a caminho ou falhada.
 *
 * Repete o desenho de `ContagemItem` de propósito -- o que muda é a
 * moldura e o rodapé, não a informação. Quem conta precisa reconhecer a
 * linha que acabou de lançar sem reler.
 */
function LinhaEmTransito({
  envio,
  fatores,
  aoReenviar,
  aoDescartar,
}: {
  envio: Envio;
  fatores: Fatores;
  aoReenviar: () => void;
  aoDescartar: () => void;
}) {
  const { linha, situacao, mensagem } = envio;
  const falhou = situacao === "erro";

  return (
    <li
      className={`rounded-xl border p-3 ${
        falhou ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
      }`}
      aria-busy={!falhou}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {linha.tipo} · {linha.formato} · {linha.status}
          </p>
          <p className="text-xs text-slate-500">
            {formatarData(linha.data)} — Pal {linha.palete} / Las{" "}
            {linha.lastro} / Cx {linha.caixa}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
          {totalEmCaixas(linha, fatores[linha.formato])} cx
        </span>
      </div>

      {falhou ? (
        <>
          <p className="mt-2 text-xs font-medium text-red-700">
            {mensagem ?? "Não foi possível salvar."}
          </p>
          <div className="mt-2 flex justify-end gap-2 border-t border-red-200 pt-2">
            <button
              type="button"
              onClick={aoDescartar}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={aoReenviar}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark"
            >
              Reenviar
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-500">
          <span className="rodinha" aria-hidden="true" />
          Enviando...
        </p>
      )}
    </li>
  );
}
