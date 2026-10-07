/**
 * AS FOTOS DO CHECK DE MANUTENÇÃO QUE AINDA NÃO SUBIRAM (07/10/2026).
 *
 * Pedido do dono depois da primeira ronda em São Félix: "a foto foi
 * tirada e, ao sair da câmera, sumiu". No banco e no bucket não havia
 * rastro nenhum -- a foto nunca saiu do celular. Ela vivia só na memória
 * da página, e qualquer coisa perdia: o "voltar" do Android, o navegador
 * recarregando a aba, a foto tirada antes da nota esperando a nota.
 *
 * Agora a foto vai para o IndexedDB NO INSTANTE em que é aceita, e só sai
 * de lá depois que o servidor confirma que guardou. Se a página morrer no
 * meio, o cartão do item reabre com a foto e tenta de novo.
 *
 * Tudo em try/catch, como o qr-offline: aba anônima ou armazenamento
 * cheio não podem derrubar a tela -- no pior caso volta a ser só memória.
 * Só roda no navegador.
 */

export type FotoGuardada = {
  /** Mesmo id da prévia no cartão. */
  id: string;
  avaliacaoId: string;
  itemId: string;
  foto: Blob;
  criadaEm: string;
};

const BANCO = "manutencao-fotos";
const LOJA = "pendentes";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(LOJA)) {
        pedido.result.createObjectStore(LOJA, { keyPath: "id" });
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

export async function guardarFotoPendente(f: FotoGuardada): Promise<boolean> {
  try {
    await naLoja("readwrite", (l) => l.put(f));
    return true;
  } catch {
    return false;
  }
}

/**
 * As fotos guardadas de uma avaliação. Os 36 cartões perguntam ao mesmo
 * tempo ao abrir a tela: uma leitura só, repartida entre eles.
 */
const leituras = new Map<string, Promise<FotoGuardada[]>>();

export function fotosGuardadasDaAvaliacao(avaliacaoId: string): Promise<FotoGuardada[]> {
  let p = leituras.get(avaliacaoId);
  if (!p) {
    p = naLoja<FotoGuardada[]>("readonly", (l) => l.getAll() as IDBRequest<FotoGuardada[]>)
      .then((todas) => todas.filter((f) => f.avaliacaoId === avaliacaoId).sort((a, b) => a.criadaEm.localeCompare(b.criadaEm)))
      .catch(() => []);
    leituras.set(avaliacaoId, p);
    // A leitura vale para a abertura da tela, não para sempre.
    setTimeout(() => leituras.delete(avaliacaoId), 5000);
  }
  return p;
}

export async function removerFotoPendente(id: string) {
  try {
    await naLoja("readwrite", (l) => l.delete(id));
  } catch {
    // Se não saiu, na próxima abertura ela sobe de novo -- e o servidor
    // reconhece o id e não duplica (ver salvarResposta).
  }
}

export function novoIdDeFoto() {
  try {
    return crypto.randomUUID();
  } catch {
    return `foto-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
