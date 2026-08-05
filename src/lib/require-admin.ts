import { redirect } from "next/navigation";
import { getPerfil, getConcessoes } from "@/lib/sessao";
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

  const concessoes = await getConcessoes();
  if (!podeFazer(perfil.role, concessoes, modulo, acao)) {
    redirect(`/admin?erro=${encodeURIComponent(negado(modulo, acao))}`);
  }

  return perfil;
}

function negado(modulo: string, acao: string) {
  return `Você não tem permissão para ${acao} em ${modulo}. Fale com o dono do app.`;
}

/** Versão que responde em vez de redirecionar, para ações que devolvem erro. */
export async function podeNoModulo(modulo: ModuloId, acao: Acao) {
  const perfil = await getPerfil();
  if (!perfil) return false;
  const concessoes = await getConcessoes();
  return podeFazer(perfil.role, concessoes, modulo, acao);
}

export { chaveDaPermissao };
