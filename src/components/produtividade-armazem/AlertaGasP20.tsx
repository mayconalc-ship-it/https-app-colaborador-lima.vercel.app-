import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  formatarTelefone,
  telefoneParaLink,
  tempoAberto,
  urgenciaDoEstoque,
} from "@/lib/gas-p20";
import type { ConfigDeGas, PedidoDeGas } from "@/lib/gas-p20-server";
import { confirmarPedidoDeGas } from "@/app/produtividade-armazem/empilhadeira/actions";

/**
 * O alerta de gás acabando.
 *
 * Não tem "X" de propósito: pedido do dono é que ele NÃO saia da tela
 * enquanto ninguém confirmar que ligou para o fornecedor. Um botão de
 * fechar transformaria o aviso em algo que se dispensa sem resolver, que
 * é exatamente o fim que ele não pode ter.
 */
export function AlertaGasP20({
  pedido,
  config,
  voltarPara,
}: {
  pedido: PedidoDeGas;
  config: ConfigDeGas;
  /** Para onde voltar depois de confirmar -- a tela onde o alerta apareceu. */
  voltarPara: string;
}) {
  const critico = urgenciaDoEstoque(pedido.botijoesCheios) === "critico";
  const discavel = telefoneParaLink(config.fornecedorTelefone);

  return (
    <section
      role="alert"
      className={`mb-4 min-w-0 rounded-2xl border-2 p-4 shadow-sm ${
        critico ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"
      }`}
    >
      <p className={`text-sm font-extrabold ${critico ? "text-red-800" : "text-amber-900"}`}>
        {critico ? "🔴 Acabou o gás P20" : "🟠 Gás P20 acabando"}
      </p>

      <p className={`mt-1 break-words text-xs ${critico ? "text-red-700" : "text-amber-800"}`}>
        {pedido.botijoesCheios === 0
          ? "Nenhum botijão cheio no estoque."
          : `${pedido.botijoesCheios === 1 ? "Resta 1 botijão cheio" : `Restam ${pedido.botijoesCheios} botijões cheios`} no estoque.`}
        {pedido.botijoesVazios !== null && ` ${pedido.botijoesVazios} vazio(s) para devolver.`}
        {pedido.abertoPorNome && ` Contado por ${pedido.abertoPorNome},`} há{" "}
        {tempoAberto(pedido.abertoEm)}.
      </p>

      {/* O telefone é o ponto do aviso: é para o empilhador ligar dali
          mesmo, sem procurar o número com ninguém. */}
      <div className="mt-3 rounded-xl bg-white/70 p-3">
        {config.fornecedorNome || discavel ? (
          <>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Fornecedor</p>
            <p className="break-words text-sm font-bold text-slate-900">
              {config.fornecedorNome ?? "Sem nome cadastrado"}
            </p>
            {discavel ? (
              <a
                href={`tel:${discavel}`}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-700"
              >
                📞 Ligar {formatarTelefone(config.fornecedorTelefone)}
              </a>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Telefone não cadastrado. Peça ao Admin para cadastrar em Produtividade do
                Armazém → Empilhadeiras.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-600">
            Nenhum fornecedor cadastrado. Avise a liderança — e peça para cadastrar em
            <strong> Admin → Produtividade do Armazém → Empilhadeiras</strong>, para o próximo
            alerta já vir com o telefone.
          </p>
        )}
      </div>

      <form action={confirmarPedidoDeGas} className="mt-3 space-y-2">
        <input type="hidden" name="pedido_id" value={pedido.id} />
        <input type="hidden" name="voltar_para" value={voltarPara} />
        <input
          type="text"
          name="observacao"
          maxLength={200}
          placeholder="Com quem falou, previsão de entrega (opcional)"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
        />
        <BotaoEnviar
          textoEnviando="Confirmando..."
          className="w-full rounded-xl bg-slate-800 px-4 py-3 text-sm font-bold text-white hover:bg-slate-900"
        >
          ✅ Já solicitei o gás
        </BotaoEnviar>
      </form>
    </section>
  );
}
