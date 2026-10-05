import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { DetalheDoChamado } from "@/components/chamados/DetalheDoChamado";
import { AcoesDoAtendente, Comentar, ConfirmarAtendimento } from "@/components/chamados/AcoesDoChamado";
import { emAberto, protocolo } from "@/lib/chamados";
import {
  ChamadosNaoInstalado,
  contextoChamados,
  lerChamado,
  lerHistorico,
  podeAtenderChamado,
  podeVerChamado,
} from "@/lib/chamados-server";
import {
  aguardarChamado,
  assumirChamado,
  cancelarChamado,
  comentarChamado,
  concluirChamado,
  confirmarNoApp,
  excluirChamado,
  mudarPrioridade,
} from "../actions";

export const dynamic = "force-dynamic";

/**
 * UM CHAMADO: o que foi pedido, em que pé está, e o que cada um pode
 * fazer agora -- o time da manutenção atende, quem pediu confirma.
 */
export default async function ChamadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ novo?: string }>;
}) {
  const ctx = await contextoChamados();
  if (!ctx.ok) redirect(`/?erro=${encodeURIComponent(ctx.erro)}`);
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  let chamado;
  try {
    chamado = await lerChamado(id);
  } catch (e) {
    if (e instanceof ChamadosNaoInstalado) redirect("/chamados");
    throw e;
  }
  if (!chamado || !podeVerChamado(ctx, chamado)) {
    redirect(`/chamados?erro=${encodeURIComponent("Chamado não encontrado.")}`);
  }

  const { eventos, fotos } = await lerHistorico(chamado.id);
  const atende = podeAtenderChamado(ctx, chamado);
  const souQuemPediu = chamado.solicitante_id === ctx.perfil.id;
  const esperandoConfirmacao = chamado.status === "concluido" && !chamado.confirmacao;

  return (
    <div>
      <PageHeader title={`🔧 Chamado ${protocolo(chamado.numero)}`} fecharHref={atende ? "/chamados?aba=fila" : "/chamados?aba=meus"} />

      {sp.novo && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <span className="text-3xl" aria-hidden>
            ✅
          </span>
          <div>
            <p className="font-bold text-emerald-900">Chamado aberto: {protocolo(chamado.numero)}</p>
            <p className="text-sm text-emerald-800">A manutenção foi avisada. Cada passo do atendimento chega no seu sino.</p>
          </div>
        </div>
      )}

      <DetalheDoChamado chamado={chamado} eventos={eventos} fotos={fotos} mostrarTelefone={atende || ctx.podeVerPainel}>
        {souQuemPediu && esperandoConfirmacao && <ConfirmarAtendimento acao={confirmarNoApp} ocultos={{ id: chamado.id }} />}

        {atende && (
          <AcoesDoAtendente
            id={chamado.id}
            status={chamado.status}
            prioridade={chamado.prioridade}
            assumir={assumirChamado}
            aguardar={aguardarChamado}
            concluir={concluirChamado}
            mudarPrioridade={mudarPrioridade}
            cancelar={cancelarChamado}
          />
        )}

        {(atende || souQuemPediu) && chamado.status !== "cancelado" && <Comentar acao={comentarChamado} id={chamado.id} />}

        {souQuemPediu && !atende && chamado.status === "aberto" && (
          <div className="text-right">
            <BotaoNoLugar
              acao={cancelarChamado}
              campos={{ id: chamado.id, motivo: "Aberto por engano." }}
              confirmacao="Cancelar o seu chamado?"
              detalhe="Use quando abriu por engano ou o problema se resolveu sozinho."
              rotuloConfirmar="Cancelar chamado"
              textoEnviando="Cancelando..."
            >
              Cancelar meu chamado
            </BotaoNoLugar>
          </div>
        )}
      </DetalheDoChamado>

      {ctx.podeExcluir && (
        <div className="mt-8 border-t border-slate-200 pt-4 text-right">
          <BotaoNoLugar
            acao={excluirChamado}
            campos={{ id: chamado.id }}
            confirmacao={`Apagar o chamado ${protocolo(chamado.numero)} de vez?`}
            detalhe={
              emAberto(chamado.status)
                ? "Ele ainda está em aberto. Apagar some com o histórico e as fotos -- é para chamado de teste ou aberto por engano."
                : "Some com o histórico e as fotos. É para chamado de teste ou aberto por engano."
            }
            rotuloConfirmar="Apagar"
            textoEnviando="Apagando..."
          >
            🗑️ Apagar chamado
          </BotaoNoLugar>
        </div>
      )}
    </div>
  );
}
