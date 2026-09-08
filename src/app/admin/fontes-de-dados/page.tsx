import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { requireGestor, podeNoModulo } from "@/lib/require-admin";
import {
  FONTES,
  ROTULO_TIPO,
  estaVelha,
  fontesComLink,
  fontesPorUpload,
  tempoDesde,
  type Fonte,
} from "@/lib/fontes-de-dados";
import { salvarFonte } from "./actions";
import { avisarRVAtualizada, salvarConfigRV } from "@/app/admin/rv/actions";
import { RolarAteAFonte } from "@/components/admin/RolarAteAFonte";
import { importarRating } from "@/app/admin/rating/actions";
import { importarRefugo } from "@/app/admin/refugo/actions";
import { importarDevolucao } from "@/app/admin/devolucao/actions";
import { atualizarRotas } from "@/app/admin/rotas/actions";
import { importarClientes } from "@/app/admin/pdv-particularidades/actions";

/**
 * O botão "Atualizar agora" chama a MESMA action do módulo, passando
 * `voltar_para` para o resultado aparecer aqui. Nenhuma lógica de
 * importação foi copiada -- só o destino do redirecionamento muda.
 *
 * A RV fica de fora: são várias planilhas por área, sem um "importar"
 * único; ela é lida na hora em que a tela do colaborador abre.
 */
const IMPORTAR: Record<string, ((f: FormData) => Promise<void>) | undefined> = {
  rating: importarRating,
  refugo: importarRefugo,
  devolucao: importarDevolucao,
  rotas: atualizarRotas,
  // A base de clientes entrou aqui em 08/09/2026, a pedido do dono. Ela
  // nasceu como aba do cadastro de particularidades, e o lugar estava
  // errado: é uma fonte igual às outras -- link do Drive, botão de
  // atualizar, data da última entrada.
  clientes: importarClientes,
};

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

type Estado = {
  pasta_link: string | null;
  ultima_sincronizacao: string | null;
  ultimo_resultado: string | null;
};

/** A RV tem uma planilha POR ÁREA -- não cabe num campo só, como as outras. */
type LinhaRV = {
  area: string;
  rotulo: string;
  csv_url: string | null;
  coluna_cpf: string | null;
  coluna_valor: string | null;
};

/**
 * DE ONDE VÊM OS DADOS DESTE APP
 *
 * A configuração da fonte morava dentro da tela de cada módulo -- sete
 * telas, sete layouts, e nenhum lugar que respondesse a pergunta acima.
 * Esta tela responde, e é onde se edita o link.
 *
 * O botão de ATUALIZAR fica aqui também, e não só na tela do módulo. A
 * primeira versão deixava o import só lá, com o argumento de que ele mora
 * junto do histórico -- mas a página acaba de dizer "sem atualizar há 4
 * dias" e mandar a pessoa navegar para outro lugar para agir sobre o que
 * ela acabou de ler é o oposto de juntar tudo num lugar só.
 *
 * A lógica não é duplicada: o formulário chama a MESMA action do módulo,
 * passando `voltar_para` para o resultado aparecer onde o clique
 * aconteceu. A tela do módulo continua com o botão dela, para quem chega
 * por lá.
 */
