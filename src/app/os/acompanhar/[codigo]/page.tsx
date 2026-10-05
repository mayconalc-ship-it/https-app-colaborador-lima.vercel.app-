import type { Metadata } from "next";
import Link from "next/link";
import { DetalheDoChamado } from "@/components/chamados/DetalheDoChamado";
import { CompartilharAcompanhamento, ConfirmarAtendimento } from "@/components/chamados/AcoesDoChamado";
import { getPerfil } from "@/lib/sessao";
import { protocolo } from "@/lib/chamados";
import { ChamadosNaoInstalado, lerChamadoPorCodigo, lerHistorico } from "@/lib/chamados-server";
import { confirmarPeloLink } from "../../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acompanhar chamado",
  robots: { index: false, follow: false },
};

/**
 * O ACOMPANHAMENTO DE QUEM ABRIU SEM LOGIN.
 *
 * O código do endereço é o segredo: só quem abriu o recebe (na tela do
 * "chamado aberto"), e é por ele que a pessoa vê o andamento e confirma
 * se resolveu. O telefone dela não aparece aqui -- o link pode ser
 * repassado.
 */
export default async function AcompanharChamadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ novo?: string }>;
}) {
  const [{ codigo }, sp] = await Promise.all([params, searchParams]);

  let chamado = null;
  try {
    chamado = await lerChamadoPorCodigo(codigo);
  } catch (e) {
    if (!(e instanceof ChamadosNaoInstalado)) throw e;
  }

  if (!chamado) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-3xl">🔧</p>
        <p className="mt-2 text-base font-bold text-slate-900">Chamado não encontrado</p>
        <p className="mt-1 text-sm text-slate-600">Confira o link. Se o chamado foi apagado, abra outro pelo QR Code da área.</p>
      </div>
    );
  }

  const [{ eventos, fotos }, perfil] = await Promise.all([lerHistorico(chamado.id), getPerfil()]);
  const esperandoConfirmacao = chamado.status === "concluido" && !chamado.confirmacao;

  return (
    <div className="space-y-4">
      {sp.novo ? (
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-5 text-center text-white shadow-md">
          <p className="text-4xl" aria-hidden>
            ✅
          </p>
          <p className="mt-1 text-sm font-semibold text-white/90">Chamado aberto! Anote o número:</p>
          <p className="mt-1 font-mono text-4xl font-extrabold tracking-wider">{protocolo(chamado.numero)}</p>
          <p className="mt-2 text-sm text-white/90">A equipe de manutenção já foi avisada.</p>
        </div>
      ) : (
        <h1 className="text-2xl font-bold text-slate-900">🔧 Chamado {protocolo(chamado.numero)}</h1>
      )}

      {!chamado.solicitante_id && <CompartilharAcompanhamento protocolo={protocolo(chamado.numero)} local={chamado.local_nome} />}

      {chamado.solicitante_id && perfil?.id === chamado.solicitante_id && (
        <Link
          href={`/chamados/${chamado.id}`}
          className="block rounded-2xl border border-primary/30 bg-primary-soft/50 p-3 text-center text-sm font-semibold text-primary-dark"
        >
          Este chamado está no seu app, em Chamado de Manutenção › Meus →
        </Link>
      )}

      <DetalheDoChamado chamado={chamado} eventos={eventos} fotos={fotos}>
        {esperandoConfirmacao && <ConfirmarAtendimento acao={confirmarPeloLink} ocultos={{ codigo: chamado.codigo }} />}
      </DetalheDoChamado>
    </div>
  );
}
