import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { AbasDeAcesso } from "@/components/admin/AbasDeAcesso";
import { exigirTelaDeAcessos } from "@/lib/gestao-de-acessos-server";
import { MODULO_ACESSOS } from "@/lib/gestao-de-acessos";
import { lerLimpezaDeAcessos } from "@/lib/limpeza-de-acessos-server";
import { DIAS_SEM_ENTRAR, DIAS_SEM_USO, haQuantoTempo } from "@/lib/limpeza-de-acessos";
import { moduloPorId } from "@/lib/acessos";
import { podeNoModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { retirarAcessosSemUso } from "./actions";
import { ListaSemUso, type GrupoSemUso } from "./ListaSemUso";

export const dynamic = "force-dynamic";

const dataBr = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/**
 * LIMPEZA DE ACESSOS (16/09/2026, pedido do dono).
 *
 * Três perguntas, da que se resolve aqui mesmo para a que pede conversa:
 *   1. que módulo está liberado e ninguém abre -- retira-se nesta tela;
 *   2. que liderança não entra -- ela carrega permissão sobre o time;
 *   3. quem não entra no app há dois meses -- pode ter saído da empresa, e
 *      isso só o RH confirma. O cadastro se exclui em Colaboradores.
 */
export default async function LimpezaDeAcessosPage({
  searchParams,
}: {
  searchParams: Promise<{ revenda?: string; erro?: string; sucesso?: string }>;
}) {
  const { revenda: revendaParam, erro, sucesso } = await searchParams;
  const { eu, dono, podeEditar, revendas, escolhida } = await exigirTelaDeAcessos(revendaParam);

  const [{ semUso, liderancasAusentes, semEntrar, pessoas }, mostrarPerfis, { data: gestores }] = await Promise.all([
    lerLimpezaDeAcessos(escolhida.id),
    dono ? Promise.resolve(true) : podeNoModulo("perfis-acesso", "ver"),
    createAdminClient().from("lideranca_permissoes").select("colaborador_id").eq("modulo", MODULO_ACESSOS),
  ]);
  const quemGerencia = new Set((gestores ?? []).map((g) => String(g.colaborador_id)));

  const grupos: GrupoSemUso[] = [];
  for (const l of semUso) {
    let grupo = grupos.find((g) => g.colaboradorId === l.colaboradorId);
    if (!grupo) {
      const pessoa = pessoas.get(l.colaboradorId)!;
      grupo = {
        colaboradorId: l.colaboradorId,
        nome: pessoa.nome,
        cargo: pessoa.cargo,
        travada:
          l.colaboradorId === eu.id
            ? "É você — os próprios acessos não se alteram por aqui."
            : !dono && quemGerencia.has(l.colaboradorId)
              ? "Também gerencia acessos — só o Admin altera."
              : null,
        itens: [],
      };
      grupos.push(grupo);
    }
    const modulo = moduloPorId(l.modulo);
    grupo.itens.push({
      modulo: l.modulo,
      rotulo: modulo?.rotulo ?? l.modulo,
      emoji: modulo?.emoji ?? "📄",
      liberadoEm: dataBr(l.liberadoEm),
      ultimoUso: haQuantoTempo(l.ultimoUsoEm),
    });
  }

  return (
    <div>
      <PageHeader
        title="🔐 Acessos por Pessoa"
        subtitle="Quem entra no Modo Liderança e o que cada um pode fazer. É aqui, e só aqui, que se TIRA acesso."
      />
      <AbasDeAcesso atual="limpeza" revendaId={escolhida.id} mostrarPerfis={mostrarPerfis} />

      {revendas.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {revendas.map((r) => (
            <Link
              key={r.id}
              href={`/admin/acessos/limpeza?revenda=${r.id}`}
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

      {erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {sucesso && <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{sucesso}</p>}

      {/* O resumo primeiro: três números dizem se vale rolar a tela. */}
      <div className="mb-6 grid grid-cols-3 gap-2">
        {[
          { valor: semUso.length, rotulo: `módulos sem uso há ${DIAS_SEM_USO}+ dias`, ancora: "#sem-uso" },
          { valor: liderancasAusentes.length, rotulo: `lideranças sem entrar há ${DIAS_SEM_USO}+ dias`, ancora: "#lideranca" },
          { valor: semEntrar.length, rotulo: `pessoas sem entrar há ${DIAS_SEM_ENTRAR}+ dias`, ancora: "#sem-entrar" },
        ].map((c) => (
          <a
            key={c.ancora}
            href={c.ancora}
            className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm hover:border-primary"
          >
            <span className="block text-2xl font-bold tabular-nums text-slate-900">{c.valor}</span>
            <span className="block text-[11px] leading-tight text-slate-500">{c.rotulo}</span>
          </a>
        ))}
      </div>

      <section id="sem-uso" className="mb-8 scroll-mt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          📦 Liberado e sem uso há {DIAS_SEM_USO} dias
        </h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          Módulo liberado há mais de {DIAS_SEM_USO} dias cuja tela a pessoa não abriu nesse tempo. Jornal, Ranking,
          Padrões, Sonho e Desafio não entram: são leitura para o time todo, e não abrir um mês não é motivo para
          retirar. {!podeEditar && "Você pode consultar, mas não retirar."}
        </p>
        {grupos.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            ✅ Nenhuma liberação parada em {escolhida.nome}.
          </p>
        ) : (
          <ListaSemUso grupos={grupos} podeEditar={podeEditar} acao={retirarAcessosSemUso} revendaId={escolhida.id} />
        )}
      </section>

      <section id="lideranca" className="mb-8 scroll-mt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          👔 Liderança sem entrar há {DIAS_SEM_USO} dias
        </h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          Quem tem Modo Liderança carrega permissão para ver e alterar dados do time. Se a pessoa mudou de função,
          ajuste a ficha dela.
        </p>
        {liderancasAusentes.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            ✅ Toda a liderança de {escolhida.nome} entrou nos últimos {DIAS_SEM_USO} dias.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {liderancasAusentes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{p.nome}</p>
                  <p className="text-xs text-slate-500">
                    {[p.cargo, `último acesso: ${haQuantoTempo(p.ultimoAcesso)}`, `${p.permissoes} permissão(ões)`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Link
                  href={`/admin/acessos/${p.id}?revenda=${escolhida.id}`}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary hover:text-primary"
                >
                  Abrir a ficha
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="sem-entrar" className="mb-8 scroll-mt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          🚪 Sem entrar no app há {DIAS_SEM_ENTRAR} dias
        </h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          O app não sabe quem saiu da empresa — isto é a pista. Confirme com o RH; se a pessoa saiu, exclua o cadastro
          em Colaboradores, e o login dela deixa de funcionar. Cadastros com menos de {DIAS_SEM_ENTRAR} dias não
          aparecem aqui.
        </p>
        {semEntrar.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            ✅ Todo mundo de {escolhida.nome} entrou nos últimos {DIAS_SEM_ENTRAR} dias.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {semEntrar.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{p.nome}</p>
                  <p className="text-xs text-slate-500">
                    {[
                      p.cargo,
                      p.ultimoAcesso ? `último acesso: ${haQuantoTempo(p.ultimoAcesso)}` : "nunca entrou",
                      `cadastro de ${dataBr(p.criadoEm)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Link
                  href={`/admin/colaboradores?busca=${p.cpf}`}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary hover:text-primary"
                >
                  Ver cadastro
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
