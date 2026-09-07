import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import {
  pendenciasComPrazo,
  rotuloDoHorario,
  rotuloDoPrazo,
  rotuloDosDias,
  valeHoje,
  type Severidade,
} from "@/lib/pdv-particularidades";
import {
  categoriasDaRevenda,
  particularidadesDaRevenda,
  particularidadesDoDia,
  type CategoriaCompleta,
  type ParticularidadeCompleta,
} from "@/lib/pdv-particularidades-server";
import { DoDia } from "./DoDia";

export const dynamic = "force-dynamic";

const brasileira = (iso: string) => iso.split("-").reverse().join("/");

/**
 * PARTICULARIDADES DO PDV -- a visão de quem acompanha.
 *
 * Pedido do dono (07/09/2026): "para que o monitoramento de rota saiba e
 * possa atuar na preventiva. E apenas as configurações precisa estar na
 * liderança".
 *
 * SÓ LEITURA, e isso é a definição da tela, não uma limitação. Quem
 * monitora rota precisa de resposta em segundos, com a carga saindo: um
 * campo editável no meio disso é convite a mexer com pressa no cadastro
 * que a operação inteira lê. Cadastrar continua no Modo Liderança.
 *
 * A ORDEM É A DA PREVENÇÃO. Primeiro o que TEM PRAZO -- o bloqueio que
 * vence hoje é o que faz a carga voltar --, depois o resto por cidade,
 * porque é assim que quem monitora pensa: por rota, e rota é região.
 *
 * O BLOQUEIO APARECE AQUI E NÃO NA ROTA, e é a mesma decisão de sempre:
 * bloqueio é assunto comercial, o motorista não negocia, e comentar na
 * porta do cliente vira ruído. Quem atua na preventiva é quem lê esta
 * tela.
 */
