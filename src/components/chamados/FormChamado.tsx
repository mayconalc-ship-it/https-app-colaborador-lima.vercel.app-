"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { CampoFoto } from "@/components/CampoFoto";
import { IconeTipo } from "@/components/chamados/Selos";
import { PRIORIDADES, TIPOS, formatarTelefone } from "@/lib/chamados";
import type { ResultadoAcao } from "@/lib/resultado-acao";

type GrupoDeLocais = { titulo: string; itens: { id: string; nome: string }[] };

/** O que fica lembrado no aparelho, para o próximo chamado sair em segundos. */
const LEMBRAR_TELEFONE = "chamado:telefone";
const LEMBRAR_NOME = "chamado:nome";

function lembrado(chave: string) {
  try {
    return window.localStorage.getItem(chave) ?? "";
  } catch {
    return "";
  }
}

function lembrar(chave: string, valor: string) {
  try {
    if (valor.trim()) window.localStorage.setItem(chave, valor.trim());
  } catch {
    // Navegador sem armazenamento (aba anônima): só não lembra.
  }
}

const rotulo = "mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500";
const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/**
 * O FORMULÁRIO DO CHAMADO -- o mesmo no app e na página do QR.
 *
 * Os campos são os do Forms (unidade, área, solicitante, telefone, tipo
 * de O.S. e descrição), na ordem de quem está parado na frente do
 * problema: ONDE, O QUÊ, e só no fim quem é. Mais a foto e a prioridade,
 * que o Forms não tinha.
 *
 * Feito para sair em menos de um minuto:
 *  - a unidade vem do QR (um só por revenda) ou do vínculo, no app;
 *  - o tipo é um toque num desenho, não uma lista;
 *  - nome e telefone ficam lembrados no aparelho;
 *  - a descrição pode ser ditada pelo microfone do teclado.
 */
export function FormChamado({
  acao,
  unidade,
  locais,
  localInicial = "",
  nomeInicial = "",
  nomeTravado = false,
  ocultos = {},
  publico = false,
}: {
  acao: (formData: FormData) => Promise<ResultadoAcao | void>;
  /** A revenda, só para mostrar: quem decide é o QR (ou o vínculo, no app). */
  unidade: string;
  locais: GrupoDeLocais[];
  localInicial?: string;
  nomeInicial?: string;
  /** No app o nome vem do cadastro e não se digita. */
  nomeTravado?: boolean;
  ocultos?: Record<string, string>;
  /** Página aberta (QR): ganha a armadilha de robô e lembra o nome. */
  publico?: boolean;
}) {
  const [descricao, setDescricao] = useState("");
  const nome = useRef<HTMLInputElement>(null);
  const telefone = useRef<HTMLInputElement>(null);

  // O que ficou lembrado entra só depois de montar: no servidor não há
  // aparelho, e preencher antes faria a tela do servidor e a do celular
  // discordarem.
  useEffect(() => {
    if (telefone.current && !telefone.current.value) telefone.current.value = lembrado(LEMBRAR_TELEFONE);
    if (publico && nome.current && !nome.current.value) nome.current.value = lembrado(LEMBRAR_NOME);
  }, [publico]);

  async function antesDeEnviar(form: HTMLFormElement) {
    const dados = new FormData(form);
    lembrar(LEMBRAR_TELEFONE, String(dados.get("telefone") ?? ""));
    if (publico) lembrar(LEMBRAR_NOME, String(dados.get("nome") ?? ""));
    return true;
  }

  return (
    <FormNoLugar acao={acao} antesDeEnviar={antesDeEnviar} className="space-y-5">
      {Object.entries(ocultos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      {publico && (
        // Armadilha de robô: invisível para gente, irresistível para script
        // que preenche tudo. Quem preencher não abre chamado.
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Empresa
            <input name="empresa" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
      )}

      {/* ---- 1. Onde ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">1 · Onde é o problema?</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">🏢 {unidade}</span>
        </div>
        <select name="local_id" required defaultValue={localInicial} className={campo}>
          <option value="" disabled>
            Escolha a área…
          </option>
          {locais.map((g) => (
            <optgroup key={g.titulo} label={g.titulo}>
              {g.itens.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </section>

      {/* ---- 2. O quê ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <fieldset>
          <legend className={rotulo}>2 · Que tipo de serviço?</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {TIPOS.map((t) => (
              <label
                key={t.id}
                title={t.exemplo}
                className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-1 py-3 text-center text-slate-600 transition has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary-dark has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40"
              >
                <input type="radio" name="tipo" value={t.id} required className="sr-only" />
                <IconeTipo tipo={t.id} size={24} />
                <span className="text-xs font-semibold leading-tight">{t.rotulo}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-5 block">
          <span className={rotulo}>3 · Descreva o problema</span>
          <textarea
            name="descricao"
            required
            minLength={5}
            maxLength={2000}
            rows={4}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: lâmpada queimada em cima da doca 3; a sala fica escura no turno da noite."
            className={campo}
          />
          <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Mic size={12} aria-hidden /> Prefere falar? Toque no microfone do teclado e dite.
            </span>
            <span className="tabular-nums">{descricao.length}/2000</span>
          </span>
        </label>

        <div className="mt-4">
          <span className={rotulo}>Fotos (opcional, até 4)</span>
          <CampoFoto name="fotos" accept="image/*" capture="environment" multiple />
          <p className="mt-1.5 text-[11px] text-slate-400">Uma foto mostra em um segundo o que levaria um parágrafo.</p>
        </div>
      </section>

      {/* ---- 3. Quanto pesa ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <fieldset>
          <legend className={rotulo}>4 · Qual a urgência?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRIORIDADES.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-2 border-slate-200 p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 ${
                  p.id === "risco"
                    ? "has-[:checked]:border-red-500 has-[:checked]:bg-red-50"
                    : p.id === "urgente"
                      ? "has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50"
                      : "has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                }`}
              >
                <input
                  type="radio"
                  name="prioridade"
                  value={p.id}
                  defaultChecked={p.id === "normal"}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-900">
                    {p.id === "risco" ? "⚠️ " : ""}
                    {p.rotulo}
                  </span>
                  <span className="block text-[11px] leading-snug text-slate-500">{p.explica}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Risco à segurança avisa a manutenção na hora. Se alguém pode se machucar agora, isole o local e avise também a
            sua liderança.
          </p>
        </fieldset>
      </section>

      {/* ---- 4. Quem ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <span className={rotulo}>5 · Quem está pedindo</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Seu nome</span>
            <input
              ref={nome}
              name="nome"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              defaultValue={nomeInicial}
              readOnly={nomeTravado}
              placeholder="Nome e sobrenome"
              className={`${campo} ${nomeTravado ? "bg-slate-50 text-slate-600" : ""}`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Telefone com DDD</span>
            <input
              ref={telefone}
              name="telefone"
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              placeholder="(77) 99999-9999"
              onBlur={(e) => (e.currentTarget.value = formatarTelefone(e.currentTarget.value))}
              className={campo}
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          {nomeTravado
            ? "O andamento chega no seu sino e no celular. O telefone é para a manutenção falar com você, se precisar."
            : "Para a manutenção falar com você, se precisar. Ao enviar, você recebe o número do chamado e um link para acompanhar."}
        </p>
      </section>

      <BotaoEnviar
        textoEnviando="Abrindo o chamado..."
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-base font-bold text-white shadow-md hover:bg-primary-dark"
      >
        🔧 Abrir chamado
      </BotaoEnviar>
    </FormNoLugar>
  );
}
