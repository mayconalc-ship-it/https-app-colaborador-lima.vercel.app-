/**
 * Ajudantes de push que rodam no navegador.
 *
 * Separado do componente porque a tela de "Minha conta" e a sincronização
 * silenciosa do layout precisam exatamente das mesmas checagens -- e
 * porque a regra do iPhone é sutil o bastante para não merecer duas
 * cópias que podem divergir.
 */

/** A chave pública viaja para o navegador; é pública por definição. */
export const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * O navegador exige a chave em bytes, mas ela chega como texto em
 * base64 "url-safe". Converter na mão evita puxar uma biblioteca inteira
 * para 6 linhas.
 */
function chaveParaBytes(base64: string): Uint8Array {
  const preenchimento = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalizado = (base64 + preenchimento).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(normalizado);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

/** Está rodando como app instalado (tela de início) e não como aba? */
export function ehAppInstalado(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari antigo não implementa display-mode; usa esta propriedade.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function ehIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPad moderno se apresenta como Mac; o toque é o que o denuncia.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

export type SituacaoPush =
  | "pronto" // dá para ativar (ou já está ativo)
  | "precisa-instalar" // iPhone em aba: só funciona instalando o app antes
  | "sem-suporte" // navegador velho demais
  | "sem-chave"; // as chaves VAPID não foram configuradas no servidor

export function situacaoDoAparelho(): SituacaoPush {
  if (typeof window === "undefined") return "sem-suporte";
  if (!CHAVE_PUBLICA) return "sem-chave";

  const temApi =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  // No iPhone o push só existe dentro do app instalado na tela de início.
  // Numa aba comum a API pode até aparecer, mas a inscrição falha -- por
  // isso a checagem de instalação vem ANTES da de suporte.
  if (ehIOS() && !ehAppInstalado()) return "precisa-instalar";
  if (!temApi) return "sem-suporte";
  return "pronto";
}

export async function registrarServiceWorker() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/**
 * Cria (ou recupera) a inscrição deste aparelho.
 *
 * Não pede permissão sozinha: quem pede é o componente, depois de
 * explicar para que serve. Popup de permissão sem contexto é a receita
 * para a pessoa clicar em "Bloquear" e nunca mais voltar atrás.
 */
export async function assinar(): Promise<PushSubscription | null> {
  const registro = await registrarServiceWorker();
  await navigator.serviceWorker.ready;

  const existente = await registro.pushManager.getSubscription();
  if (existente) return existente;

  return registro.pushManager.subscribe({
    // Obrigatório nos navegadores atuais: todo push precisa virar um
    // aviso visível. Nada de rastreamento silencioso -- e é bom que seja
    // assim num app de trabalho.
    userVisibleOnly: true,
    applicationServerKey: chaveParaBytes(CHAVE_PUBLICA) as BufferSource,
  });
}

/** Extrai as chaves da inscrição no formato que o servidor guarda. */
export function dadosDaInscricao(inscricao: PushSubscription) {
  const json = inscricao.toJSON();
  return {
    endpoint: inscricao.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  };
}
