/**
 * Peças do padrão "cadastro moderno" pra telas de configuração do Admin:
 * um cartão por catálogo, contador no cabeçalho, botão "+ Novo" que
 * revela o formulário sem sair da tela (um `<details>` estilizado, sem
 * JavaScript de cliente), e cada item da lista com ações em ícone e a
 * edição escondida atrás de um "✏️ Editar" -- em vez do formulário de
 * editar sempre visível brigando com a lista pelo olho de quem rola a
 * tela.
 *
 * Só troca a APRESENTAÇÃO das telas de config. Vira o padrão a repetir
 * nos próximos cadastros do app -- é por isso que mora em
 * components/admin, e não dentro de uma página só.
 */

import { BotaoEnviar } from "@/components/BotaoEnviar";
import { MaisOuFechar } from "@/components/BotaoMais";

export function PainelCadastro({
  titulo,
  contagem,
  novoRotulo = "Novo",
  formNovo,
  vazio,
  temItens,
  children,
}: {
  titulo: string;
  contagem?: number;
  novoRotulo?: string;
  formNovo: React.ReactNode;
  vazio?: string;
  temItens: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 marker:content-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">{titulo}</h2>
            {contagem !== undefined && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                {contagem}
              </span>
            )}
          </div>
          {/* Mesmo "+" quadrado azul do resto do app (ver BotaoMais) --
              vira "✕" quando o formulário está aberto. */}
          <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-primary-dark">
            <MaisOuFechar />
            <span className="group-open:hidden">{novoRotulo}</span>
            <span className="hidden group-open:inline">Fechar</span>
          </span>
        </summary>
        <div className="border-t border-slate-100 bg-slate-50/70 p-4">{formNovo}</div>
      </details>
      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {temItens ? children : (
          <p className="p-6 text-center text-sm text-slate-400">{vazio ?? "Nada cadastrado ainda."}</p>
        )}
      </div>
    </div>
  );
}

export function ItemCadastro({
  ativo = true,
  titulo,
  subtitulo,
  acoes,
  formEditar,
}: {
  ativo?: boolean;
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  acoes?: React.ReactNode;
  formEditar?: React.ReactNode;
}) {
  return (
    <div className={`p-3.5 ${ativo ? "" : "bg-slate-50/70"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${ativo ? "text-slate-900" : "text-slate-400 line-through"}`}>
            {titulo}
          </p>
          {subtitulo && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex shrink-0 items-center gap-1">{acoes}</div>}
      </div>
      {formEditar && (
        <details className="group mt-2.5">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-primary marker:content-none [&::-webkit-details-marker]:hidden">
            ✏️ Editar
          </summary>
          <div className="mt-2 rounded-xl bg-slate-50 p-3">{formEditar}</div>
        </details>
      )}
    </div>
  );
}

/** Botão de ícone só -- ativar/desativar, sem disputar espaço com o nome
 *  do item numa linha que já tem pouca largura no celular. Passa pelo
 *  BotaoEnviar de propósito: mesma rodinha de "enviando" que o resto do
 *  app usa, só que no tamanho de um ícone. */
export function BotaoIcone({
  action,
  campos,
  titulo,
  children,
}: {
  action: (formData: FormData) => void;
  campos: Record<string, string>;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <BotaoEnviar
        compacto
        ariaLabel={titulo}
        title={titulo}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-slate-100"
      >
        {children}
      </BotaoEnviar>
    </form>
  );
}
