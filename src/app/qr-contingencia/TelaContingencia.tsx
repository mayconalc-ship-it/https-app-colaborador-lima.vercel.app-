"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClienteDaRota } from "@/lib/clientes-do-mapa-server";
import {
  LIMITES_QR,
  clienteCasa,
  formatarCnpj,
  formatarReais,
  lerValor,
  validarComprovante,
} from "@/lib/qr-contingencia";
import {
  buscarClientesDoMapa,
  buscarClientesNaBase,
  excluirComprovante,
  registrarComprovante,
} from "./actions";

export type ConfigParaTela = {
  qrUrl: string | null;
  favorecido: string | null;
  cnpj: string | null;
  chavePix: string | null;
  instrucoes: string | null;
};

export type ComprovanteDaTela = {
  id: string;
  mapa: string | null;
  codPdv: string;
  clienteNome: string | null;
  valor: number | null;
  hora: string;
  fotos: { id: string; url: string | null }[];
};

type Foto = { id: string; arquivo: File; previa: string };

const CHAVE_MAPA = "qr-contingencia:mapa";
const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 focus:border-primary focus:outline-none";

/**
 * Reduz a foto NO CELULAR antes de enviar: a câmera tira 3-4 MB, e o
 * servidor recusa envio acima de ~4,5 MB. 1600 px e JPEG 80 deixam o
 * comprovante legível em ~300 KB. Se o aparelho não conseguir reduzir,
 * vai o original -- o servidor avisa se passar do limite.
 */
