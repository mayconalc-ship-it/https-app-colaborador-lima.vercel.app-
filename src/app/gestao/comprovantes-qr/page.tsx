import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { lerTudo } from "@/lib/ler-tudo";
import { MODULO_QR, normalizarBusca } from "@/lib/qr-contingencia";
import { normalizarMapa } from "@/lib/rotas";
import {
  COLUNAS_COMPROVANTE,
  comFotos,
  hojeNaOperacao,
} from "@/lib/qr-contingencia-server";
import { PainelComprovantes } from "./PainelComprovantes";

export const dynamic = "force-dynamic";

type Linha = Parameters<typeof comFotos>[0][number];

/**
 * OS COMPROVANTES DO QR DE CONTINGÊNCIA -- a tela de quem concilia.
 *
 * Refeita em 18/09/2026 (pedido do dono: "agrupe por mapa, os campos de
 * busca precisam seguir o padrão do app"). A conciliação é feita MAPA A
 * MAPA -- é o documento que volta da rota com o motorista --, então cada
 * mapa é um cartão com o total dele, e os clientes dentro, na ordem em que
 * foram pagos. Mapa e motorista são escolhidos numa lista (só os que têm
 * comprovante no período), não digitados.
 */
export default async function ComprovantesQrPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; mapa?: string; motorista?: string; busca?: string }>;
}) {
  await requireModulo(MODULO_QR, "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const sp = await searchParams;

  const hoje = hojeNaOperacao();
  const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const de = valida(sp.de) ?? hoje;
  const ate = valida(sp.ate) ?? hoje;
  const mapaEscolhido = normalizarMapa(sp.mapa ?? "");
  const motoristaEscolhido = (sp.motorista ?? "").trim();
  const busca = (sp.busca ?? "").trim();

  const [doPeriodo, podeExcluir] = await Promise.all([
    lerTudo<Linha>((a, b) =>
      createAdminClient()
        .from("qr_comprovantes")
        .select(COLUNAS_COMPROVANTE)
        .eq("revenda_id", revendaId)
        .gte("data", de)
        .lte("data", ate)
        .order("criado_em", { ascending: false })
        .range(a, b),
    ),
    podeNoModulo(MODULO_QR, "excluir"),
  ]);

  // As listas dos filtros saem do PERÍODO, antes dos outros filtros: assim
  // trocar o mapa não faz sumir da lista o motorista de outro mapa.
  const mapasDoPeriodo = [...new Set(doPeriodo.map((l) => l.mapa).filter((m): m is string => Boolean(m)))].sort(
    (a, b) => Number(b) - Number(a),
  );
  const motoristasDoPeriodo = [...new Map(doPeriodo.map((l) => [l.colaborador_id ?? l.colaborador_nome, l.colaborador_nome]))]
    .map(([valor, nome]) => ({ valor: String(valor), nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const termo = normalizarBusca(busca);
  const filtradas = doPeriodo.filter(
    (l) =>
      (!mapaEscolhido || l.mapa === mapaEscolhido) &&
      (!motoristaEscolhido || (l.colaborador_id ?? l.colaborador_nome) === motoristaEscolhido) &&
      (!termo || normalizarBusca(`${l.cod_pdv} ${l.cliente_nome ?? ""} ${l.cliente_cidade ?? ""}`).includes(termo)),
  );

  // As fotos só dos 300 primeiros: link assinado custa uma ida ao
  // armazenamento, e ninguém confere 500 comprovantes rolando a tela.
  const comprovantes = await comFotos(filtradas.slice(0, 300));

  return (
    <PainelComprovantes
      de={de}
      ate={ate}
      mapaEscolhido={mapaEscolhido}
      motoristaEscolhido={motoristaEscolhido}
      busca={busca}
      temFiltro={Boolean(mapaEscolhido || motoristaEscolhido || busca || sp.de || sp.ate)}
      mapasDoPeriodo={mapasDoPeriodo}
      motoristasDoPeriodo={motoristasDoPeriodo}
      filtradas={filtradas}
      comprovantes={comprovantes}
      podeExcluir={podeExcluir}
    />
  );
}
