import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { decodificar } from "@/lib/texto-url";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { garantirBlitzDoAtendimento } from "@/lib/blitz-server";
import { ROTULO_DIMENSAO, type Dimensao } from "@/lib/blitz";
import { concluirBlitz } from "./actions";
import { ItemDaBlitz, type ItemChecklist, type RespostaGravada } from "./ItemDaBlitz";

export const dynamic = "force-dynamic";

type LinhaBlitz = {
  id: string;
  status: "pendente" | "concluida" | "tratada";
  gatilho_dimensao: Dimensao | null;
  gatilho_nome: string | null;
  transportadora_nome: string | null;
  media_avaria_pct: number | null;
  limite_pct: number | null;
  carretas_consideradas: number | null;
  conferente_nome: string | null;
  concluida_em: string | null;
};

/**
 * O CHECKLIST DA BLITZ -- a tela que o conferente usa na doca.
 *
 * Tela PRÓPRIA, e não mais um bloco na página da carreta: aquela já é a
 * maior do módulo, e o conferente faz a blitz ANDANDO ao redor da carreta,
 * com o celular na mão. Aqui ele tem só as perguntas, na ordem em que anda.
 *
 * AGRUPADA COMO A VOLTA É DADA: asa delta e grade, assoalho e estrutura,
 * carga, documento. Treze perguntas numa lista corrida viram rolagem; em
 * blocos, cada parada tem começo e fim.
 */
