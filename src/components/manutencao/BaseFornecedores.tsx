"use client";

import { useMemo, useState } from "react";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  CATEGORIAS,
  FREQUENCIAS,
  buscarFornecedores,
  dataBr,
  formatarTelefone,
  linkTelefone,
  linkWhatsapp,
  pendenciasDoFornecedor,
  type Categoria,
  type Fornecedor,
} from "@/lib/manutencao-raci";
import {
  marcarAnsParaRevisar,
  registrarAnsRevisto,
  removerFornecedor,
  salvarFornecedor,
} from "@/app/fornecedores/actions";
import { ComMarcas } from "@/components/Icone";

const campo = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold text-slate-600";

/**
 * A BASE DE FORNECEDORES (V.3): busca, categoria e o botão de ligar ou
 * chamar no WhatsApp direto do cartão -- quem está com a cabine elétrica
 * desarmada não quer copiar número.
 *
 * Quem é do time da manutenção vê também o editar, o "serviço não foi
 * adequado" e o "ANS revisto" (V.4).
 */
export function BaseFornecedores({ fornecedores, podeEditar }: { fornecedores: Fornecedor[]; podeEditar: boolean }) {
  const [termo, setTermo] = useState("");
  const [categoria, setCategoria] = useState<Categoria | "todas" | "pendencias">("todas");

  const visiveis = useMemo(() => {
    const achados = buscarFornecedores(fornecedores, termo);
    if (categoria === "todas") return achados;
    if (categoria === "pendencias") return achados.filter((f) => pendenciasDoFornecedor(f).length > 0);
    return achados.filter((f) => f.categoria === categoria);
  }, [fornecedores, termo, categoria]);

  const comPendencia = fornecedores.filter((f) => pendenciasDoFornecedor(f).length > 0).length;
  const contagem = (c: Categoria) => fornecedores.filter((f) => f.categoria === c).length;

  return (
    <div>
      <input
        type="search"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="🔎 Buscar: ar-condicionado, energia, Mansidão..."
        aria-label="Buscar fornecedor"
        className={`${campo} mb-3 py-3`}
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Filtro ativo={categoria === "todas"} onClick={() => setCategoria("todas")}>
          Todos ({fornecedores.length})
        </Filtro>
        {CATEGORIAS.map((c) =>
          contagem(c.id) > 0 ? (
            <Filtro key={c.id} ativo={categoria === c.id} onClick={() => setCategoria(c.id)}>
              <ComMarcas texto={c.emoji ?? ""} /> {c.rotulo} ({contagem(c.id)})
            </Filtro>
          ) : null,
        )}
        {podeEditar && comPendencia > 0 && (
          <Filtro ativo={categoria === "pendencias"} onClick={() => setCategoria("pendencias")} alerta>
            ⚠️ Pendências ({comPendencia})
          </Filtro>
        )}
      </div>

      {podeEditar && (
        <details className="mb-4 rounded-2xl border border-dashed border-primary/40 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-primary">➕ Incluir fornecedor</summary>
          <FormNoLugar acao={salvarFornecedor} limparAoSalvar fecharAoSalvar className="mt-3">
            <CamposDoFornecedor />
            <BotaoEnviar textoEnviando="Salvando..." className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white">
              Incluir na base
            </BotaoEnviar>
          </FormNoLugar>
        </details>
      )}

      {visiveis.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Nenhum fornecedor encontrado{termo ? ` para "${termo}"` : ""}.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {visiveis.map((f) => (
            <CartaoFornecedor key={f.id} f={f} podeEditar={podeEditar} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Filtro({
  ativo,
  alerta = false,
  onClick,
  children,
}: {
  ativo: boolean;
  alerta?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
        ativo
          ? alerta
            ? "border-amber-500 bg-amber-500 text-white"
            : "border-primary bg-primary text-white"
          : alerta
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-slate-300 bg-white text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function CartaoFornecedor({ f, podeEditar }: { f: Fornecedor; podeEditar: boolean }) {
  const tel = linkTelefone(f.telefone);
  const zap = linkWhatsapp(f.telefone);
  const pendencias = pendenciasDoFornecedor(f);
  const cat = CATEGORIAS.find((c) => c.id === f.categoria);

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xl" aria-hidden>
          <ComMarcas texto={cat?.emoji ?? ""} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">{f.nome}</p>
          <p className="text-xs text-slate-600">
            {f.tipoServico}
            {f.cidade ? ` · ${f.cidade}` : ""}
          </p>
          <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {f.critico && <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-800">Item crítico</span>}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              {FREQUENCIAS.find((x) => x.id === f.frequencia)?.rotulo}
            </span>
          </p>
        </div>
      </div>

      {(f.ans || f.custo || f.observacao) && (
        <dl className="mt-3 grid gap-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
          {f.ans && (
            <div>
              <dt className="inline font-semibold">ANS: </dt>
              <dd className="inline">
                {f.ans}
                {f.ansRevisadaEm && <span className="text-slate-400"> · revisto em {dataBr(f.ansRevisadaEm)}</span>}
              </dd>
            </div>
          )}
          {f.custo && (
            <div>
              <dt className="inline font-semibold">Custo: </dt>
              <dd className="inline">{f.custo}</dd>
            </div>
          )}
          {f.observacao && <dd>{f.observacao}</dd>}
        </dl>
      )}

      {podeEditar && pendencias.length > 0 && (
        <ul className="mt-2 space-y-1">
          {pendencias.map((p) => (
            <li key={p} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
              ⚠️ {p}
              {p.startsWith("ANS a revisar") && f.motivoRevisao ? `: ${f.motivoRevisao}` : ""}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        {tel && (
          <a href={tel} className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-center text-sm font-semibold text-white">
            📞 {formatarTelefone(f.telefone)}
          </a>
        )}
        {zap && (
          <a
            href={zap}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800"
          >
            WhatsApp
          </a>
        )}
      </div>

      {podeEditar && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-primary">✏️ Editar</summary>
            <FormNoLugar acao={salvarFornecedor} fecharAoSalvar className="mt-2">
              <input type="hidden" name="id" value={f.id} />
              <CamposDoFornecedor f={f} />
              <BotaoEnviar textoEnviando="Salvando..." className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
                Salvar
              </BotaoEnviar>
            </FormNoLugar>
            <FormNoLugar
              acao={removerFornecedor}
              confirmacao={{ titulo: `Tirar ${f.nome} da base?`, confirmar: "Tirar", perigo: true }}
              className="mt-2"
            >
              <input type="hidden" name="id" value={f.id} />
              <BotaoEnviar textoEnviando="Tirando..." className="w-full rounded-xl px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">
                Tirar da base
              </BotaoEnviar>
            </FormNoLugar>
          </details>

          {f.situacaoAns === "em_dia" ? (
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-amber-700">👎 O serviço não foi adequado</summary>
              <FormNoLugar acao={marcarAnsParaRevisar} fecharAoSalvar className="mt-2">
                <input type="hidden" name="id" value={f.id} />
                <label className={rotulo} htmlFor={`motivo-${f.id}`}>
                  O que aconteceu? (fica registrado para revisar o ANS com o fornecedor)
                </label>
                <textarea id={`motivo-${f.id}`} name="motivo" rows={2} required className={campo} placeholder="Ex.: demorou 3 dias para vir; o combinado era 24 h" />
                <BotaoEnviar textoEnviando="Salvando..." className="mt-2 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white">
                  Marcar ANS para revisar
                </BotaoEnviar>
              </FormNoLugar>
            </details>
          ) : (
            <details open>
              <summary className="cursor-pointer text-xs font-semibold text-emerald-700">🤝 Revisei o ANS com o fornecedor</summary>
              <FormNoLugar acao={registrarAnsRevisto} className="mt-2">
                <input type="hidden" name="id" value={f.id} />
                <label className={rotulo} htmlFor={`ans-${f.id}`}>
                  ANS combinado
                </label>
                <input id={`ans-${f.id}`} name="ans" defaultValue={f.ans ?? ""} required className={campo} placeholder="Ex.: atende em até 24 h; emergência em 4 h" />
                <BotaoEnviar textoEnviando="Salvando..." className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">
                  Registrar ANS revisto
                </BotaoEnviar>
              </FormNoLugar>
            </details>
          )}
          {f.atualizadoPorNome && (
            <p className="text-[11px] text-slate-400">
              Atualizado por {f.atualizadoPorNome.split(" ")[0]} em {dataBr(f.atualizadoEm)}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function CamposDoFornecedor({ f }: { f?: Fornecedor }) {
  const id = f?.id ?? "novo";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={rotulo} htmlFor={`nome-${id}`}>
          Nome *
        </label>
        <input id={`nome-${id}`} name="nome" defaultValue={f?.nome} required maxLength={120} className={campo} />
      </div>
      <div>
        <label className={rotulo} htmlFor={`cat-${id}`}>
          Categoria
        </label>
        <select id={`cat-${id}`} name="categoria" defaultValue={f?.categoria ?? "manutencao"} className={campo}>
          {CATEGORIAS.map((c) => (
            <option key={c.id} value={c.id}>
              <ComMarcas texto={c.emoji ?? ""} /> {c.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={rotulo} htmlFor={`tipo-${id}`}>
          Tipo de serviço *
        </label>
        <input id={`tipo-${id}`} name="tipo_servico" defaultValue={f?.tipoServico} required maxLength={160} className={campo} placeholder="Ex.: conserto de ar-condicionado" />
      </div>
      <div>
        <label className={rotulo} htmlFor={`tel-${id}`}>
          Telefone *
        </label>
        <input id={`tel-${id}`} name="telefone" type="tel" defaultValue={f?.telefone} required maxLength={40} className={campo} placeholder="(77) 99999-9999" />
      </div>
      <div>
        <label className={rotulo} htmlFor={`cid-${id}`}>
          Cidade
        </label>
        <input id={`cid-${id}`} name="cidade" defaultValue={f?.cidade ?? ""} maxLength={80} className={campo} />
      </div>
      <div>
        <label className={rotulo} htmlFor={`ans-n-${id}`}>
          ANS (prazo de atendimento)
        </label>
        <input id={`ans-n-${id}`} name="ans" defaultValue={f?.ans ?? ""} maxLength={300} className={campo} placeholder="Ex.: atende em até 24 h" />
      </div>
      <div>
        <label className={rotulo} htmlFor={`custo-${id}`}>
          Custo
        </label>
        <input id={`custo-${id}`} name="custo" defaultValue={f?.custo ?? ""} maxLength={200} className={campo} placeholder="Ex.: visita R$ 150 + peças" />
      </div>
      <div>
        <label className={rotulo} htmlFor={`freq-${id}`}>
          Frequência de uso
        </label>
        <select id={`freq-${id}`} name="frequencia" defaultValue={f?.frequencia ?? "raro"} className={campo}>
          {FREQUENCIAS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.rotulo}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
        <input type="checkbox" name="critico" defaultChecked={f?.critico} className="h-4 w-4" />
        Atende item crítico (precisa de ANS)
      </label>
      <div className="sm:col-span-2">
        <label className={rotulo} htmlFor={`obs-${id}`}>
          Observação
        </label>
        <input id={`obs-${id}`} name="observacao" defaultValue={f?.observacao ?? ""} maxLength={500} className={campo} />
      </div>
    </div>
  );
}
