import { frasesDoEvento } from "@/components/chamados/DetalheDoChamado";
import {
  dataHoraCompleta,
  protocolo,
  rotuloPrioridade,
  rotuloStatus,
  rotuloTipo,
  situacaoDoPrazo,
  textoDoPrazo,
} from "@/lib/chamados";
import type { Chamado, Evento, FotoChamado } from "@/lib/chamados-server";

/**
 * O CHAMADO EM PDF (07/10/2026, pedido do dono) -- a Ordem de Serviço numa
 * folha A4.
 *
 * Mesma impressão do Relato de Anomalia e do cartaz do QR (globals.css,
 * @media print): sem biblioteca de PDF, o "⬇️ Baixar em PDF" abre o
 * "Salvar como PDF" do navegador. A folha fica escondida na tela
 * (`hidden`) e só ela vai para o papel (`folha so-no-papel`); a tela do
 * chamado, que é feita para o celular, fica de fora (`so-na-tela`).
 *
 * As linhas de assinatura no fim são de propósito: a O.S. impressa é o
 * que a manutenção leva para o serviço e devolve assinada.
 */
export function FolhaDoChamado({
  chamado: c,
  unidade,
  eventos,
  fotos,
  mostrarTelefone = false,
}: {
  chamado: Chamado;
  unidade: string;
  eventos: Evento[];
  fotos: FotoChamado[];
  /** O telefone de quem abriu: só na folha de quem pode vê-lo na tela. */
  mostrarTelefone?: boolean;
}) {
  const daAbertura = fotos.filter((f) => f.etapa === "abertura" && f.url);
  const daConclusao = fotos.filter((f) => f.etapa === "conclusao" && f.url);
  const prazo = textoDoPrazo(situacaoDoPrazo(c));
  const emitidoEm = dataHoraCompleta(new Date().toISOString());

  const campos: [string, string][] = [
    ["Unidade", unidade],
    ["Área", c.local_nome],
    ["Tipo de serviço", rotuloTipo(c.tipo)],
    ["Prioridade", rotuloPrioridade(c.prioridade)],
    ["Situação", rotuloStatus(c.status) + (c.confirmacao === "resolvido" ? " · confirmado por quem pediu" : "")],
    ["Aberto em", `${dataHoraCompleta(c.aberto_em)}${c.origem === "qr" ? " · pelo QR Code" : " · pelo app"}`],
    ["Prazo", `${dataHoraCompleta(c.prazo_em)}${prazo ? ` · ${prazo}` : ""}`],
    ["Pedido por", mostrarTelefone ? `${c.solicitante_nome} · ${c.solicitante_telefone}` : c.solicitante_nome],
  ];
  if (c.responsavel_nome) campos.push(["Quem está cuidando", c.responsavel_nome]);
  if (c.atendimento_em) campos.push(["Assumido em", dataHoraCompleta(c.atendimento_em)]);
  if (c.concluido_em) campos.push(["Concluído em", dataHoraCompleta(c.concluido_em)]);
  if (c.reaberturas > 0) campos.push(["Reaberto", c.reaberturas === 1 ? "1 vez" : `${c.reaberturas} vezes`]);
  if (c.avaliacao) campos.push(["Nota de quem pediu", `${c.avaliacao} de 5${c.avaliacao_comentario ? ` · “${c.avaliacao_comentario}”` : ""}`]);

  return (
    <div className="folha so-no-papel hidden bg-white text-slate-900">
      <header className="bloco-do-relato flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-2">
        <div>
          <h1 className="text-lg font-bold uppercase tracking-wide">Chamado para Manutenção</h1>
          <p className="text-xs text-slate-500">Ordem de Serviço · {unidade}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-extrabold">{protocolo(c.numero)}</p>
          <p className="text-[10px] text-slate-500">Emitido em {emitidoEm}</p>
        </div>
      </header>

      <table className="bloco-do-relato mt-3 w-full border-collapse text-left">
        <tbody>
          {campos.map(([rotulo, valor]) => (
            <tr key={rotulo} className="border-b border-slate-200">
              <th className="w-40 py-1 pr-3 align-top font-semibold text-slate-500">{rotulo}</th>
              <td className="py-1 align-top">{valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="bloco-do-relato mt-3">
        <h2 className="font-bold uppercase tracking-wide text-slate-700">Descrição do problema</h2>
        <p className="mt-1 whitespace-pre-wrap rounded border border-slate-300 p-2">{c.descricao}</p>
        {daAbertura.length > 0 && <Fotos fotos={daAbertura} titulo="Foto do problema" />}
      </section>

      {c.solucao && (
        <section className="bloco-do-relato mt-3">
          <h2 className="font-bold uppercase tracking-wide text-slate-700">O que foi feito</h2>
          <p className="mt-1 whitespace-pre-wrap rounded border border-slate-300 p-2">{c.solucao}</p>
          {daConclusao.length > 0 && <Fotos fotos={daConclusao} titulo="Foto do serviço pronto" />}
        </section>
      )}

      {eventos.length > 0 && (
        <section className="bloco-do-relato mt-3">
          <h2 className="font-bold uppercase tracking-wide text-slate-700">Andamento</h2>
          <ol className="mt-1 space-y-0.5">
            {eventos.map((e) => (
              <li key={e.id}>
                <span className="font-mono text-slate-500">{dataHoraCompleta(e.criado_em)}</span> · {frasesDoEvento(e)}
                {e.texto && e.tipo !== "avaliado" ? <span className="text-slate-600"> — {e.texto}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="bloco-do-relato mt-8 grid grid-cols-2 gap-8">
        {["Responsável pela execução", "Solicitante"].map((quem) => (
          <div key={quem}>
            <p className="border-b border-slate-500 pb-6" />
            <p className="mt-1 text-center text-[10px] text-slate-500">
              {quem} · data: ____/____/______
            </p>
          </div>
        ))}
      </section>

      <p className="mt-4 text-center text-[9px] text-slate-400">
        App do Colaborador Lima · Chamado {protocolo(c.numero)} · {unidade}
      </p>
    </div>
  );
}

function Fotos({ fotos, titulo }: { fotos: FotoChamado[]; titulo: string }) {
  return (
    <div className="mt-2 grid grid-cols-4 gap-2">
      {fotos.map((f, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- link assinado do bucket privado, fora do otimizador
        <img
          key={f.id}
          src={f.url!}
          alt={`${titulo} ${i + 1}`}
          className="aspect-square w-full rounded border border-slate-300 object-cover"
        />
      ))}
    </div>
  );
}
