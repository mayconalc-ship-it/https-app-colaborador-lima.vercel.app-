import type { Metadata } from "next";
import { FormChamado } from "@/components/chamados/FormChamado";
import { getPerfil } from "@/lib/sessao";
import { agruparLocais, nomeDoLocal, type Local } from "@/lib/chamados";
import { ChamadosNaoInstalado, lerLocais, resolverCodigo } from "@/lib/chamados-server";
import { abrirPeloQr } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chamado de Manutenção",
  // Página de QR colado na parede: não tem por que aparecer em busca.
  robots: { index: false, follow: false },
};

/**
 * A PÁGINA DO QR CODE -- o substituto do Forms colado nas áreas.
 *
 * Aberta, sem login (o proxy deixa /os/ passar). O código do endereço diz
 * a revenda e, no QR de uma área, a própria área -- quem escaneia na
 * frente do vazamento do vestiário já chega com "Vestiário Masculino"
 * marcado.
 *
 * Quem está com o app logado no celular abre o mesmo formulário, com o
 * nome já preenchido, e o chamado vai para "Meus chamados" dele.
 */
export default async function AbrirPeloQrPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;

  let alvo: Awaited<ReturnType<typeof resolverCodigo>>;
  let locais: Local[];
  try {
    alvo = await resolverCodigo(codigo);
    locais = alvo ? await lerLocais(alvo.revendaId) : [];
  } catch (e) {
    if (!(e instanceof ChamadosNaoInstalado)) throw e;
    alvo = null;
    locais = [];
  }

  if (!alvo) {
    return (
      <Aviso titulo="QR Code inválido">
        Este QR não abre mais chamados. Avise a manutenção que o cartaz precisa ser trocado — ou abra o chamado pelo App do
        Colaborador.
      </Aviso>
    );
  }

  const perfil = await getPerfil();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-5 text-white shadow-md">
        <p className="text-xs font-bold uppercase tracking-wide text-white/80">🔧 Chamado de Manutenção</p>
        <h1 className="mt-1 text-xl font-bold leading-tight">
          {alvo.local ? `Problema em ${nomeDoLocal(alvo.local)}?` : "Viu algo quebrado ou sem funcionar?"}
        </h1>
        <p className="mt-1.5 text-sm text-white/85">
          Conte o que é e, se puder, mande uma foto. Leva menos de um minuto, e você recebe o número do chamado para
          acompanhar.
        </p>
      </div>

      <FormChamado
        acao={abrirPeloQr}
        unidade={alvo.revendaNome}
        locais={agruparLocais(locais).map((g) => ({ titulo: g.titulo, itens: g.itens.map((l) => ({ id: l.id, nome: l.nome })) }))}
        localDoQr={alvo.local ? { id: alvo.local.id, nome: nomeDoLocal(alvo.local) } : undefined}
        nomeInicial={perfil?.nome ?? ""}
        ocultos={{ codigo }}
        publico
      />

      <p className="px-2 text-center text-[11px] text-slate-400">
        Os dados vão só para a equipe de manutenção da {alvo.revendaNome}, para atender o seu pedido.
      </p>
    </div>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-3xl">🔧</p>
      <p className="mt-2 text-base font-bold text-slate-900">{titulo}</p>
      <p className="mt-1 text-sm text-slate-600">{children}</p>
    </div>
  );
}