export default async function FontesDeDadosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string; aberta?: string }>;
}) {
  await requireGestor();
  const sp = await searchParams;
  /*
    QUAL GAVETA ESTÁ ABERTA, e ela vem da URL (08/09/2026, pedido do dono:
    "deixe todas as fontes agrupadas e, caso haja interação em salvar, não
    mova a tela pra cima").

    As duas coisas são o mesmo problema. Oito fontes abertas de uma vez
    davam uma página que só se lê rolando -- e, depois de salvar, o
    redirect trazia a pessoa de volta ao TOPO, longe do campo em que ela
    tinha acabado de mexer, sem sinal nenhum de que algo mudou.

    Na URL, e não em estado de componente: a ação de servidor termina em
    redirect, e qualquer estado de tela morre nele. `?aberta=rv` diz o que
    abrir e a âncora `#fonte-rv` diz onde parar a rolagem -- as duas
    sobrevivem ao redirect porque são o endereço.
  */
  const aberta = sp.aberta ?? null;

  const revendaId = await getRevendaId();
  if (!revendaId) {
    return <PageHeader title="🔌 Fontes de Dados" subtitle="Você não está em nenhuma revenda." />;
  }

  const admin = createAdminClient();
  const comLink = fontesComLink();

  // Uma leitura por tabela, em paralelo. São 5 tabelas pequenas de uma
  // linha; não vale a pena inventar uma view para isto.
  const estados = new Map<string, Estado | null>();
  const rvLinhas: LinhaRV[] = [];

  await Promise.all(
    comLink.map(async (f) => {
      if (f.chave === "rv") {
        const { data } = await admin
          .from("rv_config")
          .select("area, rotulo, csv_url, coluna_cpf, coluna_valor, atualizado_em")
          .eq("revenda_id", revendaId)
          .order("area");
        rvLinhas.push(...((data ?? []) as typeof rvLinhas));
        const maisRecente = (data ?? [])
          .map((r) => (r as { atualizado_em: string }).atualizado_em)
          .sort()
          .pop();
        estados.set(f.chave, {
          pasta_link: (data ?? []).length ? `${(data ?? []).length} planilha(s)` : null,
          ultima_sincronizacao: maisRecente ?? null,
          ultimo_resultado: null,
        });
        return;
      }
      const { data } = await admin
        .from(f.tabela as string)
        .select("pasta_link, ultima_sincronizacao, ultimo_resultado")
        .eq("revenda_id", revendaId)
        .maybeSingle();
      estados.set(f.chave, (data as Estado) ?? null);
    }),
  );

  const permissoes = new Map<string, boolean>();
  await Promise.all(
    FONTES.map(async (f) =>
      // "criar" para quase todas -- é a permissão de importar. A base de
      // clientes pede "editar": nela, "criar" é cadastrar a particularidade
      // de um cliente, coisa de quem monitora rota, e essa pessoa não tem
      // por que poder trocar a base inteira.
      permissoes.set(f.chave, await podeNoModulo(f.modulo as never, f.acaoParaEditar ?? "criar")),
    ),
  );

  const configuradas = comLink.filter((f) => estados.get(f.chave)?.pasta_link).length;
  const velhas = comLink.filter((f) => {
    const e = estados.get(f.chave);
    return e?.pasta_link && estaVelha(e.ultima_sincronizacao);
  }).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="🔌 Fontes de Dados"
        subtitle="De onde vem cada número do app, e quando entrou pela última vez."
      />

      {/* O recado só fica no topo quando NÃO há gaveta aberta. Com uma
          aberta, ele é desenhado dentro dela -- perto do botão que a pessoa
          apertou, que é onde ela está olhando. */}
      {!aberta && sp.erro && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}
      {!aberta && sp.sucesso && (
        <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
          ✅ {sp.sucesso}
        </p>
      )}

      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-500">Fontes configuradas</p>
          <p className="text-2xl font-extrabold text-slate-900">
            {configuradas}
            <span className="text-base font-semibold text-slate-400"> de {comLink.length}</span>
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-500">Sem atualizar</p>
          <p className={`text-2xl font-extrabold ${velhas > 0 ? "text-amber-700" : "text-slate-900"}`}>
            {velhas}
          </p>
          <p className="text-[11px] text-slate-400">há mais de 3 dias</p>
        </div>
      </div>

      {/*
        UMA LISTA SÓ, e todas fechadas. As "enviadas por arquivo" moravam
        num bloco separado no fim -- e a resposta para "de onde vêm os
        dados deste app?" ficava partida em dois lugares, com a segunda
        metade escondida atrás de um clique que ninguém dava.
      */}
      {aberta && <RolarAteAFonte chave={aberta} />}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {comLink.map((f) => (
          <CartaoDaFonte
            key={f.chave}
            fonte={f}
            estado={estados.get(f.chave) ?? null}
            podeEditar={permissoes.get(f.chave) ?? false}
            rvLinhas={f.chave === "rv" ? rvLinhas : undefined}
            atualizar={IMPORTAR[f.chave]}
            aberta={aberta === f.chave}
            erro={aberta === f.chave ? sp.erro : undefined}
            sucesso={aberta === f.chave ? sp.sucesso : undefined}
          />
        ))}

        {fontesPorUpload().map((f) => (
          <CartaoDaFonte
            key={f.chave}
            fonte={f}
            estado={null}
            podeEditar={false}
            aberta={aberta === f.chave}
          />
        ))}
      </div>

      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
        💡 <strong>Atualizar</strong> lê a fonte e traz o que há de novo para o app — é o que faz o
        número aparecer para o colaborador. A tela de cada módulo continua com o botão dela e com o
        histórico completo das importações anteriores.
      </p>
    </div>
  );
}

