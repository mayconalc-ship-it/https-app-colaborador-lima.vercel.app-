import { QrDoLink } from "@/components/QrDoLink";
import { BotaoImprimir } from "@/components/anomalia/BotaoImprimir";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda, getRevendaAtiva } from "@/lib/revendas";
import { MODULO_CHAMADOS } from "@/lib/chamados";
import { lerConfig, origemDoSite } from "@/lib/chamados-server";

export const dynamic = "force-dynamic";

/**
 * O CARTAZ DO QR CODE -- uma folha A4, o mesmo cartaz em quantos lugares
 * a unidade quiser. UM QR só por revenda, como era o Forms (pedido do
 * dono, 05/10/2026).
 *
 * É a mesma impressão do navegador do Relato de Anomalia (globals.css,
 * @media print): só a `.folha` vai para o papel. O QR sai com correção
 * "Q", que ainda lê com um quarto dele riscado ou empoeirado -- cartaz de
 * armazém não fica limpo por muito tempo.
 */
export default async function CartazQrPage() {
  await requireModulo(MODULO_CHAMADOS, "editar");
  const revendaId = await exigirRevenda("/admin");
  const [config, site, revenda] = await Promise.all([lerConfig(revendaId), origemDoSite(), getRevendaAtiva()]);
  const url = `${site.origem}/os/${config.tokenPublico}`;

  return (
    <div>
      <div className="so-na-tela mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-sm text-slate-600">Uma folha A4. Imprima quantas cópias precisar: é o mesmo QR em todos os lugares.</p>
        <BotaoImprimir />
      </div>
      {site.local && (
        <p className="so-na-tela mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ Endereço de teste: este QR Code não abre no celular de ninguém. Imprima pelo app publicado.
        </p>
      )}

      <div className="folha mx-auto max-w-3xl">
        <div
          style={{ height: "265mm" }}
          className="flex flex-col items-center justify-between rounded-3xl border-4 border-[#0b4da2] bg-white p-10 text-center"
        >
          <div>
            <p style={{ fontSize: "34pt" }} className="font-extrabold leading-tight text-[#0b4da2]">
              🔧 Chamado de Manutenção
            </p>
            <p style={{ fontSize: "18pt" }} className="mt-3 font-semibold text-slate-700">
              Viu algo quebrado, vazando ou sem funcionar?
            </p>
          </div>

          <QrDoLink url={url} rotulo="QR Code dos chamados de manutenção" nivel="Q" className="h-[110mm] w-[110mm]" />

          <div>
            <p style={{ fontSize: "20pt" }} className="font-bold text-slate-900">
              Aponte a câmera do celular
            </p>
            <p style={{ fontSize: "14pt" }} className="mt-2 text-slate-600">
              Escolha a área, conte o problema e mande uma foto.
              <br />
              Você recebe o número do chamado para acompanhar.
            </p>
            <p style={{ fontSize: "11pt" }} className="mt-4 text-slate-400">
              {revenda?.nome ?? ""} · não precisa de login
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
