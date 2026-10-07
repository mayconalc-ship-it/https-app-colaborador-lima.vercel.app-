import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ChecklistManutencao } from "@/components/manutencao/ChecklistManutencao";
import type { AnteriorDoCartao, RespostaDoCartao } from "@/components/manutencao/CartaoItem";
import { exigirRevenda } from "@/lib/revendas";
import { podeNoModulo, requireAcessoModulo } from "@/lib/require-admin";
import { hojeIso } from "@/lib/pesquisa";
import { mesesDoTrimestre, rotuloTrimestre } from "@/lib/manutencao";
import {
  MODULO_MANUTENCAO,
  ModuloNaoInstalado,
  lerAvaliacao,
  lerItens,
  lerRespostas,
  listarAvaliacoes,
  pessoasDaRevenda,
} from "@/lib/manutencao-server";
import { finalizarAvaliacao, reabrirAvaliacao, removerFoto, salvarResposta } from "../actions";
import { AvisoNaoInstalado } from "../AvisoNaoInstalado";

export const dynamic = "force-dynamic";
// Várias fotos de uma vez passam pelo sharp no servidor.
export const maxDuration = 60;

/** Os dados da tela, ou o motivo de não haver tela. */
async function carregar(id: string, revendaId: string) {
  try {
    const [avaliacao, itens, avaliacoes, podeReabrir, pessoas] = await Promise.all([
      lerAvaliacao(id, revendaId),
      lerItens(revendaId),
      listarAvaliacoes(revendaId),
      podeNoModulo(MODULO_MANUTENCAO, "editar"),
      pessoasDaRevenda(revendaId),
    ]);
    if (!avaliacao) return { tipo: "nao-achou" as const };

    // A anterior é a que vem logo depois na lista (do mais novo ao mais
    // antigo) -- é com ela que cada item se compara.
    const posicao = avaliacoes.findIndex((a) => a.id === avaliacao.id);
    const anteriorAval = posicao >= 0 ? avaliacoes[posicao + 1] : undefined;
    const respostas = await lerRespostas([avaliacao.id, ...(anteriorAval ? [anteriorAval.id] : [])]);

    const minhas: Record<string, RespostaDoCartao> = {};
    for (const r of respostas.get(avaliacao.id) ?? []) {
      minhas[r.itemId] = {
        nota: r.nota,
        na: r.na,
        observacao: r.observacao,
        planoAcao: r.planoAcao,
        responsavel: r.responsavel,
        prazo: r.prazo,
        respondidoPorNome: r.respondidoPorNome,
        fotos: r.fotos.map((f) => ({ id: f.id, url: f.url })),
      };
    }
    const anteriores: Record<string, AnteriorDoCartao> = {};
    if (anteriorAval) {
      for (const r of respostas.get(anteriorAval.id) ?? []) {
        anteriores[r.itemId] = {
          rotulo: rotuloTrimestre(anteriorAval),
          nota: r.nota,
          na: r.na,
          fotos: r.fotos.map((f) => ({ id: f.id, url: f.url })),
        };
      }
    }
    return { tipo: "ok" as const, avaliacao, itens, minhas, anteriores, podeReabrir, pessoas };
  } catch (e) {
    if (e instanceof ModuloNaoInstalado) return { tipo: "nao-instalado" as const };
    throw e;
  }
}

export default async function AvaliacaoManutencaoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAcessoModulo(MODULO_MANUTENCAO);
  const revendaId = await exigirRevenda("/");
  const { id } = await params;

  const dados = await carregar(id, revendaId);
  if (dados.tipo === "nao-instalado") return <AvisoNaoInstalado />;
  if (dados.tipo === "nao-achou") notFound();
  const { avaliacao, itens, minhas, anteriores, podeReabrir, pessoas } = dados;

  const rotulo = rotuloTrimestre(avaliacao);
  return (
    <div>
      <PageHeader
        title={`☑️ Check de Manutenção · ${rotulo}`}
        subtitle={`${mesesDoTrimestre(avaliacao)} · iniciado por ${avaliacao.iniciadaPorNome.split(" ")[0]}${
          avaliacao.status === "finalizada" && avaliacao.finalizadaPorNome
            ? ` · finalizado por ${avaliacao.finalizadaPorNome.split(" ")[0]}`
            : ""
        }`}
        fecharHref="/manutencao"
      />
      <ChecklistManutencao
        avaliacaoId={avaliacao.id}
        rotulo={rotulo}
        itens={itens}
        respostas={minhas}
        anteriores={anteriores}
        aberta={avaliacao.status === "em_andamento"}
        podeReabrir={podeReabrir}
        pessoas={pessoas}
        hojeIso={hojeIso()}
        acoes={{ salvar: salvarResposta, removerFoto, finalizar: finalizarAvaliacao, reabrir: reabrirAvaliacao }}
      />
    </div>
  );
}
