import { ROTULO_TURNO } from "@/lib/produtividade-armazem";
import { TIPO_ABASTECIMENTO, ehTipoAbastecimento, formatarHl, formatarMinutos } from "@/lib/abastecimento";
import {
  porDia,
  porHora,
  porPessoa,
  porTipo,
  porTurno,
  resumirAtividade,
  type LinhaDeGrupo,
  type SessaoAnalise,
} from "@/lib/abastecimento-analise";

/**
 * O painel da atividade -- o que a aba de análise tinha de virar.
 *
 * Antes ela era só o ranking de SKU: uma pergunta boa ("qual produto
 * consome mais HL") e uma pergunta só. Quem cuida desta atividade precisa
 * de outras quatro, e nenhuma delas se lê num ranking de produto -- ver o
 * comentário de lib/abastecimento-analise.
 *
 * Sem biblioteca de gráfico: barras são divs com largura proporcional. O
 * app abre no celular do armazém, e um pacote de gráfico custa mais
 * download do que informa.
 */
export function PainelDoAbastecimento({ sessoes }: { sessoes: SessaoAnalise[] }) {
  if (sessoes.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
        Nenhum abastecimento finalizado no período.
      </p>
    );
  }

  const r = resumirAtividade(sessoes);
  const dias = porDia(sessoes);
  const horas = porHora(sessoes);
  const tipos = porTipo(sessoes);
  const turnos = porTurno(sessoes);
  const pessoas = porPessoa(sessoes);

  return (
    <div className="space-y-4">
      {/* ---- Os números do topo ---- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Numero titulo="HL abastecidos" valor={formatarHl(r.hl)} rodape={`${r.sessoes} sessões`} />
        <Numero
          titulo="Taxa média"
          valor={r.hlPorHora === null ? "—" : `${r.hlPorHora.toLocaleString("pt-BR")}`}
          rodape="HL por hora"
        />
        <Numero
          titulo="Média por dia"
          valor={r.hlPorDia === null ? "—" : formatarHl(r.hlPorDia)}
          rodape={`${r.diasComMovimento} dias com movimento`}
        />
        <Numero
          titulo="Duração média"
          valor={r.duracaoMedia === null ? "—" : formatarMinutos(r.duracaoMedia)}
          rodape={`${r.horas.toLocaleString("pt-BR")} h no total`}
        />
      </div>

      {/* Quanto do trabalho já passa pelo fluxo de pedido. É o número que
          diz se o módulo novo pegou -- e o único aqui que fala sobre a
          MUDANÇA, não sobre a operação. */}
      {r.pctDeSolicitacao !== null && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">Abastecimentos vindos de pedido</span>
            <span className="text-xl font-bold tabular-nums text-primary">
              {r.pctDeSolicitacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-primary" style={{ width: `${r.pctDeSolicitacao}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            O resto foi lançado direto, sem passar pela empilhadeira. Não é erro — é o caminho de
            quem completa uma posição sozinho —, mas é nesses que o tempo de espera não é medido.
          </p>
        </div>
      )}

      {/* ---- Completo x Pontual ---- */}
      <Bloco
        titulo="Completo × Pontual"
        ajuda="Nunca somados: uma varredura da manhã de 2 horas é normal, um chamado pontual de 2 horas é um problema."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {tipos.map((t) => {
            const info = ehTipoAbastecimento(t.chave) ? TIPO_ABASTECIMENTO[t.chave] : null;
            return (
              <div key={t.chave} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="text-sm font-bold text-slate-800">
                  {info?.emoji} {info?.curto ?? t.chave}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <Par rotulo="Sessões" valor={String(t.sessoes)} />
                  <Par rotulo="HL" valor={formatarHl(t.hl)} />
                  <Par
                    rotulo="Duração média"
                    valor={t.duracaoMedia === null ? "—" : formatarMinutos(t.duracaoMedia)}
                  />
                  <Par
                    rotulo="HL/h"
                    valor={t.hlPorHora === null ? "—" : t.hlPorHora.toLocaleString("pt-BR")}
                  />
                </dl>
              </div>
            );
          })}
        </div>
      </Bloco>

      {/* ---- Evolução por dia ---- */}
      <Bloco titulo="HL por dia" ajuda="Só os dias que tiveram abastecimento.">
        <Barras
          itens={dias.map((d) => ({
            rotulo: d.dia.slice(8) + "/" + d.dia.slice(5, 7),
            valor: d.hl,
            detalhe: `${d.sessoes} ${d.sessoes === 1 ? "sessão" : "sessões"}`,
          }))}
          sufixo=" HL"
        />
      </Bloco>

      {/* ---- Hora do dia ---- */}
      <Bloco
        titulo="Em que hora o picking pede"
        ajuda="Onde reforçar a equipe. Costuma desmentir a impressão de todo mundo, que lembra do pico e esquece do resto."
      >
        <Barras
          itens={horas.map((h) => ({
            rotulo: `${String(h.hora).padStart(2, "0")}h`,
            valor: h.sessoes,
            detalhe: `${formatarHl(h.hl)} HL`,
          }))}
          sufixo=""
          tom="gold"
        />
      </Bloco>

      {/* ---- Turno ---- */}
      <Bloco titulo="Por turno">
        <div className="grid gap-2 sm:grid-cols-3">
          {turnos.map((t) => (
            <div key={t.chave} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-sm font-bold text-slate-800">
                {ROTULO_TURNO[t.chave as keyof typeof ROTULO_TURNO] ?? t.chave}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <Par rotulo="Sessões" valor={String(t.sessoes)} />
                <Par rotulo="HL" valor={formatarHl(t.hl)} />
                <Par
                  rotulo="HL/h"
                  valor={t.hlPorHora === null ? "—" : t.hlPorHora.toLocaleString("pt-BR")}
                />
                <Par rotulo="Paletes" valor={t.paletes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} />
              </dl>
            </div>
          ))}
        </div>
      </Bloco>

      {/* ---- Quem abastece ---- */}
      <Bloco
        titulo="Quem abastece"
        ajuda="A taxa (HL/h) diz mais que o total: quem trabalhou mais horas soma mais HL sem estar mais rápido."
      >
        <ul className="space-y-2">
          {pessoas.map((p) => (
            <li key={p.colaboradorId} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-slate-800">
                  {p.colaboradorNome}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-primary-dark">
                  {formatarHl(p.hl)} HL
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {p.sessoes} {p.sessoes === 1 ? "sessão" : "sessões"} ·{" "}
                {p.hlPorHora === null ? "sem tempo medido" : `${p.hlPorHora.toLocaleString("pt-BR")} HL/h`} ·{" "}
                {p.itens} {p.itens === 1 ? "item" : "itens"}
                {p.deSolicitacao > 0 && ` · ${p.deSolicitacao} de pedido`}
              </p>
            </li>
          ))}
        </ul>
      </Bloco>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Numero({ titulo, valor, rodape }: { titulo: string; valor: string; rodape?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className="truncate text-[11px] uppercase text-slate-400">{titulo}</p>
      <p className="text-xl font-bold tabular-nums text-slate-900">{valor}</p>
      {rodape && <p className="truncate text-[11px] text-slate-400">{rodape}</p>}
    </div>
  );
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] uppercase text-slate-400">{rotulo}</dt>
      <dd className="truncate font-semibold tabular-nums text-slate-700">{valor}</dd>
    </div>
  );
}

