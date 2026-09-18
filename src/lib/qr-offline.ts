/**
 * QR DE CONTINGÊNCIA SEM INTERNET -- o que fica guardado no celular
 * (18/09/2026, pedido do dono).
 *
 * Três coisas, cada uma no lugar certo:
 *   - a CONFIGURAÇÃO (imagem do QR, CNPJ, código PIX) e os CLIENTES dos
 *     últimos mapas: pequenas, vão no localStorage;
 *   - a FILA de comprovantes: tem fotos (Blob), vai no IndexedDB, que é o
 *     único armazenamento do navegador que guarda arquivo.
 *
 * Tudo dentro de try/catch: aba anônima, armazenamento cheio ou bloqueado
 * não podem derrubar a tela -- no pior caso ela volta a ser o que era sem
 * o modo offline (precisa de sinal).
 *
 * Só roda no navegador.
 */

import type { ClienteDaRota } from "@/lib/clientes-do-mapa-server";

// ------------------------------------------------------------------
// Configuração do QR
// ------------------------------------------------------------------

const CHAVE_CONFIG = "qr-contingencia:config:v1";

export type ConfigGuardada = {
  qrDataUrl: string | null;
  favorecido: string | null;
  cnpj: string | null;
  chavePix: string | null;
  instrucoes: string | null;
  guardadaEm: string;
};

export function lerConfigGuardada(): ConfigGuardada | null {
  try {
    const bruto = localStorage.getItem(CHAVE_CONFIG);
    return bruto ? (JSON.parse(bruto) as ConfigGuardada) : null;
  } catch {
    return null;
  }
}

/** Baixa a imagem do QR (link assinado, que expira) e guarda como dataURL, que não expira. */
export async function guardarConfig(c: Omit<ConfigGuardada, "qrDataUrl" | "guardadaEm"> & { qrUrl: string | null }) {
  try {
    let qrDataUrl: string | null = lerConfigGuardada()?.qrDataUrl ?? null;
    if (c.qrUrl) {
      const blob = await (await fetch(c.qrUrl)).blob();
      qrDataUrl = await new Promise<string>((ok, falha) => {
        const leitor = new FileReader();
        leitor.onload = () => ok(String(leitor.result));
        leitor.onerror = falha;
        leitor.readAsDataURL(blob);
      });
    }
    const guardada: ConfigGuardada = {
      qrDataUrl,
      favorecido: c.favorecido,
      cnpj: c.cnpj,
      chavePix: c.chavePix,
      instrucoes: c.instrucoes,
      guardadaEm: new Date().toISOString(),
    };
    localStorage.setItem(CHAVE_CONFIG, JSON.stringify(guardada));
  } catch {
    // Sem guardar, a tela continua usando o QR que veio do servidor.
  }
}

// ------------------------------------------------------------------
// Clientes dos últimos mapas
// ------------------------------------------------------------------

const CHAVE_MAPAS = "qr-contingencia:mapas:v1";
/** Os últimos mapas buscados. Um motorista faz um ou dois mapas por dia. */
const MAPAS_GUARDADOS = 6;

export type MapaGuardado = {
  mapa: string;
  data: string;
  clientes: ClienteDaRota[];
  /** Quem já tinha comprovante quando o mapa foi buscado com sinal. */
  pagos?: { codPdv: string; valor: number }[];
  guardadoEm: string;
};

function lerMapas(): MapaGuardado[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_MAPAS) ?? "[]") as MapaGuardado[];
  } catch {
    return [];
  }
}

export function guardarMapa(m: Omit<MapaGuardado, "guardadoEm">) {
  try {
    const outros = lerMapas().filter((x) => x.mapa !== m.mapa);
    const lista = [{ ...m, guardadoEm: new Date().toISOString() }, ...outros].slice(0, MAPAS_GUARDADOS);
    localStorage.setItem(CHAVE_MAPAS, JSON.stringify(lista));
  } catch {
    // Sem espaço: a busca sem internet só não terá este mapa.
  }
}

/** O mapa guardado, comparando só os dígitos sem zero à esquerda. */
export function mapaGuardado(mapaDigitado: string): MapaGuardado | null {
  const alvo = mapaDigitado.replace(/\D/g, "").replace(/^0+/, "");
  return lerMapas().find((m) => m.mapa === alvo) ?? null;
}

// ------------------------------------------------------------------
// A fila de comprovantes (IndexedDB)
// ------------------------------------------------------------------

export type ComprovantePendente = {
  envioId: string;
  codPdv: string;
  clienteNome: string;
  mapa: string;
  valor: string;
  observacao: string;
  fotos: Blob[];
  pagoEm: string;
  /** A última resposta do servidor, quando ele recusou. */
  erro?: string;
  /** Recusa que não se resolve tentando de novo (sem foto, valor torto). */
  definitivo?: boolean;
};

const BANCO = "qr-contingencia";
const LOJA = "pendentes";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(LOJA)) {
        pedido.result.createObjectStore(LOJA, { keyPath: "envioId" });
      }
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => falha(pedido.error);
  });
}

async function naLoja<T>(modo: IDBTransactionMode, fazer: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((ok, falha) => {
      const req = fazer(db.transaction(LOJA, modo).objectStore(LOJA));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
  } finally {
    db.close();
  }
}

export async function guardarPendente(c: ComprovantePendente): Promise<boolean> {
  try {
    await naLoja("readwrite", (l) => l.put(c));
    return true;
  } catch {
    return false;
  }
}

export async function listarPendentes(): Promise<ComprovantePendente[]> {
  try {
    const todos = await naLoja<ComprovantePendente[]>("readonly", (l) => l.getAll() as IDBRequest<ComprovantePendente[]>);
    return todos.sort((a, b) => a.pagoEm.localeCompare(b.pagoEm));
  } catch {
    return [];
  }
}

export async function removerPendente(envioId: string) {
  try {
    await naLoja("readwrite", (l) => l.delete(envioId));
  } catch {
    // Se não saiu, o próximo envio responde "já estava registrado" e sai.
  }
}

export function novoEnvioId() {
  return crypto.randomUUID();
}

/** Monta o envio do jeito que `registrarComprovante` espera. */
export function formularioDoPendente(c: ComprovantePendente): FormData {
  const f = new FormData();
  f.set("envio_id", c.envioId);
  f.set("cod_pdv", c.codPdv);
  f.set("cliente_nome", c.clienteNome);
  f.set("mapa", c.mapa);
  f.set("valor", c.valor);
  f.set("observacao", c.observacao);
  f.set("pago_em", c.pagoEm);
  c.fotos.forEach((foto, i) => f.append("fotos", new File([foto], `comprovante-${i + 1}.jpg`, { type: foto.type || "image/jpeg" })));
  return f;
}

/** Registra o service worker desta tela, que guarda a página para abrir sem sinal. */
export async function registrarModoSemInternet() {
  try {
    if (!("serviceWorker" in navigator)) return;
    await navigator.serviceWorker.register("/sw-qr.js", { scope: "/qr-contingencia" });
  } catch {
    // Sem service worker, a tela só não abre sem sinal; o resto funciona.
  }
}
