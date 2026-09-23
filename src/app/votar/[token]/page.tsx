import { createAdminClient } from "@/lib/supabase/admin";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FotoEvidencia } from "@/components/FotoEvidencia";
import { CartaoPratica, type PraticaParaCartao } from "@/components/boas-praticas/CartaoPratica";
import {
  DIGITOS_DO_CPF,
  formatarDia,
  formatarReais,
  hojeSP,
  premiosDe,
  textoDoPrazo,
  votacaoRecebeVoto,
} from "@/lib/boas-praticas";
import { decodificar } from "@/lib/texto-url";
import { votarPeloLink } from "./actions";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, titulo, problema, objetivo, escopo, beneficios, foto_url, colaborador_id, colaborador_nome, criado_em";

/**
 * A VOTAÇÃO PELO LINK DO GRUPO (23/09/2026, pedido do dono).
 *
 * Página ABERTA, para mandar no grupo de WhatsApp: quem tem o link lê as
 * práticas do jeito que foram enviadas no app e vota. Um voto por pessoa,
 * identificada pelo nome e pelos 3 primeiros números do CPF.
 *
 * Só o endereço secreto (token) abre esta tela, e ela não mostra nada
 * além das práticas que já estão em votação -- nem parcial, nem quem
 * votou. O proxy deixa /votar passar sem login.
 */
export default async function VotarPeloLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const admin = createAdminClient();
  const { data: votacao } = await admin
    .from("boas_praticas_votacoes")
    .select("id, revenda_id, titulo, fim, divulgacao_em, encerrada_em, premio_1, premio_2, premio_3")
    .eq("token_publico", token)
    .maybeSingle();

  if (!votacao) {
    return (
      <Aviso titulo="Link inválido">
        Este link não vale mais. Peça o link atual a quem conduz o programa de Boas Práticas.
      </Aviso>
    );
  }

  const hoje = hojeSP();
  const aberta = votacaoRecebeVoto(votacao, hoje);
  const { data: praticasBanco } = await admin
    .from("boas_praticas")
    .select(COLUNAS)
    .eq("revenda_id", votacao.revenda_id)
    .eq("votacao_id", votacao.id)
    .order("criado_em");
  const praticas = (praticasBanco ?? []) as PraticaParaCartao[];
  const premios = premiosDe(votacao);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-5 text-white shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-white/80">💡 Boas Práticas</p>
        <h1 className="mt-1 text-lg font-bold">{votacao.titulo}</h1>
        <p className="mt-2 text-sm text-white/90">⏰ {textoDoPrazo(votacao, hoje)}</p>
        {votacao.divulgacao_em && (
          <p className="text-sm text-white/90">📣 Resultado em {formatarDia(votacao.divulgacao_em)}</p>
        )}
        {premios.some((p) => p.valor != null) && (
          <p className="mt-2 text-sm text-white/90">
            🎁 {premios.map((p) => `${p.medalha} ${formatarReais(p.valor)}`).join(" · ")}
          </p>
        )}
      </div>

      {sp.ok && (
        <p className="rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">✅ {decodificar(sp.ok)}</p>
      )}
      {sp.erro && (
        <p className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700">{decodificar(sp.erro)}</p>
      )}

      {!aberta ? (
        <Aviso titulo="Votação encerrada">
          O prazo para votar acabou
          {votacao.divulgacao_em ? `, e o resultado sai em ${formatarDia(votacao.divulgacao_em)}.` : "."}
        </Aviso>
      ) : praticas.length === 0 ? (
        <Aviso titulo="Nenhuma prática na votação">Fale com quem conduz o programa.</Aviso>
      ) : (
        <form action={votarPeloLink} className="space-y-4">
          <input type="hidden" name="token" value={token} />

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-800">Quem está votando</p>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Seu nome completo</span>
              <input
                name="nome"
                required
                autoComplete="name"
                placeholder="Nome e sobrenome"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                {DIGITOS_DO_CPF} primeiros números do seu CPF
              </span>
              <input
                name="digitos"
                required
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={DIGITOS_DO_CPF}
                placeholder="000"
                className="w-28 rounded-lg border border-slate-300 px-3 py-2.5 text-center font-mono text-lg tabular-nums"
              />
            </label>
            <p className="text-[11px] text-slate-500">
              Só para confirmar que o voto é seu — um voto por pessoa. O CPF inteiro não é pedido nem guardado.
            </p>
          </div>

          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            Estas práticas foram enviadas pelos colegas no app e aprovadas pela liderança. Leia e escolha <b>UMA</b>.
            Não vale votar na própria.
          </p>

          <ul className="space-y-3">
            {praticas.map((p) => (
              // A FOTO FORA DO RECOLHÍVEL (23/09/2026, pedido do dono): quem
              // mandou foto merece que ela seja vista sem abrir o cartão --
              // é ela que explica a ideia em um segundo.
              <CartaoPratica key={p.id} p={p} semFoto>
                {p.foto_url && (
                  <FotoEvidencia
                    src={p.foto_url}
                    alt={`Foto da prática ${p.titulo}`}
                    classeCaixa="h-56 w-full sm:h-72"
                  />
                )}
                <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 hover:border-primary">
                  <input type="radio" name="pratica_id" value={p.id} required className="h-4 w-4 accent-primary" />
                  Votar nesta
                </label>
              </CartaoPratica>
            ))}
          </ul>

          <BotaoEnviar
            textoEnviando="Registrando..."
            className="w-full rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-dark"
          >
            🗳️ Confirmar meu voto
          </BotaoEnviar>
        </form>
      )}
    </div>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-3xl">🗳️</p>
      <p className="mt-2 text-base font-bold text-slate-900">{titulo}</p>
      <p className="mt-1 text-sm text-slate-600">{children}</p>
    </div>
  );
}
