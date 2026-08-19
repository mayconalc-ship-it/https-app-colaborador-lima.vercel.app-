import { EMOJI_SENSO, JAPONES_SENSO, ROTULO_SENSO, SENSOS, type Senso } from "@/lib/cinco-s";

/**
 * "O que é o 5S?" -- recolhido, num ícone, para quem tiver curiosidade.
 *
 * Fica fechado por padrão e não empurra nada da tela: quem já sabe o que
 * é 5S não precisa ler de novo toda vez que abre o app, e quem não sabe
 * não deveria ter que perguntar para alguém.
 *
 * `details/summary` em vez de modal: é o mesmo recurso que o resto do
 * app usa para recolher bloco, abre sem JavaScript nenhum e continua
 * funcionando se o script falhar.
 *
 * O texto descreve o que cada senso pede na prática, em linguagem
 * direta e neutra -- é material informativo do programa, não peça de
 * campanha interna.
 */

const EXPLICACAO: Record<Senso, string> = {
  utilizacao:
    "Manter na área apenas o que é utilizado. Itens quebrados, sem uso ou em excesso devem ser retirados.",
  organizacao:
    "Definir um lugar para cada item e identificar esse lugar, para que qualquer pessoa encontre o que precisa com facilidade.",
  limpeza:
    "Manter a área limpa no dia a dia, e não apenas realizar limpezas pontuais.",
  conservacao:
    "Conservar em bom estado o que já foi organizado: piso, paredes, iluminação, tomadas, equipamentos e materiais.",
  disciplina:
    "Cumprir os padrões de forma contínua, manter os quadros de gestão à vista atualizados e executar as ações definidas nas auditorias anteriores.",
};

export function OQueEh5S({ aberto = false }: { aberto?: boolean }) {
  return (
    <details
      open={aberto}
      className="group mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary"
          aria-hidden="true"
        >
          ?
        </span>
        <span className="text-sm font-medium text-slate-700">
          O que é o 5S?
        </span>
        <span className="ml-auto text-slate-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="space-y-3 border-t border-slate-100 p-4">
        <p className="text-sm text-slate-600">
          O 5S é um programa de organização do ambiente de trabalho,
          formado por cinco sensos. O objetivo é manter as áreas
          organizadas, limpas e seguras, facilitando o trabalho do dia a
          dia.
        </p>

        <ul className="space-y-2.5">
          {SENSOS.map((s, i) => (
            <li key={s} className="flex gap-2.5">
              <span className="shrink-0 text-lg leading-none" aria-hidden="true">
                {EMOJI_SENSO[s]}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">
                  {i + 1}. {ROTULO_SENSO[s]}
                  <span className="ml-1.5 font-normal text-slate-400">
                    {JAPONES_SENSO[s]}
                  </span>
                </p>
                <p className="text-sm leading-snug text-slate-600">
                  {EXPLICACAO[s]}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Como funciona a auditoria
          </p>
          <p className="mt-1 text-sm leading-snug text-slate-600">
            Todos os meses um auditor avalia a área respondendo 25
            perguntas, cada uma como <strong>OK</strong> (conforme),{" "}
            <strong>NOK</strong> (não conforme) ou <strong>N/A</strong>{" "}
            (não se aplica àquela área). O resultado é o percentual de
            itens conformes; os itens marcados como não aplicáveis ficam
            fora do cálculo.
          </p>
          <p className="mt-2 text-sm leading-snug text-slate-600">
            Cada item não conforme gera uma ação corretiva, com
            responsável e prazo definidos. A conclusão da ação é
            registrada com evidência e validada posteriormente.
          </p>
        </div>

        <p className="text-xs text-slate-400">
          A auditoria tem como objetivo identificar oportunidades de
          melhoria na área, e não avaliar pessoas.
        </p>
      </div>
    </details>
  );
}
