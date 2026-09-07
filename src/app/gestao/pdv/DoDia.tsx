import Link from "next/link";
import { MensagemProPdv } from "@/components/pdv/MensagemProPdv";
import { rotuloDoPrazo } from "@/lib/pdv-particularidades";
import type { ClienteDoDia, DiaDasParticularidades } from "@/lib/pdv-particularidades-server";

const brasileira = (iso: string) => iso.split("-").reverse().join("/");

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const porExtenso = (iso: string) =>
  `${DIAS[new Date(`${iso}T12:00:00`).getDay()]}, ${brasileira(iso)}`;

/**
 * O DIA -- o que tratar antes de a carga sair.
 *
 * Pedido do dono (07/09/2026): cruzar as particularidades com a data de
 * entrega, para o monitoramento atuar na preventiva.
 *
 * A TELA É POR ROTA, e não por cliente solto. Quem monitora fala com o
 * motorista da rota, cobra a rota, atrasa a rota: uma lista de clientes
 * fora do mapa obrigaria a pessoa a montar essa conta de cabeça, quinze
 * vezes por manhã.
 *
 * PRIMEIRO O QUE FAZ A CARGA VOLTAR. O bloqueio abre a tela mesmo não indo
 * para o motorista -- cliente bloqueado dentro da rota do dia é carga que
 * sai e volta, e é a informação mais cara aqui.
 */
export function DoDia({
  dia,
  podeEditar,
}: {
  dia: DiaDasParticularidades;
  podeEditar: boolean;
}) {
  const clientes = dia.rotas.flatMap((r) => r.clientes);
  const bloqueios = dia.rotas.flatMap((r) =>
    r.clientes.filter((c) => !c.alertaNaRota).map((c) => ({ mapa: r.mapa, cliente: c })),
  );
  const comMensagem = clientes.filter((c) => c.mensagem).length;

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Numero valor={dia.rotas.length} de={dia.totalDeRotas} rotulo="rotas com aviso" />
        <Numero valor={clientes.length} rotulo="clientes a tratar" />
        <Numero valor={comMensagem} rotulo="com mensagem pronta" />
      </div>

      {/* ---- SEM VÍNCULO NENHUM: dizer o porquê, e o que fazer ---- */}
      {dia.totalDeRotas > 0 && dia.rotasComVinculo === 0 && (
        <p className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs leading-snug text-amber-900">
          ⚠️ As {dia.totalDeRotas} rotas desta data foram importadas <strong>sem a lista de
          clientes</strong>, então não dá para cruzar por código. Reimporte a pré-rota em{" "}
          <strong>Modo Liderança › Minha Rota</strong>: a coluna <em>Clientes</em> da planilha é o
          que liga o cliente ao mapa.
        </p>
      )}

      {dia.totalDeRotas === 0 && (
        <p className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Nenhuma rota importada para {brasileira(dia.data)}.
        </p>
      )}

      {/* ---- O QUE FAZ A CARGA VOLTAR ---- */}
      {bloqueios.length > 0 && (
        <section className="mb-5 rounded-2xl border-2 border-red-300 bg-red-50 p-3">
          <h2 className="text-sm font-bold text-red-900">
            🛑 {bloqueios.length} cliente(s) bloqueado(s) dentro das rotas de hoje
          </h2>
          <p className="mb-2 mt-0.5 text-xs leading-snug text-red-800">
            Se a carga sair, volta. O motorista não vê este aviso — resolver com o comercial antes
            do carregamento é o que evita a devolução.
          </p>
          <ul className="space-y-1.5">
            {bloqueios.map(({ mapa, cliente }) => (
              <li
                key={`${mapa}-${cliente.codPdv}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-2 text-xs"
              >
                <span className="font-semibold text-slate-900">
                  {cliente.nomePdv ?? `Cliente ${cliente.codPdv}`}
                  <span className="ml-1 font-normal text-slate-400">#{cliente.codPdv}</span>
                </span>
                <span className="text-slate-500">mapa {mapa}</span>
                {cliente.diasDePrazo !== null && (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 font-bold text-white">
                    {rotuloDoPrazo(cliente.diasDePrazo)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- AS ROTAS ---- */}
      {dia.totalDeRotas > 0 && dia.rotas.length === 0 && dia.rotasComVinculo > 0 && (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm font-semibold text-emerald-800">
          ✅ Nenhuma das {dia.totalDeRotas} rotas de {porExtenso(dia.data)} tem cliente com
          particularidade.
        </p>
      )}

      <div className="space-y-3">
        {dia.rotas.map((rota) => (
          <section
            key={rota.mapa}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-sm font-bold text-slate-900">Mapa {rota.mapa}</span>
              <span className="text-xs text-slate-500">
                {[rota.veiculo, rota.placa].filter(Boolean).join(" · ") || "sem veículo"}
                {rota.entregas ? ` · ${rota.entregas} entregas` : ""}
              </span>
              <span className="w-full text-[11px] uppercase tracking-wide text-slate-400">
                {rota.cidades.join(" · ") || "sem cidade"} — {rota.clientes.length} a tratar
              </span>
            </header>

            <ul className="divide-y divide-slate-100">
              {rota.clientes.map((c) => (
                <li key={`${rota.mapa}-${c.codPdv}-${c.categoria}`} className="p-3">
                  <Cliente cliente={c} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {podeEditar && (
        <p className="mt-5 text-center text-xs text-slate-400">
          As mensagens prontas são de cada categoria:{" "}
          <Link
            href="/admin/pdv-particularidades"
            className="font-semibold text-primary hover:underline"
          >
            editar no Modo Liderança
          </Link>
        </p>
      )}
    </div>
  );
}

function Cliente({ cliente: c }: { cliente: ClienteDoDia }) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-slate-900">
            {c.emoji} {c.nomePdv ?? `Cliente ${c.codPdv}`}
            <span className="ml-1.5 text-xs font-normal text-slate-400">#{c.codPdv}</span>
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">
            {c.categoria}
            {c.cidade && ` · ${c.cidade}`}
          </p>
        </div>
        {!c.alertaNaRota && (
          <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            🔒 o motorista não vê
          </span>
        )}
      </div>

      <p className="mt-1.5 text-sm leading-snug text-slate-800">{c.aviso}</p>
      {c.detalhe && <p className="mt-0.5 text-xs text-slate-500">{c.detalhe}</p>}

      {(c.horario || c.diasDePrazo !== null) && (
        <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-600">
          {c.horario && <span>⏰ {c.horario}</span>}
          {c.diasDePrazo !== null && (
            <span className={c.diasDePrazo < 0 ? "font-bold text-red-700" : ""}>
              🚫 {rotuloDoPrazo(c.diasDePrazo)}
            </span>
          )}
        </p>
      )}

      {/* A mensagem só aparece quando a categoria tem modelo -- oferecer um
          botão que abre o WhatsApp em branco seria pior que não oferecer. */}
      {c.mensagem && (
        <MensagemProPdv texto={c.mensagem} nome={c.nomePdv ?? `o cliente ${c.codPdv}`} />
      )}
    </>
  );
}

function Numero({
  valor,
  de,
  rotulo,
}: {
  valor: number;
  de?: number;
  rotulo: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className="text-2xl font-bold tabular-nums text-slate-900">
        {valor}
        {de !== undefined && <span className="text-sm font-normal text-slate-400"> / {de}</span>}
      </p>
      <p className="text-xs leading-tight text-slate-500">{rotulo}</p>
    </div>
  );
}
