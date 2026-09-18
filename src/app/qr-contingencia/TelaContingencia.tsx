"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClienteDaRota } from "@/lib/clientes-do-mapa-server";
import {
  formularioDoPendente,
  guardarConfig,
  guardarMapa,
  guardarPendente,
  lerConfigGuardada,
  listarPendentes,
  mapaGuardado,
  novoEnvioId,
  registrarModoSemInternet,
  removerPendente,
  type ComprovantePendente,
} from "@/lib/qr-offline";
import {
  LIMITES_QR,
  clienteCasa,
  codigoDigitado,
  digitosDoValor,
  formatarCnpj,
  mostrarDigitosEmReais,
  valorDosDigitos,
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
import { CameraNaTela } from "./CameraNaTela";

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

type RotaNaTela = {
  mapa: string;
  data: string;
  clientes: ClienteDaRota[];
  pagos?: { codPdv: string; valor: number }[];
};

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
  const [rota, setRota] = useState<RotaNaTela | null>(null);
  // Registrados NESTA tela desde a busca do mapa -- entram na marcação
  // "pago" sem precisar buscar o mapa de novo.
  const [pagosAgora, setPagosAgora] = useState<{ mapa: string; codPdv: string; valor: number }[]>([]);
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

  // ---- MODO SEM INTERNET (18/09/2026) ----
  const [online, setOnline] = useState(true);
  const [qrSrc, setQrSrc] = useState<string | null>(config.qrUrl);
  const [pendentes, setPendentes] = useState<ComprovantePendente[]>([]);
  const [manual, setManual] = useState<{ codigo: string; nome: string } | null>(null);
  const sincronizando = useRef(false);

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

  // Guarda a página (service worker) e o QR no celular. Com sinal, a cópia
  // guardada é renovada a cada abertura -- QR trocado na liderança chega.
  useEffect(() => {
    registrarModoSemInternet();
    const atualizar = () => setOnline(navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    if (navigator.onLine) {
      guardarConfig({
        qrUrl: config.qrUrl,
        favorecido: config.favorecido,
        cnpj: config.cnpj,
        chavePix: config.chavePix,
        instrucoes: config.instrucoes,
      });
    } else {
      const guardada = lerConfigGuardada();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do armazenamento do celular
      if (guardada?.qrDataUrl) setQrSrc(guardada.qrDataUrl);
    }
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, [config]);

  /** Envia o que está na fila do celular, um por vez, na ordem em que foi feito. */
  const sincronizar = useCallback(async () => {
    if (sincronizando.current || !navigator.onLine) return;
    sincronizando.current = true;
    try {
      let enviados = 0;
      for (const p of await listarPendentes()) {
        let r: Awaited<ReturnType<typeof registrarComprovante>>;
        try {
          r = await registrarComprovante(formularioDoPendente(p));
        } catch {
          break; // o sinal caiu de novo: tenta na próxima
        }
        if (r.ok) {
          await removerPendente(p.envioId);
          enviados++;
        } else {
          await guardarPendente({ ...p, erro: r.erro, definitivo: r.definitivo });
        }
      }
      setPendentes(await listarPendentes());
      if (enviados > 0) {
        setAviso({ tipo: "ok", texto: `${enviados} comprovante(s) guardado(s) no celular foram enviados.` });
        router.refresh();
      }
    } finally {
      sincronizando.current = false;
    }
  }, [router]);

  // Tenta ao abrir, quando o sinal volta e, com fila, a cada minuto.
  useEffect(() => {
    listarPendentes().then(setPendentes);
    sincronizar();
    window.addEventListener("online", sincronizar);
    const relogio = setInterval(sincronizar, 60_000);
    return () => {
      window.removeEventListener("online", sincronizar);
      clearInterval(relogio);
    };
  }, [sincronizar]);

  // As prévias das fotos são URLs do navegador; soltam a memória ao sair
  // da tela (as removidas uma a uma são soltas em `tirarFoto`).
  const fotosAtuais = useRef<Foto[]>([]);
  useEffect(() => {
    fotosAtuais.current = fotos;
  }, [fotos]);
  useEffect(() => () => fotosAtuais.current.forEach((f) => URL.revokeObjectURL(f.previa)), []);

  function usarMapa(r: RotaNaTela, guardado: boolean) {
    setRota(r);
    setFiltro("");
    try {
      localStorage.setItem(CHAVE_MAPA, mapa);
    } catch {
      // Lembrar o mapa é conveniência, não regra.
    }
    if (r.clientes.length === 0) {
      setErroMapa("Este mapa não trouxe a lista de clientes do dia. Procure o cliente pelo nome ou informe o código.");
    } else if (guardado) {
      setErroMapa("Sem internet: usando a lista deste mapa guardada no celular.");
    }
  }

  function buscarMapa() {
    setErroMapa(null);
    setDaBase(null);
    iniciarBusca(async () => {
      // Sem sinal: a lista guardada da última vez que este mapa foi buscado.
      const semSinal = () => {
        const g = mapaGuardado(mapa);
        if (g) return usarMapa(g, true);
        setRota(null);
        setErroMapa(
          "Sem internet, e este mapa não foi buscado antes neste celular. Informe o código do cliente abaixo — o comprovante fica guardado e sobe quando o sinal voltar.",
        );
      };
      if (!navigator.onLine) return semSinal();
      let r: Awaited<ReturnType<typeof buscarClientesDoMapa>>;
      try {
        r = await buscarClientesDoMapa(mapa);
      } catch {
        return semSinal();
      }
      if (!r.ok) {
        setRota(null);
        setErroMapa(r.erro);
        return;
      }
      guardarMapa({ mapa: r.mapa, data: r.data, clientes: r.clientes, pagos: r.pagos });
      usarMapa(r, false);
    });
  }

  // Busca na base: só quando a lista do mapa não resolve (texto digitado e
  // nada no mapa casa), para não gastar consulta a cada letra.
  const doMapa = useMemo(
    () => (rota?.clientes ?? []).filter((c) => clienteCasa(c, filtro)),
    [rota, filtro],
  );

  /**
   * QUEM JÁ PAGOU NESTE MAPA: o que o servidor devolveu na busca, o que foi
   * registrado nesta tela desde então e o que está guardado no celular
   * esperando sinal (esse com a marca de "aguardando envio").
   */
  const pagos = useMemo(() => {
    const m = new Map<string, { valor: number; pendente: boolean }>();
    if (!rota) return m;
    const somar = (cod: string, valor: number, pendente: boolean) => {
      const atual = m.get(cod);
      m.set(cod, { valor: (atual?.valor ?? 0) + valor, pendente: (atual?.pendente ?? true) && pendente });
    };
    for (const p of rota.pagos ?? []) somar(p.codPdv, p.valor, false);
    for (const p of pagosAgora) if (p.mapa === rota.mapa) somar(p.codPdv, p.valor, false);
    for (const p of pendentes) {
      if (codigoDigitado(p.mapa) === rota.mapa) somar(p.codPdv, lerValor(p.valor) || 0, true);
    }
    return m;
  }, [rota, pagosAgora, pendentes]);
  function buscarNaBase() {
    iniciarBusca(async () => {
      try {
        setDaBase(await buscarClientesNaBase(filtro));
      } catch {
        setDaBase([]);
        setErroMapa("Sem internet para procurar em todos os clientes. Informe o código do cliente abaixo.");
      }
    });
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

  // A câmera dentro da tela (ver CameraNaTela): a foto já vem no tamanho
  // certo, sem passar pela redução.
  const [cameraAberta, setCameraAberta] = useState(false);
  const [avisoCamera, setAvisoCamera] = useState<string | null>(null);
  const capturada = useCallback((arquivo: File) => {
    setFotos((atual) =>
      atual.length >= LIMITES_QR.fotosMax
        ? atual
        : [...atual, { id: `${Date.now()}-${Math.random()}`, arquivo, previa: URL.createObjectURL(arquivo) }],
    );
  }, []);
  const cameraFalhou = useCallback((motivo: string) => {
    setCameraAberta(false);
    setAvisoCamera(motivo);
  }, []);
  function abrirCamera() {
    setAvisoCamera(null);
    if (typeof navigator.mediaDevices?.getUserMedia === "function") setCameraAberta(true);
    else inputCamera.current?.click();
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
    valor: lerValor(valorDosDigitos(valor)),
    observacao: observacao.trim(),
    fotos: fotos.map((f) => ({ tamanho: f.arquivo.size, tipo: f.arquivo.type })),
  });

  function limparFormulario() {
    setCliente(null);
    fotos.forEach((f) => URL.revokeObjectURL(f.previa));
    setFotos([]);
    setValor("");
    setObservacao("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Com sinal, envia na hora. Sem sinal -- ou se o sinal cair no meio --
   * guarda no celular com um id próprio e a hora de agora, e a fila envia
   * depois. O id impede que o mesmo comprovante entre duas vezes.
   */
  function enviar() {
    if (!cliente || problema) return;
    setAviso(null);
    const pendente: ComprovantePendente = {
      envioId: novoEnvioId(),
      codPdv: cliente.codPdv,
      clienteNome: cliente.nome ?? "",
      mapa: rota?.mapa ?? mapa,
      valor: valorDosDigitos(valor),
      observacao,
      fotos: fotos.map((f) => f.arquivo),
      pagoEm: new Date().toISOString(),
    };
    const guardarNoCelular = async (motivo: string) => {
      if (!(await guardarPendente(pendente))) {
        setAviso({
          tipo: "erro",
          texto: "Sem internet, e o celular não conseguiu guardar o comprovante. Tente de novo quando tiver sinal.",
        });
        return;
      }
      setPendentes(await listarPendentes());
      setAviso({ tipo: "ok", texto: `${motivo} O comprovante ficou guardado no celular e será enviado sozinho quando o sinal voltar.` });
      limparFormulario();
    };
    iniciarEnvio(async () => {
      if (!navigator.onLine) return guardarNoCelular("Sem internet.");
      let r: Awaited<ReturnType<typeof registrarComprovante>>;
      try {
        r = await registrarComprovante(formularioDoPendente(pendente));
      } catch {
        return guardarNoCelular("O sinal caiu no envio.");
      }
      if (!r.ok) {
        // Problema do próprio comprovante: mostra e deixa corrigir. Falha
        // passageira (sessão, servidor): guarda e tenta depois.
        if (r.definitivo) setAviso({ tipo: "erro", texto: r.erro });
        else await guardarNoCelular(r.erro);
        return;
      }
      setAviso({ tipo: "ok", texto: r.mensagem });
      setPagosAgora((atual) => [
        ...atual,
        { mapa: codigoDigitado(pendente.mapa), codPdv: pendente.codPdv, valor: lerValor(pendente.valor) || 0 },
      ]);
      limparFormulario();
      router.refresh();
    });
  }

  function usarManual() {
    if (!manual) return;
    const codigo = codigoDigitado(manual.codigo);
    if (!codigo) return;
    setCliente({ codPdv: codigo, nome: manual.nome.trim() || null, cidade: null, bairro: null, endereco: null, telefone: null });
    setManual(null);
  }

  async function descartarPendente(p: ComprovantePendente) {
    if (!confirm(`Descartar o comprovante de ${p.clienteNome || `cliente ${p.codPdv}`}? As fotos guardadas no celular somem.`)) return;
    await removerPendente(p.envioId);
    setPendentes(await listarPendentes());
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
      {!online && (
        <p role="status" className="rounded-xl bg-slate-800 p-3 text-sm font-medium text-white">
          📵 Sem internet. O QR continua aqui, e o comprovante que você registrar fica guardado no celular e é enviado
          sozinho quando o sinal voltar.
        </p>
      )}

      {pendentes.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-amber-900">⏳ Aguardando envio ({pendentes.length})</h2>
            {online && (
              <button
                type="button"
                onClick={() => sincronizar()}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Enviar agora
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-amber-900">
            Guardados neste celular. Não desinstale o app nem limpe os dados do navegador antes de enviar.
          </p>
          <ul className="mt-2 space-y-1.5">
            {pendentes.map((p) => (
              <li key={p.envioId} className="rounded-lg bg-white p-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{p.clienteNome || `Cliente ${p.codPdv}`}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(p.pagoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {p.fotos.length} foto(s)
                      {p.mapa && ` · mapa ${p.mapa}`}
                    </p>
                    {p.erro && <p className="mt-0.5 text-xs text-red-600">{p.erro}</p>}
                  </div>
                  {p.definitivo && (
                    <button
                      type="button"
                      onClick={() => descartarPendente(p)}
                      className="shrink-0 rounded-md border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-600"
                    >
                      Descartar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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
        {qrSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário, fora do otimizador
          <img
            src={qrSrc}
            // Link expirado ou sem sinal: a cópia guardada no celular.
            onError={() => {
              const guardada = lerConfigGuardada()?.qrDataUrl;
              if (guardada && guardada !== qrSrc) setQrSrc(guardada);
            }}
            alt="QR Code PIX de contingência"
            className="mx-auto my-3 aspect-square w-full max-w-[280px] rounded-xl border border-slate-100 object-contain"
          />
        ) : (
          <p className="my-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            A liderança ainda não cadastrou o QR Code. Peça para cadastrar em Modo Liderança → Comprovante de Pagamento.
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
                <ListaDeClientes clientes={doMapa} escolher={setCliente} pagos={pagos} />
              </>
            )}

            {/* Cliente fora da lista, ou sem sinal para buscar: o código à
                mão. O servidor completa o nome pela base quando enviar. */}
            {manual ? (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <input
                  value={manual.codigo}
                  onChange={(e) => setManual({ ...manual, codigo: e.target.value })}
                  inputMode="numeric"
                  placeholder="Código do cliente"
                  aria-label="Código do cliente"
                  className={campo}
                />
                <input
                  value={manual.nome}
                  onChange={(e) => setManual({ ...manual, nome: e.target.value })}
                  placeholder="Nome do cliente (opcional)"
                  aria-label="Nome do cliente"
                  className={campo}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={usarManual}
                    disabled={!codigoDigitado(manual.codigo)}
                    className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Usar este cliente
                  </button>
                  <button
                    type="button"
                    onClick={() => setManual(null)}
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-600"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setManual({ codigo: "", nome: "" })}
                className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-600"
              >
                ✍️ Cliente não está na lista? Informar o código
              </button>
            )}

            {filtro.trim().length >= LIMITES_QR.buscaMin && online && (
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
                    <ListaDeClientes clientes={daBase} escolher={setCliente} pagos={pagos} />
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
                  onClick={abrirCamera}
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
              {avisoCamera && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{avisoCamera}</p>}
              {/* O jeito antigo (aplicativo de câmera do celular), de reserva:
                  câmera da tela negada, ou aparelho sem suporte. */}
              <button
                type="button"
                onClick={() => inputCamera.current?.click()}
                disabled={reduzindo || fotos.length >= LIMITES_QR.fotosMax}
                className={`mt-2 w-full text-center text-xs underline disabled:opacity-40 ${
                  avisoCamera ? "font-semibold text-primary" : "text-slate-500"
                }`}
              >
                Usar a câmera do celular
              </button>
              {cameraAberta && (
                <CameraNaTela
                  restantes={LIMITES_QR.fotosMax - fotos.length}
                  aoCapturar={capturada}
                  aoFechar={() => setCameraAberta(false)}
                  aoFalhar={cameraFalhou}
                />
              )}
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
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Valor pago <span className="text-red-600">*</span>
                </span>
                {/* Como no app do banco: teclado numérico, e os números entram
                    pela direita nos centavos (1-5-2-4-0 = R$ 152,40). */}
                <input
                  value={mostrarDigitosEmReais(valor)}
                  // O CURSOR MORA NO FIM (pedido do dono, 18/09/2026: tocando
                  // na frente do número e digitando 123, virava R$ 1.000,23).
                  // Todo toque, foco ou seleção devolve o cursor ao fim -- o
                  // dígito entra sempre pela direita, como no app do banco.
                  onFocus={cursorNoFim}
                  onClick={cursorNoFim}
                  onSelect={cursorNoFim}
                  onChange={(e) => setValor(digitosDoValor(e.target.value))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label="Valor pago em reais"
                  className={`${campo} text-right text-lg font-semibold tabular-nums ${valor ? "" : "text-slate-400"}`}
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
              {enviando
                ? "Enviando..."
                : fotos.length === 0
                  ? "Tire a foto para enviar"
                  : !valor
                    ? "Informe o valor para enviar"
                    : online
                    ? "Enviar comprovante"
                    : "Guardar no celular (sem internet)"}
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
          // AGRUPADOS POR MAPA (pedido do dono, 18/09/2026) -- o mesmo
          // desenho da tela de conciliação: o cartão do mapa com o total, e
          // os clientes dentro, na ordem do dia.
          <div className="space-y-3">
            {porMapa(meusDeHoje).map((g) => (
              <div key={g.mapa ?? "-"} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2">
                  <span className="text-sm font-bold text-slate-800">{g.mapa ? `Mapa ${g.mapa}` : "Sem mapa"}</span>
                  <span className="text-xs text-slate-500">
                    {g.itens.length} cliente{g.itens.length === 1 ? "" : "s"} ·{" "}
                    <strong className="tabular-nums text-slate-800">{formatarReais(g.total)}</strong>
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {g.itens.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-slate-500">{c.hora}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{c.clienteNome ?? `Cliente ${c.codPdv}`}</p>
                        <div className="mt-1 flex gap-1.5 overflow-x-auto">
                          {c.fotos.map((f, i) =>
                            f.url ? (
                              <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário */}
                                <img
                                  src={f.url}
                                  alt={`Foto ${i + 1}`}
                                  className="h-10 w-8 rounded border border-slate-200 object-cover"
                                />
                              </a>
                            ) : null,
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-sm font-bold tabular-nums text-slate-900">
                          {c.valor != null ? formatarReais(c.valor) : "—"}
                        </span>
                        <button
                          type="button"
                          onClick={() => apagar(c.id)}
                          disabled={enviando}
                          className="text-[11px] font-semibold text-red-600 underline"
                        >
                          Apagar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Leva o cursor do campo de valor para o fim (ver o comentário no campo). */
function cursorNoFim(e: React.SyntheticEvent<HTMLInputElement>) {
  const campo = e.currentTarget;
  const fim = campo.value.length;
  if (campo.selectionStart !== fim || campo.selectionEnd !== fim) {
    // Depois do navegador posicionar o cursor do toque -- senão ele ganha.
    requestAnimationFrame(() => campo.setSelectionRange(fim, fim));
  }
}

/** Os comprovantes do dia agrupados por mapa, com o total de cada um. */
function porMapa(lista: ComprovanteDaTela[]) {
  const grupos = new Map<string, { mapa: string | null; itens: ComprovanteDaTela[]; total: number }>();
  for (const c of lista) {
    const k = c.mapa ?? "-";
    const g = grupos.get(k) ?? { mapa: c.mapa, itens: [], total: 0 };
    g.itens.push(c);
    g.total += c.valor ?? 0;
    grupos.set(k, g);
  }
  return [...grupos.values()].map((g) => ({ ...g, itens: [...g.itens].sort((a, b) => a.hora.localeCompare(b.hora)) }));
}

/**
 * A lista de clientes, com a marcação de quem JÁ PAGOU pelo QR neste mapa.
 * Quem pagou continua tocável (pode haver um segundo pagamento), mas vai
 * para o fim da lista, esmaecido: o motorista procura quem falta.
 */
function ListaDeClientes({
  clientes,
  escolher,
  pagos,
}: {
  clientes: ClienteDaRota[];
  escolher: (c: ClienteDaRota) => void;
  pagos: Map<string, { valor: number; pendente: boolean }>;
}) {
  if (clientes.length === 0) {
    return <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Nenhum cliente com essa busca neste mapa.</p>;
  }
  const ordenados = [...clientes].sort((a, b) => Number(pagos.has(a.codPdv)) - Number(pagos.has(b.codPdv)));
  return (
    <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
      {ordenados.map((c) => {
        const pago = pagos.get(c.codPdv);
        return (
          <li key={c.codPdv}>
            <button
              type="button"
              onClick={() => escolher(c)}
              className={`flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-50 active:bg-primary-soft ${
                pago ? "bg-emerald-50/60" : ""
              }`}
            >
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                  pago ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                }`}
              >
                {c.codPdv}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm ${
                    pago ? "text-slate-500" : c.nome ? "font-medium text-slate-900" : "italic text-slate-400"
                  }`}
                >
                  {c.nome ?? "Sem cadastro na base"}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {[c.bairro, c.cidade].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              {pago ? (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    pago.pendente ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {pago.pendente ? "⏳" : "✅"} {formatarReais(pago.valor)}
                </span>
              ) : (
                <span className="shrink-0 text-slate-300" aria-hidden="true">
                  ›
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