export default async function BlitzDaCarretaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const perfil = await requireAcessoModulo("carretas-conferencia", "/carretas-conferencia");
  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const { id } = await params;
  const { erro } = await searchParams;
  const admin = createAdminClient();

  const { data: atendimento } = await admin
    .from("atendimentos_carretas")
    .select("id, numero_dt, placa_carreta, motorista_nome, chegada_em, blitz_exigida, pa_transportadoras(nome)")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!atendimento) notFound();

  const transportadora = Array.isArray(atendimento.pa_transportadoras)
    ? (atendimento.pa_transportadoras[0]?.nome ?? "—")
    : ((atendimento.pa_transportadoras as { nome: string } | null)?.nome ?? "—");

  // A blitz nasce na primeira vez que a tela abre. Ver
  // garantirBlitzDoAtendimento: um botão "iniciar" antes da primeira
  // pergunta é um toque que alguém esquece.
  const blitzId = await garantirBlitzDoAtendimento(id, revendaId, {
    id: perfil.id,
    nome: perfil.nome,
  });
  if (!blitzId) {
    redirect(
      `/carretas-conferencia/${id}?erro=${encodeURIComponent(
        "Não foi possível abrir a blitz desta carreta.",
      )}`,
    );
  }

  const [{ data: blitzBanco }, { data: itensBanco }, { data: respostasBanco }] = await Promise.all([
    admin
      .from("pa_blitz")
      .select(
        "id, status, gatilho_dimensao, gatilho_nome, transportadora_nome, media_avaria_pct, limite_pct, carretas_consideradas, conferente_nome, concluida_em",
      )
      .eq("id", blitzId)
      .maybeSingle(),
    admin
      .from("pa_blitz_itens")
      .select("id, pergunta, ajuda, grupo, ordem")
      .eq("revenda_id", revendaId)
      .eq("ativo", true)
      .order("ordem"),
    admin
      .from("pa_blitz_respostas")
      .select("item_id, resposta, observacao, foto_url")
      .eq("blitz_id", blitzId),
  ]);

  const blitz = blitzBanco as LinhaBlitz | null;
  if (!blitz) notFound();

  const itens = (itensBanco ?? []) as (ItemChecklist & { ordem: number })[];
  const respostas = new Map(
    ((respostasBanco ?? []) as ({ item_id: string } & RespostaGravada)[]).map((r) => [
      r.item_id,
      { resposta: r.resposta, observacao: r.observacao, foto_url: r.foto_url },
    ]),
  );

  const respondidos = itens.filter((i) => respostas.has(i.id)).length;
  const nok = [...respostas.values()].filter((r) => r.resposta === "nok").length;
  const falta = itens.length - respondidos;
  const fechada = blitz.status !== "pendente";

  // A ordem dos blocos é a do cadastro (coluna `ordem`), e não alfabética:
  // é a volta que se dá na carreta.
  const grupos: { nome: string; itens: typeof itens }[] = [];
  for (const item of itens) {
    const nome = item.grupo?.trim() || "Checklist";
    const atual = grupos.find((g) => g.nome === nome);
    if (atual) atual.itens.push(item);
    else grupos.push({ nome, itens: [item] });
  }

  return (
    <div>
      <PageHeader
        title="🚨 Blitz de carreta"
        subtitle={`${atendimento.placa_carreta} — DT ${atendimento.numero_dt}`}
        fecharHref={`/carretas-conferencia/${id}`}
      />

      {erro && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {decodificar(erro)}
        </p>
      )}

      {/*
        POR QUE ESTA CARRETA FOI PARADA, na primeira dobra.

        O conferente vai olhar a carreta na frente do motorista, e o
        motorista vai perguntar. Ele precisa da frase pronta -- "a média
        desta carreta está em X%, acima do limite de Y%" -- e não de uma
        marca vermelha sem explicação.
      */}
      <section className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-bold text-red-900">
          {blitz.gatilho_dimensao && blitz.gatilho_nome
            ? `${ROTULO_DIMENSAO[blitz.gatilho_dimensao]} ${blitz.gatilho_nome} acima do limite de avaria`
            : "Carreta selecionada para inspeção de recebimento"}
        </p>
        {blitz.media_avaria_pct !== null && blitz.limite_pct !== null && (
          <p className="mt-1 text-xs text-red-800">
            Média de <strong>{blitz.media_avaria_pct}%</strong> de avaria
            {blitz.carretas_consideradas ? ` em ${blitz.carretas_consideradas} cargas` : ""} — o
            limite é <strong>{blitz.limite_pct}%</strong>.
          </p>
        )}
        <div className="mt-2 space-y-0.5 text-xs text-red-900/80">
          <p>Transportadora: {transportadora}</p>
          <p>Motorista: {atendimento.motorista_nome}</p>
          <p>Chegada: {formatarDataHora(atendimento.chegada_em)}</p>
        </div>
      </section>

      {fechada ? (
        <p className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm">
          ✅ Blitz concluída
          {blitz.concluida_em ? ` em ${formatarDataHora(blitz.concluida_em)}` : ""}
          {blitz.conferente_nome ? ` por ${blitz.conferente_nome}` : ""} — {nok} não conformidade(s).
          A liderança trata no{" "}
          <Link href="/gestao/anomalias" className="text-primary hover:underline">
            painel de pendências
          </Link>
          .
        </p>
      ) : (
        /* O CONTADOR FICA GRUDADO NO TOPO. Na doca a pessoa rola muito, e
           "faltam 4" é a única informação que ela procura o tempo todo. */
        <div className="sticky top-2 z-10 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 text-sm shadow-sm backdrop-blur">
          <span className="font-semibold text-slate-700">
            {respondidos} de {itens.length} respondidos
          </span>
          <span className={nok > 0 ? "font-bold text-red-700" : "text-slate-500"}>
            {nok} NOK
          </span>
        </div>
      )}

      {itens.length === 0 && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          O checklist da blitz está vazio. O Admin cadastra as perguntas em{" "}
          <strong>Admin → Relato de Anomalia</strong>.
        </p>
      )}

      <div className="space-y-5">
        {grupos.map((g) => (
          <section key={g.nome}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              {g.nome}
            </h2>
            <ul className="space-y-2">
              {g.itens.map((item) => (
                <ItemDaBlitz
                  key={item.id}
                  item={item}
                  gravada={respostas.get(item.id) ?? null}
                  atendimentoId={id}
                  blitzId={blitz.id}
                  somenteLeitura={fechada}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {!fechada && itens.length > 0 && (
        <form action={concluirBlitz} className="sticky bottom-4 z-10 mt-5">
          <input type="hidden" name="atendimento_id" value={id} />
          <input type="hidden" name="blitz_id" value={blitz.id} />
          {/* O botão só liga com o checklist inteiro respondido, e diz o que
              falta. A ação de servidor recusa igual -- botão escondido não é
              regra, é cortesia. */}
          <BotaoEnviar
            textoEnviando="Concluindo..."
            disabled={falta > 0}
            className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-primary-dark"
          >
            {falta > 0
              ? `Falta${falta === 1 ? "" : "m"} ${falta} item(ns) para concluir`
              : `Concluir blitz${nok > 0 ? ` — ${nok} NOK` : " — tudo OK"}`}
          </BotaoEnviar>
        </form>
      )}
    </div>
  );
}
