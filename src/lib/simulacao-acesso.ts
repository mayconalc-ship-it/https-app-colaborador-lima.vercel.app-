import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getModulosDaRevenda } from "@/lib/revendas";
import {
  MODULOS,
  MODULOS_OPCIONAIS,
  ehOwner,
  podeFazer,
  type Acao,
  type Modulo,
  type ModuloId,
} from "@/lib/acessos";
import { MENU_PADRAO, agruparItens, cartoesVisiveis, type ItemMenu } from "@/lib/menu";
import { paineisPara, type Painel } from "@/lib/gestao";

/**
 * "VER COMO ESTA PESSOA VÊ" -- a prévia de acesso.
 *
 * Pedido do dono (05/09/2026): "eu que crio o app fico confuso em o que
 * liberar às vezes". A tela de Acessos só sabe responder a pergunta de
 * ENTRADA -- "quem tem o módulo X?". A dúvida real é a de SAÍDA: "o que
 * esta pessoa enxerga?". Sem responder isso, a única conferência possível
 * era entrar na conta de alguém.
 *
 * NADA AQUI REIMPLEMENTA REGRA. Os cartões saem de `cartoesVisiveis`, as
 * análises de `paineisPara`, a permissão de `podeFazer` -- as MESMAS
 * funções que a home, a Gestão e o Modo Liderança usam de verdade. Foi
 * para isso que as três foram extraídas (06/09/2026): uma prévia com
 * lógica própria mente na primeira mudança, e mente justamente onde se
 * confia nela para decidir uma permissão.
 *
 * O QUE ELA NÃO COBRE, e é honesto dizer: as portas laterais do 5S
 * (auditor e dono de área, em cinco_s_*) dão acesso ao módulo sem passar
 * por permissão nenhuma. A prévia avisa quando é o caso, em vez de
 * afirmar que a pessoa não vê.
 */

export type TelaDaLideranca = {
  modulo: Modulo;
  acoes: Acao[];
};

export type Simulacao = {
  pessoa: { id: string; nome: string; role: string; cargo: string | null; area: string | null };
  daRevenda: boolean;
  /** Os blocos da tela inicial, como a pessoa veria. */
  blocos: { id: string; titulo: string; itens: ItemMenu[] }[];
  /** As análises da Gestão que aparecem na home dela. */
  paineis: Painel[];
  /** As telas do Modo Liderança que ela abre, e com que ações. */
  telas: TelaDaLideranca[];
  /** Módulos opcionais liberados individualmente (o cartão no app). */
  extras: ModuloId[];
  /** Verdadeiro quando o 5S pode entrar por auditor/dono de área. */
  cincoSPorVinculo: boolean;
};

export async function simularAcesso(
  colaboradorId: string,
  revendaId: string,
): Promise<Simulacao | null> {
  const admin = createAdminClient();

  const [
    { data: pessoa },
    { data: vinculo },
    { data: permissoes },
    { data: extrasBanco },
    { data: itensBanco },
    modulosDaRevenda,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, nome, role, cargo, area")
      .eq("id", colaboradorId)
      .maybeSingle(),
    admin
      .from("colaborador_revendas")
      .select("colaborador_id")
      .eq("colaborador_id", colaboradorId)
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    admin
      .from("lideranca_permissoes")
      .select("modulo, acao")
      .eq("colaborador_id", colaboradorId)
      .eq("revenda_id", revendaId),
    admin
      .from("colaborador_modulos_extra")
      .select("modulo")
      .eq("colaborador_id", colaboradorId)
      .eq("revenda_id", revendaId),
    admin
      .from("menu_itens")
      .select("chave, titulo, emoji, href, ordem, visivel")
      .eq("revenda_id", revendaId)
      .order("ordem", { ascending: true }),
    getModulosDaRevenda(revendaId),
  ]);

  if (!pessoa) return null;

  const concessoes = new Set((permissoes ?? []).map((p) => `${p.modulo}:${p.acao}`));
  const extras = new Set((extrasBanco ?? []).map((e) => e.modulo));
  const dono = ehOwner(pessoa.role);

  // A MESMA CONTA DE getModulosAcessiveis, sobre outra pessoa: dono vê
  // todos os opcionais da revenda; liderança com "ver" administrativo
  // enxerga o módulo como colaborador também; fora isso, é a liberação
  // individual que manda.
  const opcionaisDaRevenda = MODULOS_OPCIONAIS.filter((m) => modulosDaRevenda.has(m));
  const modulosAcessiveis = new Set<string>(
    dono
      ? opcionaisDaRevenda
      : opcionaisDaRevenda.filter(
          (m) => podeFazer(pessoa.role, concessoes, m, "ver") || extras.has(m),
        ),
  );

  const todos = (itensBanco && itensBanco.length > 0 ? itensBanco : MENU_PADRAO) as ItemMenu[];
  const blocos = agruparItens(cartoesVisiveis(todos, modulosDaRevenda, modulosAcessiveis)).map(
    (b) => ({ id: b.id, titulo: b.titulo, itens: b.itens }),
  );

  const paineis = paineisPara(modulosDaRevenda, (modulo) =>
    podeFazer(pessoa.role, concessoes, modulo, "ver"),
  );

  // As telas do Modo Liderança: as que a pessoa abre, com as ações que
  // tem em cada uma. Módulo sem tela de admin (e os que moram na Gestão)
  // ficam de fora -- já apareceram como cartão ou como análise.
  const telas: TelaDaLideranca[] = MODULOS.filter(
    (m) => modulosDaRevenda.has(m.id) && !m.semTelaAdmin && !m.emGestao && !m.subGrupoDe,
  )
    .map((m) => ({
      modulo: m,
      acoes: m.acoes.filter((a) => podeFazer(pessoa.role, concessoes, m.id, a)),
    }))
    .filter((t) => t.acoes.length > 0);

  // A porta lateral do 5S -- ver getModulosAcessiveis. Só perguntamos se
  // ela importa: quando o módulo existe e a pessoa ainda não o tem.
  let cincoSPorVinculo = false;
  if (modulosDaRevenda.has("5s") && !modulosAcessiveis.has("5s")) {
    const [{ data: auditor }, { data: donoDeArea }] = await Promise.all([
      admin
        .from("cinco_s_auditores")
        .select("colaborador_id")
        .eq("colaborador_id", colaboradorId)
        .eq("revenda_id", revendaId)
        .eq("ativo", true)
        .maybeSingle(),
      admin
        .from("cinco_s_area_donos")
        .select("area_id, cinco_s_areas!inner(revenda_id)")
        .eq("colaborador_id", colaboradorId)
        .is("ate", null)
        .eq("cinco_s_areas.revenda_id", revendaId),
    ]);
    cincoSPorVinculo = Boolean(auditor) || (donoDeArea?.length ?? 0) > 0;
  }

  return {
    pessoa,
    daRevenda: Boolean(vinculo),
    blocos,
    paineis,
    telas,
    extras: [...extras].filter((m): m is ModuloId =>
      (MODULOS_OPCIONAIS as readonly string[]).includes(m),
    ),
    cincoSPorVinculo,
  };
}
