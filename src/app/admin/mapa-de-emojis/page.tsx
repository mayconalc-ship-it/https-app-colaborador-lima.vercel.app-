import { PageHeader } from "@/components/PageHeader";
import { Icone } from "@/components/Icone";
import { requireOwner } from "@/lib/require-admin";
import { MAPA_DE_EMOJIS, type Assunto } from "@/lib/mapa-emojis";

/**
 * O MAPA DE EMOJIS, à vista (ver lib/mapa-emojis).
 *
 * Um assunto, um emoji. Onde nenhum emoji serve, o desenho próprio --
 * e ele aparece em todo o app: cartão, menu, título, aba e botão.
 */
export default async function MapaDeEmojisPage() {
  await requireOwner();
  const areas = [...new Set(MAPA_DE_EMOJIS.map((a) => a.area))];
  const porArea = (area: Assunto["area"]) => MAPA_DE_EMOJIS.filter((a) => a.area === area);

  return (
    <div className="space-y-4">
      <PageHeader title="🎨 Mapa de emojis" subtitle="Cada assunto do app tem um emoji só — e nenhum emoji serve a dois assuntos." />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
        <p>
          <strong>Como ler:</strong> a coluna <strong>No app</strong> é o que aparece no cartão, no menu e dentro da tela. Quando não
          existe emoji que sirva, o assunto tem um <strong>desenho próprio</strong> (em azul). A coluna <strong>Em aviso</strong> é o
          emoji usado onde desenho não entra: notificação no celular e texto copiado para o WhatsApp.
        </p>
      </section>

      {areas.map((area) => (
        <section key={area} className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">{area}</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {porArea(area).map((a) => (
              <li key={a.id} className="flex items-center gap-3 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icone chave={a.chaves[0] ?? ""} emoji={a.emoji} tamanho={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{a.nome}</span>
                  {a.desenho && <span className="block text-xs text-primary">desenho próprio</span>}
                </span>
                <span className="shrink-0 text-right text-xs text-slate-500">
                  Em aviso
                  <span className="block text-xl leading-none">{a.emoji}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
