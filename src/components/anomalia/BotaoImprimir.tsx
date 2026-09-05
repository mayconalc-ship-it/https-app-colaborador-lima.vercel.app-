"use client";

/**
 * "Baixar em PDF" -- que é a impressão do navegador.
 *
 * O nome do botão diz PDF, e não "Imprimir", porque é o que a pessoa
 * quer: o diálogo que abre já vem com "Salvar como PDF" como destino na
 * esmagadora maioria dos aparelhos, e quem quiser papel escolhe a
 * impressora ali mesmo. Chamar de "Imprimir" faria quem só quer o
 * arquivo achar que precisa de uma impressora.
 *
 * Sem biblioteca de PDF de propósito: o que sai é a MESMA folha que a
 * pessoa acabou de preencher (ver @media print em globals.css). Um
 * gerador à parte seria um segundo documento para manter em dia com o
 * primeiro -- e o dia em que os dois divergissem seria o dia da
 * auditoria.
 */
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      ⬇️ Baixar em PDF
    </button>
  );
}
