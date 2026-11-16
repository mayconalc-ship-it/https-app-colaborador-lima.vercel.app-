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
import { cancelarAvaliacao, finalizarAvaliacao, reabrirAvaliacao, removerFoto, salvarResposta } from "../actions";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { createAdminClient } from "@/lib/supabase/admin";
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
    // A última pergunta mexida: é dela que a ronda continua ao voltar.
    let ultimo: { itemId: string; em: string } | null = null;
    for (const r of respostas.get(avaliacao.id) ?? []) {
      if (!ultimo || r.atualizadoEm > ultimo.em) ultimo = { itemId: r.itemId, em: r.atualizadoEm };
      minhas[r.itemId] = {
        nota: r.nota,
        na: r.na,
        observacao: r.observacao,
        planoAcao: r.planoAcao,
        responsavel: r.responsavel,
        prazo: r.prazo,
        respondidoPorNome: r.respondidoPorNome,
        // A chave é o nome do arquivo sem extensão: o id que o celular deu
        // à foto. É por ela que o cartão sabe que a foto local já chegou.
        fotos: r.fotos.map((f) => ({ id: f.id, url: f.url, mini: f.mini, chave: f.caminho.split("/").pop()?.replace(/\.[^.]+$/, "") })),
      };
    }
    const anteriores: Record<string, AnteriorDoCartao> = {};
    if (anteriorAval) {
      for (const r of respostas.get(anteriorAval.id) ?? []) {
        anteriores[r.itemId] = {
          rotulo: rotuloTrimestre(anteriorAval),
          nota: r.nota,
          na: r.na,
          fotos: r.fotos.map((f) => ({ id: f.id, url: f.url, mini: f.mini })),
        };
      }
    }
    return { tipo: "ok" as const, avaliacao, itens, minhas, anteriores, podeReabrir, pessoas, ultimoItemId: ultimo?.itemId ?? null };
  } catch (e) {
    if (e instanceof ModuloNaoInstalado) return { tipo: "nao-instalado" as const };
    throw e;
  }
}

export default async function AvaliacaoManutencaoPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await requireAcessoModulo(MODULO_MANUTENCAO);
  const revendaId = await exigirRevenda("/");
  const { id } = await params;

  const dados = await carregar(id, revendaId);
  if (dados.tipo === "nao-instalado") return <AvisoNaoInstalado />;
  if (dados.tipo === "nao-achou") notFound();
  const { avaliacao, itens, minhas, anteriores, podeReabrir, pessoas, ultimoItemId } = dados;

  const rotulo = rotuloTrimestre(avaliacao);

  // Cancelar (16/11/2026): só a aberta, e só quem iniciou ou a liderança
  // com editar -- a mesma régua da ação, para não oferecer o que será negado.
  let podeCancelar = false;
  if (avaliacao.status === "em_andamento") {
    const { data: dona } = await createAdminClient()
      .from("manut_avaliacoes")
      .select("iniciada_por")
      .eq("id", avaliacao.id)
      .maybeSingle();
    podeCancelar = podeReabrir || dona?.iniciada_por === perfil.id;
  }
  const nRespostas = Object.keys(minhas).length;
  const nFotos = Object.values(minhas).reduce((t, r) => t + r.fotos.length, 0);
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
      {podeCancelar && (
        <div className="-mt-2 mb-3 flex justify-end">
          <BotaoNoLugar
            acao={cancelarAvaliacao}
            campos={{ avaliacao_id: avaliacao.id }}
            confirmacao={`Cancelar a avaliação do ${rotulo}?`}
            detalhe={
              nRespostas > 0
                ? `Apaga ${nRespostas} resposta${nRespostas === 1 ? "" : "s"}${nFotos ? ` e ${nFotos} foto${nFotos === 1 ? "" : "s"}` : ""}. Não dá para desfazer.`
                : "Ainda não há resposta. O trimestre fica livre para começar de novo."
            }
            rotuloConfirmar="Cancelar avaliação"
            textoEnviando="Cancelando..."
            className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            ✕ Cancelar avaliação
          </BotaoNoLugar>
        </div>
      )}
      <ChecklistManutencao
        avaliacaoId={avaliacao.id}
        rotulo={rotulo}
        itens={itens}
        respostas={minhas}
        anteriores={anteriores}
        aberta={avaliacao.status === "em_andamento"}
        podeReabrir={podeReabrir}
        pessoas={pessoas}
        ultimoItemId={avaliacao.status === "em_andamento" ? ultimoItemId : null}
        hojeIso={hojeIso()}
        acoes={{ salvar: salvarResposta, removerFoto, finalizar: finalizarAvaliacao, reabrir: reabrirAvaliacao }}
      />
    </div>
  );
}
