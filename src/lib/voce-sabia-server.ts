import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { areaDoColaborador } from "@/lib/quiz";
import type { AreaId } from "@/lib/areas";
import {
  diaDaOperacao,
  escolherDica,
  pctDeAcerto,
  type Candidata,
  type Dica,
} from "@/lib/voce-sabia";

/**
 * O que a lâmpada precisa saber, montado do banco.
 *
 * Chave de serviço porque a tabela de vistos tem RLS sem política -- e
 * porque a leitura cruza o que a PESSOA errou com o acervo da revenda.
 * Quem garante que é a pessoa certa é quem chama, no layout, com o id da
 * própria sessão.
 */

export type EstadoDaLampada = {
  dica: Dica;
  /** Já foi vista hoje? Então a lâmpada não pisca -- ela só continua
   *  disponível para quem quiser reler. */
  jaVistaHoje: boolean;
  curtiu: boolean;
  areaCurta: string;
};

const ROTULO_CURTO: Record<AreaId, string> = {
  DU: "Distribuição",
  AL: "Armazém",
};

export async function getDicaDoDia(
  colaboradorId: string,
  revendaId: string,
): Promise<EstadoDaLampada | null> {
  const admin = createAdminClient();

  const { data: perfil } = await admin
    .from("profiles")
    .select("area")
    .eq("id", colaboradorId)
    .maybeSingle();

  // Quem não é de Distribuição nem de Armazém (FINANCEIRO, GENTE) não tem
  // desafio e não tem o que revisar. A lâmpada fica apagada em vez de
  // cair na área errada -- medido em 03/09/2026, são 5 pessoas.
  const area = areaDoColaborador(perfil?.area);
  if (!area) return null;

  const [{ data: vistos }, { data: minhasParticipacoes }] = await Promise.all([
    admin
      .from("voce_sabia_vistos")
      .select("questao_id, visto_em, curtiu")
      .eq("colaborador_id", colaboradorId)
      .order("visto_em", { ascending: false }),
    admin
      .from("quiz_participacoes")
      .select("id")
      .eq("colaborador_id", colaboradorId),
  ]);

  const vistas = new Set((vistos ?? []).map((v) => v.questao_id as number));

  // O card de hoje, se já houve um. Ele continua sendo mostrado o dia
  // inteiro: sem isso, recarregar a tela logo depois de ler faria o card
  // sumir, e quem só passou o olho perderia a explicação.
  const hoje = diaDaOperacao();
  const deHoje = (vistos ?? []).find(
    (v) => diaDaOperacao(new Date(v.visto_em as string)) === hoje,
  );

  const idsParticipacao = (minhasParticipacoes ?? []).map((p) => p.id as number);

  // O que ESTA pessoa errou. Filtrado pelas participações dela, então a
  // consulta é pequena por construção -- e não corre o risco do corte de
  // 1000 linhas que uma varredura de quiz_respostas teria (já são 510 no
  // total em 03/09/2026, e só crescem).
  let errei = new Set<number>();
  if (idsParticipacao.length > 0) {
    const { data: respostas } = await admin
      .from("quiz_respostas")
      .select("questao_id")
      .in("participacao_id", idsParticipacao)
      .eq("correta", false);
    errei = new Set((respostas ?? []).map((r) => r.questao_id as number));
  }

  // O acervo da área. `acertos`/`erros` são os contadores mantidos a cada
  // resposta (migration 029) -- e não uma soma de quiz_respostas, que
  // seria a consulta que estoura o limite de 1000 linhas daqui a alguns
  // meses, calada.
  const { data: questoes } = await admin
    .from("quiz_questoes")
    .select("id, pergunta, explicacao, area, acertos, erros")
    .eq("revenda_id", revendaId)
    .eq("area", area)
    .eq("status", "ativa");

  const doAcervo = questoes ?? [];
  if (doAcervo.length === 0) return null;

  // Só perguntas que alguém já respondeu: uma pergunta em rascunho não
  // ensinou nada a ninguém ainda, e revelá-la aqui entregaria a resposta
  // de uma rodada que ainda vai acontecer. Este filtro é o que impede o
  // "Você sabia?" de virar cola do desafio do mês.
  const respondidas = doAcervo.filter(
    (q) => (q.acertos ?? 0) + (q.erros ?? 0) > 0,
  );
  if (respondidas.length === 0) return null;

  // A resposta certa, para o balão poder mostrá-la. Uma consulta só, para
  // todas as questões da área.
  const { data: alternativas } = await admin
    .from("quiz_alternativas")
    .select("questao_id, texto")
    .in(
      "questao_id",
      respondidas.map((q) => q.id),
    )
    .eq("correta", true);

  const respostaCerta = new Map<number, string>(
    (alternativas ?? []).map((a) => [a.questao_id as number, a.texto as string]),
  );

  const candidatas: Candidata[] = respondidas
    // Sem alternativa correta cadastrada não há o que mostrar -- e um
    // balão com a pergunta e sem a resposta é pior que balão nenhum.
    .filter((q) => respostaCerta.has(q.id as number))
    .map((q) => ({
      questaoId: q.id as number,
      pergunta: q.pergunta as string,
      resposta: respostaCerta.get(q.id as number)!,
      explicacao: (q.explicacao as string) ?? "",
      area: q.area as AreaId,
      acertos: (q.acertos as number) ?? 0,
      erros: (q.erros as number) ?? 0,
      euErrei: errei.has(q.id as number),
    }));

  const areaCurta = ROTULO_CURTO[area];

  if (deHoje) {
    const c = candidatas.find((x) => x.questaoId === deHoje.questao_id);
    if (!c) return null; // a pergunta saiu do ar depois de vista
    return {
      dica: {
        ...c,
        motivo: c.euErrei ? "meu_erro" : "area_erra",
        pctAcerto: pctDeAcerto(c.acertos, c.erros),
      },
      jaVistaHoje: true,
      curtiu: Boolean(deHoje.curtiu),
      areaCurta,
    };
  }

  const dica = escolherDica(candidatas, vistas);
  if (!dica) return null;

  return { dica, jaVistaHoje: false, curtiu: false, areaCurta };
}
