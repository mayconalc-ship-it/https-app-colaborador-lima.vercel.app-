import { cookies } from "next/headers";
import { getPerfil, getUsuarioId } from "@/lib/sessao";
import { COOKIE_REVENDA, getRevendas } from "@/lib/revendas";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { ehOwner } from "@/lib/acessos";

/**
 * Gestor LOG online (19/11/2026, migration 182).
 *
 * O programa é o mesmo HTML do arquivo Gestor LOG.html; o que muda é onde
 * a base mora. Cada chave que ele guardava só no navegador vira um
 * arquivo no bucket privado `gestor-log`, e `gestor_log_dados` diz qual é
 * a versão atual de cada uma.
 *
 * A revenda de cada chave está no próprio nome (fontes:BAR, pedidos:SF):
 * quem não pertence à revenda não lê nem grava a base dela. `ids` e
 * `produtos` (códigos de filial e cadastro de produtos do Promax) são das
 * duas.
 */

export const BUCKET_GESTOR_LOG = "gestor-log";

/** Código da revenda no Gestor LOG -> id da revenda no app. */
export const REVENDA_DO_CODIGO: Record<string, string> = {
  SF: "7afe4da5-e846-4b02-947f-96843a2791fe",
  BAR: "fc365d16-ccbd-4322-ae02-e992a36861e8",
};

/**
 * Só estas chaves vão para o servidor -- é a mesma lista do app-nuvem.js
 * do Gestor LOG. Pasta escolhida, caches de mapa e ajustes de cada pessoa
 * continuam no navegador.
 */
const CHAVE = /^(?:(?:fontes|fontesMeta|pedidos|frotaRot|reposicao|grade|tempos|histMapas|histBuf|antGrade|dispo|otif|estoque|frota|frotaOc|ansRot|ansMeta):(SF|BAR)|ids|produtos|senha)$/;

export function chaveValida(chave: unknown): chave is string {
  return typeof chave === "string" && CHAVE.test(chave);
}

/** null = chave das duas revendas. */
export function revendaDaChave(chave: string): string | null {
  const m = CHAVE.exec(chave);
  return m && m[1] ? m[1] : null;
}

/** Pasta do arquivo no bucket: "fontes:BAR" -> "fontes/BAR". */
export function pastaDaChave(chave: string) {
  return chave.replace(":", "/");
}

export type ContextoGestorLog = {
  perfilId: string;
  nome: string;
  podeEditar: boolean;
  /** Dono do app: só ele cria, troca ou tira a senha de alteração (pedido 27/11/2026). */
  dono: boolean;
  /** Códigos (SF, BAR) das revendas da pessoa. */
  revendas: Set<string>;
};

/**
 * Velocidade (25/11/2026): a conferência abaixo encadeia 5 a 7 consultas (perfil, revenda, módulo, concessões) e levava
 * 0,7 a 2 s em cada chamada do programa. O resultado fica guardado 60 s na memória do servidor, por pessoa + revenda
 * escolhida (cookie). O login continua conferido em toda chamada pelo proxy (o id vem dele); mudança de permissão ou de
 * vínculo vale em até 1 minuto. Sem acesso não é guardado (quem acabou de ganhar acesso não espera).
 */
const CONTEXTO_MS = 60_000;
const contextos = new Map<string, { ctx: ContextoGestorLog; em: number }>();

/** Quem está pedindo, o que pode e de quais revendas. null = sem acesso. */
export async function contextoGestorLog(): Promise<ContextoGestorLog | null> {
  const id = await getUsuarioId();
  if (!id) return null;
  const chave = id + "|" + ((await cookies()).get(COOKIE_REVENDA)?.value ?? "");
  const guardado = contextos.get(chave);
  if (guardado && Date.now() - guardado.em < CONTEXTO_MS) return guardado.ctx;
  const ctx = await conferirContexto();
  if (ctx) {
    if (contextos.size > 500) contextos.clear();
    contextos.set(chave, { ctx, em: Date.now() });
  }
  return ctx;
}

async function conferirContexto(): Promise<ContextoGestorLog | null> {
  const perfil = await getPerfil();
  if (!perfil) return null;
  // Abre: dono, liderança com "ver" ou quem o dono liberou em Acessos
  // (módulo opcional). Atualiza a base: "editar" OU a liberação pessoa a
  // pessoa -- liberar é justamente para a pessoa poder atualizar.
  if (!(await temAcessoModulo("gestor-log"))) return null;
  const [editar, ver, revendas] = await Promise.all([
    podeNoModulo("gestor-log", "editar"),
    podeNoModulo("gestor-log", "ver"),
    getRevendas(),
  ]);
  // liberado só pela ficha (sem concessão de liderança): também atualiza
  const podeEditar = editar || !ver;
  const ids = new Set(revendas.map((r) => r.id));
  const codigos = new Set(
    Object.entries(REVENDA_DO_CODIGO)
      .filter(([, id]) => ids.has(id))
      .map(([codigo]) => codigo),
  );
  return { perfilId: perfil.id, nome: perfil.nome, podeEditar, dono: ehOwner(perfil.role), revendas: codigos };
}

/**
 * Chave do carteiro (etapa 2, migration 183): o programa que olha a pasta
 * do servidor e manda os relatórios para a caixa de entrada. Não tem
 * sessão do app; prova quem é com esta chave, derivada da chave de
 * serviço (sem variável nova na Vercel, mesmo desenho da chave das
 * Prioridades). Trocar a chave de serviço invalida o carteiro.
 */
export async function chaveDoCarteiro() {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update("gestor-log-carteiro")
    .digest("hex")
    .slice(0, 32);
}

/** Nome do arquivo seguro para o Storage (sem acento, espaço nem "+"). */
export function nomeParaStorage(nome: string) {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .slice(-120) || "arquivo"
  );
}

/** A pessoa pode ler/gravar esta chave? (a permissão de gravar é conferida à parte) */
export function chaveDaPessoa(ctx: ContextoGestorLog, chave: string) {
  const rev = revendaDaChave(chave);
  return rev === null || ctx.revendas.has(rev);
}
