"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";
import {
  confirmarImportacaoColaboradores,
  lerPlanilhaColaboradores,
} from "@/app/admin/colaboradores/actions";
import type { EstadoDaLeitura } from "@/lib/colaboradores-planilha";

const mascara = (cpf: string) => `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;

/**
 * IMPORTAR A PLANILHA -- em dois passos, e o primeiro não grava nada.
 *
 * Criar cem acessos é o tipo de coisa que não se desfaz com um clique: cada
 * um vira login, perfil e vínculo. Então a planilha é LIDA primeiro, e a
 * tela mostra o que vai acontecer -- quem entra, quem muda e em quê, quem
 * foi recusado e por quê. Só o segundo botão grava, e ele diz o número.
 *
 * O SERVIDOR NÃO CONFIA NA PRÉVIA. O segundo passo manda as linhas de
 * volta, e a ação refaz a validação e a classificação contra o banco
 * daquele momento: se alguém cadastrou um dos CPFs entre um clique e
 * outro, ele não é criado duas vezes.
 */
export function ImportarColaboradores({
  revendaNome,
  senhaPadrao,
}: {
  revendaNome: string;
  senhaPadrao: string;
}) {
  const [estado, ler, lendo] = useActionState<EstadoDaLeitura, FormData>(
    lerPlanilhaColaboradores,
    null,
  );
  const confirmarEnvio = useConfirmarEnvio();

  const pronto = estado && estado.ok ? estado : null;
  const vaiGravar = pronto ? pronto.criar.length + pronto.atualizar.length : 0;

  return (
    <div className="space-y-3">
      <form action={ler} className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="arquivo"
          accept=".xlsx"
          required
          className="min-w-0 flex-1 text-sm text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-dark"
        />
        <button
          type="submit"
          disabled={lendo}
          className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {lendo ? "Lendo..." : "Ler planilha"}
        </button>
      </form>

      {estado && !estado.ok && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{estado.erro}</p>
      )}

      {pronto && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-xs text-slate-500">
            <strong className="text-slate-700">{pronto.nomeArquivo}</strong> — {pronto.total} linha(s)
            lida(s). Tudo entra em <strong className="text-slate-700">{revendaNome}</strong>.
          </p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Numero valor={pronto.criar.length} rotulo="novos acessos" cor="green" />
            <Numero valor={pronto.atualizar.length} rotulo="cadastros a atualizar" cor="blue" />
            <Numero valor={pronto.semMudanca} rotulo="já iguais" cor="slate" />
            <Numero
              valor={pronto.problemas.length + pronto.outraUnidade.length}
              rotulo="não entram"
              cor={pronto.problemas.length + pronto.outraUnidade.length > 0 ? "red" : "slate"}
            />
          </div>

          {/* O QUE O APP MUDOU NA PLANILHA, dito antes de gravar: ninguém
              deveria descobrir depois que "TRANSPORTE" virou outra coisa. */}
          {pronto.areasConvertidas.map((c) => (
            <p key={c.de} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              🔁 Área <strong>{c.de}</strong> vai entrar como <strong>{c.para}</strong> ({c.quantas}{" "}
              pessoa(s)) — é o nome que o app usa para Desafio do Mês, Escala e comunicados por área.
            </p>
          ))}
          {pronto.areasSemTraducao.map((a) => (
            <p key={a.area} className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
              ⚠️ A área <strong>{a.area}</strong> ({a.quantas} pessoa(s)) não é Distribuição nem
              Armazém para o app: essas pessoas ficam sem Desafio do Mês, Escala e comunicados por
              área. Se for engano, corrija a planilha antes de confirmar.
            </p>
          ))}
          {pronto.cpfsCorrigidos > 0 && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
              {pronto.cpfsCorrigidos} CPF(s) tinham perdido o zero da frente no Excel e foram
              corrigidos — só os que ficam válidos com ele.
            </p>
          )}

          {pronto.criar.length > 0 && (
            <Grupo titulo={`✅ ${pronto.criar.length} novo(s) acesso(s)`}>
              {pronto.criar.map((l) => (
                <li key={l.cpf}>
                  <span className="font-semibold text-slate-800">{l.nome}</span> · {l.cargo} ·{" "}
                  <span className="font-mono">{mascara(l.cpf)}</span>
                </li>
              ))}
            </Grupo>
          )}

          {pronto.atualizar.length > 0 && (
            <Grupo titulo={`✏️ ${pronto.atualizar.length} cadastro(s) a atualizar`}>
              {pronto.atualizar.map((l) => (
                <li key={l.cpf}>
                  <span className="font-semibold text-slate-800">{l.nome}</span> —{" "}
                  {l.mudancas.join("; ")}
                </li>
              ))}
            </Grupo>
          )}

          {/* Recusadas e de outra unidade ficam ABERTAS por padrão: é o que
              pede ação de quem importou, e fechado ninguém lê. */}
          {pronto.problemas.length > 0 && (
            <Grupo titulo={`🚫 ${pronto.problemas.length} linha(s) recusada(s)`} aberto>
              {pronto.problemas.map((p) => (
                <li key={`${p.linha}-${p.motivo}`}>
                  Linha {p.linha}: <span className="font-semibold">{p.nome}</span> — {p.motivo}
                </li>
              ))}
            </Grupo>
          )}

          {pronto.outraUnidade.length > 0 && (
            <Grupo titulo={`🏢 ${pronto.outraUnidade.length} já cadastrado(s) em outra unidade`} aberto>
              <li className="list-none pb-1 text-slate-500">
                Não são alterados por esta planilha. Para a pessoa trabalhar nas duas unidades,
                vincule pela ficha dela, na lista abaixo.
              </li>
              {pronto.outraUnidade.map((l) => (
                <li key={l.cpf}>
                  Linha {l.linha}: <span className="font-semibold">{l.nomeNoApp}</span>
                </li>
              ))}
            </Grupo>
          )}

          {vaiGravar > 0 ? (
            <form
              action={confirmarImportacaoColaboradores}
              onSubmit={confirmarEnvio({
                titulo: `Gravar em ${revendaNome}?`,
                detalhe:
                  `${pronto.criar.length} novo(s) acesso(s) e ${pronto.atualizar.length} atualização(ões). ` +
                  (pronto.criar.length > 0
                    ? `Cada novo entra com o CPF e a senha ${senhaPadrao}, trocada no primeiro acesso. O app não avisa ninguém — a comunicação ao time é com você.`
                    : ""),
                confirmar: "Gravar",
              })}
            >
              <input
                type="hidden"
                name="linhas"
                value={JSON.stringify([...pronto.criar, ...pronto.atualizar])}
              />
              <BotaoEnviar
                textoEnviando="Gravando... (pode levar um minuto)"
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-dark"
              >
                Gravar {pronto.criar.length > 0 ? `${pronto.criar.length} novo(s)` : ""}
                {pronto.criar.length > 0 && pronto.atualizar.length > 0 ? " e " : ""}
                {pronto.atualizar.length > 0 ? `${pronto.atualizar.length} atualização(ões)` : ""}
              </BotaoEnviar>
            </form>
          ) : (
            <p className="text-center text-sm font-semibold text-slate-600">
              Nada a gravar — a planilha já está igual ao cadastro.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Numero({
  valor,
  rotulo,
  cor,
}: {
  valor: number;
  rotulo: string;
  cor: "green" | "blue" | "slate" | "red";
}) {
  const estilo = {
    green: "text-green-700",
    blue: "text-blue-700",
    slate: "text-slate-700",
    red: "text-red-700",
  }[cor];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
      <p className={`text-xl font-bold tabular-nums ${estilo}`}>{valor}</p>
      <p className="text-[11px] leading-tight text-slate-500">{rotulo}</p>
    </div>
  );
}

function Grupo({
  titulo,
  aberto = false,
  children,
}: {
  titulo: string;
  aberto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={aberto} className="rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">{titulo}</summary>
      <ul className="max-h-72 space-y-1 overflow-y-auto border-t border-slate-100 px-3 py-2 text-xs text-slate-600">
        {children}
      </ul>
    </details>
  );
}