function Bloco({
  titulo,
  ajuda,
  children,
}: {
  titulo: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">{titulo}</h2>
      {ajuda && <p className="mb-3 mt-0.5 text-xs leading-relaxed text-slate-500">{ajuda}</p>}
      {!ajuda && <div className="mb-3" />}
      {children}
    </section>
  );
}

/**
 * Barras proporcionais ao maior valor -- sem biblioteca de gráfico.
 *
 * O rótulo fica FORA da barra, na esquerda, com largura fixa: dentro dele
 * o texto some quando a barra é curta, que é justamente o caso em que a
 * pessoa mais precisa saber de qual dia se trata.
 */
function Barras({
  itens,
  sufixo,
  tom = "primary",
}: {
  itens: { rotulo: string; valor: number; detalhe?: string }[];
  sufixo: string;
  tom?: "primary" | "gold";
}) {
  const maior = Math.max(1, ...itens.map((i) => i.valor));
  const cor = tom === "gold" ? "bg-gold" : "bg-primary";

  return (
    <ul className="space-y-1.5">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex min-w-0 items-center gap-2">
          <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-500">
            {i.rotulo}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block h-5 w-full overflow-hidden rounded bg-slate-100">
              <span
                className={`block h-full rounded ${cor}`}
                style={{ width: `${Math.max(2, (i.valor / maior) * 100)}%` }}
              />
            </span>
          </span>
          <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-600">
            <span className="font-bold">
              {i.valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
              {sufixo}
            </span>
            {i.detalhe && <span className="block text-[10px] text-slate-400">{i.detalhe}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
