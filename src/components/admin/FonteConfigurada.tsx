import Link from "next/link";
import { estaVelha, tempoDesde } from "@/lib/fontes-de-dados";

/**
 * A faixa que substituiu o formulário de pasta nas telas de importação.
 *
 * A configuração da fonte era editável em quatro telas diferentes, cada
 * uma com o seu layout e o seu texto de ajuda. Agora mora num lugar só
 * (Admin > Fontes de Dados) e aqui fica o ESTADO: qual pasta está
 * ligada, quando entrou pela última vez, e o caminho para trocar.
 *
 * Mostrar o estado em vez de simplesmente remover é o ponto. Quem abre
 * esta tela para importar precisa saber de onde vai vir -- tirar o campo
 * e não colocar nada no lugar transformaria "está apontando para a pasta
 * errada" num erro invisível até a importação sair errada.
 */
export function FonteConfigurada({
  rotulo,
  link,
  ultima,
  observacaoQuandoVazio,
}: {
  rotulo: string;
  link: string | null;
  ultima: string | null;
  /** Para o Refugo, onde "sem link" não é erro: significa usar a pasta
   *  do Rating. Sem isto a faixa acusaria um problema que não existe. */
  observacaoQuandoVazio?: string;
}) {
  const semLink = !link;
  const velha = !semLink && estaVelha(ultima);

  return (
    <div
      className={`mb-5 rounded-2xl border p-4 ${
        semLink && !observacaoQuandoVazio
          ? "border-red-200 bg-red-50"
          : velha
            ? "border-amber-200 bg-amber-50"
            : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          🔌 Fonte dos dados
        </p>
        <Link
          href="/admin/fontes-de-dados"
          className="shrink-0 text-xs font-semibold text-primary hover:underline"
        >
          Configurar em Fontes de Dados →
        </Link>
      </div>

      {semLink ? (
        <p className={`mt-1 text-sm ${observacaoQuandoVazio ? "text-slate-600" : "font-semibold text-red-800"}`}>
          {observacaoQuandoVazio ?? `Nenhuma pasta ligada ao ${rotulo}. A importação não tem de onde ler.`}
        </p>
      ) : (
        <>
          <p className="mt-1 break-all text-xs text-slate-600">{link}</p>
          <p className={`mt-1 text-[11px] ${velha ? "font-semibold text-amber-800" : "text-slate-400"}`}>
            Última entrada: {tempoDesde(ultima)}
            {velha && " — vale conferir se o arquivo novo chegou na pasta."}
          </p>
        </>
      )}
    </div>
  );
}
