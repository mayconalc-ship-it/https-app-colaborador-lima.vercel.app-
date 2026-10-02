import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { LinkDoGuia } from "@/components/LinkDoGuia";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { MatrizRaci } from "@/components/manutencao/MatrizRaci";
import { exigirRevenda } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { hojeIso } from "@/lib/pesquisa";
import { DIAS_DE_VIGENCIA, dataBr, raciVigente, situacaoDaRevisao } from "@/lib/manutencao-raci";
import { MODULO_MANUTENCAO, ModuloNaoInstalado } from "@/lib/manutencao-server";
import { lerMatriz } from "@/lib/manutencao-raci-server";
import { adicionarAtividade, adicionarPapel, definirLetra, registrarRevisao, removerDaMatriz } from "./actions";
import { AvisoNaoInstalado } from "../AvisoNaoInstalado";

export const dynamic = "force-dynamic";

async function carregar(revendaId: string) {
  try {
    return { tipo: "ok" as const, matriz: await lerMatriz(revendaId) };
  } catch (e) {
    if (e instanceof ModuloNaoInstalado) return { tipo: "nao-instalado" as const };
    throw e;
  }
}

/**
 * RACI DA MANUTENÇÃO -- o V.4: quem executa, quem aprova, quem é
 * consultado e quem é informado, entre as áreas da unidade e os
 * fornecedores externos. Vale 90 dias a partir da revisão registrada.
 */
export default async function RaciPage() {
  await requireAcessoModulo(MODULO_MANUTENCAO);
  const revendaId = await exigirRevenda("/");

  const dados = await carregar(revendaId);
  if (dados.tipo === "nao-instalado") {
    return <AvisoNaoInstalado titulo="🧭 RACI da Manutenção" migration="157 (Fornecedores e RACI)" />;
  }
  const { papeis, atividades, letras, revisoes, problemas } = dados.matriz;

  const situacao = situacaoDaRevisao(revisoes[0]?.revisadaEm ?? null, hojeIso());
  const comProblema = Object.keys(problemas).length;
  const vigente = raciVigente(situacao, comProblema);

  return (
    <div>
      <PageHeader title="🧭 RACI da Manutenção" subtitle="Áreas da unidade × fornecedores externos · DPO 2.2 V.4" fecharHref="/manutencao" />
      <LinkDoGuia slug="revisar-raci-manutencao" className="mb-4" />

      <section
        className={`mb-4 rounded-2xl border-2 p-4 ${
          vigente ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"
        }`}
      >
        <p className={`text-sm font-bold ${vigente ? "text-emerald-900" : "text-amber-900"}`}>
          {vigente
            ? `✅ Vigente até ${situacao.tipo === "em_dia" ? dataBr(situacao.venceEm) : ""}`
            : situacao.tipo === "nunca"
              ? "📝 Sugestão: ainda não foi revista pelo time"
              : situacao.tipo === "vencida"
                ? `⏰ Vencida há ${situacao.dias} dia${situacao.dias === 1 ? "" : "s"}: revise a matriz`
                : `⚠️ Revista, mas com ${comProblema} atividade${comProblema === 1 ? "" : "s"} fora da regra`}
        </p>
        <p className="mt-1 text-xs text-slate-700">
          {revisoes[0]
            ? `Última revisão em ${dataBr(revisoes[0].revisadaEm)} por ${revisoes[0].revisadaPorNome.split(" ")[0]}.`
            : "A matriz abaixo é um ponto de partida. Confira com o time e os fornecedores, ajuste as letras e registre a revisão."}{" "}
          Vale {DIAS_DE_VIGENCIA} dias: revise junto com o Check de Manutenção do trimestre.
        </p>
        {comProblema > 0 && (
          <p className="mt-2 text-xs font-semibold text-red-700">
            {comProblema} atividade{comProblema === 1 ? "" : "s"} sem A único ou sem R. Acerte antes de registrar a revisão.
          </p>
        )}
      </section>

      <MatrizRaci
        papeis={papeis}
        atividades={atividades}
        letras={letras}
        acoes={{ definir: definirLetra, adicionarAtividade, adicionarPapel, remover: removerDaMatriz }}
      />

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">🤝 Registrar a revisão</h2>
        <p className="mt-1 text-xs text-slate-600">
          Depois de conferir a matriz com as áreas e os fornecedores. Fica no histórico para a auditoria.
        </p>
        <FormNoLugar acao={registrarRevisao} limparAoSalvar className="mt-3 space-y-2">
          <textarea
            name="observacao"
            rows={2}
            maxLength={500}
            aria-label="Observação da revisão"
            placeholder="Opcional: quem participou, o que mudou"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <BotaoEnviar textoEnviando="Registrando..." className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">
            ✅ Revisamos a RACI hoje
          </BotaoEnviar>
        </FormNoLugar>
        {revisoes.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 text-xs">
            {revisoes.map((r) => (
              <li key={r.id} className="py-2 text-slate-700">
                <strong>{dataBr(r.revisadaEm)}</strong> · {r.revisadaPorNome}
                {r.observacao && <span className="block text-slate-500">{r.observacao}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-4 text-center text-xs">
        <Link href="/fornecedores" className="font-semibold text-primary">
          📇 Ver a base de fornecedores →
        </Link>
      </p>
    </div>
  );
}
