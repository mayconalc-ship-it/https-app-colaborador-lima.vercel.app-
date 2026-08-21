import { formatarDiaEHora } from "@/lib/comunicados";

/**
 * O "reloginho" da matéria: leva a data marcada para o calendário do
 * celular do colaborador.
 *
 * Âncora comum, sem JavaScript nenhum. O destino é um arquivo .ics (ver
 * /api/comunicados/[id]/agenda), e é o próprio sistema do telefone que
 * abre o calendário nativo com o convite preenchido -- Android e iPhone,
 * sem conta de Google, sem instalar nada e sem permissão para pedir.
 *
 * O rótulo mostra a data ANTES do toque de propósito: um relógio mudo
 * faria a pessoa abrir o calendário só para descobrir de que dia se
 * trata. Aqui ela já sabe, e o toque é só para não esquecer.
 */
export function BotaoAgenda({
  comunicadoId,
  quando,
}: {
  comunicadoId: number;
  quando: string;
}) {
  return (
    <a
      href={`/api/comunicados/${comunicadoId}/agenda`}
      // O download explícito é o que faz o Android tratar o arquivo como
      // convite em vez de abrir texto cru numa aba.
      download={`comunicado-${comunicadoId}.ics`}
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200"
    >
      ⏰ {formatarDiaEHora(quando)}
      <span className="font-normal text-amber-700">· lembrar no celular</span>
    </a>
  );
}
