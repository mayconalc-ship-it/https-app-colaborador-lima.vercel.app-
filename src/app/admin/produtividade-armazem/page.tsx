import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { PainelCadastro, ItemCadastro, BotaoIcone } from "@/components/admin/CadastroCard";
import { FormularioComPessoa } from "@/components/admin/SeletorDePessoa";
import { AvisoDaUrl } from "@/components/AvisoDaUrl";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ROTULO_SENSO,
  ROTULO_TURNO,
  ROTULO_TURNO_CURTO,
  SENSOS,
  TURNOS,
  formatarDataHora,
  litrosPorCaixa,
  camadasDoPalete,
  lastroFechaOPalete,
  produtoReepackDeLinha,
  produtoProntoParaReepack,
  type ProdutoReepack,
} from "@/lib/produtividade-armazem";
import { compararNomes, ruasDoDeposito } from "@/lib/fefo";
import { BuscaProdutoCadastro } from "@/components/admin/BuscaProdutoCadastro";
import { ROTULO_UNIDADE_AG, UNIDADES_AG } from "@/lib/carretas";
import {
  alternarAgAtivo,
  alternarEmpilhadeiraAtivo,
  alternarEmpilhadorAtivo,
  alternarFabricaAtivo,
  alternarItemChecklist5sAtivo,
  alternarDepositoFefoAtivo,
  alternarMotivoFefoAtivo,
  alternarRuaFefoAtiva,
  alternarMotoristaAtivo,
  alternarProdutoAtivo,
  alternarTransportadoraAtivo,
  buscarColaboradoresParaLembrete,
  corrigirHorimetroOperacao,
  corrigirHorimetroTrocaGas,
  editarAg,
  editarEmbalagemDespejo,
  editarEmpilhadeira,
  editarEmpilhador,
  editarFabrica,
  editarDepositoFefo,
  editarProdutoReepack,
  editarItemChecklist5s,
  editarMotivoFefo,
  editarRuaFefo,
  editarMotorista,
  editarProduto,
  editarTransportadora,
  excluirAg,
  excluirDepositoFefo,
  excluirRuaFefo,
  excluirEmpilhadeira,
  excluirEmpilhador,
  excluirFabrica,
  excluirItemChecklist5s,
  excluirLembreteEmpilhadeira,
  excluirMotivoFefo,
  excluirMotorista,
  excluirProduto,
  excluirTransportadora,
  importarPlanilhaProdutos,
  importarProdutos,
  salvarAg,
  salvarConfigRecebimento,
  salvarDepositoFefo,
  salvarRuaFefo,
  salvarEmpilhadeira,
  salvarEmpilhador,
  salvarFabrica,
  salvarCustoP20,
  salvarAlertaGas,
  editarEmbalagemRepack,
  alternarEmbalagemRepackAtivo,
  excluirTrocaGas,
  excluirOperacaoEmpilhadeira,
  adicionarNotificadoGas,
  removerNotificadoGas,
  salvarItemChecklist5s,
  salvarLembreteEmpilhadeira,
  salvarMotivoFefo,
  salvarMotorista,
  salvarProduto,
  salvarProdutoReepack,
  salvarTransportadora,
  corrigirAgendamentoCarreta,
} from "./actions";

export const dynamic = "force-dynamic";
// A planilha de produtos chega pesada (4-5 MB, centenas de linhas com
// estilo/fórmula cacheada) e importarPlanilhaProdutos faz várias idas ao
// banco em sequência (embalagens de repack, embalagens de despejo, upsert
// de produtos) -- sem isto, o limite padrão da Vercel (10s) cortava a
// Server Action no meio e o navegador via só "An unexpected response was
// received from the server", sem nenhuma mensagem de erro de verdade.
// Precisa ficar aqui (na página), não no arquivo de actions -- um arquivo
// "use server" só pode exportar funções async, nada mais.
export const maxDuration = 60;

import { ESTOQUE_MINIMO_PADRAO } from "@/lib/gas-p20";
import { FotoEvidencia } from "@/components/FotoEvidencia";

type CarretaParaCorrigir = {
  id: string;
  numero_dt: string;
  placa_carreta: string;
  motorista_nome: string;
  chegada_em: string;
  carga_agendada: boolean;
  agendamento_em: string | null;
  status: string;
};

/** O PostgREST devolve o relacionamento como objeto ou array conforme a
 *  cardinalidade que ele infere -- por isso os dois. */
type NotificadoGas = {
  colaborador_id: string;
  profiles: { nome: string; cargo: string | null } | { nome: string; cargo: string | null }[] | null;
};

/** "2026-08-29T17:00:00Z" -> "2026-08-29T14:00", que é o formato que o
 *  input datetime-local entende, já no horário de Brasília. */
function paraDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const emBrasilia = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return emBrasilia.toISOString().slice(0, 16);
}

type Aba = "reepack-despejo" | "empilhadeiras" | "recebimento" | "cinco-s" | "fefo";
const ABAS: { id: Aba; rotulo: string; emoji: string }[] = [
  { id: "reepack-despejo", rotulo: "Produtos", emoji: "📦" },
  { id: "empilhadeiras", rotulo: "Empilhadeiras", emoji: "🏗️" },
  { id: "recebimento", rotulo: "Recebimento", emoji: "🚛" },
  { id: "cinco-s", rotulo: "5S", emoji: "🧹" },
  { id: "fefo", rotulo: "FEFO", emoji: "🚨" },
];

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/** As linhas cruas dos dois catálogos novos do FEFO (migration 097). */
type DepositoBanco = { id: string; nome: string; ordem: number; ativo: boolean };
type RuaBanco = {
  id: string;
  deposito_id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
};

export default async function AdminProdutividadeArmazemPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    erro?: string;
    sucesso?: string;
    buscaProduto?: string;
    buscaReepack?: string;
    buscaOperador?: string;
    buscaHorimetro?: string;
    buscaLideranca?: string;
  }>;
}) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda("/admin");
  const sp = await searchParams;
  const aba: Aba = (ABAS.find((a) => a.id === sp.aba)?.id ?? "reepack-despejo") as Aba;
  const buscaProduto = (sp.buscaProduto ?? "").trim();
  const buscaReepack = (sp.buscaReepack ?? "").trim().toLowerCase();
  const buscaOperador = (sp.buscaOperador ?? "").trim();
  const buscaHorimetro = (sp.buscaHorimetro ?? "").trim();
  const buscaLideranca = (sp.buscaLideranca ?? "").trim();

  const supabase = await createClient();
  const admin = createAdminClient();

  const [
    { data: embalagens },
    { data: embalagensDespejo },
    { data: empilhadeiras },
    { data: lembretes },
    { data: fabricas },
    { data: transportadoras },
    { data: produtos },
    { count: totalProdutos },
    { data: produtosReepackBanco },
    { data: itensChecklist },
    { data: operadoresEncontrados },
    { data: motoristas },
    { data: empilhadores },
    { data: agCatalogo },
    { data: recebimentoConfig },
    { data: operacoesEncontradas },
    { data: motivosFefo },
    { data: depositosFefo },
    { data: ruasFefo },
    podeExcluir,
    { data: empilhadeiraConfig },
    { data: trocasGas },
    { data: carretasRecentes },
    { data: notificadosGas },
    { data: liderancaEncontrada },
  ] = await Promise.all([
    supabase
      .from("pa_embalagens")
      .select("id, nome, meta_reepacks_hora, ativo")
      .eq("revenda_id", revendaId)
      .order("nome"),
    supabase
      .from("pa_embalagens_despejo")
      .select("id, nome, litros_por_unidade, meta_litros_hora")
      .eq("revenda_id", revendaId)
      .order("nome"),
    supabase.from("pa_empilhadeiras").select("id, numero, ativo").eq("revenda_id", revendaId).order("numero"),
    supabase
      .from("pa_empilhadeira_lembretes")
      .select("id, operador_nome, turno, ativo")
      .eq("revenda_id", revendaId)
      .order("operador_nome"),
    supabase.from("pa_fabricas").select("id, nome, ativo").eq("revenda_id", revendaId).order("nome"),
    supabase.from("pa_transportadoras").select("id, nome, ativo").eq("revenda_id", revendaId).order("nome"),
    aba === "recebimento" && buscaProduto.length >= 2
      ? supabase
          .from("pa_produtos")
          .select("id, codigo, descricao, ativo")
          .eq("revenda_id", revendaId)
          .or(`codigo.ilike.%${buscaProduto}%,descricao.ilike.%${buscaProduto}%`)
          .order("codigo")
          .limit(100)
      : Promise.resolve({ data: [] as { id: string; codigo: string; descricao: string; ativo: boolean }[] }),
    supabase.from("pa_produtos").select("id", { count: "exact", head: true }).eq("revenda_id", revendaId),
    aba === "reepack-despejo"
      ? supabase
          .from("pa_produtos")
          .select(
            "id, codigo, descricao, cluster_produto, unidades_por_caixa, caixas_pallet, caixas_por_lastro, fator_hecto, tipo, embalagem_id, meta_reepack_hora, meta_despejo_hora, ativo",
          )
          .eq("revenda_id", revendaId)
          .not("fator_hecto", "is", null)
          .order("descricao")
      : Promise.resolve({
          data: [] as {
            id: string;
            codigo: string;
            descricao: string;
            cluster_produto: string | null;
            unidades_por_caixa: number | null;
            caixas_pallet: number | null;
            caixas_por_lastro: number | null;
            fator_hecto: number | null;
            tipo: string | null;
            embalagem_id: string | null;
            meta_reepack_hora: number | null;
            meta_despejo_hora: number | null;
            ativo: boolean;
          }[],
        }),
    supabase
      .from("pa_checklist_5s_itens")
      .select("id, senso, descricao, ativo")
      .eq("revenda_id", revendaId)
      .order("ordem"),
    aba === "empilhadeiras" && buscaOperador.length >= 2
      ? (() => {
          let q = admin.from("profiles").select("id, nome, cargo").limit(10);
          const digitos = buscaOperador.replace(/\D/g, "");
          q = digitos
            ? q.or(`nome.ilike.%${buscaOperador}%,cpf.ilike.%${digitos}%`)
            : q.ilike("nome", `%${buscaOperador}%`);
          return q;
        })()
      : Promise.resolve({ data: [] as { id: string; nome: string; cargo: string | null }[] }),
    supabase.from("pa_motoristas").select("id, nome, cpf, ativo").eq("revenda_id", revendaId).order("nome"),
    supabase.from("pa_empilhadores").select("id, nome, cpf, ativo").eq("revenda_id", revendaId).order("nome"),
    supabase.from("pa_ag_catalogo").select("id, codigo, descricao, unidade, ativo").eq("revenda_id", revendaId).order("codigo"),
    supabase.from("pa_recebimento_config").select("tma_alvo_minutos, dias_minimos_validade_alerta").eq("revenda_id", revendaId).maybeSingle(),
    aba === "empilhadeiras" && buscaHorimetro.length >= 2
      ? supabase
          .from("pa_empilhadeira_operacoes")
          .select(
            "id, operador_nome, horimetro_inicial, horimetro_final, inicio, fim, status, foto_inicial_url, foto_final_url, pa_empilhadeiras(numero)",
          )
          .eq("revenda_id", revendaId)
          .ilike("operador_nome", `%${buscaHorimetro}%`)
          .order("inicio", { ascending: false })
          .limit(20)
      : Promise.resolve({
          data: [] as {
            id: string;
            operador_nome: string;
            horimetro_inicial: number;
            horimetro_final: number | null;
            inicio: string;
            fim: string | null;
            status: string;
            foto_inicial_url: string | null;
            foto_final_url: string | null;
            pa_empilhadeiras: { numero: string } | { numero: string }[] | null;
          }[],
        }),
    supabase
      .from("pa_fefo_motivos")
      .select("id, nome, ajuda, emoji, ordem, ativo")
      .eq("revenda_id", revendaId)
      .order("ordem")
      .order("nome"),
    // Depósitos e as ruas de cada um (migration 097). Só na aba FEFO: são
    // duas consultas que não têm o que fazer nas outras quatro abas.
    aba === "fefo"
      ? supabase
          .from("pa_fefo_depositos")
          .select("id, nome, ordem, ativo")
          .eq("revenda_id", revendaId)
          .order("ordem")
          .order("nome")
      : Promise.resolve({ data: [] as DepositoBanco[] }),
    aba === "fefo"
      ? supabase
          .from("pa_fefo_ruas")
          .select("id, deposito_id, nome, ordem, ativo")
          .eq("revenda_id", revendaId)
          .order("ordem")
          .order("nome")
      : Promise.resolve({ data: [] as RuaBanco[] }),
    // Apagar motivo é a única ação atrás de "excluir" -- pedido do dono:
    // desativar qualquer um com "editar" pode; apagar, não.
    podeNoModulo("produtividade-armazem", "excluir"),
    supabase
      .from("pa_empilhadeira_config")
      .select("custo_p20, estoque_minimo_p20, fornecedor_nome, fornecedor_telefone")
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    // Trocas de gás recentes, para corrigir horímetro digitado errado.
    aba === "empilhadeiras"
      ? supabase
          .from("pa_empilhadeira_trocas_gas")
          .select(
            "id, horimetro, realizada_em, operador_nome, foto_url, botijoes_cheios, botijoes_vazios, pa_empilhadeiras(numero)",
          )
          .eq("revenda_id", revendaId)
          .order("realizada_em", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    // Atendimentos recentes, para corrigir agendamento lançado errado.
    aba === "recebimento"
      ? supabase
          .from("atendimentos_carretas")
          .select("id, numero_dt, placa_carreta, motorista_nome, chegada_em, carga_agendada, agendamento_em, status")
          .eq("revenda_id", revendaId)
          .order("chegada_em", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as CarretaParaCorrigir[] }),
    // Quem recebe o aviso de gás acabando -- SÓ OS IDS aqui; os nomes vêm
    // numa segunda consulta, logo abaixo.
    //
    // Era um join `profiles(nome, cargo)`, e ele nunca funcionou:
    // pa_gas_notificados.colaborador_id aponta para auth.users, não para
    // public.profiles, então o PostgREST responde "Could not find a
    // relationship between 'pa_gas_notificados' and 'profiles'" e devolve
    // NULL -- não uma lista vazia, não um erro na tela. O resultado era a
    // seção inteira dizendo "Ninguém da liderança está sendo avisado
    // ainda" com quatro pessoas gravadas no banco, e sem lixeira nenhuma
    // para tirá-las. Relatado pelo dono em 03/09/2026; conferido no banco:
    // as quatro linhas estavam lá desde o dia anterior.
    aba === "empilhadeiras"
      ? admin
          .from("pa_gas_notificados")
          .select("colaborador_id")
          .eq("revenda_id", revendaId)
      : Promise.resolve({ data: [] as { colaborador_id: string }[] }),
    aba === "empilhadeiras" && buscaLideranca.length >= 2
      ? (() => {
          let q = admin.from("profiles").select("id, nome, cargo").limit(10);
          const digitos = buscaLideranca.replace(/\D/g, "");
          q = digitos
            ? q.or(`nome.ilike.%${buscaLideranca}%,cpf.ilike.%${digitos}%`)
            : q.ilike("nome", `%${buscaLideranca}%`);
          return q;
        })()
      : Promise.resolve({ data: [] as { id: string; nome: string; cargo: string | null }[] }),
  ]);

  /*
    Os nomes de quem recebe o aviso de gás, buscados à parte.

    Duas consultas em vez de um join porque o join não existe: a coluna
    aponta para auth.users, e o PostgREST só atravessa relação declarada
    entre tabelas do schema público. Buscar por `in` é barato -- são
    quatro ids, não uma varredura -- e é o mesmo padrão que o resto do app
    usa quando precisa do nome de alguém a partir de uma tabela de
    vínculo.
  */
  const idsNotificados = ((notificadosGas ?? []) as { colaborador_id: string }[]).map(
    (n) => n.colaborador_id,
  );
  const { data: perfisNotificados } = idsNotificados.length
    ? await admin.from("profiles").select("id, nome, cargo").in("id", idsNotificados)
    : { data: [] as { id: string; nome: string; cargo: string | null }[] };

  const notificados = idsNotificados
    .map((id) => {
      const p = (perfisNotificados ?? []).find((x) => x.id === id);
      return {
        colaborador_id: id,
        // Cadastro apagado deixa o vínculo para trás. Mostrar a linha
        // assim mesmo é o que permite tirá-la daqui -- escondê-la faria
        // um aviso continuar sendo enviado para um id que ninguém vê.
        nome: p?.nome ?? "(cadastro removido)",
        cargo: p?.cargo ?? null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const totalMotivosFefo = motivosFefo?.length ?? 0;

  /*
    A ORDEM DOS DOIS CATÁLOGOS DO FEFO, resolvida aqui e não no `order`
    do banco: o Postgres ordena "10" antes de "2" porque o nome da rua é
    texto, e quem procura a sua rua na lista passa por ela sem ver.

    Ordena pelo NOME (ver compararNomes), não por um campo "ordem": o
    campo existia, e a primeira coisa que aconteceu foi o depósito A
    ficar com ordem 12 e aparecer depois do C.
  */
  const depositosOrdenados = [...(depositosFefo ?? [])].sort(compararNomes);
  const ruasDaTela = (ruasFefo ?? []).map((r) => ({
    id: r.id,
    depositoId: r.deposito_id,
    nome: r.nome,
    ativo: r.ativo,
  }));

  const totalEmbalagensDespejo = embalagensDespejo?.length ?? 0;

  // Embalagens do Repack: quantas ativas, e quantos produtos usam cada
  // uma. A contagem de produtos é o que separa uma embalagem de verdade
  // da órfã que a importação deixou para trás ao mudar de nome.
  const embalagensRepack = (embalagens ?? []) as {
    id: string;
    nome: string;
    meta_reepacks_hora: number | null;
    ativo: boolean;
  }[];
  const embalagensRepackAtivas = embalagensRepack.filter((e) => e.ativo);
  const produtosPorEmbalagem = new Map<string, number>();
  for (const p of (produtosReepackBanco ?? []) as { embalagem_id?: string | null }[]) {
    if (p.embalagem_id) {
      produtosPorEmbalagem.set(p.embalagem_id, (produtosPorEmbalagem.get(p.embalagem_id) ?? 0) + 1);
    }
  }
  const totalEmpilhadeiras = empilhadeiras?.length ?? 0;
  const totalFabricas = fabricas?.length ?? 0;
  const totalTransportadoras = transportadoras?.length ?? 0;
  const totalChecklist = itensChecklist?.length ?? 0;
  const totalMotoristas = motoristas?.length ?? 0;
  const totalEmpilhadores = empilhadores?.length ?? 0;
  const totalAg = agCatalogo?.length ?? 0;

  const embalagemNomePorId = new Map((embalagens ?? []).map((e) => [e.id, e.nome]));

  const produtosReepack: (ProdutoReepack & { ativo: boolean })[] = (produtosReepackBanco ?? []).map((p) => ({
    ...produtoReepackDeLinha(p),
    ativo: p.ativo,
  }));
  const totalProdutosReepack = produtosReepack.length;
  const pendentesReepack = produtosReepack.filter((p) => !produtoProntoParaReepack(p)).length;
  // Conta a base INTEIRA, não a lista filtrada: o aviso serve para dizer
  // que existe o problema, e uma busca por "GATORADE" não deve fazer os
  // outros nove sumirem da contagem.
  const lastroErrado = produtosReepack.filter((p) => lastroFechaOPalete(p) === false).length;
  const produtosReepackFiltrados = buscaReepack
    ? produtosReepack.filter(
        (p) => p.codigo.toLowerCase().includes(buscaReepack) || p.descricao.toLowerCase().includes(buscaReepack),
      )
    : produtosReepack;
  // O que precisa de conserto sobe pro topo -- é o que falta corrigir na
  // planilha, e não deveria depender de rolar 565 produtos pra achar.
  // Primeiro o cadastro incompleto (o produto nem aparece no
  // lançamento), depois o lastro que não fecha (aparece, e mente).
  const produtosReepackOrdenados = [...produtosReepackFiltrados].sort((a, b) => {
    const prontoA = produtoProntoParaReepack(a) ? 1 : 0;
    const prontoB = produtoProntoParaReepack(b) ? 1 : 0;
    const lastroA = lastroFechaOPalete(a) === false ? 0 : 1;
    const lastroB = lastroFechaOPalete(b) === false ? 0 : 1;
    return (
      prontoA - prontoB ||
      lastroA - lastroB ||
      a.descricao.localeCompare(b.descricao, "pt-BR")
    );
  });

  return (
    <div>
      <PageHeader
        title="Produtividade do Armazém — Configuração"
        subtitle="Cadastro de produtos (por planilha ou à mão), empilhadeiras, catálogos de recebimento e checklist 5S."
      />

      {/* A confirmação vira aviso flutuante, no rodapé, perto do polegar.
          Esta tela tem 1.700 linhas de formulário: quem cadastrava um
          lembrete lá embaixo era devolvido para a mesma posição com a
          mensagem a três mil pixels dali, e da cadeira dele nada tinha
          acontecido -- o passo seguinte era clicar de novo (relatado pelo
          dono em 03/09/2026). O <p> colorido no topo continua, para
          quem estiver justamente aqui em cima. */}
      <AvisoDaUrl />

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <a
        href="/produtividade-armazem"
        className="mb-4 inline-flex text-sm font-medium text-primary hover:underline"
      >
        ← Ir para o app
      </a>

      {/* Segmented control: mesma ideia da barra do Admin -- ícone sempre
          visível, rótulo junto para não depender só da cor pra dizer qual
          aba está ativa. */}
      <nav className="mb-6 grid grid-cols-4 gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {ABAS.map((a) => (
          <a
            key={a.id}
            href={`?aba=${a.id}`}
            aria-current={a.id === aba ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-center text-xs font-semibold transition-colors ${
              a.id === aba ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <span className="text-base leading-none">{a.emoji}</span>
            {a.rotulo}
          </a>
        ))}
      </nav>

      {aba === "reepack-despejo" && (
        <div className="space-y-6">
          {/*
            CADASTRO DE PRODUTOS -- o nome é esse, e só esse (pedido do
            dono, 04/09/2026). "Produtos do Reepack" dizia onde o produto
            é USADO, não o que o cartão é: o mesmo cadastro alimenta
            Repack, Despejo, Abastecimento do Picking e FEFO, e quem vem
            cadastrar um produto novo não procura pelo nome de um dos
            módulos que o consomem.
          */}
          <PainelCadastro
          titulo="Cadastro de produtos"
          contagem={totalProdutosReepack}
          novoRotulo="Cadastrar um produto"
          temItens={totalProdutosReepack > 0}
          vazio="Nenhum produto cadastrado ainda -- importe a planilha ou cadastre um à mão."
          /*
            A FAIXA: as duas ações que valem para o CATÁLOGO INTEIRO --
            importar a base e procurar um produto nela. Ficam separadas
            do "+", que é para acrescentar UM produto (ver CadastroCard).
          */
          faixaTopo={
            <div className="space-y-3">
              {/* A BUSCA vem antes da importação: procurar um produto
                  acontece toda semana, importar a base acontece quando a
                  planilha muda. */}
              <BuscaProdutoCadastro termoAtual={buscaReepack} />

              <details className="group/imp border-t border-primary/10 pt-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary-dark marker:content-none [&::-webkit-details-marker]:hidden">
                  <span
                    className="transition-transform group-open/imp:rotate-90"
                    aria-hidden="true"
                  >
                    ▸
                  </span>
                  📥 Importar a base (planilha .xlsx)
                </summary>

                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-600">
                    Resolve a base inteira de uma vez: cluster, Fator Hecto, caixas/pallet,
                    caixas/lastro, unidades/caixa, tipo, embalagem e meta de repack (cx/h) vêm todos
                    daqui. Produto novo ou meta nova? Atualiza a planilha e importa de novo — quem
                    já existe (mesmo código Promax) é <strong>atualizado</strong>, nunca duplicado.
                  </p>

                  {/*
                    BAIXAR ANTES DE IMPORTAR -- pedido do dono
                    (05/09/2026), e ele achou o defeito junto: editar um
                    produto na tela e depois importar uma planilha antiga
                    devolve o campo ao que estava lá, inclusive vazio.

                    É o desenho da importação: cada linha substitui o
                    produto inteiro, e coluna em branco quer dizer campo
                    vazio, não "não mexa". Trocar essa regra impediria de
                    APAGAR um valor errado pela planilha.

                    A saída é parar de manter uma planilha paralela que
                    envelhece a cada correção feita na tela: baixa-se a
                    verdade, edita-se, devolve-se. O que não foi tocado
                    volta igual porque veio de lá.
                  */}
                  <a
                    href="/api/produtividade-armazem/produtos/exportar"
                    className="flex items-center gap-2 rounded-xl border border-primary bg-white px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary-soft"
                  >
                    <span className="text-base leading-none">⬇️</span>
                    <span className="min-w-0">
                      {/* `totalProdutos` (a base inteira), e não
                          `totalProdutosReepack`, que só conta quem tem
                          Fator Hecto: o arquivo sai com TODOS, e um
                          número menor no botão faria a pessoa achar que
                          alguém ficou de fora. */}
                      Baixar a planilha padrão com os {totalProdutos ?? 0} produtos
                      <span className="block text-xs font-normal text-slate-500">
                        Comece por aqui: edite este arquivo e importe de volta. Assim nada que já
                        está cadastrado se perde.
                      </span>
                    </span>
                  </a>
                  <form action={importarPlanilhaProdutos} className="space-y-2">
                    {/*
                      O "Escolher arquivo / Nenhum arquivo escolhido" do
                      navegador é cinza, minúsculo e em inglês em alguns
                      aparelhos -- ninguém acha onde clicar (pedido do
                      dono, 05/09/2026). As classes `file:` estilizam o
                      BOTÃO interno do input, que é a única parte que dá
                      para vestir sem JavaScript. O nome do arquivo
                      escolhido continua sendo escrito pelo navegador, ao
                      lado do botão.
                    */}
                    <label className="block cursor-pointer rounded-xl border-2 border-dashed border-primary/40 bg-white p-3 hover:border-primary">
                      <span className="mb-2 block text-xs font-semibold text-slate-700">
                        1. Escolha o arquivo da planilha
                      </span>
                      <input
                        type="file"
                        name="arquivo"
                        accept=".xlsx"
                        required
                        className="block w-full cursor-pointer text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-white hover:file:bg-primary-dark"
                      />
                      <span className="mt-2 block text-xs text-slate-400">
                        Só .xlsx. A primeira aba do arquivo é a que vale.
                      </span>
                    </label>
                    <BotaoEnviar
                      textoEnviando="Importando..."
                      className="w-full rounded-xl bg-primary px-3 py-3 text-sm font-bold text-white hover:bg-primary-dark"
                    >
                      2. Importar planilha
                    </BotaoEnviar>
                  </form>
                </div>
              </details>
            </div>
          }
          formNovo={
            <div className="space-y-4">
              {/* CADASTRO À MÃO -- pedido do dono, para o caso eventual.
                  Agora ele É o formulário do "+", sem mais um `details`
                  por cima: com a planilha na faixa de cima, o "+" tem um
                  assunto só, e ele é este.

                  Os campos são os MESMOS da planilha, com as mesmas
                  regras: código e descrição obrigatórios, Fator Hecto e
                  embalagem exigidos porque sem os dois o produto não
                  aparece no lançamento (ver produtoProntoParaReepack) --
                  cadastrar um produto que não dá para lançar seria
                  cadastrar um problema para descobrir depois. */}
              <div>
                <p className="text-xs text-slate-500">
                  Para o produto que apareceu sozinho e não vale reimportar a planilha
                  inteira. Se o código já existir, o cadastro é <strong>atualizado</strong>,
                  nunca duplicado — a mesma regra da importação.
                </p>

                <form action={salvarProdutoReepack} className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className={rotulo} htmlFor="np-codigo">Código Promax *</label>
                      <input id="np-codigo" name="codigo" required maxLength={40} className={campo} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={rotulo} htmlFor="np-descricao">Descrição *</label>
                      <input id="np-descricao" name="descricao" required maxLength={200} className={campo} />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className={rotulo} htmlFor="np-fator">Fator Hecto (HL/caixa) *</label>
                      <input
                        id="np-fator"
                        name="fator_hecto"
                        type="number"
                        inputMode="decimal"
                        /* step="any": produto com cinco casas existe
                           (0,00588), e um step fixo recusaria o valor
                           real. O servidor exige > 0. */
                        step="any"
                        min="0"
                        required
                        placeholder="Ex.: 0,06"
                        className={campo}
                      />
                    </div>
                    <div>
                      <label className={rotulo} htmlFor="np-uncx">Unidades por caixa</label>
                      <input id="np-uncx" name="unidades_por_caixa" type="number" min={1} className={campo} />
                    </div>
                    <div>
                      <label className={rotulo} htmlFor="np-cxpallet">Caixas por pallet</label>
                      <input id="np-cxpallet" name="caixas_pallet" type="number" min={1} className={campo} />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className={rotulo} htmlFor="np-cxlastro">Caixas por lastro</label>
                      <input id="np-cxlastro" name="caixas_por_lastro" type="number" min={1} className={campo} />
                      {/* Sem este número a unidade "lastro" não é
                          oferecida para o produto -- em vez de aparecer
                          e dar HL errado. */}
                      <p className="mt-1 text-xs text-slate-400">
                        A camada do palete. Sem ele, quem lança não vê a opção
                        &quot;lastro&quot; neste produto.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className={rotulo} htmlFor="np-embalagem">Embalagem do Repack *</label>
                      <select id="np-embalagem" name="embalagem_id" required className={campo} defaultValue="">
                        <option value="" disabled>Escolha...</option>
                        {embalagensRepackAtivas.map((e) => (
                          <option key={e.id} value={e.id}>{e.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={rotulo} htmlFor="np-cluster">Cluster</label>
                      <input id="np-cluster" name="cluster_produto" maxLength={80} className={campo} />
                    </div>
                    <div>
                      <label className={rotulo} htmlFor="np-tipo">Tipo</label>
                      <select id="np-tipo" name="tipo" className={campo} defaultValue="">
                        <option value="">—</option>
                        <option value="DESCARTAVEL">Descartável</option>
                        <option value="RETORNAVEL">Retornável</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={rotulo} htmlFor="np-meta-reepack">Meta de repack (cx/h)</label>
                      <input id="np-meta-reepack" name="meta_reepack_hora" type="number" min={0} className={campo} />
                    </div>
                    <div>
                      <label className={rotulo} htmlFor="np-meta-despejo">Meta de despejo (L/h)</label>
                      <input id="np-meta-despejo" name="meta_despejo_hora" type="number" min={0} className={campo} />
                    </div>
                  </div>

                  <p className="text-xs text-slate-400">
                    * obrigatórios. Fator Hecto e embalagem são exigidos porque sem os dois o
                    produto não aparece no lançamento do Repack.
                  </p>

                  <BotaoEnviar
                    textoEnviando="Salvando..."
                    className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-dark"
                  >
                    Salvar produto
                  </BotaoEnviar>
                </form>
              </div>
            </div>
          }
        >
          {pendentesReepack > 0 && (
            <p className="bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              ⚠️ {pendentesReepack} produto(s) sem embalagem vinculada -- não aparecem no
              lançamento ainda. Corrija a coluna EMBALAGEM_REPACK na planilha e reimporte. Estão
              no topo da lista.
            </p>
          )}
          {lastroErrado > 0 && (
            <p className="bg-red-50 p-3 text-xs font-semibold text-red-800">
              🧱 {lastroErrado} produto(s) com o lastro que não fecha o palete — as caixas por
              pallet não são um número inteiro de lastros. Isso <strong>não dá erro</strong>: dá HL
              errado com cara de certo, porque o cálculo passa por caixas. Estão marcados com 🧱 na
              lista, com a conta ao lado.
            </p>
          )}
          {produtosReepackOrdenados.map((p) => {
            const pronto = produtoProntoParaReepack(p);
            const embalagemNome = p.embalagemId ? embalagemNomePorId.get(p.embalagemId) : null;
            // Duas marcas diferentes porque são dois problemas
            // diferentes: ⚠️ é cadastro incompleto (o produto nem
            // aparece no lançamento), 🧱 é cadastro que passa e mente.
            const lastroFecha = lastroFechaOPalete(p);
            const camadas = camadasDoPalete(p);
            return (
              <ItemCadastro
                key={p.id}
                ativo={p.ativo}
                titulo={`${pronto ? "" : "⚠️ "}${lastroFecha === false ? "🧱 " : ""}${p.codigo} — ${p.descricao}`}
                subtitulo={
                  p.fatorHecto !== null
                    ? [
                        p.clusterProduto,
                        p.tipo,
                        `${p.unidadesPorCaixa ?? "?"} un/caixa`,
                        `${litrosPorCaixa(p.fatorHecto)} L/caixa`,
                        p.caixasPallet !== null ? `${p.caixasPallet} cx/pallet` : null,
                        p.caixasPorLastro !== null ? `${p.caixasPorLastro} cx/lastro` : null,
                        embalagemNome ?? "sem embalagem vinculada",
                        `meta reepack ${p.metaReepackHora ?? "—"} cx/h`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "Sem Fator Hecto -- corrija na planilha e reimporte"
                }
                /* A conta aparece INTEIRA: "1650 ÷ 14 = 117,86 camadas"
                   diz sozinha qual dos dois números está errado. "Lastro
                   inconsistente" mandaria a pessoa refazer a divisão. */
                aviso={
                  lastroFecha === false && camadas !== null ? (
                    <>
                      🧱{" "}
                      <strong>
                        {p.caixasPallet} ÷ {p.caixasPorLastro} ={" "}
                        {camadas.toLocaleString("pt-BR")} camadas
                      </strong>{" "}
                      — um lastro é uma camada do palete, então a conta tem que dar número inteiro.
                      Confira a coluna CAIXAS LASTRO da planilha, ou corrija no cadastro à mão.
                    </>
                  ) : undefined
                }
                acoes={
                  <BotaoIcone
                    action={alternarProdutoAtivo}
                    campos={{ id: p.id, ativo: String(p.ativo), aba: "reepack-despejo" }}
                    titulo={p.ativo ? "Desativar" : "Ativar"}
                  >
                    {p.ativo ? "🚫" : "✅"}
                  </BotaoIcone>
                }
                /*
                  EDITAR UM PRODUTO NA LISTA -- pedido do dono
                  (05/09/2026). Até aqui, corrigir um número de um
                  produto só era possível pela planilha: mudar a linha,
                  salvar, reimportar 333. Para um lastro errado (e há dez
                  deles), isso é caro demais para o que o conserto é.

                  São os MESMOS campos do cadastro à mão, e é de
                  propósito: dois caminhos para o mesmo produto não podem
                  aceitar coisas diferentes.
                */
                formEditar={
                  <form action={editarProdutoReepack} className="space-y-3">
                    <input type="hidden" name="id" value={p.id} />

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className={rotulo}>Código Promax *</label>
                        <input name="codigo" defaultValue={p.codigo} required maxLength={40} className={campo} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={rotulo}>Descrição *</label>
                        <input name="descricao" defaultValue={p.descricao} required maxLength={200} className={campo} />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <label className={rotulo}>Fator Hecto *</label>
                        {/* step="any", e não 0.0001: o Fator Hecto vem do
                            SAP com a precisão que ele tem, e há produto
                            com cinco casas (o 22007 é 0,00588). Com um
                            step fixo, o navegador RECUSA o valor que já
                            está gravado -- "os dois valores válidos mais
                            próximos são 0,0058 e 0,0059" -- e trava a
                            edição de um campo que ninguém queria mexer. */}
                        <input
                          name="fator_hecto"
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          required
                          defaultValue={p.fatorHecto ?? ""}
                          className={campo}
                        />
                      </div>
                      <div>
                        <label className={rotulo}>Un/caixa</label>
                        <input name="unidades_por_caixa" type="number" min={1} defaultValue={p.unidadesPorCaixa ?? ""} className={campo} />
                      </div>
                      <div>
                        <label className={rotulo}>Caixas/pallet</label>
                        <input name="caixas_pallet" type="number" min={1} defaultValue={p.caixasPallet ?? ""} className={campo} />
                      </div>
                      <div>
                        <label className={rotulo}>Caixas/lastro</label>
                        <input
                          name="caixas_por_lastro"
                          type="number"
                          min={1}
                          defaultValue={p.caixasPorLastro ?? ""}
                          className={`${campo} ${lastroFecha === false ? "border-red-400 bg-red-50" : ""}`}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className={rotulo}>Embalagem do Repack</label>
                        <select name="embalagem_id" className={campo} defaultValue={p.embalagemId ?? ""}>
                          <option value="">— sem embalagem —</option>
                          {embalagensRepackAtivas.map((e) => (
                            <option key={e.id} value={e.id}>{e.nome}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={rotulo}>Cluster</label>
                        <input name="cluster_produto" defaultValue={p.clusterProduto ?? ""} maxLength={80} className={campo} />
                      </div>
                      <div>
                        <label className={rotulo}>Tipo</label>
                        <select name="tipo" className={campo} defaultValue={p.tipo ?? ""}>
                          <option value="">—</option>
                          <option value="DESCARTAVEL">Descartável</option>
                          <option value="RETORNAVEL">Retornável</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={rotulo}>Meta de repack (cx/h)</label>
                        <input name="meta_reepack_hora" type="number" min={0} defaultValue={p.metaReepackHora ?? ""} className={campo} />
                      </div>
                      <div>
                        <label className={rotulo}>Meta de despejo (L/h)</label>
                        <input name="meta_despejo_hora" type="number" min={0} defaultValue={p.metaDespejoHora ?? ""} className={campo} />
                      </div>
                    </div>

                    {/* O aviso é a parte que importa: a correção feita
                        aqui vive até a próxima importação, que
                        sobrescreve o produto pelo código. */}
                    <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                      A próxima importação da planilha <strong>sobrescreve</strong> este produto —
                      corrija também lá, senão o número volta ao errado.
                    </p>

                    <BotaoEnviar
                      textoEnviando="Salvando..."
                      className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-dark"
                    >
                      Salvar produto
                    </BotaoEnviar>
                  </form>
                }
              />
            );
          })}
          </PainelCadastro>

          <PainelCadastro
            titulo="Embalagens — Repack"
            contagem={embalagensRepackAtivas.length}
            temItens={(embalagensRepack ?? []).length > 0}
            vazio="Nenhuma embalagem ainda -- importe a planilha de produtos, ela cria as embalagens sozinha."
            formNovo={
              <p className="text-xs text-slate-500">
                Catálogo do Repack, criado pela planilha de produtos (o Despejo tem o dele, logo
                abaixo). Aqui você ajusta a <strong>meta de caixas por hora</strong> de cada tipo —
                é a régua do acompanhamento por embalagem — e desativa a duplicata que a importação
                deixou para trás quando o nome mudou na planilha. Desativar não apaga histórico.
              </p>
            }
          >
            {(embalagensRepack ?? []).map((e) => {
              const produtos = produtosPorEmbalagem.get(e.id) ?? 0;
              return (
                <ItemCadastro
                  key={e.id}
                  ativo={e.ativo}
                  titulo={e.nome}
                  subtitulo={
                    produtos === 0
                      ? "⚠️ nenhum produto usa esta embalagem"
                      : `${produtos} produto(s)${
                          e.meta_reepacks_hora ? ` · meta ${e.meta_reepacks_hora} cx/h` : " · sem meta"
                        }`
                  }
                  acoes={
                    <BotaoIcone
                      action={alternarEmbalagemRepackAtivo}
                      campos={{ id: e.id, ativo: String(e.ativo) }}
                      titulo={e.ativo ? "Desativar" : "Ativar"}
                    >
                      {e.ativo ? "🚫" : "✅"}
                    </BotaoIcone>
                  }
                  formEditar={
                    <form action={editarEmbalagemRepack} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={e.id} />
                      <input
                        name="meta_reepacks_hora"
                        type="number"
                        step="0.1"
                        min={0}
                        defaultValue={e.meta_reepacks_hora ?? ""}
                        placeholder="Meta cx/h"
                        className={campo}
                      />
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </BotaoEnviar>
                    </form>
                  }
                />
              );
            })}
          </PainelCadastro>

          <PainelCadastro
            titulo="Embalagens — Despejo"
            contagem={totalEmbalagensDespejo}
            temItens={totalEmbalagensDespejo > 0}
            vazio="Nenhuma embalagem ainda -- importe a planilha de produtos, ela cria as embalagens sozinha."
            formNovo={
              <p className="text-xs text-slate-500">
                Despejo é lançado por embalagem, não por produto -- e tem catálogo PRÓPRIO,
                diferente do Repack (mesma peça pode ter nome diferente nos dois:
                &ldquo;Lata 350ml C/12&rdquo; no Repack, &ldquo;Lata 350ml&rdquo; no Despejo). O
                litro por unidade já vem calculado da planilha de produtos (Fator Hecto ÷
                Un/Cx); ajuste aqui só se precisar corrigir, e a meta de L/h de cada uma.
              </p>
            }
          >
            {(embalagensDespejo ?? []).map((e) => (
              <ItemCadastro
                key={e.id}
                titulo={e.nome}
                subtitulo={
                  e.litros_por_unidade !== null
                    ? `${e.litros_por_unidade} L/unidade${e.meta_litros_hora ? ` · meta ${e.meta_litros_hora} L/h` : ""}`
                    : "⚠️ sem litro por unidade -- não aparece no lançamento de despejo"
                }
                formEditar={
                  <form action={editarEmbalagemDespejo} className="flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    <input
                      name="litros_por_unidade"
                      type="number"
                      step="0.001"
                      defaultValue={e.litros_por_unidade ?? ""}
                      placeholder="Litros por unidade"
                      className={campo}
                    />
                    <input
                      name="meta_litros_hora"
                      type="number"
                      step="0.1"
                      defaultValue={e.meta_litros_hora ?? ""}
                      placeholder="Meta L/h"
                      className={campo}
                    />
                    <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                      Salvar
                    </BotaoEnviar>
                  </form>
                }
              />
            ))}
          </PainelCadastro>
        </div>
      )}

      {aba === "empilhadeiras" && (
        <div className="space-y-6">
          <PainelCadastro
            titulo="Empilhadeiras"
            contagem={totalEmpilhadeiras}
            novoRotulo="Nova"
            temItens={totalEmpilhadeiras > 0}
            vazio="Nenhuma empilhadeira cadastrada ainda."
            formNovo={
              <form action={salvarEmpilhadeira} className="flex gap-2">
                <input name="numero" placeholder="Número/identificação" required className={`${campo} flex-1`} />
                <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                  Adicionar
                </BotaoEnviar>
              </form>
            }
          >
            {(empilhadeiras ?? []).map((m) => (
              <ItemCadastro
                key={m.id}
                ativo={m.ativo}
                titulo={`🏗️ ${m.numero}`}
                acoes={
                  <>
                    <BotaoIcone action={alternarEmpilhadeiraAtivo} campos={{ id: m.id, ativo: String(m.ativo) }} titulo={m.ativo ? "Desativar" : "Ativar"}>
                      {m.ativo ? "🚫" : "✅"}
                    </BotaoIcone>
                    <BotaoExcluir
                      action={excluirEmpilhadeira}
                      campos={{ id: m.id }}
                      confirmacao={`Excluir a empilhadeira "${m.numero}"?`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                    >
                      🗑️
                    </BotaoExcluir>
                  </>
                }
                formEditar={
                  <form action={editarEmpilhadeira} className="flex gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <input name="numero" defaultValue={m.numero} required className={`${campo} flex-1`} />
                    <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                      Salvar
                    </BotaoEnviar>
                  </form>
                }
              />
            ))}
          </PainelCadastro>

          {/* Fechado, como os cartões de catálogo: a aba vira uma lista
              de assuntos, e abre-se o que se veio mexer (pedido do dono,
              03/09/2026). */}
          <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none border-b border-slate-100 p-4 marker:content-none [&::-webkit-details-marker]:hidden">
              <h2 className="text-sm font-bold text-slate-900">
                <span className="mr-1 inline-block text-slate-400 transition-transform group-open:rotate-90">
                  ▸
                </span>
                ⛽ Valor do botijão P20
              </h2>
              <p className="mt-1 pl-4 text-xs text-slate-500">
                Vira custo por hora no dashboard de consumo de gás. Deixe em branco para não mostrar
                valores — as horas e o consumo aparecem do mesmo jeito.
              </p>
            </summary>
            <form action={salvarCustoP20} className="flex flex-wrap items-end gap-2 p-4">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="custo_p20">
                  Valor do P20 (R$)
                </label>
                <input
                  id="custo_p20"
                  name="custo_p20"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="Ex: 120,00"
                  defaultValue={empilhadeiraConfig?.custo_p20 ?? ""}
                  className={campo}
                />
              </div>
              <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                Salvar
              </BotaoEnviar>
            </form>
          </details>

          {/* ---- Alerta de gás acabando ---- */}
          <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none border-b border-slate-100 p-4 marker:content-none [&::-webkit-details-marker]:hidden">
              <h2 className="text-sm font-bold text-slate-900">
                <span className="mr-1 inline-block text-slate-400 transition-transform group-open:rotate-90">
                  ▸
                </span>
                🔥 Alerta de gás P20 acabando
              </h2>
              <p className="mt-1 pl-4 text-xs text-slate-500">
                Em toda troca o empilhador conta os botijões do depósito. Caindo ao mínimo, o app
                abre um pedido e manda o aviso com o telefone do fornecedor — e o alerta fica na
                tela até alguém confirmar que solicitou.
              </p>
            </summary>

            <form action={salvarAlertaGas} className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <label className={rotulo} htmlFor="fornecedor_nome">Fornecedor</label>
                  <input
                    id="fornecedor_nome"
                    name="fornecedor_nome"
                    maxLength={120}
                    placeholder="Ex: Ultragaz Barreiras"
                    defaultValue={empilhadeiraConfig?.fornecedor_nome ?? ""}
                    className={campo}
                  />
                </div>
                <div className="min-w-0">
                  <label className={rotulo} htmlFor="fornecedor_telefone">Telefone</label>
                  <input
                    id="fornecedor_telefone"
                    name="fornecedor_telefone"
                    type="tel"
                    maxLength={40}
                    placeholder="Ex: (77) 99999-8888"
                    defaultValue={empilhadeiraConfig?.fornecedor_telefone ?? ""}
                    className={campo}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className={rotulo} htmlFor="estoque_minimo_p20">
                    Acender alerta com até quantos cheios
                  </label>
                  <input
                    id="estoque_minimo_p20"
                    name="estoque_minimo_p20"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    step={1}
                    required
                    defaultValue={empilhadeiraConfig?.estoque_minimo_p20 ?? ESTOQUE_MINIMO_PADRAO}
                    className={campo}
                  />
                </div>
                <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                  Salvar
                </BotaoEnviar>
              </div>
              <p className="text-xs text-slate-400">
                Sem telefone cadastrado o aviso ainda é enviado — só sem o número para ligar.
              </p>
            </form>

            {/* ---- Quem recebe o aviso ---- */}
            <div className="border-t border-slate-100 p-4">
              <h3 className="text-sm font-bold text-slate-900">🔔 Quem é avisado</h3>
              <p className="mt-1 text-xs text-slate-500">
                O empilhador que registrou a troca recebe sempre. Aqui você escolhe quem mais da
                liderança recebe o mesmo aviso.
              </p>

              {/* Digite e escolha, num campo só. Era um formulário GET:
                  digitar, "Buscar", recarregar a página inteira, achar a
                  lista que apareceu em algum lugar dela e clicar num
                  segundo botão -- três passos e uma volta ao servidor
                  para escolher alguém que o app já conhece (pedido do
                  dono, 03/09/2026). */}
              <FormularioComPessoa
                action={adicionarNotificadoGas}
                buscar={buscarColaboradoresParaLembrete}
                campoId="colaborador_id"
                placeholder="Digite o nome ou CPF de quem vai ser avisado"
                rotuloBotao="Incluir"
              />
            </div>

            <div className="divide-y divide-slate-100">
              {notificados.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">
                  Ninguém da liderança está sendo avisado ainda.
                </p>
              ) : (
                notificados.map((n) => (
                  <ItemCadastro
                    key={n.colaborador_id}
                    titulo={n.nome}
                    subtitulo={n.cargo ?? undefined}
                    acoes={
                      <BotaoExcluir
                        action={removerNotificadoGas}
                        campos={{ colaborador_id: n.colaborador_id }}
                        confirmacao={`Parar de avisar ${n.nome} sobre gás acabando?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    }
                  />
                ))
              )}
            </div>
          </details>

          <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none border-b border-slate-100 p-4 marker:content-none [&::-webkit-details-marker]:hidden">
              <h2 className="text-sm font-bold text-slate-900">
                <span className="mr-1 inline-block text-slate-400 transition-transform group-open:rotate-90">
                  ▸
                </span>
                🔔 Lembrete de fechamento
              </h2>
              <p className="mt-1 pl-4 text-xs text-slate-500">
                Por pessoa, não por máquina: o aviso chega pro empilhadeirista no fim do
                turno dele, se ele estiver com alguma empilhadeira aberta.
              </p>
            </summary>

            {/* O formulário fica FORA do <summary>: dentro dele, cada
                toque no campo fecharia o painel em vez de digitar -- o
                summary é o alvo que abre e fecha o <details>. */}
            <div className="border-b border-slate-100 px-4 pb-4">
              <FormularioComPessoa
                action={salvarLembreteEmpilhadeira}
                buscar={buscarColaboradoresParaLembrete}
                campoId="operador_id"
                campoNome="operador_nome"
                placeholder="Digite o nome ou CPF do empilhadeirista"
                rotuloBotao="Salvar"
                extras={
                  <select name="turno" required className={`${campo} w-auto shrink-0`}>
                    {TURNOS.map((t) => (
                      <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
                    ))}
                  </select>
                }
              />
            </div>
            <div className="divide-y divide-slate-100">
              {(lembretes ?? []).length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Nenhum lembrete cadastrado.</p>
              ) : (
                (lembretes ?? []).map((l) => (
                  <ItemCadastro
                    key={l.id}
                    titulo={l.operador_nome}
                    subtitulo={ROTULO_TURNO_CURTO[l.turno as keyof typeof ROTULO_TURNO] ?? l.turno}
                    acoes={
                      <BotaoExcluir
                        action={excluirLembreteEmpilhadeira}
                        campos={{ id: l.id }}
                        confirmacao={`Excluir o lembrete de ${l.operador_nome}?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    }
                  />
                ))
              )}
            </div>
          </details>

          {/* FECHADA, pedido do dono (03/09/2026): são 20 trocas com foto,
              formulário de correção e lixeira cada uma -- o bloco mais
              alto desta aba, e ele fica no caminho de tudo o que vem
              depois. Corrigir horímetro é conserto, não rotina: quem
              precisa, abre. */}
          <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none border-b border-slate-100 p-4 marker:content-none [&::-webkit-details-marker]:hidden">
              <h2 className="text-sm font-bold text-slate-900">
                ⛽ Corrigir ou excluir troca de gás
                <span className="ml-2 font-medium text-slate-400">
                  {(trocasGas ?? []).length} registro
                  {(trocasGas ?? []).length === 1 ? "" : "s"} · toque para abrir
                </span>
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Um horímetro digitado sem o ponto (5485,0 virando 54850) distorce o ciclo inteiro no
                dashboard de consumo. Se a troca foi lançada por engano — ou com a foto errada —
                use o 🗑️: a foto sai junto. Últimas 20 trocas.
              </p>
            </summary>
            <div className="divide-y divide-slate-100">
              {(trocasGas ?? []).length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Nenhuma troca registrada.</p>
              ) : (
                (trocasGas ?? []).map((t) => {
                  const maq = Array.isArray(t.pa_empilhadeiras) ? t.pa_empilhadeiras[0] : t.pa_empilhadeiras;
                  const descricao = `${maq?.numero ?? "—"} — ${t.operador_nome as string} — ${formatarDataHora(
                    t.realizada_em as string,
                  )}`;
                  return (
                    <div key={t.id as string} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-xs text-slate-500">🏗️ {descricao}</p>
                        {podeExcluir && (
                          <BotaoExcluir
                            action={excluirTrocaGas}
                            campos={{ id: t.id as string }}
                            confirmacao={`Excluir a troca de gás de ${descricao}? A foto também será apagada. Não dá para desfazer.`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                          >
                            🗑️
                          </BotaoExcluir>
                        )}
                      </div>

                      {/* A foto vem junto: é por ela que se reconhece a
                          troca lançada errada -- o horímetro e a data
                          sozinhos não dizem qual imagem está no registro. */}
                      {typeof t.foto_url === "string" && t.foto_url && (
                        <FotoEvidencia
                          src={t.foto_url}
                          alt={`Horímetro da troca — ${descricao}`}
                          classeCaixa="h-24 w-24"
                        />
                      )}

                      <form action={corrigirHorimetroTrocaGas} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={t.id as string} />
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                            Horímetro da troca
                          </label>
                          <input
                            name="horimetro"
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min={0}
                            required
                            defaultValue={String(t.horimetro)}
                            className={`${campo} w-36`}
                          />
                        </div>
                        <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                          Salvar
                        </BotaoEnviar>
                      </form>
                    </div>
                  );
                })
              )}
            </div>
          </details>

          <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none border-b border-slate-100 p-4 marker:content-none [&::-webkit-details-marker]:hidden">
              <h2 className="text-sm font-bold text-slate-900">
                <span className="mr-1 inline-block text-slate-400 transition-transform group-open:rotate-90">
                  ▸
                </span>
                🛠️ Corrigir ou excluir operação
              </h2>
              <p className="mt-1 pl-4 text-xs text-slate-500">
                Para quando o operador digitou o horímetro errado (ex: sem o ponto decimal).
                Só corrige o número -- não reabre nem fecha a operação. Se a operação foi lançada
                por engano, ou com a foto errada, use o 🗑️: as fotos saem junto.
              </p>
            </summary>

            {/* Fora do <summary>: um campo dentro dele fecharia o painel a
                cada toque, em vez de deixar digitar. */}
            <div className="border-b border-slate-100 px-4 pb-4">
              <form method="get" className="flex gap-2">
                <input type="hidden" name="aba" value="empilhadeiras" />
                <input
                  name="buscaHorimetro"
                  defaultValue={buscaHorimetro}
                  placeholder="Buscar operação pelo nome do operador"
                  className={`${campo} flex-1`}
                />
                <button type="submit" className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                  Buscar
                </button>
              </form>
            </div>

            <div className="divide-y divide-slate-100">
              {buscaHorimetro.length > 0 && buscaHorimetro.length < 2 ? (
                <p className="p-6 text-center text-sm text-slate-400">Digite ao menos 2 letras.</p>
              ) : buscaHorimetro.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Busque pelo nome do operador para ver as operações dele.</p>
              ) : (operacoesEncontradas ?? []).length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Nenhuma operação encontrada.</p>
              ) : (
                (operacoesEncontradas ?? []).map((o) => {
                  const maquina = Array.isArray(o.pa_empilhadeiras) ? o.pa_empilhadeiras[0] : o.pa_empilhadeiras;
                  const encerrada = o.status === "encerrada";
                  const descricao = `${maquina?.numero ?? "—"} — ${o.operador_nome} — ${formatarDataHora(o.inicio)}`;
                  return (
                    <div key={o.id} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-xs text-slate-500">
                          🏗️ {descricao}
                          {o.fim && ` até ${formatarDataHora(o.fim)}`}
                          {!encerrada && " · em aberto"}
                        </p>
                        {podeExcluir && (
                          <BotaoExcluir
                            action={excluirOperacaoEmpilhadeira}
                            campos={{ id: o.id }}
                            confirmacao={`Excluir a operação de ${descricao}? As fotos também serão apagadas. Não dá para desfazer.`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                          >
                            🗑️
                          </BotaoExcluir>
                        )}
                      </div>

                      {/* A foto é o que identifica a operação lançada
                          errada -- horímetro e data sozinhos não dizem
                          qual imagem foi anexada. */}
                      <div className="flex flex-wrap gap-2">
                        {o.foto_inicial_url && (
                          <FotoEvidencia
                            src={o.foto_inicial_url}
                            alt={`Horímetro inicial — ${descricao}`}
                            classeCaixa="h-24 w-24"
                          />
                        )}
                        {o.foto_final_url && (
                          <FotoEvidencia
                            src={o.foto_final_url}
                            alt={`Horímetro final — ${descricao}`}
                            classeCaixa="h-24 w-24"
                          />
                        )}
                      </div>

                      <form
                        action={corrigirHorimetroOperacao}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="id" value={o.id} />
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Horímetro inicial</label>
                          <input
                            name="horimetro_inicial"
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min={0}
                            required
                            defaultValue={o.horimetro_inicial}
                            className={`${campo} w-32`}
                          />
                        </div>
                        {encerrada && (
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Horímetro final</label>
                            <input
                              name="horimetro_final"
                              type="number"
                              inputMode="decimal"
                              step="0.1"
                              min={0}
                              defaultValue={o.horimetro_final ?? ""}
                              className={`${campo} w-32`}
                            />
                          </div>
                        )}
                        <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                          Salvar
                        </BotaoEnviar>
                      </form>
                    </div>
                  );
                })
              )}
            </div>
          </details>
        </div>
      )}

      {aba === "recebimento" && (
        <div className="space-y-6">
          {/* Correção do agendamento -- pedido do dono, 30/08/2026. Fica
              no topo porque é o que se procura quando algo saiu errado; o
              resto da aba é cadastro, que se mexe uma vez e esquece. */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-900">Corrigir agendamento da carreta</h2>
              <p className="mt-1 text-xs text-slate-500">
                O agendamento decide <strong>de onde o TMA começa a contar</strong>. Marcado por engano, a
                espera entre a chegada e o horário agendado desaparece da conta.
              </p>
              <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500">
                Só o agendamento se corrige aqui. Chegada, descarga, carga e conferência são apontamentos do que
                aconteceu — editá-los seria dar a alguém a chave para melhorar o próprio TMA depois do fato.
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {(carretasRecentes ?? []).length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Nenhum atendimento registrado ainda.</p>
              ) : (
                (carretasRecentes ?? []).map((c: CarretaParaCorrigir) => (
                  <form key={c.id} action={corrigirAgendamentoCarreta} className="space-y-2 p-4">
                    <input type="hidden" name="id" value={c.id} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          DT {c.numero_dt} — Carreta {c.placa_carreta}
                        </p>
                        <p className="text-xs text-slate-500">
                          {c.motorista_nome} · chegou {formatarDataHora(c.chegada_em)}
                        </p>
                        <p className="text-xs font-semibold text-primary">
                          {c.carga_agendada
                            ? `⏰ Agendada${c.agendamento_em ? ` para ${formatarDataHora(c.agendamento_em)}` : " (sem horário)"}`
                            : "Sem agendamento — o TMA conta da chegada"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {c.status}
                      </span>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        name="carga_agendada"
                        defaultChecked={c.carga_agendada}
                        className="h-4 w-4"
                      />
                      ⏰ Carga agendada
                    </label>

                    <div className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <label className={rotulo} htmlFor={`ag-${c.id}`}>
                          Data/hora do agendamento
                        </label>
                        <input
                          id={`ag-${c.id}`}
                          type="datetime-local"
                          name="agendamento_em"
                          defaultValue={paraDatetimeLocal(c.agendamento_em)}
                          className={campo}
                        />
                      </div>
                      <BotaoEnviar
                        compacto
                        className="shrink-0 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white"
                      >
                        Salvar
                      </BotaoEnviar>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Desmarcando a caixa, o TMA passa a contar da chegada. O horário é ignorado nesse caso.
                    </p>
                  </form>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <PainelCadastro
              titulo="Fábricas"
              contagem={totalFabricas}
              temItens={totalFabricas > 0}
              vazio="Nenhuma fábrica cadastrada."
              formNovo={
                <form action={salvarFabrica} className="flex gap-2">
                  <input name="nome" required className={`${campo} flex-1`} />
                  <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
              }
            >
              {(fabricas ?? []).map((f) => (
                <ItemCadastro
                  key={f.id}
                  ativo={f.ativo}
                  titulo={f.nome}
                  acoes={
                    <>
                      <BotaoIcone action={alternarFabricaAtivo} campos={{ id: f.id, ativo: String(f.ativo) }} titulo={f.ativo ? "Desativar" : "Ativar"}>
                        {f.ativo ? "🚫" : "✅"}
                      </BotaoIcone>
                      <BotaoExcluir
                        action={excluirFabrica}
                        campos={{ id: f.id }}
                        confirmacao={`Excluir "${f.nome}"?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    </>
                  }
                  formEditar={
                    <form action={editarFabrica} className="flex gap-2">
                      <input type="hidden" name="id" value={f.id} />
                      <input name="nome" defaultValue={f.nome} required className={`${campo} flex-1`} />
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </BotaoEnviar>
                    </form>
                  }
                />
              ))}
            </PainelCadastro>

            <PainelCadastro
              titulo="Transportadoras"
              contagem={totalTransportadoras}
              temItens={totalTransportadoras > 0}
              vazio="Nenhuma transportadora cadastrada."
              formNovo={
                <form action={salvarTransportadora} className="flex gap-2">
                  <input name="nome" required className={`${campo} flex-1`} />
                  <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
              }
            >
              {(transportadoras ?? []).map((t) => (
                <ItemCadastro
                  key={t.id}
                  ativo={t.ativo}
                  titulo={t.nome}
                  acoes={
                    <>
                      <BotaoIcone action={alternarTransportadoraAtivo} campos={{ id: t.id, ativo: String(t.ativo) }} titulo={t.ativo ? "Desativar" : "Ativar"}>
                        {t.ativo ? "🚫" : "✅"}
                      </BotaoIcone>
                      <BotaoExcluir
                        action={excluirTransportadora}
                        campos={{ id: t.id }}
                        confirmacao={`Excluir "${t.nome}"?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    </>
                  }
                  formEditar={
                    <form action={editarTransportadora} className="flex gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <input name="nome" defaultValue={t.nome} required className={`${campo} flex-1`} />
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </BotaoEnviar>
                    </form>
                  }
                />
              ))}
            </PainelCadastro>

            <PainelCadastro
              titulo="Motoristas"
              contagem={totalMotoristas}
              temItens={totalMotoristas > 0}
              vazio="Nenhum motorista cadastrado."
              formNovo={
                <form action={salvarMotorista} className="flex flex-wrap gap-2">
                  <input name="nome" placeholder="Nome completo" required className={`${campo} flex-1`} />
                  <input name="cpf" placeholder="CPF" inputMode="numeric" maxLength={14} required className={`${campo} w-40`} />
                  <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
              }
            >
              {(motoristas ?? []).map((m) => (
                <ItemCadastro
                  key={m.id}
                  ativo={m.ativo}
                  titulo={m.nome}
                  subtitulo={m.cpf ?? "sem CPF cadastrado"}
                  acoes={
                    <>
                      <BotaoIcone action={alternarMotoristaAtivo} campos={{ id: m.id, ativo: String(m.ativo) }} titulo={m.ativo ? "Desativar" : "Ativar"}>
                        {m.ativo ? "🚫" : "✅"}
                      </BotaoIcone>
                      <BotaoExcluir
                        action={excluirMotorista}
                        campos={{ id: m.id }}
                        confirmacao={`Excluir "${m.nome}"?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    </>
                  }
                  formEditar={
                    <form action={editarMotorista} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={m.id} />
                      <input name="nome" defaultValue={m.nome} placeholder="Nome completo" required className={`${campo} flex-1`} />
                      <input name="cpf" defaultValue={m.cpf ?? ""} placeholder="CPF" inputMode="numeric" maxLength={14} required className={`${campo} w-40`} />
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </BotaoEnviar>
                    </form>
                  }
                />
              ))}
            </PainelCadastro>

            <PainelCadastro
              titulo="Empilhadores"
              contagem={totalEmpilhadores}
              temItens={totalEmpilhadores > 0}
              vazio="Nenhum empilhador cadastrado."
              formNovo={
                <form action={salvarEmpilhador} className="flex flex-wrap gap-2">
                  <input name="nome" placeholder="Nome completo" required className={`${campo} flex-1`} />
                  <input name="cpf" placeholder="CPF" inputMode="numeric" maxLength={14} required className={`${campo} w-40`} />
                  <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
              }
            >
              {(empilhadores ?? []).map((e) => (
                <ItemCadastro
                  key={e.id}
                  ativo={e.ativo}
                  titulo={e.nome}
                  subtitulo={e.cpf ?? "sem CPF cadastrado"}
                  acoes={
                    <>
                      <BotaoIcone action={alternarEmpilhadorAtivo} campos={{ id: e.id, ativo: String(e.ativo) }} titulo={e.ativo ? "Desativar" : "Ativar"}>
                        {e.ativo ? "🚫" : "✅"}
                      </BotaoIcone>
                      <BotaoExcluir
                        action={excluirEmpilhador}
                        campos={{ id: e.id }}
                        confirmacao={`Excluir "${e.nome}"?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    </>
                  }
                  formEditar={
                    <form action={editarEmpilhador} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={e.id} />
                      <input name="nome" defaultValue={e.nome} placeholder="Nome completo" required className={`${campo} flex-1`} />
                      <input name="cpf" defaultValue={e.cpf ?? ""} placeholder="CPF" inputMode="numeric" maxLength={14} required className={`${campo} w-40`} />
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </BotaoEnviar>
                    </form>
                  }
                />
              ))}
            </PainelCadastro>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <PainelCadastro
              titulo="AG (Ativo de Giro que retorna na carreta)"
              contagem={totalAg}
              temItens={totalAg > 0}
              vazio="Nenhum AG cadastrado."
              formNovo={
                <form action={salvarAg} className="flex flex-wrap gap-2">
                  <input name="codigo" placeholder="Código" required className={campo} />
                  <input name="descricao" placeholder="Descrição" required className={`${campo} flex-1`} />
                  <select name="unidade" className={campo} defaultValue="palete">
                    {UNIDADES_AG.map((u) => (
                      <option key={u} value={u}>{ROTULO_UNIDADE_AG[u]}</option>
                    ))}
                  </select>
                  <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
              }
            >
              {(agCatalogo ?? []).map((a) => (
                <ItemCadastro
                  key={a.id}
                  ativo={a.ativo}
                  titulo={`${a.codigo} — ${a.descricao}`}
                  subtitulo={ROTULO_UNIDADE_AG[a.unidade as "palete" | "unidade"] ?? a.unidade}
                  acoes={
                    <>
                      <BotaoIcone action={alternarAgAtivo} campos={{ id: a.id, ativo: String(a.ativo) }} titulo={a.ativo ? "Desativar" : "Ativar"}>
                        {a.ativo ? "🚫" : "✅"}
                      </BotaoIcone>
                      <BotaoExcluir
                        action={excluirAg}
                        campos={{ id: a.id }}
                        confirmacao={`Excluir o AG "${a.codigo} — ${a.descricao}"?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    </>
                  }
                  formEditar={
                    <form action={editarAg} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={a.id} />
                      <input name="codigo" defaultValue={a.codigo} className={`${campo} w-28`} />
                      <input name="descricao" defaultValue={a.descricao} className={`${campo} flex-1`} />
                      <select name="unidade" className={campo} defaultValue={a.unidade}>
                        {UNIDADES_AG.map((u) => (
                          <option key={u} value={u}>{ROTULO_UNIDADE_AG[u]}</option>
                        ))}
                      </select>
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </BotaoEnviar>
                    </form>
                  }
                />
              ))}
            </PainelCadastro>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <h2 className="text-sm font-bold text-slate-900">⚙️ Configuração do Monitor</h2>
                <p className="mt-1 text-xs text-slate-500">
                  TMA alvo alimenta o sinalizador do Monitor de Recebimento (vermelho quando estourar).
                  Dias mínimos de validade alimenta o alerta que o conferente vê ao lançar um item perto de vencer.
                </p>
              </div>
              <form action={salvarConfigRecebimento} className="space-y-3 p-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="tma_alvo_minutos">
                    TMA alvo (minutos)
                  </label>
                  <input
                    id="tma_alvo_minutos"
                    name="tma_alvo_minutos"
                    type="number"
                    min={1}
                    step="1"
                    required
                    defaultValue={recebimentoConfig?.tma_alvo_minutos ?? 120}
                    className={campo}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="dias_minimos_validade_alerta">
                    Dias mínimos de validade (alerta)
                  </label>
                  <input
                    id="dias_minimos_validade_alerta"
                    name="dias_minimos_validade_alerta"
                    type="number"
                    min={0}
                    step="1"
                    required
                    defaultValue={recebimentoConfig?.dias_minimos_validade_alerta ?? 30}
                    className={campo}
                  />
                </div>
                <BotaoEnviar className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                  Salvar configuração
                </BotaoEnviar>
              </form>
            </div>
          </div>

          <PainelCadastro
            titulo="Produtos"
            contagem={totalProdutos ?? 0}
            temItens
            formNovo={
              <div className="space-y-3">
                <form action={salvarProduto} className="flex flex-wrap gap-2">
                  <input name="codigo" placeholder="Código" required className={campo} />
                  <input name="descricao" placeholder="Descrição" required className={`${campo} flex-1`} />
                  <BotaoEnviar className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-primary">
                    Importar vários de uma vez
                  </summary>
                  <form action={importarProdutos} className="mt-2 space-y-2">
                    <textarea
                      name="lista"
                      rows={5}
                      placeholder={"código;descrição\ncódigo;descrição"}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <BotaoEnviar compacto className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                      Importar lista
                    </BotaoEnviar>
                  </form>
                </details>
              </div>
            }
          >
            <div className="p-4">
              <form method="get" className="flex gap-2">
                <input type="hidden" name="aba" value="recebimento" />
                <input
                  name="buscaProduto"
                  defaultValue={buscaProduto}
                  placeholder="Buscar por código ou descrição (a lista completa não cabe aqui)"
                  className={`${campo} flex-1`}
                />
                <button type="submit" className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                  Buscar
                </button>
              </form>
            </div>
            <div className="border-t border-slate-100">
              {buscaProduto.length > 0 && buscaProduto.length < 2 ? (
                <p className="p-6 text-center text-sm text-slate-400">Digite ao menos 2 letras.</p>
              ) : buscaProduto.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">
                  {totalProdutos ?? 0} produtos na base -- busque para ver, editar ou excluir.
                </p>
              ) : (produtos ?? []).length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Nenhum produto encontrado.</p>
              ) : (
                <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                  {(produtos ?? []).map((p) => (
                    <ItemCadastro
                      key={p.id}
                      ativo={p.ativo}
                      titulo={`${p.codigo} — ${p.descricao}`}
                      acoes={
                        <>
                          <BotaoIcone action={alternarProdutoAtivo} campos={{ id: p.id, ativo: String(p.ativo) }} titulo={p.ativo ? "Desativar" : "Ativar"}>
                            {p.ativo ? "🚫" : "✅"}
                          </BotaoIcone>
                          <BotaoExcluir
                            action={excluirProduto}
                            campos={{ id: p.id }}
                            confirmacao={`Excluir o produto "${p.codigo}"?`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                          >
                            🗑️
                          </BotaoExcluir>
                        </>
                      }
                      formEditar={
                        <form action={editarProduto} className="flex flex-wrap gap-2">
                          <input type="hidden" name="id" value={p.id} />
                          <input name="codigo" defaultValue={p.codigo} className={`${campo} w-28`} />
                          <input name="descricao" defaultValue={p.descricao} className={`${campo} flex-1`} />
                          <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                            Salvar
                          </BotaoEnviar>
                        </form>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </PainelCadastro>
        </div>
      )}

      {aba === "fefo" && (
        <div className="space-y-6">
        <PainelCadastro
          titulo="Motivos de quebra de FEFO"
          contagem={totalMotivosFefo}
          novoRotulo="Novo motivo"
          temItens={totalMotivosFefo > 0}
          vazio="Nenhum motivo cadastrado."
          formNovo={
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                É o que o colaborador escolhe ao informar uma quebra. A explicação aparece embaixo
                da opção -- sem ela, duas pessoas classificam a mesma quebra de jeitos diferentes e
                agrupar por motivo deixa de dizer alguma coisa. A ordem define a posição na lista.
              </p>
              <form action={salvarMotivoFefo} className="flex flex-wrap gap-2">
                <input name="emoji" placeholder="🚨" maxLength={4} className={`${campo} w-16`} />
                <input name="nome" placeholder="Nome do motivo" required className={`${campo} flex-1`} />
                <input name="ordem" type="number" placeholder="Ordem" className={`${campo} w-20`} />
                <input name="ajuda" placeholder="Quando usar este motivo" className={`${campo} w-full`} />
                <BotaoEnviar className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                  Adicionar
                </BotaoEnviar>
              </form>
            </div>
          }
        >
          {(motivosFefo ?? []).map((m) => (
            <ItemCadastro
              key={m.id}
              ativo={m.ativo}
              titulo={`${m.emoji ? `${m.emoji} ` : ""}${m.nome}`}
              subtitulo={m.ajuda ?? "sem explicação cadastrada"}
              acoes={
                <>
                  <BotaoIcone
                    action={alternarMotivoFefoAtivo}
                    campos={{ id: m.id, ativo: String(m.ativo), aba: "fefo" }}
                    titulo={m.ativo ? "Desativar" : "Ativar"}
                  >
                    {m.ativo ? "🚫" : "✅"}
                  </BotaoIcone>
                  {podeExcluir && (
                    <BotaoExcluir
                      action={excluirMotivoFefo}
                      campos={{ id: m.id }}
                      confirmacao={`Excluir o motivo "${m.nome}"? Se já foi usado numa ocorrência, prefira Desativar.`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                    >
                      🗑️
                    </BotaoExcluir>
                  )}
                </>
              }
              formEditar={
                <form action={editarMotivoFefo} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <input name="emoji" defaultValue={m.emoji ?? ""} maxLength={4} className={`${campo} w-16`} />
                  <input name="nome" defaultValue={m.nome} required className={`${campo} flex-1`} />
                  <input name="ordem" type="number" defaultValue={m.ordem} className={`${campo} w-20`} />
                  <input name="ajuda" defaultValue={m.ajuda ?? ""} placeholder="Quando usar" className={`${campo} w-full`} />
                  <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                    Salvar
                  </BotaoEnviar>
                </form>
              }
            />
          ))}
        </PainelCadastro>

        {/*
          DEPÓSITOS E AS RUAS DE CADA UM -- um cartão só.

          Nasceu como dois (um de depósitos, um de ruas), e o dono não
          entendeu como usar: para cadastrar a rua 11 do depósito B era
          preciso sair do cartão do B, entrar no de Ruas e reencontrar o
          B num dropdown. O cadastro tinha DOIS lugares para um assunto
          que é um só, e o dropdown existia só para desfazer a separação
          que o próprio desenho tinha criado.

          Agora a rua se cadastra DE DENTRO do depósito: abrir o depósito
          mostra as ruas dele e o campo de acrescentar mais. Some o
          dropdown -- o depósito já é o lugar onde a pessoa está.

          A rua continua pertencendo ao depósito no banco (migration
          097): a rua 1 do A e a rua 1 do C são lugares diferentes.
        */}
        <PainelCadastro
          titulo="Depósitos e ruas"
          contagem={depositosFefo?.length ?? 0}
          novoRotulo="Novo depósito"
          temItens={(depositosFefo?.length ?? 0) > 0}
          vazio="Nenhum depósito cadastrado -- sem eles ninguém consegue informar onde a quebra está."
          formNovo={
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                É o que a pessoa escolhe em &quot;Onde está&quot; ao informar uma quebra. Depois de
                criar, <strong>abra o depósito para cadastrar as ruas dele</strong> -- depósito sem
                rua não aparece para quem lança.
              </p>
              <form action={salvarDepositoFefo} className="flex flex-wrap gap-2">
                <input
                  name="nome"
                  placeholder="Nome (ex.: A, Câmara fria)"
                  required
                  maxLength={40}
                  className={`${campo} flex-1`}
                />
                <BotaoEnviar className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                  Adicionar
                </BotaoEnviar>
              </form>
            </div>
          }
        >
          {depositosOrdenados.map((d) => {
            const minhasRuas = ruasDoDeposito(ruasDaTela, d.id);
            const ativas = minhasRuas.filter((r) => r.ativo);
            return (
              /* Um `<details>` por depósito, com nome próprio no group
                 para o "▸" girar só com ELE -- o painel de fora e o "+"
                 de novo depósito já usam os seus. */
              <details key={d.id} className="group/dep">
                <summary className="flex cursor-pointer list-none items-center gap-2 p-3.5 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span
                    className="text-slate-400 transition-transform group-open/dep:rotate-90"
                    aria-hidden="true"
                  >
                    ▸
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-semibold ${
                        d.ativo ? "text-slate-900" : "text-slate-400 line-through"
                      }`}
                    >
                      🏬 {d.nome}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {minhasRuas.length === 0
                        ? "⚠️ sem ruas — não aparece para quem lança"
                        : `Ruas: ${ativas.map((r) => r.nome).join(", ")}`}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                    {minhasRuas.length}
                  </span>
                </summary>

                <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 p-3">
                  {/* O DEPÓSITO em si: renomear, ordem, ativar, excluir.
                      Fica aqui dentro, e não na linha fechada, porque um
                      botão dentro do `<summary>` compete com o toque que
                      abre o painel -- no celular, um erra o outro. */}
                  <div className="flex flex-wrap items-end gap-2">
                    <form action={editarDepositoFefo} className="flex flex-1 flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={d.id} />
                      <label className="flex-1">
                        <span className={rotulo}>Nome do depósito</span>
                        <input
                          name="nome"
                          defaultValue={d.nome}
                          required
                          maxLength={40}
                          className={campo}
                        />
                      </label>
                      <BotaoEnviar
                        compacto
                        className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white"
                      >
                        Salvar
                      </BotaoEnviar>
                    </form>
                    <div className="flex shrink-0 items-center gap-1 pb-0.5">
                      <BotaoIcone
                        action={alternarDepositoFefoAtivo}
                        campos={{ id: d.id, ativo: String(d.ativo), aba: "fefo" }}
                        titulo={d.ativo ? "Desativar depósito" : "Ativar depósito"}
                      >
                        {d.ativo ? "🚫" : "✅"}
                      </BotaoIcone>
                      {podeExcluir && (
                        <BotaoExcluir
                          action={excluirDepositoFefo}
                          campos={{ id: d.id }}
                          confirmacao={`Excluir o depósito "${d.nome}"? As ${minhasRuas.length} rua(s) dele são apagadas junto. As ocorrências antigas continuam mostrando o nome.`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                        >
                          🗑️
                        </BotaoExcluir>
                      )}
                    </div>
                  </div>

                  {/* AS RUAS DELE. Sem dropdown de depósito: o depósito é
                      onde a pessoa já está. */}
                  <div className="rounded-xl border border-slate-200 bg-white">
                    <p className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Ruas do depósito {d.nome}
                    </p>

                    {minhasRuas.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-slate-400">
                        Nenhuma rua ainda. Cadastre abaixo -- enquanto não houver nenhuma, este
                        depósito não aparece na tela de quem informa a quebra.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {minhasRuas.map((r) => (
                          <ItemCadastro
                            key={r.id}
                            ativo={r.ativo}
                            titulo={`Rua ${r.nome}`}
                            acoes={
                              <>
                                <BotaoIcone
                                  action={alternarRuaFefoAtiva}
                                  campos={{ id: r.id, ativo: String(r.ativo), aba: "fefo" }}
                                  titulo={r.ativo ? "Desativar" : "Ativar"}
                                >
                                  {r.ativo ? "🚫" : "✅"}
                                </BotaoIcone>
                                {podeExcluir && (
                                  <BotaoExcluir
                                    action={excluirRuaFefo}
                                    campos={{ id: r.id }}
                                    confirmacao={`Excluir a rua "${r.nome}" do depósito ${d.nome}? As ocorrências antigas continuam mostrando ela.`}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                                  >
                                    🗑️
                                  </BotaoExcluir>
                                )}
                              </>
                            }
                            formEditar={
                              <form action={editarRuaFefo} className="flex flex-wrap items-end gap-2">
                                <input type="hidden" name="id" value={r.id} />
                                <label className="flex-1">
                                  <span className={rotulo}>Nome da rua</span>
                                  <input
                                    name="nome"
                                    defaultValue={r.nome}
                                    required
                                    maxLength={40}
                                    className={campo}
                                  />
                                </label>
                                <BotaoEnviar
                                  compacto
                                  className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white"
                                >
                                  Salvar
                                </BotaoEnviar>
                              </form>
                            }
                          />
                        ))}
                      </div>
                    )}

                    {/* ACRESCENTAR RUAS -- em leva. Rua a rua seriam dez
                        idas ao servidor para montar um depósito, e
                        depósito nasce inteiro. */}
                    <form
                      action={salvarRuaFefo}
                      className="flex flex-wrap items-end gap-2 border-t border-slate-100 p-3"
                    >
                      <input type="hidden" name="deposito_id" value={d.id} />
                      <label className="min-w-[10rem] flex-1">
                        <span className={rotulo}>Acrescentar ruas</span>
                        <input
                          name="nome"
                          placeholder="1 a 10  ·  ou  11, 12  ·  ou  A1"
                          required
                          className={campo}
                        />
                      </label>
                      <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                        Adicionar
                      </BotaoEnviar>
                      <p className="w-full text-xs text-slate-400">
                        <code className="rounded bg-slate-100 px-1">1 a 10</code> cria a faixa
                        inteira · vírgula separa (<code className="rounded bg-slate-100 px-1">11, 12</code>)
                        · repetir o que já existe acrescenta só o que falta.
                      </p>
                    </form>
                  </div>
                </div>
              </details>
            );
          })}
        </PainelCadastro>
        </div>
      )}

      {aba === "cinco-s" && (
        <div className="space-y-6">
          <PainelCadastro
            titulo="Checklist 5S"
            contagem={totalChecklist}
            novoRotulo="Novo item"
            temItens
            formNovo={
              <form action={salvarItemChecklist5s} className="flex flex-wrap gap-2">
                <select name="senso" required className={campo}>
                  {SENSOS.map((s) => (
                    <option key={s} value={s}>{ROTULO_SENSO[s]}</option>
                  ))}
                </select>
                <input name="descricao" placeholder="Descrição do item" required className={`${campo} flex-1`} />
                <BotaoEnviar className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                  Adicionar
                </BotaoEnviar>
              </form>
            }
          >
            {null}
          </PainelCadastro>

          {SENSOS.map((senso) => {
            const doSenso = (itensChecklist ?? []).filter((i) => i.senso === senso);
            if (doSenso.length === 0) return null;
            return (
              <div key={senso} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h3 className="border-b border-slate-100 p-4 text-sm font-bold text-slate-900">
                  {ROTULO_SENSO[senso]}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                    {doSenso.length}
                  </span>
                </h3>
                <div className="divide-y divide-slate-100">
                  {doSenso.map((i) => (
                    <ItemCadastro
                      key={i.id}
                      ativo={i.ativo}
                      titulo={i.descricao}
                      acoes={
                        <>
                          <BotaoIcone action={alternarItemChecklist5sAtivo} campos={{ id: i.id, ativo: String(i.ativo) }} titulo={i.ativo ? "Desativar" : "Ativar"}>
                            {i.ativo ? "🚫" : "✅"}
                          </BotaoIcone>
                          <BotaoExcluir
                            action={excluirItemChecklist5s}
                            campos={{ id: i.id }}
                            confirmacao="Excluir este item do checklist?"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                          >
                            🗑️
                          </BotaoExcluir>
                        </>
                      }
                      formEditar={
                        <form action={editarItemChecklist5s} className="flex gap-2">
                          <input type="hidden" name="id" value={i.id} />
                          <input name="descricao" defaultValue={i.descricao} className={`${campo} flex-1`} />
                          <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                            Salvar
                          </BotaoEnviar>
                        </form>
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
