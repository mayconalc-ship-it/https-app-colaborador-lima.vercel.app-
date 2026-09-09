import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ExportarCsv } from "@/components/ExportarCsv";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { AREAS, ehAreaValida, type AreaId } from "@/lib/areas";
import { listarRodadas } from "@/lib/quiz-server";
import {
  ALERTA_DE_ACERTO,
  SEGUNDOS_DE_CHUTE,
  acertoPorGrupo,
  desempenhoPorQuestao,
  distribuicaoDeAcertos,
  tomDoAcerto,
} from "@/lib/desafio-analise";
import { CartaoDesafio, BarraDeAcerto, ColunasDeNota } from "./Graficos";
import { FiltroDoDesafio } from "./FiltroDoDesafio";
import { CartazDoDesafio } from "./CartazDoDesafio";

export const dynamic = "force-dynamic";

const MESES = [
  "", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export default async function GestaoDesafioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Mesma régua do módulo: quem abre o Desafio no Modo Liderança abre a
  // análise dele. Nenhuma permissão nova nasce aqui (ver lib/gestao.ts).
  await requireModulo("quiz", "ver");
  const revendaId = await exigirRevenda("/gestao");

  const sp = await searchParams;
  const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const areaFiltro = ehAreaValida(texto(sp.area)) ? (texto(sp.area) as AreaId) : null;

  /*
    TODAS as rodadas publicadas, das duas áreas.

    O filtro de área recorta a LISTA de rodadas, não a rodada escolhida:
    uma rodada pertence a uma área só (a coluna `area` é obrigatória e
    aceita DU ou AL), então não existe "esta rodada no recorte da outra
    área". Filtrar aqui é escolher de qual área é o campeonato que se
    está olhando.
  */
  const rodadas = (await listarRodadas(revendaId, { publicadas: true })).filter(
    (r) => !areaFiltro || r.area === areaFiltro,
  );

  const rodadaEscolhida =
    rodadas.find((r) => String(r.id) === texto(sp.rodada)) ?? rodadas[0] ?? null;

  if (!rodadaEscolhida) {
    return (
      <div>
        <PageHeader
          title="🏆 Desafio do Mês"
          subtitle="O que o time acertou, o que errou e o que isso manda treinar."
          fecharHref="/gestao"
        />
        <FiltroDoDesafio area={areaFiltro} rodadas={rodadas} rodadaId={null} />
        <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
          Nenhuma rodada publicada {areaFiltro ? "nesta área" : ""} ainda. Publique uma em{" "}
          <Link href="/admin/quiz" className="font-semibold underline">
            Modo Liderança → Desafio do Mês
          </Link>
          .
        </p>
      </div>
    );
  }

  const admin = createAdminClient();

  const [
    { data: participacoesBanco },
    { data: rodadaQuestoes },
    { data: vinculos },
  ] = await Promise.all([
    admin
      .from("quiz_participacoes")
      .select("id, colaborador_id, colaborador_nome, area, status, pontos, acertos, respondidas, tempo_ms, concluida_em")
      .eq("rodada_id", rodadaEscolhida.id),
    admin
      .from("quiz_rodada_questoes")
      .select("questao_id, ordem, quiz_questoes(id, pergunta, dificuldade, padrao_nome, atividade, pilar)")
      .eq("rodada_id", rodadaEscolhida.id)
      .order("ordem"),
    // Quem PODIA ter jogado: o vínculo com a revenda mais a área do
    // cadastro. Sem este número, "18 pessoas participaram" é um elogio
    // ou um problema conforme o time tenha 20 ou 90 pessoas -- e a tela
    // não dizia qual dos dois.
    admin.from("colaborador_revendas").select("colaborador_id").eq("revenda_id", revendaId),
  ]);

  const participacoes = (participacoesBanco ?? []) as {
    id: number;
    colaborador_id: string;
    colaborador_nome: string;
    area: string;
    status: string;
    pontos: number;
    acertos: number;
    respondidas: number;
    tempo_ms: number;
    concluida_em: string | null;
  }[];

  const idsVinculados = (vinculos ?? []).map((v) => v.colaborador_id as string);
  const { data: perfis } = await admin
    .from("profiles")
    .select("id, nome, area")
    .in("id", idsVinculados.length > 0 ? idsVinculados : ["00000000-0000-0000-0000-000000000000"]);

  // A área do cadastro chega em texto livre; a rodada é DU ou AL. A
  // tradução é a mesma do resto do Desafio: contém "arma"/"log" é AL,
  // o resto é DU.
  const ehDaArea = (area: string | null, alvo: AreaId) => {
    const t = (area ?? "").toLowerCase();
    const daPessoa: AreaId = t.includes("arma") || t.includes("log") || t.includes("al") ? "AL" : "DU";
    return daPessoa === alvo;
  };
  const elegiveis = (perfis ?? []).filter((p) => ehDaArea(p.area as string | null, rodadaEscolhida.area));

  const questoes = ((rodadaQuestoes ?? []) as unknown as {
    questao_id: number;
    quiz_questoes:
      | { id: number; pergunta: string; dificuldade: string; padrao_nome: string | null; atividade: string | null; pilar: string | null }
      | null;
  }[])
    .map((l) => l.quiz_questoes)
    .filter((q): q is NonNullable<typeof q> => q !== null)
    .map((q) => ({
      id: q.id,
      pergunta: q.pergunta,
      dificuldade: q.dificuldade,
      padraoNome: q.padrao_nome,
      atividade: q.atividade,
      pilar: q.pilar,
    }));

  const { data: respostasBanco } = await admin
    .from("quiz_respostas")
    .select("questao_id, correta, tempo_ms")
    .in("participacao_id", participacoes.length > 0 ? participacoes.map((p) => p.id) : [0]);

  const respostas = ((respostasBanco ?? []) as { questao_id: number; correta: boolean; tempo_ms: number }[]).map(
    (r) => ({ questaoId: r.questao_id, correta: r.correta, tempoMs: r.tempo_ms }),
  );

  // ---- Os números ----
  const concluidas = participacoes.filter((p) => p.status === "concluida");
  const totalRespostas = respostas.length;
  const totalAcertos = respostas.filter((r) => r.correta).length;
  const taxaAcertoGeral = totalRespostas > 0 ? Math.round((totalAcertos / totalRespostas) * 100) : null;
  const pctParticipacao =
    elegiveis.length > 0 ? Math.round((concluidas.length / elegiveis.length) * 100) : null;
  const segundosPorPergunta =
    totalRespostas > 0
      ? Math.round((respostas.reduce((s, r) => s + r.tempoMs, 0) / totalRespostas / 1000) * 10) / 10
      : null;

  const desempenho = desempenhoPorQuestao(questoes, respostas);
  // Do PIOR para o melhor: a lista existe para achar o que treinar.
  const piores = [...desempenho].sort((a, b) => (a.pctAcerto ?? 0) - (b.pctAcerto ?? 0));
  const abaixoDoAlerta = piores.filter((q) => (q.pctAcerto ?? 100) < ALERTA_DE_ACERTO);
  const chutes = desempenho.filter((q) => q.cheiroDeChute);

  /**
   * A RESPOSTA da pergunta crítica -- a que vai no cartaz.
   *
   * O cartaz mostrava quem faltava entregar. Trocado a pedido do dono
   * (09/09/2026) pela resposta certa: um cartaz que ensina o
   * procedimento chega a todo mundo do grupo, inclusive a quem acertou
   * por sorte; um cartaz que lista nomes só constrange quem já está
   * atrasado. A lista de quem falta continua na TELA, que é onde a
   * cobrança é feita -- de líder para pessoa, não no grupo.
   *
   * O gabarito vem pelo cliente admin porque `quiz_alternativas` tem RLS
   * sem política nenhuma: quem tem a chave pública não pode ler
   * `correta`, senão teria a prova inteira antes de responder.
   */
  const questaoCritica = piores[0] ?? null;
  const { data: gabaritoBanco } = questaoCritica
    ? await admin
        .from("quiz_alternativas")
        .select("texto")
        .eq("questao_id", questaoCritica.id)
        .eq("correta", true)
        .maybeSingle()
    : { data: null };
  const { data: explicacaoBanco } = questaoCritica
    ? await admin.from("quiz_questoes").select("explicacao").eq("id", questaoCritica.id).maybeSingle()
    : { data: null };

  const respostaCritica = questaoCritica
    ? {
        pergunta: questaoCritica.pergunta,
        pct: questaoCritica.pctAcerto ?? 0,
        resposta: (gabaritoBanco?.texto as string) ?? "",
        explicacao: ((explicacaoBanco?.explicacao as string) ?? "").trim(),
        origem: questaoCritica.origem,
      }
    : null;

  /**
   * A rodada ainda está NO AR.
   *
   * Mandar o cartaz agora entrega o gabarito a quem não respondeu, e a
   * classificação do mês deixa de valer. O aviso fica na tela, não no
   * cartaz -- quem decide é quem publica.
   */
  const rodadaNoAr = rodadaEscolhida.status === "publicada";

  const porPadrao = acertoPorGrupo(desempenho, (q) => q.origem);
  const porDificuldade = acertoPorGrupo(desempenho, (q) => q.dificuldade);

  const distribuicao = distribuicaoDeAcertos(
    concluidas.map((p) => p.acertos),
    rodadaEscolhida.totalPerguntas,
  );

  const ranking = [...concluidas].sort(
    (a, b) => b.pontos - a.pontos || b.acertos - a.acertos || a.tempo_ms - b.tempo_ms,
  );

  /**
   * Quem não entregou.
   *
   * É o número que vira cobrança, então ele é explícito e nominal: uma
   * "taxa de participação de 64%" não faz ninguém responder o desafio;
   * a lista de quem falta, colada no grupo, faz.
   */
  const jogaram = new Set(concluidas.map((p) => p.colaborador_id));
  const faltantes = elegiveis
    .filter((p) => !jogaram.has(p.id as string))
    .map((p) => (p.nome as string) ?? "sem nome")
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const nomeDaArea = AREAS.find((a) => a.id === rodadaEscolhida.area)?.curto ?? rodadaEscolhida.area;
  const periodo = `${MESES[rodadaEscolhida.mes]}/${rodadaEscolhida.temporada}`;

  return (
    <div>
      <PageHeader
        title="🏆 Desafio do Mês"
        subtitle="O que o time acertou, o que errou e o que isso manda treinar."
        fecharHref="/gestao"
      />

      <FiltroDoDesafio area={areaFiltro} rodadas={rodadas} rodadaId={rodadaEscolhida.id} />

      {/* ---- CABEÇALHO DA RODADA ---- */}
      <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
          {nomeDaArea} · {periodo} · {rodadaEscolhida.status === "encerrada" ? "encerrada" : "no ar"}
        </p>
        <h2 className="mt-1 text-xl font-extrabold">{rodadaEscolhida.nome}</h2>
        {(rodadaEscolhida.padraoNome || rodadaEscolhida.atividade) && (
          <p className="mt-1 text-sm text-white/70">
            {[rodadaEscolhida.padraoNome, rodadaEscolhida.atividade].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="mt-3 text-sm text-white/80">
          {rodadaEscolhida.totalPerguntas} perguntas · {concluidas.length} de {elegiveis.length} pessoas
          concluíram
          {taxaAcertoGeral !== null && ` · ${taxaAcertoGeral}% de acerto`}
        </p>
      </section>

      {/* ---- OS QUATRO NÚMEROS ---- */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CartaoDesafio
          titulo="Participação"
          valor={pctParticipacao === null ? "—" : `${pctParticipacao}%`}
          legenda={`${concluidas.length} de ${elegiveis.length} da área`}
          tom={
            pctParticipacao === null ? "neutro" : pctParticipacao >= 80 ? "bom" : pctParticipacao >= 50 ? "atencao" : "ruim"
          }
        />
        <CartaoDesafio
          titulo="Taxa de acerto"
          valor={taxaAcertoGeral === null ? "—" : `${taxaAcertoGeral}%`}
          legenda={`${totalAcertos} de ${totalRespostas} respostas`}
          tom={tomDoAcerto(taxaAcertoGeral)}
        />
        <CartaoDesafio
          titulo="Perguntas em alerta"
          valor={String(abaixoDoAlerta.length)}
          legenda={`abaixo de ${ALERTA_DE_ACERTO}% de acerto`}
          tom={abaixoDoAlerta.length === 0 ? "bom" : abaixoDoAlerta.length <= 2 ? "atencao" : "ruim"}
        />
        <CartaoDesafio
          titulo="Tempo por pergunta"
          valor={segundosPorPergunta === null ? "—" : `${segundosPorPergunta}s`}
          legenda={chutes.length > 0 ? `${chutes.length} com cheiro de chute` : "média da rodada"}
          tom="neutro"
        />
      </div>

      {/* ---- O CARTAZ PARA O GRUPO ---- */}
      <CartazDoDesafio
        titulo={rodadaEscolhida.nome}
        area={nomeDaArea}
        periodo={periodo}
        participacao={pctParticipacao}
        concluiram={concluidas.length}
        elegiveis={elegiveis.length}
        taxaAcerto={taxaAcertoGeral}
        totalPerguntas={rodadaEscolhida.totalPerguntas}
        podio={ranking.slice(0, 3).map((p) => ({
          nome: p.colaborador_nome,
          pontos: p.pontos,
          acertos: p.acertos,
        }))}
        perguntaCritica={respostaCritica}
        rodadaNoAr={rodadaNoAr}
      />

      {/* ---- O QUE TREINAR ---- */}
      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">🎯 O que treinar</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          As perguntas com menor taxa de acerto. Abaixo de {ALERTA_DE_ACERTO}% a pergunta deixa de ser
          placar e vira pauta: metade do time não sabe o procedimento.
        </p>

        {piores.length === 0 ? (
          <p className="mt-3 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
            Ninguém respondeu esta rodada ainda.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {piores.slice(0, 10).map((q, i) => {
              const tom = tomDoAcerto(q.pctAcerto);
              return (
                <li
                  key={q.id}
                  className={`rounded-xl border p-3 ${
                    tom === "ruim"
                      ? "border-red-200 bg-red-50"
                      : tom === "atencao"
                        ? "border-amber-200 bg-amber-50"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium text-slate-800">
                      <span className="mr-1.5 text-slate-400 tabular-nums">{i + 1}.</span>
                      {q.pergunta}
                    </p>
                    <span
                      className={`shrink-0 rounded-lg px-2 py-0.5 text-sm font-bold tabular-nums ${
                        tom === "ruim"
                          ? "bg-red-100 text-red-700"
                          : tom === "atencao"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-green-100 text-green-700"
                      }`}
                    >
                      {q.pctAcerto}%
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    📄 {q.origem} · {q.dificuldade} · {q.acertos} de {q.respondida} acertaram
                    {q.segundosMedio !== null && ` · ${q.segundosMedio}s em média`}
                    {q.cheiroDeChute && (
                      <span className="ml-1 font-semibold text-amber-700">
                        · ⚡ respondida em menos de {SEGUNDOS_DE_CHUTE}s e errada — cheiro de chute,
                        não de desconhecimento
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- ONDE, E QUEM ---- */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <BarraDeAcerto
          titulo="Acerto por padrão de origem"
          subtitulo="Qual POP a equipe não sabe — do pior para o melhor"
          itens={porPadrao}
        />
        <BarraDeAcerto
          titulo="Acerto por dificuldade cadastrada"
          subtitulo="Uma pergunta 'fácil' com acerto baixo é enunciado ruim ou padrão não treinado — não é a equipe"
          itens={porDificuldade}
        />
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <ColunasDeNota
          titulo="Quantas pessoas tiraram cada nota"
          subtitulo="A média esconde a forma: turma parelha e turma partida ao meio dão a mesma média e pedem ações opostas"
          faixas={distribuicao}
          totalPerguntas={rodadaEscolhida.totalPerguntas}
        />

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">🔔 Quem ainda não entregou</h3>
          <p className="mb-3 mt-0.5 text-xs text-slate-500">
            {faltantes.length} de {elegiveis.length} da área. Uma taxa de participação não faz ninguém
            responder; a lista de nomes, sim.
          </p>
          {faltantes.length === 0 ? (
            <p className="rounded-xl bg-green-50 p-4 text-center text-sm font-semibold text-green-700">
              ✅ Todo mundo entregou.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-slate-700">
              {faltantes.map((nome) => (
                <li key={nome} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                  {nome}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---- CLASSIFICAÇÃO ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">🏅 Classificação da rodada</h2>
          <ExportarCsv
            nome="desafio"
            complemento={`${nomeDaArea}_${periodo.replace("/", "-")}`}
            cabecalho={["Posição", "Colaborador", "Área", "Pontos", "Acertos", "Respondidas", "Tempo (s)"]}
            linhas={ranking.map((p, i) => [
              i + 1,
              p.colaborador_nome,
              p.area,
              p.pontos,
              p.acertos,
              p.respondidas,
              Math.round(p.tempo_ms / 1000),
            ])}
            rotulo="Exportar .csv"
          />
        </div>

        {ranking.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
            Ninguém concluiu esta rodada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Colaborador</th>
                  <th className="p-3 text-right">Acertos</th>
                  <th className="p-3 text-right">Tempo</th>
                  <th className="p-3 text-right">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((p, i) => (
                  <tr key={p.id} className={`border-t border-slate-100 ${i < 3 ? "bg-gold-soft/40" : ""}`}>
                    <td className="p-3 font-bold text-slate-700">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </td>
                    <td className="p-3 font-semibold text-slate-900">{p.colaborador_nome}</td>
                    <td className="p-3 text-right tabular-nums">
                      {p.acertos}/{rodadaEscolhida.totalPerguntas}
                    </td>
                    <td className="p-3 text-right tabular-nums text-slate-500">
                      {Math.round(p.tempo_ms / 1000)}s
                    </td>
                    <td className="p-3 text-right">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-700">
                        {p.pontos}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
