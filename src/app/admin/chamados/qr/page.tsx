import { QrDoLink } from "@/components/QrDoLink";
import { BotaoImprimir } from "@/components/anomalia/BotaoImprimir";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda, getRevendaAtiva } from "@/lib/revendas";
import { MODULO_CHAMADOS, nomeDoLocal } from "@/lib/chamados";
import { lerConfig, lerLocais, origemDoSite } from "@/lib/chamados-server";

export const dynamic = "force-dynamic";

/**
 * OS CARTAZES DO QR CODE -- dois por folha A4, para recortar e colar.
 *
 * É a mesma impressão do navegador do Relato de Anomalia (globals.css,
 * @media print): só a `.folha` vai para o papel. O QR sai com correção
 * "Q", que ainda lê com um quarto dele riscado ou empoeirado -- cartaz de
 * armazém não fica limpo por muito tempo.
 *
 *   ?local=<id>  o cartaz de uma área
 *   ?geral=1     o cartaz do QR geral
 *   (nada)       o geral e todas as áreas ligadas
 */
export default async function CartazesQrPage({ searchParams }: { searchParams: Promise<{ local?: string; geral?: string }> }) {
  await requireModulo(MODULO_CHAMADOS, "editar");
  const revendaId = await exigirRevenda("/admin");
  const sp = await searchParams;
  const [config, locais, site, revenda] = await Promise.all([lerConfig(revendaId), lerLocais(revendaId), origemDoSite(), getRevendaAtiva()]);

  const cartazes: { chave: string; titulo: string; url: string }[] = [];
  if (sp.geral || (!sp.local && !sp.geral)) {
    cartazes.push({ chave: "geral", titulo: "", url: `${site.origem}/os/${config.tokenPublico}` });
  }
  if (!sp.geral) {
    for (const l of locais.filter((x) => !sp.local || x.id === sp.local)) {
      cartazes.push({ chave: l.id, titulo: nomeDoLocal(l), url: `${site.origem}/os/${l.codigo}` });
    }
  }

  return (
    <div>
      <div className="so-na-tela mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-sm text-slate-600">
          {cartazes.length} {cartazes.length === 1 ? "cartaz" : "cartazes"} · dois por folha A4
        </p>
        <BotaoImprimir />
      </div>
      {site.local && (
        <p className="so-na-tela mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ Endereço de teste: estes QR Codes não abrem no celular de ninguém. Imprima pelo app publicado.
        </p>
      )}

      <div className="folha mx-auto max-w-3xl space-y-4">
        {cartazes.map((c) => (
          <div
            key={c.chave}
            style={{ breakInside: "avoid", pageBreakInside: "avoid", height: "132mm" }}
            className="flex flex-col items-center justify-between rounded-3xl border-2 border-dashed border-slate-300 bg-white p-6 text-center"
          >
            <div>
              <p style={{ fontSize: "22pt" }} className="font-extrabold leading-tight text-[#0b4da2]">
                🔧 Chamado de Manutenção
              </p>
              <p style={{ fontSize: "13pt" }} className="mt-1 font-semibold text-slate-700">
                Viu algo quebrado, vazando ou sem funcionar?
              </p>
            </div>

            <QrDoLink url={c.url} rotulo={`QR Code ${c.titulo || "geral"}`} nivel="Q" className="h-[62mm] w-[62mm]" />

            <div>
              {c.titulo ? (
                <p style={{ fontSize: "17pt" }} className="font-bold text-slate-900">
                  📍 {c.titulo}
                </p>
              ) : (
                <p style={{ fontSize: "14pt" }} className="font-bold text-slate-900">
                  Aponte a câmera do celular e escolha a área
                </p>
              )}
              <p style={{ fontSize: "11pt" }} className="mt-1 text-slate-600">
                Aponte a câmera, conte o problema e acompanhe pelo número do chamado.
              </p>
              <p style={{ fontSize: "9pt" }} className="mt-1 text-slate-400">
                {revenda?.nome ?? ""} · não precisa de login
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