export default async function PainelDePdvPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; aba?: string; data?: string }>;
}) {
  await requireModulo("pdv-particularidades", "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const { busca = "", aba, data } = await searchParams;
  const podeEditar = await podeNoModulo("pdv-particularidades", "editar");

  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  /*
    O DIA É A ABA DE ABERTURA, e não a lista completa.

    Quem abre esta tela está no meio da manhã, com as rotas do dia
    carregando. A pergunta dela nunca é "quais clientes têm alguma
    particularidade?" -- é "o que eu preciso resolver ANTES de a carga
    sair?". A lista completa continua a um toque, para o resto.
  */
  const emDia = aba !== "todos";
  const dataEscolhida = data || hoje;
  if (emDia) {
    const dia = await particularidadesDoDia(revendaId, dataEscolhida);
    return (
      <div>
        <Cabecalho />
        <Abas atual="dia" data={dataEscolhida} />
        <SeletorDeData
          escolhida={dataEscolhida}
          hoje={hoje}
          disponiveis={dia.datasDisponiveis}
        />
        <DoDia dia={dia} podeEditar={podeEditar} />
      </div>
    );
  }

  const [categorias, ativas] = await Promise.all([
    categoriasDaRevenda(revendaId, { incluirInativas: true }),
    particularidadesDaRevenda(revendaId, { status: "ativa" }),
  ]);

  const mapaCategorias = new Map(categorias.map((c) => [c.id, c]));

  const comPrazo = pendenciasComPrazo(ativas, mapaCategorias, hoje);
  const vencidos = comPrazo.filter((p) => p.vencida);

  const termo = busca.trim().toLowerCase();
  const filtradas = termo
    ? ativas.filter(
        (p) =>
          p.codPdv.includes(termo) ||
          (p.nomePdv ?? "").toLowerCase().includes(termo) ||
          (p.cidade ?? "").toLowerCase().includes(termo),
      )
    : ativas;

  // Agrupado por cidade: é a unidade em que quem monitora pensa, porque
  // rota é região. Sem cidade vai para o fim, com o aviso de que aquele
  // cliente não aparece no alerta da pré-rota.
  const porCidade = new Map<string, ParticularidadeCompleta[]>();
  for (const p of filtradas) {
    const chave = (p.cidade ?? "").trim() || "— sem cidade";
    porCidade.set(chave, [...(porCidade.get(chave) ?? []), p]);
  }
  const cidades = [...porCidade.entries()].sort(([a], [b]) => {
    if (a.startsWith("—")) return 1;
    if (b.startsWith("—")) return -1;
    return a.localeCompare(b, "pt-BR");
  });

  const clientes = new Set(ativas.map((p) => p.codPdv)).size;

  return (
    <div>
      <Cabecalho />
      <Abas atual="todos" data={dataEscolhida} />

      <div className="mb-5 grid grid-cols-3 gap-2">
        <Numero valor={clientes} rotulo="clientes com aviso" />
        <Numero valor={comPrazo.length} rotulo="com prazo correndo" />
        <Numero valor={vencidos.length} rotulo="prazos vencidos" alerta={vencidos.length > 0} />
      </div>

      {/* ---- O QUE TEM PRAZO ---- */}
      {comPrazo.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            ⏳ Com prazo correndo
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            Bloqueio vencido é entrega perdida todo dia em que ninguém olha. Quem libera é a
            liderança, no Modo Liderança.
          </p>
          <div className="space-y-2">
            {comPrazo.map(({ particularidade: p, categoria, dias, vencida }) => (
              <div
                key={p.id}
                className={`rounded-2xl border p-3 shadow-sm ${
                  vencida ? "border-red-300 bg-red-50" : "border-amber-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">
                      {categoria.emoji} {p.nomePdv ?? `Cliente ${p.codPdv}`}
                      <span className="ml-1.5 text-xs font-normal text-slate-400">#{p.codPdv}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">{p.aviso}</p>
                    {p.cidade && <p className="mt-0.5 text-[11px] text-slate-400">{p.cidade}</p>}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      vencida ? "bg-red-600 text-white" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {rotuloDoPrazo(dias)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- TODAS, POR CIDADE ---- */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Por cidade ({filtradas.length})
          </h2>
          <form method="get" className="flex gap-2">
            {/* A aba viaja no formulário, senão buscar joga a pessoa de
                volta para a aba do dia. */}
            <input type="hidden" name="aba" value="todos" />
            <input
              name="busca"
              defaultValue={busca}
              placeholder="Código, nome ou cidade"
              className="min-w-[10rem] rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white"
            >
              Buscar
            </button>
            {termo && (
              <Link
                href="/gestao/pdv?aba=todos"
                className="flex items-center px-2 text-sm text-slate-500 hover:text-primary"
              >
                Limpar
              </Link>
            )}
          </form>
        </div>

        {filtradas.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            {termo
              ? "Nenhum cliente com esse termo."
              : "Nenhuma particularidade cadastrada ainda."}
          </p>
        ) : (
          <div className="space-y-4">
            {cidades.map(([cidade, lista]) => (
              <div key={cidade}>
                <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {cidade} · {lista.length}
                </p>
                <div className="space-y-2">
                  {lista.map((p) => (
                    <Linha
                      key={p.id}
                      p={p}
                      categoria={mapaCategorias.get(p.categoriaId)}
                      hoje={hoje}
                    />
                  ))}
                </div>
                {/* Sem cidade o cliente não entra no alerta por região --
                    e quem monitora precisa saber que aquele aviso não está
                    chegando ao motorista. */}
                {cidade.startsWith("—") && (
                  <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
                    ⚠️ Sem cidade, estes avisos não aparecem na pré-rota por região. Eles só chegam
                    ao motorista quando o cliente está na lista do mapa.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* O caminho para configurar, para quem tem a permissão -- e só para
          ela. Sem isso, quem pode editar procuraria o botão nesta tela. */}
      {podeEditar && (
        <p className="mt-5 text-center text-xs text-slate-400">
          Cadastrar, editar ou resolver:{" "}
          <Link
            href="/admin/pdv-particularidades"
            className="font-semibold text-primary hover:underline"
          >
            Modo Liderança › Particularidades do PDV
          </Link>
        </p>
      )}
    </div>
  );
}

function Cabecalho() {
  return (
    <PageHeader
      title="📍 Particularidades do PDV"
      subtitle="O que cada cliente tem de diferente — para agir antes de a carga sair."
    />
  );
}

/**
 * As duas perguntas da tela, separadas: "o que resolver hoje?" e "o que
 * existe cadastrado?". A data viaja entre as abas para quem volta não
 * perder o dia que estava olhando.
 */
function Abas({ atual, data }: { atual: "dia" | "todos"; data: string }) {
  const estilo = (minha: string) =>
    `flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold ${
      atual === minha
        ? "bg-primary text-white shadow-sm"
        : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
    }`;
  return (
    <div className="mb-4 flex gap-2">
      <Link href={`/gestao/pdv?data=${data}`} className={estilo("dia")}>
        📅 O dia
      </Link>
      <Link href={`/gestao/pdv?aba=todos&data=${data}`} className={estilo("todos")}>
        📋 Todos os cadastros
      </Link>
    </div>
  );
}

/**
 * A DATA DA ENTREGA -- a chave da tela inteira.
 *
 * Uma lista das datas que a pré-rota tem, e não um calendário livre:
 * escolher um dia sem rota importada devolve uma tela vazia que parece
 * defeito. Hoje e amanhã ficam como atalho porque são 95% dos usos, e o
 * "amanhã" é onde a preventiva de verdade acontece -- avisar o cliente na
 * véspera vale mais do que avisar com o caminhão na rua.
 */
function SeletorDeData({
  escolhida,
  hoje,
  disponiveis,
}: {
  escolhida: string;
  hoje: string;
  disponiveis: string[];
}) {
  const amanha = new Date(`${hoje}T12:00:00`);
  amanha.setDate(amanha.getDate() + 1);
  const iso = amanha.toISOString().slice(0, 10);
  const atalhos = [
    { rotulo: "Hoje", valor: hoje },
    { rotulo: "Amanhã", valor: iso },
  ];

  return (
    <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex gap-1.5">
        {atalhos.map((a) => (
          <Link
            key={a.valor}
            href={`/gestao/pdv?data=${a.valor}`}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              escolhida === a.valor
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
      </div>
      <select
        name="data"
        defaultValue={escolhida}
        className="min-w-[9rem] flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
      >
        {!disponiveis.includes(escolhida) && (
          <option value={escolhida}>{brasileira(escolhida)} — sem rota importada</option>
        )}
        {disponiveis.map((d) => (
          <option key={d} value={d}>
            {brasileira(d)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white"
      >
        Ver
      </button>
    </form>
  );
}

function Linha({
  p,
  categoria,
  hoje,
}: {
  p: ParticularidadeCompleta;
  categoria: CategoriaCompleta | undefined;
  hoje: string;
}) {
  const severidade: Severidade = categoria?.severidade ?? "atencao";
  const horario = rotuloDoHorario(p.janelas);
  const dias = rotuloDosDias(p.diasSemana);
  const valendo = valeHoje(p, hoje);

  return (
    <div
      className={`rounded-2xl border bg-white p-3 shadow-sm ${
        severidade === "critico"
          ? "border-l-4 border-l-red-500 border-slate-200"
          : severidade === "atencao"
            ? "border-l-4 border-l-amber-500 border-slate-200"
            : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">
            {categoria?.emoji} {p.nomePdv ?? `Cliente ${p.codPdv}`}
            <span className="ml-1.5 text-xs font-normal text-slate-400">#{p.codPdv}</span>
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">
            {categoria?.nome ?? "categoria apagada"}
            {p.bairro && ` · ${p.bairro}`}
          </p>
        </div>
        {categoria && !categoria.alertaNaRota && (
          <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            🔒 só a liderança vê
          </span>
        )}
      </div>

      <p className="mt-1.5 text-sm leading-snug text-slate-800">{p.aviso}</p>
      {p.detalhe && <p className="mt-1 text-xs text-slate-500">{p.detalhe}</p>}

      {(horario || dias || p.ate) && (
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          {horario && <span>⏰ {horario}</span>}
          {dias && <span>📅 {dias}</span>}
          {p.ate && <span>🚫 até {brasileira(p.ate)}</span>}
        </p>
      )}

      {/* Fora da janela de datas, o aviso existe mas não está valendo hoje
          -- dizer isso evita a ligação para o cliente sobre um bloqueio
          que já terminou. */}
      {!valendo && (
        <p className="mt-1.5 text-[11px] font-medium text-slate-400">
          Fora do período — não está valendo hoje.
        </p>
      )}
    </div>
  );
}

function Numero({
  valor,
  rotulo,
  alerta = false,
}: {
  valor: number;
  rotulo: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 text-center shadow-sm ${
        alerta && valor > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
      }`}
    >
      <p
        className={`text-2xl font-bold tabular-nums ${
          alerta && valor > 0 ? "text-red-700" : "text-slate-900"
        }`}
      >
        {valor}
      </p>
      <p className="text-xs leading-tight text-slate-500">{rotulo}</p>
    </div>
  );
}
