import { redirect } from "next/navigation";
import { getPerfil } from "@/lib/sessao";
import { getConcessoes } from "@/lib/concessoes";
import { getRevendaId, revendaTemModulo } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  chaveDaPermissao,
  ehOwner,
  podeFazer,
  temAlgumAcesso,
  type Acao,
  type ModuloId,
} from "@/lib/acessos";

/**
 * Porta de entrada do Modo Liderança.
 *
 * Quem não tem NADA liberado nem chega aqui: volta para o app como
 * colaborador comum.
 */
export async function requireGestor() {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const concessoes = await getConcessoes();
  if (!temAlgumAcesso(perfil.role, concessoes)) redirect("/");

  return perfil;
}

/**
 * Exclusivo do dono. Usado nas telas críticas -- Gestão de Acessos e
 * Auditoria -- e em toda ação que mexa em papel ou permissão.
 */
export async function requireOwner() {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  if (!ehOwner(perfil.role)) redirect("/admin");
  return perfil;
}

/**
 * A verificação que interessa: este módulo, esta ação.
 *
 * Vale para a TELA e para a AÇÃO que grava. Proteger só a tela deixaria a
 * porta dos fundos aberta para quem souber o endereço.
 */
export async function requireModulo(modulo: ModuloId, acao: Acao) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  if (!(await revendaTemModulo(modulo))) {
    redirect(`/admin?erro=${encodeURIComponent(desligado(modulo))}`);
  }

  const concessoes = await getConcessoes();
  if (!podeFazer(perfil.role, concessoes, modulo, acao)) {
    redirect(`/admin?erro=${encodeURIComponent(negado(modulo, acao))}`);
  }

  return perfil;
}

function negado(modulo: string, acao: string) {
  return `Você não tem permissão para ${acao} em ${modulo}. Fale com o dono do app.`;
}

function desligado(modulo: string) {
  return `O módulo ${modulo} não está ativo nesta revenda.`;
}

/** Versão que responde em vez de redirecionar, para ações que devolvem erro. */
export async function podeNoModulo(modulo: ModuloId, acao: Acao) {
  const perfil = await getPerfil();
  if (!perfil) return false;
  if (!(await revendaTemModulo(modulo))) return false;
  const concessoes = await getConcessoes();
  return podeFazer(perfil.role, concessoes, modulo, acao);
}

/**
 * Módulos opcionais (ex.: Ativo de Giro) começam invisíveis para todo mundo.
 * O dono libera colaborador por colaborador em `colaborador_modulos_extra`.
 * Quem já administra o módulo (gestor com "ver") ou é dono passa direto.
 *
 * A revenda vem primeiro, e vale até para o dono: se a revenda não usa o
 * módulo, ele não existe ali para ninguém. Liberação individual só faz
 * sentido dentro de um módulo que a revenda tem.
 */
export async function temAcessoModulo(modulo: ModuloId) {
  const perfil = await getPerfil();
  if (!perfil) return false;

  const revendaId = await getRevendaId();
  if (!revendaId) return false;
  if (!(await revendaTemModulo(modulo))) return false;

  if (ehOwner(perfil.role)) return true;

  const concessoes = await getConcessoes();
  if (podeFazer(perfil.role, concessoes, modulo, "ver")) return true;

  const admin = createAdminClient();
  const { data } = await admin
    .from("colaborador_modulos_extra")
    .select("modulo")
    .eq("colaborador_id", perfil.id)
    .eq("revenda_id", revendaId)
    .eq("modulo", modulo)
    .maybeSingle();

  return Boolean(data);
}

/** Versão que redireciona em vez de responder, para proteger a tela inteira. */
export async function requireAcessoModulo(modulo: ModuloId, destino = "/") {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  if (!(await temAcessoModulo(modulo))) {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        "Você não tem acesso a este módulo. Fale com o Admin.",
      )}`,
    );
  }

  return perfil;
}

export { chaveDaPermissao };
