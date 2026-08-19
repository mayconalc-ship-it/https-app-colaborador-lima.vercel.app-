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
 * O texto de cada senso responde "o que eu faço?", não "o que a palavra
 * significa". Definição de dicionário não muda o que a pessoa faz na
 * segunda-feira -- e é para ela que este texto existe.
 */

const EXPLICACAO: Record<Senso, string> = {
  utilizacao:
    "Na área fica só o que se usa. Quebrado, sobrando ou encostado há meses: tira.",
  organizacao:
    "Cada coisa tem lugar, e o lugar tem placa. Se alguém de fora acha sozinho, está certo.",
  limpeza:
    "Limpar é inspecionar. Quem passa o pano é quem acha o problema antes de ele parar a operação.",
  conservacao:
    "Manter o que já foi arrumado. Piso, luz, tomada e equipamento em ordem, não só no dia da auditoria.",
  disciplina:
    "Virou hábito. Quadro atualizado e as ações da última auditoria feitas de verdade.",
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
          Um jeito de deixar a área boa de trabalhar: sem tranco para achar
          as coisas, sem risco bobo e sem retrabalho. São cinco hábitos, um
          puxando o outro.
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
            Todo mês um colega passa na área e responde 25 perguntas, cada
            uma com <strong>OK</strong>, <strong>NOK</strong> ou{" "}
            <strong>N/A</strong> (quando não se aplica ali). A nota é a
            porcentagem de OK — o que não se aplica não conta nem a favor
            nem contra.
          </p>
          <p className="mt-2 text-sm leading-snug text-slate-600">
            Item NOK não fica só no papel: vira uma tarefa com responsável
            e prazo, e alguém confere depois se foi resolvido mesmo.
          </p>
        </div>

        <p className="text-xs text-slate-400">
          A auditoria não é prova nem caça a culpado. É para achar o que
          atrapalha o dia e tirar da frente.
        </p>
      </div>
    </details>
  );
}