async function reduzir(arquivo: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    if (!blob) return arquivo;
    return new File([blob], "comprovante.jpg", { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}

export function TelaContingencia({
  config,
  meusDeHoje,
}: {
  config: ConfigParaTela;
  meusDeHoje: ComprovanteDaTela[];
}) {
  const router = useRouter();
  const [mapa, setMapa] = useState("");
  const [rota, setRota] = useState<{ mapa: string; data: string; clientes: ClienteDaRota[] } | null>(null);
  const [erroMapa, setErroMapa] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [daBase, setDaBase] = useState<ClienteDaRota[] | null>(null);
  const [cliente, setCliente] = useState<ClienteDaRota | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [buscando, iniciarBusca] = useTransition();
  const [enviando, iniciarEnvio] = useTransition();
  const [reduzindo, setReduzindo] = useState(false);
  const inputCamera = useRef<HTMLInputElement>(null);
  const inputGaleria = useRef<HTMLInputElement>(null);

  // O último mapa usado volta preenchido: o motorista faz vários clientes
  // do mesmo mapa no dia.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_MAPA);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do navegador
      if (salvo) setMapa(salvo);
    } catch {
      // Sem armazenamento local, começa vazio.
    }
  }, []);

  // As prévias das fotos são URLs do navegador; soltam a memória ao sair
  // da tela (as removidas uma a uma são soltas em `tirarFoto`).
  const fotosAtuais = useRef<Foto[]>([]);
  useEffect(() => {
    fotosAtuais.current = fotos;
  }, [fotos]);
  useEffect(() => () => fotosAtuais.current.forEach((f) => URL.revokeObjectURL(f.previa)), []);

  function buscarMapa() {
    setErroMapa(null);
    setDaBase(null);
    iniciarBusca(async () => {
      const r = await buscarClientesDoMapa(mapa);
      if (!r.ok) {
        setRota(null);
        setErroMapa(r.erro);
        return;
      }
      setRota(r);
      setFiltro("");
      try {
        localStorage.setItem(CHAVE_MAPA, mapa);
      } catch {
        // Lembrar o mapa é conveniência, não regra.
      }
      if (r.clientes.length === 0) {
        setErroMapa("Este mapa não trouxe a lista de clientes do dia. Procure o cliente pelo nome ou código abaixo.");
      }
    });
  }

  // Busca na base: só quando a lista do mapa não resolve (texto digitado e
  // nada no mapa casa), para não gastar consulta a cada letra.
  const doMapa = useMemo(
    () => (rota?.clientes ?? []).filter((c) => clienteCasa(c, filtro)),
    [rota, filtro],
  );
  function buscarNaBase() {
    iniciarBusca(async () => setDaBase(await buscarClientesNaBase(filtro)));
  }

  async function adicionarFotos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setReduzindo(true);
    const novas: Foto[] = [];
    for (const arquivo of Array.from(lista)) {
      if (fotos.length + novas.length >= LIMITES_QR.fotosMax) break;
      const reduzida = await reduzir(arquivo);
      novas.push({ id: `${Date.now()}-${Math.random()}`, arquivo: reduzida, previa: URL.createObjectURL(reduzida) });
    }
    setFotos((atual) => [...atual, ...novas]);
    setReduzindo(false);
  }

  function tirarFoto(id: string) {
    setFotos((atual) => {
      const saindo = atual.find((f) => f.id === id);
      if (saindo) URL.revokeObjectURL(saindo.previa);
      return atual.filter((f) => f.id !== id);
    });
  }

  // A MESMA regra do servidor, calculada enquanto a pessoa preenche.
  const problema = validarComprovante({
    codPdv: cliente?.codPdv ?? "",
    valor: lerValor(valor),
    observacao: observacao.trim(),
    fotos: fotos.map((f) => ({ tamanho: f.arquivo.size, tipo: f.arquivo.type })),
  });

  function enviar() {
    if (!cliente || problema) return;
    setAviso(null);
    const dados = new FormData();
    dados.set("cod_pdv", cliente.codPdv);
    dados.set("cliente_nome", cliente.nome ?? "");
    dados.set("mapa", rota?.mapa ?? mapa);
    dados.set("valor", valor);
    dados.set("observacao", observacao);
    for (const f of fotos) dados.append("fotos", f.arquivo);
    iniciarEnvio(async () => {
      const r = await registrarComprovante(dados);
      if (!r.ok) {
        setAviso({ tipo: "erro", texto: r.erro });
        return;
      }
      setAviso({ tipo: "ok", texto: r.mensagem });
      setCliente(null);
      fotos.forEach((f) => URL.revokeObjectURL(f.previa));
      setFotos([]);
      setValor("");
      setObservacao("");
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function apagar(id: string) {
    if (!confirm("Apagar este comprovante e as fotos dele?")) return;
    iniciarEnvio(async () => {
      const r = await excluirComprovante(id);
      setAviso(r.ok ? { tipo: "ok", texto: r.mensagem } : { tipo: "erro", texto: r.erro });
      router.refresh();
    });
  }

  async function copiarPix() {
    if (!config.chavePix) return;
    try {
      await navigator.clipboard.writeText(config.chavePix);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="space-y-5">
      {aviso && (
        <p
          role="status"
          className={`rounded-xl p-3 text-sm font-medium ${
            aviso.tipo === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {aviso.tipo === "ok" ? "✅ " : "⚠️ "}
          {aviso.texto}
        </p>
      )}

      {/* ---- O QR, primeiro: é o que o cliente precisa ver ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">QR Code de contingência</h2>
        {config.qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário, fora do otimizador
          <img
            src={config.qrUrl}
            alt="QR Code PIX de contingência"
            className="mx-auto my-3 aspect-square w-full max-w-[280px] rounded-xl border border-slate-100 object-contain"
          />
        ) : (
          <p className="my-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            A liderança ainda não cadastrou o QR Code. Peça para cadastrar em Modo Liderança → QR de Contingência.
          </p>
        )}
        {config.favorecido && <p className="text-base font-semibold text-slate-900">{config.favorecido}</p>}
        {config.cnpj && <p className="text-sm tabular-nums text-slate-600">CNPJ {formatarCnpj(config.cnpj)}</p>}
        {config.chavePix && (
          <button
            type="button"
            onClick={copiarPix}
            className="mt-3 w-full rounded-xl border border-primary px-4 py-3 text-sm font-semibold text-primary"
          >
            {copiado ? "✅ Código copiado" : "📋 Copiar código PIX (copia e cola)"}
          </button>
        )}
        {config.instrucoes && <p className="mt-3 text-left text-xs text-slate-500">{config.instrucoes}</p>}
      </section>

      {/* ---- Registrar o comprovante ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Registrar comprovante</h2>

        {!cliente ? (
          <div className="space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                buscarMapa();
              }}
              className="flex gap-2"
            >
              <input
                value={mapa}
                onChange={(e) => setMapa(e.target.value)}
                inputMode="numeric"
                placeholder="Número do mapa"
                aria-label="Número do mapa"
                className={campo}
              />
              <button
                type="submit"
                disabled={buscando || !mapa.trim()}
                className="shrink-0 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {buscando ? "..." : "Buscar"}
              </button>
            </form>

            {erroMapa && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{erroMapa}</p>}

            {(rota || erroMapa) && (
              <input
                value={filtro}
                onChange={(e) => {
                  setFiltro(e.target.value);
                  setDaBase(null);
                }}
                placeholder="Procurar cliente: nome, código ou bairro"
                aria-label="Procurar cliente"
                className={campo}
              />
            )}

            {rota && rota.clientes.length > 0 && (
              <>
                <p className="text-xs text-slate-500">
                  Mapa {rota.mapa} · {rota.clientes.length} cliente(s)
                  {filtro && ` · ${doMapa.length} encontrado(s)`}
                </p>
                <ListaDeClientes clientes={doMapa} escolher={setCliente} />
              </>
            )}

            {filtro.trim().length >= LIMITES_QR.buscaMin && (
              <div className="space-y-2">
                {daBase === null ? (
                  <button
                    type="button"
                    onClick={buscarNaBase}
                    disabled={buscando}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-40"
                  >
                    {buscando ? "Procurando..." : `🔎 Não achou? Procurar "${filtro.trim()}" em todos os clientes`}
                  </button>
                ) : daBase.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Nenhum cliente com esse nome ou código.</p>
                ) : (
                  <>
                    <p className="text-xs text-slate-500">Na base de clientes:</p>
                    <ListaDeClientes clientes={daBase} escolher={setCliente} />
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-xl bg-primary-soft p-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-primary-dark">Cliente</p>
                <p className="font-semibold text-slate-900">{cliente.nome ?? "Sem cadastro na base"}</p>
                <p className="text-xs text-slate-600">
                  Código {cliente.codPdv}
                  {cliente.cidade && ` · ${cliente.cidade}`}
                  {(rota?.mapa || mapa) && ` · mapa ${rota?.mapa ?? mapa}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCliente(null)}
                className="shrink-0 rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-semibold text-primary-dark"
              >
                Trocar
              </button>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">
                Fotos do comprovante <span className="text-red-600">*</span>
                <span className="ml-1 text-xs font-normal text-slate-500">
                  ({fotos.length}/{LIMITES_QR.fotosMax})
                </span>
              </p>
              {fotos.length > 0 && (
                <ul className="mb-3 grid grid-cols-3 gap-2">
                  {fotos.map((f, i) => (
                    <li key={f.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- prévia local do aparelho */}
                      <img
                        src={f.previa}
                        alt={`Foto ${i + 1} do comprovante`}
                        className="aspect-[3/4] w-full rounded-lg border border-slate-200 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => tirarFoto(f.id)}
                        aria-label={`Remover foto ${i + 1}`}
                        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => inputCamera.current?.click()}
                  disabled={reduzindo || fotos.length >= LIMITES_QR.fotosMax}
                  className="rounded-xl bg-slate-800 px-3 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  📷 Tirar foto
                </button>
                <button
                  type="button"
                  onClick={() => inputGaleria.current?.click()}
                  disabled={reduzindo || fotos.length >= LIMITES_QR.fotosMax}
                  className="rounded-xl border border-slate-300 px-3 py-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
                >
                  🖼️ Da galeria
                </button>
              </div>
              {reduzindo && <p className="mt-2 text-xs text-slate-500">Preparando a foto...</p>}
              <input
                ref={inputCamera}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  adicionarFotos(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={inputGaleria}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  adicionarFotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Valor pago (opcional)</span>
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className={campo}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Observação (opcional)</span>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  maxLength={LIMITES_QR.observacaoMax}
                  rows={2}
                  className={campo}
                />
              </label>
            </div>

            {problema && fotos.length > 0 && <p className="text-sm text-red-600">{problema}</p>}
            <button
              type="button"
              onClick={enviar}
              disabled={Boolean(problema) || enviando || reduzindo}
              className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enviando ? "Enviando..." : fotos.length === 0 ? "Tire a foto para enviar" : "Enviar comprovante"}
            </button>
          </div>
        )}
      </section>

      {/* ---- O que já foi registrado hoje ---- */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Meus comprovantes de hoje ({meusDeHoje.length})
        </h2>
        {meusDeHoje.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum comprovante registrado hoje.</p>
        ) : (
          <ul className="space-y-2">
            {meusDeHoje.map((c) => (
              <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{c.clienteNome ?? `Cliente ${c.codPdv}`}</p>
                    <p className="text-xs text-slate-500">
                      {c.hora} · código {c.codPdv}
                      {c.mapa && ` · mapa ${c.mapa}`}
                      {c.valor != null && ` · ${formatarReais(c.valor)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => apagar(c.id)}
                    disabled={enviando}
                    className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600"
                  >
                    Apagar
                  </button>
                </div>
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {c.fotos.map((f, i) =>
                    f.url ? (
                      <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário */}
                        <img
                          src={f.url}
                          alt={`Foto ${i + 1}`}
                          className="h-16 w-12 rounded-md border border-slate-200 object-cover"
                        />
                      </a>
                    ) : null,
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ListaDeClientes({
  clientes,
  escolher,
}: {
  clientes: ClienteDaRota[];
  escolher: (c: ClienteDaRota) => void;
}) {
  if (clientes.length === 0) {
    return <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Nenhum cliente com essa busca neste mapa.</p>;
  }
  return (
    <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
      {clientes.map((c) => (
        <li key={c.codPdv}>
          <button
            type="button"
            onClick={() => escolher(c)}
            className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-50 active:bg-primary-soft"
          >
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold tabular-nums text-slate-600">
              {c.codPdv}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm ${c.nome ? "font-medium text-slate-900" : "italic text-slate-400"}`}>
                {c.nome ?? "Sem cadastro na base"}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {[c.bairro, c.cidade].filter(Boolean).join(" · ") || "—"}
              </span>
            </span>
            <span className="shrink-0 text-slate-300" aria-hidden="true">
              ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
