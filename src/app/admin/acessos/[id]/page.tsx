import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { exigirTelaDeAcessos } from "@/lib/gestao-de-acessos-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMOJI_GRUPO_ADMIN, ROTULO_PAPEL, rotuloDaAcaoNoModulo, type Papel } from "@/lib/acessos";
import { simularAcesso } from "@/lib/simulacao-acesso";

export const dynamic = "force-dynamic";

/**
 * "VER COMO ESTA PESSOA VÊ".
 *
 * A tela de Acessos responde a pergunta de ENTRADA -- "quem tem o módulo
 * X?". Esta responde a de SAÍDA -- "o que esta pessoa enxerga?" --, que é
 * a que se faz antes de salvar e a que não tinha resposta: a única
 * conferência possível era entrar na conta de alguém.
 *
 * TUDO AQUI VEM DAS MESMAS FUNÇÕES DAS TELAS REAIS (ver
 * lib/simulacao-acesso.ts). Nenhuma regra é reescrita -- prévia com
 * lógica própria mente na primeira mudança.
 *
 * A MESMA PORTA de /admin/acessos: o Admin, ou a liderança que gerencia
 * os acessos daquela revenda (11/09/2026) -- e, para ela, só gente
 * vinculada à revenda. Ver o que outra pessoa enxerga é informação sobre
 * ela.
 */
export default async function PreviaDeAcessoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revenda?: string }>;
}) {
  const { id } = await params;
  const { revenda: revendaParam } = await searchParams;
  const { dono, revendas, escolhida } = await exigirTelaDeAcessos(revendaParam);

  if (!dono) {
    const admin = createAdminClient();
    const { data: vinculo } = await admin
      .from("colaborador_revendas")
      .select("revenda_id")
      .eq("colaborador_id", id)
      .eq("revenda_id", escolhida.id)
      .maybeSingle();
    if (!vinculo) notFound();
  }

  const s = await simularAcesso(id, escolhida.id);
  if (!s) notFound();

  const voltar = `/admin/acessos?revenda=${escolhida.id}`;
  const totalCartoes = s.blocos.reduce((t, b) => t + b.itens.length, 0);

  return (
    <div>
      <PageHeader
        title={`👁️ Como ${s.pessoa.nome?.split(" ")[0]} vê o app`}
        subtitle={`${s.pessoa.nome} — ${ROTULO_PAPEL[s.pessoa.role as Papel] ?? s.pessoa.role} em ${escolhida.nome}`}
        fecharHref={voltar}
      />

      {/* A REVENDA MUDA A RESPOSTA INTEIRA: a mesma pessoa pode ter tudo
          em São Félix e nada em Barreiras. */}
      {(revendas ?? []).length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(revendas ?? []).map((r) => (
            <Link
              key={r.id}
              href={`/admin/acessos/${id}?revenda=${r.id}`}
              className={
                r.id === escolhida.id
                  ? "rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
                  : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-primary"
              }
            >
              {r.nome}
            </Link>
          ))}
        </div>
      )}

      {!s.daRevenda && (
        <p className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ {s.pessoa.nome} <strong>não está vinculado a {escolhida.nome}</strong>. Nada abaixo vale
          nesta unidade — vincule primeiro na tela de Colaboradores.
        </p>
      )}

      {s.pessoa.role === "owner" && (
        <p className="mb-4 rounded-2xl border border-primary/30 bg-primary-soft p-3 text-sm text-primary-dark">
          👑 É o dono do app: enxerga tudo por definição, e marcar ou desmarcar qualquer coisa não
          muda nada para ele.
        </p>
      )}

      <div className="mb-5 grid grid-cols-3 gap-2">
        <Numero valor={totalCartoes} rotulo="cartões na home" />
        <Numero valor={s.paineis.length} rotulo="análises da Gestão" />
        <Numero valor={s.telas.length} rotulo="telas de liderança" />
      </div>

      {/* ---- A HOME ---- */}
      <Secao
        titulo="📱 A tela inicial dele"
        ajuda="Os cartões que aparecem ao abrir o app, nos blocos em que aparecem."
      >
        {totalCartoes === 0 ? (
          <Vazio texto="Nenhum cartão. A home abriria sem nada além do rodapé." />
        ) : (
          <div className="space-y-3">
            {s.blocos.map((b) => (
              <div key={b.id}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {b.titulo}
                </p>
                <div className="flex flex-wrap gap-2">
                  {b.itens.map((i) => (
                    <span
                      key={i.chave}
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
                    >
                      {i.emoji} {i.titulo}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Secao>

      {/* ---- AS ANÁLISES ---- */}
      <Secao
        titulo="📊 As análises da Gestão"
        ajuda="Os relatórios no fim da home dele, e na barra da Gestão."
      >
        {s.paineis.length === 0 ? (
          <Vazio texto="Nenhuma análise. O bloco 📊 Gestão não aparece na home dele." />
        ) : (
          <ul className="space-y-1.5">
            {s.paineis.map((p) => (
              <li key={p.id} className="text-sm text-slate-700">
                <strong>
                  {p.emoji} {p.rotulo}
                </strong>{" "}
                <span className="text-slate-500">— {p.pergunta.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* ---- O MODO LIDERANÇA ---- */}
      <Secao
        titulo="⚙️ O Modo Liderança"
        ajuda="As telas de administração que ele abre, e o que faz em cada uma."
      >
        {s.telas.length === 0 ? (
          <Vazio
            texto={
              s.pessoa.role === "lideranca"
                ? "É liderança, mas sem nenhuma tela liberada — o botão do Modo Liderança nem aparece para ele."
                : "É colaborador: o Modo Liderança não existe para ele."
            }
          />
        ) : (
          <div className="space-y-2">
            {s.telas.map(({ modulo, acoes }) => (
              <div key={modulo.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">
                  {modulo.emoji} {modulo.rotulo}
                  <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-slate-400">
                    {EMOJI_GRUPO_ADMIN[modulo.grupo]} {modulo.grupo}
                  </span>
                </p>
                <ul className="mt-1 space-y-0.5">
                  {acoes.map((a) => (
                    <li key={a} className="text-xs leading-snug text-slate-600">
                      ✅ {rotuloDaAcaoNoModulo(modulo, a)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Secao>

      {/*
        O QUE A PRÉVIA NÃO SABE, dito em vez de escondido.

        O 5S tem duas portas laterais -- ser auditor ou dono de área --
        que dão acesso sem passar por permissão nenhuma. Afirmar "não vê"
        quando existe essa porta seria a prévia mentindo no único ponto em
        que ela não enxerga.
      */}
      {s.cincoSPorVinculo && (
        <p className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          🧹 Além do que está acima, ele abre o <strong>Programa 5S</strong> por ser auditor ou dono
          de área — um vínculo operacional, cadastrado em /admin/5s, que não passa por esta tela.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={voltar}
          className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          ← Voltar e ajustar os acessos
        </Link>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        Esta tela lê as mesmas funções que a home, a Gestão e o Modo Liderança usam de verdade — não
        é uma simulação por fora. Se algo aqui está errado, está errado no app também.
      </p>
    </div>
  );
}

function Secao({
  titulo,
  ajuda,
  children,
}: {
  titulo: string;
  ajuda: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h2 className="text-sm font-bold text-slate-800">{titulo}</h2>
      <p className="mb-3 text-xs text-slate-500">{ajuda}</p>
      {children}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
      {texto}
    </p>
  );
}

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className="text-2xl font-bold tabular-nums text-slate-900">{valor}</p>
      <p className="text-xs leading-tight text-slate-500">{rotulo}</p>
    </div>
  );
}