/** O endereço que abre esta fonte e para a rolagem nela. */
const enderecoDa = (chave: string) => `/admin/fontes-de-dados?aberta=${chave}#fonte-${chave}`;

function CartaoDaFonte({
  fonte,
  estado,
  podeEditar,
  rvLinhas,
  atualizar,
  aberta,
  erro,
  sucesso,
}: {
  fonte: Fonte;
  estado: Estado | null;
  podeEditar: boolean;
  rvLinhas?: LinhaRV[];
  atualizar?: (f: FormData) => Promise<void>;
  aberta: boolean;
  erro?: string;
  sucesso?: string;
}) {
  const porUpload = fonte.tipo === "upload";
  const configurada = porUpload ? true : !!estado?.pasta_link;
  const velha = !porUpload && configurada && estaVelha(estado?.ultima_sincronizacao);
  const voltarPara = enderecoDa(fonte.chave);

  return (
    /*
      UMA GAVETA POR FONTE, fechada por padrão.

      O `open` vem do servidor, e não do clique: depois de salvar, a ação
      termina em redirect e qualquer estado de tela morre nele. Sem isto, a
      pessoa apertava Salvar e a gaveta se fechava sozinha, no topo da
      página, sem dizer se tinha dado certo.

      `id` no <details> para a âncora `#fonte-<chave>` ter onde parar.
    */
    <details
      id={`fonte-${fonte.chave}`}
      open={aberta}
      // `scroll-mt-16` para a barra do topo não cobrir o cartão quando a
      // rolagem para nele.
      className="group scroll-mt-16 border-b border-slate-100 last:border-b-0 open:bg-slate-50/40"
    >
      {/* Uma linha só, e ela cabe no celular: seta, nome com a data
          embaixo, e o selo à direita. Nome, data e selo lado a lado
          quebravam "Rating de Entrega" em três linhas num aparelho
          estreito. */}
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-slate-50">
        <span className="shrink-0 text-xs text-slate-400 transition-transform group-open:rotate-90">
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900">{fonte.rotulo}</span>
          <span className="block text-[11px] text-slate-500">
            {porUpload ? "por envio de arquivo" : tempoDesde(estado?.ultima_sincronizacao)}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold ${
            porUpload
              ? "bg-slate-100 text-slate-600"
              : !configurada
                ? "bg-red-50 text-red-700"
                : velha
                  ? "bg-amber-50 text-amber-800"
                  : "bg-green-50 text-green-700"
          }`}
        >
          {porUpload ? "manual" : !configurada ? "sem fonte" : velha ? "sem atualizar" : "em dia"}
        </span>
      </summary>

      <div className="border-t border-slate-100 p-4">
        <p className="text-xs text-slate-500">{fonte.alimenta}</p>

        {/* O RECADO FICA AQUI DENTRO, ao lado do botão que foi apertado --
            no topo da página ele estaria fora da tela depois da âncora. */}
        {erro && (
          <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{erro}</p>
        )}
        {sucesso && (
          <p className="mt-2 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
            ✅ {sucesso}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">
            {ROTULO_TIPO[fonte.tipo]}
          </span>
          <Link href={fonte.telaDoModulo} className="font-semibold text-primary hover:underline">
            Abrir a tela do módulo →
          </Link>
        </div>

        {porUpload && <p className="mt-2 text-[11px] text-slate-400">{fonte.ajuda}</p>}

        {/* O BOTÃO DE ATUALIZAR mora aqui, e não só na tela do módulo.
            A página acabou de dizer "sem atualizar há 4 dias"; mandar a
            pessoa navegar para outro lugar para agir sobre o que ela
            acabou de ler é o oposto de juntar tudo num lugar só.

            A lógica de importação NÃO é duplicada: o formulário chama a
            mesma action do módulo, passando para onde voltar. O resultado
            aparece aqui, onde o clique aconteceu. */}
        {atualizar && podeEditar && !fonte.salvaNoImport && (
          <form action={atualizar} className="mt-3 space-y-2">
            <input type="hidden" name="voltar_para" value={voltarPara} />
            {/* As opções vieram junto com o botão (08/09/2026). Mover o
                botão sem elas seria trocar um caminho completo por um pela
                metade: sem o "todos os meses" não há primeira carga, e sem
                o "avisar o time" a pré-rota entra sem ninguém saber. */}
            {(fonte.opcoes ?? []).map((o) => (
              <label key={o.nome} className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name={o.nome}
                  defaultChecked={o.marcado}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary"
                />
                <span>
                  {o.rotulo}
                  {o.ajuda && (
                    <span className="block text-[11px] leading-snug text-slate-400">{o.ajuda}</span>
                  )}
                </span>
              </label>
            ))}
            <BotaoEnviar
              textoEnviando="Atualizando..."
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-dark sm:w-auto"
            >
              ↻ Atualizar agora
            </BotaoEnviar>
            {fonte.aoAtualizar && (
              <p className="text-[11px] text-slate-400">{fonte.aoAtualizar}</p>
            )}
          </form>
        )}

        {estado?.ultimo_resultado && (
          <p className="mt-2 break-words border-l-2 border-slate-200 pl-2 text-[11px] text-slate-500">
            {estado.ultimo_resultado}
          </p>
        )}
      </div>

      <div className="p-4">
        {/*
          A RV TEM UMA PLANILHA POR ÁREA -- não cabe num campo só, como as
          outras fontes. Até 08/09/2026 ela era só LISTADA aqui, com um
          link mandando editar em outra tela; o dono pediu para mover
          ("consegue mover a remuneração também?"), e ele está certo pelo
          mesmo motivo do botão de atualizar: a tela acabou de dizer "sem
          link" e mandava a pessoa navegar para outro lugar para resolver o
          que ela acabou de ler.

          Agora cada área tem seu campo aqui. A action é a MESMA da tela do
          módulo, com `voltar_para` -- nada de upsert duplicado.

          O que FICA na tela da RV: conferir um CPF e avisar quem tem RV.
          Nenhum dos dois é fonte de dado; são operação de fechamento de
          competência.
        */}
        {rvLinhas ? (
          <>
            {rvLinhas.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma área de RV cadastrada.</p>
            ) : podeEditar ? (
              <div className="space-y-3">
                {rvLinhas.map((r) => (
                  <form action={salvarConfigRV} key={r.area} className="space-y-2">
                    <input type="hidden" name="area" value={r.area} />
                    <input type="hidden" name="voltar_para" value={voltarPara} />
                    <div className="flex items-baseline justify-between gap-2">
                      <label
                        className="text-[11px] font-semibold uppercase text-slate-500"
                        htmlFor={`rv-${r.area}`}
                      >
                        {r.rotulo} <span className="text-slate-400">({r.area})</span>
                      </label>
                      <span
                        className={`shrink-0 text-[11px] font-semibold ${
                          r.csv_url ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {r.csv_url ? "conectada" : "sem link"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        id={`rv-${r.area}`}
                        name="csv_url"
                        defaultValue={r.csv_url ?? ""}
                        placeholder="Link do arquivo no Drive ou do CSV publicado"
                        className={`${campo} min-w-0 flex-1`}
                      />
                      <BotaoEnviar
                        compacto
                        className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
                      >
                        Salvar
                      </BotaoEnviar>
                    </div>
                    {/* As colunas ficam recolhidas: o app acha CPF e valor
                        sozinho pelo cabeçalho, e mostrar dois campos vazios
                        em cada área sugeria que eram obrigatórios. */}
                    <details className="text-[11px] text-slate-500">
                      <summary className="cursor-pointer">
                        Forçar as colunas de CPF e valor (o app detecta sozinho)
                      </summary>
                      <div className="mt-1.5 flex gap-2">
                        <input
                          name="coluna_cpf"
                          defaultValue={r.coluna_cpf ?? ""}
                          placeholder="Coluna do CPF"
                          className={`${campo} min-w-0 flex-1`}
                        />
                        <input
                          name="coluna_valor"
                          defaultValue={r.coluna_valor ?? ""}
                          placeholder="Coluna do valor"
                          className={`${campo} min-w-0 flex-1`}
                        />
                      </div>
                    </details>
                  </form>
                ))}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {rvLinhas.map((r) => (
                  <li key={r.area} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-slate-700">{r.rotulo}</span>
                    <span
                      className={`shrink-0 text-[11px] font-semibold ${
                        r.csv_url ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {r.csv_url ? "conectada" : "sem link"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-slate-400">{fonte.ajuda}</p>

            {/*
              AVISAR QUE A RV FOI ATUALIZADA mora aqui (08/09/2026, pedido
              do dono: "tudo que faz referência a importar a base, ou que
              ligue a um link, ou que precise informar a atualização").

              É o caso mais claro dos três: a RV é lida AO VIVO da planilha,
              então não existe importação -- o app não tem como saber que
              alguém editou o arquivo. O aviso é a atualização, e quem sabe
              a hora certa é quem acabou de fechar a competência, olhando
              para este cartão.
            */}
            {podeEditar && (
              <form
                action={avisarRVAtualizada}
                className="mt-3 rounded-xl border border-primary/25 bg-primary-soft p-3"
              >
                <input type="hidden" name="voltar_para" value={voltarPara} />
                <p className="text-xs font-semibold text-primary-dark">
                  🔔 Avisar que a RV foi atualizada
                </p>
                <p className="mt-1 text-[11px] leading-snug text-primary-dark/80">
                  Vai só para quem tem CPF na planilha — quem não recebe RV não é incomodado. A
                  planilha é lida na hora para montar a lista, então demora alguns segundos.
                </p>
                <BotaoEnviar
                  textoEnviando="Conferindo a planilha..."
                  className="mt-2 w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark sm:w-auto"
                >
                  Avisar quem tem RV
                </BotaoEnviar>
              </form>
            )}

            <Link
              href={fonte.telaDoModulo}
              className="mt-2 inline-flex text-xs font-semibold text-primary hover:underline"
            >
              Conferir um CPF na planilha →
            </Link>
          </>
        ) : podeEditar && fonte.salvaNoImport && atualizar ? (
          /* UM CAMPO E UM BOTÃO SÓ: colar o link já importa.
             Separar "salvar" de "atualizar" daria dois botões para uma
             decisão só, e metade das vezes alguém salvaria o link sem
             importar -- deixando o cartão dizendo "sem fonte" com o link
             certo na frente. */
          <form action={atualizar} className="space-y-2">
            <input type="hidden" name="voltar_para" value={voltarPara} />
            <label
              className="block text-[11px] font-semibold uppercase text-slate-500"
              htmlFor={`link-${fonte.chave}`}
            >
              Link no Drive
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id={`link-${fonte.chave}`}
                name="link"
                defaultValue={estado?.pasta_link ?? ""}
                required
                placeholder="https://drive.google.com/file/d/..."
                className={`${campo} min-w-0 flex-1`}
              />
              <BotaoEnviar
                compacto
                textoEnviando="Importando..."
                className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Salvar e importar
              </BotaoEnviar>
            </div>
            {fonte.aoAtualizar && (
              <p className="text-[11px] text-slate-400">{fonte.aoAtualizar}</p>
            )}
            <p className="text-[11px] text-slate-400">{fonte.ajuda}</p>
          </form>
        ) : podeEditar ? (
          <form action={salvarFonte} className="space-y-2">
            <input type="hidden" name="chave" value={fonte.chave} />
            <input type="hidden" name="voltar_para" value={voltarPara} />
            <label
              className="block text-[11px] font-semibold uppercase text-slate-500"
              htmlFor={`link-${fonte.chave}`}
            >
              Link da pasta no Drive
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id={`link-${fonte.chave}`}
                name="link"
                defaultValue={estado?.pasta_link ?? ""}
                placeholder="https://drive.google.com/drive/folders/..."
                className={`${campo} min-w-0 flex-1`}
              />
              <BotaoEnviar
                compacto
                className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Salvar
              </BotaoEnviar>
            </div>
            <p className="text-[11px] text-slate-400">{fonte.ajuda}</p>
          </form>
        ) : (
          <p className="text-xs text-slate-400">
            Você não tem permissão para configurar esta fonte. Ela é liberada junto com o módulo{" "}
            <strong>{fonte.rotulo}</strong>.
          </p>
        )}
      </div>
    </details>
  );
}
