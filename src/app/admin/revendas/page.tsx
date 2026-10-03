import { decodificar } from "@/lib/texto-url";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { MarcaApp } from "@/components/MarcaApp";
import { GRUPOS_DO_ADMIN, MODULOS } from "@/lib/acessos";
import {
  alternarRevenda,
  criarRevenda,
  removerLogoRevenda,
  removerSeloRevenda,
  renomearRevenda,
  salvarLogoRevenda,
  salvarSeloRevenda,
  salvarModulos,
} from "./actions";
import { ComMarcas } from "@/components/Icone";

export default async function RevendasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireOwner();
  const { erro, sucesso } = await searchParams;

  const admin = createAdminClient();

  // selo_url nasceu na 164: sem ela rodada, lê sem o selo e a tela avisa.
  type LinhaRevenda = { id: string; slug: string; nome: string; ativa: boolean; logo_url: string | null; selo_url?: string | null };
  const lerRevendas = async () => {
    const com = await admin.from("revendas").select("id, slug, nome, ativa, logo_url, selo_url").order("ordem");
    if (!com.error) return { data: com.data as LinhaRevenda[], seloInstalado: true };
    const sem = await admin.from("revendas").select("id, slug, nome, ativa, logo_url").order("ordem");
    return { data: (sem.data ?? []) as LinhaRevenda[], seloInstalado: false };
  };

  const [{ data: revendas, seloInstalado }, { data: modulos }, { data: vinculos }] =
    await Promise.all([
      lerRevendas(),
      admin.from("revenda_modulos").select("revenda_id, modulo").eq("ativo", true),
      admin.from("colaborador_revendas").select("revenda_id"),
    ]);

  const modulosPorRevenda = new Map<string, Set<string>>();
  for (const m of modulos ?? []) {
    if (!modulosPorRevenda.has(m.revenda_id)) {
      modulosPorRevenda.set(m.revenda_id, new Set());
    }
    modulosPorRevenda.get(m.revenda_id)!.add(m.modulo);
  }

  const pessoasPorRevenda = new Map<string, number>();
  for (const v of vinculos ?? []) {
    pessoasPorRevenda.set(
      v.revenda_id,
      (pessoasPorRevenda.get(v.revenda_id) ?? 0) + 1,
    );
  }

  // Mesmas gavetas da barra do Modo Liderança: quem liga um módulo para a
  // revenda enxerga a mesma organização que vai encontrar depois.
  const grupos = GRUPOS_DO_ADMIN;

  return (
    <div>
      <PageHeader
        title="🏢 Revendas"
        subtitle="Quais unidades existem e o que cada uma usa do app"
      />

      {erro && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {decodificar(sucesso)}
        </p>
      )}

      <div className="mb-4 rounded-2xl border border-primary/25 bg-primary-soft p-4">
        <p className="text-xs text-primary-dark">
          Desligar um módulo aqui o esconde para a revenda inteira — inclusive
          para você e para as lideranças que já tinham permissão nele. Nada é
          apagado: religando, tudo volta como estava.
        </p>
      </div>

      {/* ---- Nova revenda ---- */}
      <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-4 font-semibold text-primary">
          + Cadastrar revenda
        </summary>
        <form action={criarRevenda} className="border-t border-slate-100 p-4">
          <label
            htmlFor="nome-nova"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Nome da revenda
          </label>
          <input
            id="nome-nova"
            name="nome"
            placeholder="Revenda Lima ..."
            className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            required
            minLength={3}
          />
          <BotaoEnviar
            textoEnviando="Cadastrando..."
            className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Cadastrar
          </BotaoEnviar>
          <p className="mt-2 text-xs text-slate-400">
            A revenda nasce sem nenhum módulo e sem ninguém vinculado. Os
            colaboradores você liga na tela de Colaboradores.
          </p>
        </form>
      </details>

      <div className="space-y-3">
        {(revendas ?? []).map((r) => {
          const meus = modulosPorRevenda.get(r.id) ?? new Set<string>();
          const pessoas = pessoasPorRevenda.get(r.id) ?? 0;

          return (
            <details
              key={r.id}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <summary className="cursor-pointer p-4">
                <span className="font-semibold text-slate-800">{r.nome}</span>
                {!r.ativa && (
                  <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                    desativada
                  </span>
                )}
                <span className="ml-2 text-xs text-slate-400">
                  {meus.size} módulo(s) · {pessoas} pessoa(s)
                </span>
              </summary>

              {/* ---- Módulos ---- */}
              <form
                action={salvarModulos}
                className="border-t border-slate-100 p-4"
              >
                <input type="hidden" name="id" value={r.id} />

                <div className="space-y-4">
                  {grupos.map((grupo) => (
                    <div key={grupo}>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {grupo}
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {MODULOS.filter((m) => m.grupo === grupo).map((m) => (
                          <label
                            key={m.id}
                            className="flex items-center gap-2 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              name="modulo"
                              value={m.id}
                              defaultChecked={meus.has(m.id)}
                              className="h-4 w-4 rounded border-slate-300 text-primary"
                            />
                            <ComMarcas texto={m.emoji ?? ""} /> {m.rotulo}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <BotaoEnviar
                  textoEnviando="Salvando..."
                  className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  Salvar módulos de {r.nome}
                </BotaoEnviar>
              </form>

              {/* ---- Logo da empresa ---- */}
              <div className="border-t border-slate-100 p-4">
                <p className="mb-1 text-sm font-medium text-slate-700">
                  Logo da empresa
                </p>
                <p className="mb-3 text-xs text-slate-500">
                  É ela que aparece no cabeçalho para quem está nesta
                  revenda. O ícone do app na tela inicial do celular não
                  muda — esse é a marca do App do Colaborador.
                </p>

                {/* A prévia é sobre fundo azul porque é lá que a logo vai
                    viver. Ver a marca sobre branco esconde justamente o
                    problema mais comum, que é o fundo branco do PNG. */}
                <div className="mb-3 flex items-center gap-3 rounded-xl bg-primary p-3">
                  {r.logo_url ? (
                    <span className="flex h-12 items-center rounded-lg bg-white px-2 py-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.logo_url}
                        alt={`Logo de ${r.nome}`}
                        className="h-9 w-auto max-w-[140px] object-contain"
                      />
                    </span>
                  ) : (
                    <MarcaApp tamanho={40} className="text-white" />
                  )}
                  <span className="text-xs text-white/80">
                    {r.logo_url
                      ? "É assim que aparece no app."
                      : "Sem logo: usa a marca do app."}
                  </span>
                </div>

                <form action={salvarLogoRevenda} className="flex flex-col gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input
                    type="file"
                    name="logo"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    required
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
                  />
                  <BotaoEnviar
                    textoEnviando="Enviando..."
                    className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                  >
                    {r.logo_url ? "Trocar logo" : "Enviar logo"}
                  </BotaoEnviar>
                  <p className="text-xs text-slate-400">
                    PNG com fundo transparente fica melhor: o cabeçalho é
                    azul, e logo com fundo branco vira um retângulo colado
                    ali. Até 2 MB.
                  </p>
                </form>

                {r.logo_url && (
                  <form action={removerLogoRevenda} className="mt-2">
                    <input type="hidden" name="id" value={r.id} />
                    <BotaoEnviar
                      textoEnviando="Removendo..."
                      className="w-full rounded-xl border border-slate-200 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                    >
                      Remover e voltar à marca do app
                    </BotaoEnviar>
                  </form>
                )}
              </div>

              {/* ---- Selo da revenda (03/10/2026) ---- */}
              <div className="border-t border-slate-100 p-4">
                <p className="mb-1 text-sm font-medium text-slate-700">Selo da revenda</p>
                <p className="mb-3 text-xs text-slate-500">
                  O selo de qualificação (hoje, o Qualified DPO 2026). Aparece ao lado do &ldquo;Olá&rdquo; na tela inicial e,
                  esfumaçado, como marca d&rsquo;água nas outras telas. Quando vier o selo do próximo ano, é só trocar aqui.
                </p>
                {!seloInstalado ? (
                  <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                    Falta rodar a migration 164 (selo da revenda) no Supabase.
                  </p>
                ) : (
                  <>
                    <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      {r.selo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.selo_url} alt={`Selo de ${r.nome}`} className="h-16 w-auto" />
                      ) : (
                        <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-xs text-slate-400">
                          sem selo
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        {r.selo_url ? "É assim que aparece ao lado do “Olá”." : "Sem selo: nada aparece na home nem nas telas."}
                      </span>
                    </div>

                    <form action={salvarSeloRevenda} className="flex flex-col gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        type="file"
                        name="selo"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        required
                        className="w-full rounded-xl border border-slate-200 p-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
                      />
                      <BotaoEnviar
                        textoEnviando="Enviando..."
                        className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                      >
                        {r.selo_url ? "Trocar selo" : "Enviar selo"}
                      </BotaoEnviar>
                      <p className="text-xs text-slate-400">
                        PNG com fundo transparente e pelo menos 300 pixels de largura, para sair nítido no celular. O arquivo
                        sobe como veio, sem compressão. Até 2 MB.
                      </p>
                    </form>

                    {r.selo_url && (
                      <form action={removerSeloRevenda} className="mt-2">
                        <input type="hidden" name="id" value={r.id} />
                        <BotaoEnviar
                          textoEnviando="Removendo..."
                          className="w-full rounded-xl border border-slate-200 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                        >
                          Remover o selo
                        </BotaoEnviar>
                      </form>
                    )}
                  </>
                )}
              </div>

              {/* ---- Nome ---- */}
              <form
                action={renomearRevenda}
                className="flex gap-2 border-t border-slate-100 p-4"
              >
                <input type="hidden" name="id" value={r.id} />
                <input
                  name="nome"
                  defaultValue={r.nome}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
                  required
                  minLength={3}
                />
                <BotaoEnviar
                  compacto
                  className="shrink-0 rounded-xl border border-primary px-4 py-3 text-sm font-semibold text-primary hover:bg-primary-soft"
                >
                  Renomear
                </BotaoEnviar>
              </form>

              {/* ---- Ativa / desativada ---- */}
              <form action={alternarRevenda} className="border-t border-slate-100 p-4">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="ativa" value={r.ativa ? "0" : "1"} />
                <BotaoEnviar
                  textoEnviando="Aplicando..."
                  className={
                    r.ativa
                      ? "w-full rounded-xl border border-red-300 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
                      : "w-full rounded-xl border border-primary py-3 text-sm font-medium text-primary hover:bg-primary-soft"
                  }
                >
                  {r.ativa ? `Desativar ${r.nome}` : `Reativar ${r.nome}`}
                </BotaoEnviar>
                <p className="mt-2 text-xs text-slate-400">
                  Desativar não apaga nada. A revenda some da lista de quem
                  está vinculado a ela, e o histórico continua guardado.
                </p>
              </form>
            </details>
          );
        })}
      </div>
    </div>
  );
}
