import { cache } from "react";
import { redirect } from "next/navigation";
import { getPerfil } from "@/lib/sessao";
import { getConcessoes } from "@/lib/concessoes";
import { getRevendaId, getModulosDaRevenda, revendaTemModulo } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  chaveDaPermissao,
  ehOwner,
  podeFazer,
  temAlgumAcesso,
  MODULOS_OPCIONAIS,
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
 * Exclusivo do dono. Usado nas telas críticas -- Acessos por Pessoa e
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
export async function requireModulo(modulo: ModuloId, acao: Acao, destino = "/admin") {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  if (!(await revendaTemModulo(modulo))) {
    redirect(`${destino}?erro=${encodeURIComponent(desligado(modulo))}`);
  }

  const concessoes = await getConcessoes();
  if (!podeFazer(perfil.role, concessoes, modulo, acao)) {
    redirect(`${destino}?erro=${encodeURIComponent(negado(modulo, acao))}`);
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

/**
 * Todos os módulos opcionais que a pessoa enxerga NA REVENDA ATIVA, numa
 * tacada só -- é o que o menu inicial usa para decidir quais cartões
 * mostrar, sem repetir `temAcessoModulo` módulo por módulo (isso seria
 * uma consulta a mais por módulo opcional a cada carregamento da home).
 *
 * Dono vê todos (por definição). Liderança com "ver" administrativo num
 * módulo específico enxerga esse módulo como colaborador também --
 * mexer no Jornal sem poder ler o próprio Jornal não faria sentido.
 * Fora isso, só quem tem uma linha em `colaborador_modulos_extra`.
 */
export const getModulosAcessiveis = cache(async (): Promise<Set<ModuloId>> => {
  const perfil = await getPerfil();
  if (!perfil) return new Set();

  const revendaId = await getRevendaId();
  if (!revendaId) return new Set();

  const modulosDaRevenda = await getModulosDaRevenda(revendaId);
  const opcionaisDaRevenda = MODULOS_OPCIONAIS.filter((m) => modulosDaRevenda.has(m));

  if (ehOwner(perfil.role)) return new Set(opcionaisDaRevenda);

  const concessoes = await getConcessoes();
  const jaTemPorPermissao = new Set(
    opcionaisDaRevenda.filter((m) => podeFazer(perfil.role, concessoes, m, "ver")),
  );

  const faltam = opcionaisDaRevenda.filter((m) => !jaTemPorPermissao.has(m));
  if (faltam.length === 0) return jaTemPorPermissao;

  const admin = createAdminClient();

  // "5s" tem uma segunda porta de entrada, além do toggle de módulo extra:
  // ser auditor ou dono de área (cinco_s_auditores/cinco_s_area_donos) já
  // dava acesso ao módulo antes de ele virar opcional (26/08/2026), quando
  // o cartão aparecia para todo mundo sem checagem. Sem isto aqui, quem já
  // era auditor/dono perderia o cartão do menu -- continuaria entrando
  // pela URL direta (getContexto5S cobre isso), mas não acharia mais o
  // caminho andando pelo app.
  const [{ data: extras }, { data: auditor5s }, { data: donoDeArea5s }] = await Promise.all([
    admin
      .from("colaborador_modulos_extra")
      .select("modulo")
      .eq("colaborador_id", perfil.id)
      .eq("revenda_id", revendaId)
      .in("modulo", faltam),
    faltam.includes("5s")
      ? admin
          .from("cinco_s_auditores")
          .select("colaborador_id")
          .eq("colaborador_id", perfil.id)
          .eq("revenda_id", revendaId)
          .eq("ativo", true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    faltam.includes("5s")
      ? admin
          .from("cinco_s_area_donos")
          .select("area_id, cinco_s_areas!inner(revenda_id)")
          .eq("colaborador_id", perfil.id)
          .is("ate", null)
          .eq("cinco_s_areas.revenda_id", revendaId)
      : Promise.resolve({ data: null }),
  ]);

  for (const linha of extras ?? []) jaTemPorPermissao.add(linha.modulo as ModuloId);
  if (auditor5s || (donoDeArea5s && donoDeArea5s.length > 0)) jaTemPorPermissao.add("5s");

  return jaTemPorPermissao;
});

export { chaveDaPermissao };
