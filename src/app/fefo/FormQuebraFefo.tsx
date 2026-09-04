"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { ComboboxProdutoReepack } from "@/components/produtividade-armazem/ComboboxProdutoReepack";
import {
  DIAS_VALIDADE_CRITICA,
  ROTULO_UNIDADE_FEFO,
  UNIDADES_FEFO,
  rotuloValidade,
  ruasDoDeposito,
  type DepositoFefo,
  type MotivoFefo,
  type RuaFefo,
} from "@/lib/fefo";
import { buscarProdutosFefo, registrarQuebraFefo } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

export function FormQuebraFefo({
  clusters,
  tipos,
  motivos,
  depositos,
  ruas,
}: {
  clusters: string[];
  tipos: string[];
  motivos: MotivoFefo[];
  depositos: DepositoFefo[];
  ruas: RuaFefo[];
}) {
  const [motivoId, setMotivoId] = useState(motivos[0]?.id ?? "");
  const [validade, setValidade] = useState("");
  const [menorValidade, setMenorValidade] = useState("");

  /*
    A RUA DEPENDE DO DEPÓSITO (migration 097). Antes eram duas listas
    independentes -- depósito A, B ou C e rua 1 a 10 -- e dava para
    gravar "depósito A, rua 9" num armazém que só vai até a 6.

    O depósito escolhido zera a rua: manter a rua da escolha anterior
    deixaria selecionado um lugar que não existe no depósito novo, e a
    pessoa só descobriria pela recusa do servidor.
  */
  const [depositoId, setDepositoId] = useState("");
  const ruasVisiveis = depositoId ? ruasDoDeposito(ruas, depositoId) : [];

  // O padrão manda segregar abaixo de 45 dias -- o aviso sai da data, sem
  // ninguém precisar julgar a criticidade na hora. Aparece no instante em
  // que a validade é digitada, e em vermelho: é o dado que decide se o
  // produto ainda dá para vender ou se já virou perda.
  const prazo = validade ? rotuloValidade(validade) : null;
  const datasInvertidas = Boolean(validade && menorValidade && menorValidade > validade);

  return (
    <form action={registrarQuebraFefo} className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <span className={rotulo}>O que você encontrou?</span>
          {motivos.length === 0 ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Nenhum motivo cadastrado ainda. Peça ao Admin para cadastrar em Produtividade do
              Armazém &gt; Configuração &gt; FEFO.
            </p>
          ) : (
            <div className="space-y-2">
              {motivos.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer gap-2 rounded-xl border p-3 ${
                    m.id === motivoId ? "border-primary bg-primary-soft" : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="motivo_id"
                    value={m.id}
                    checked={m.id === motivoId}
                    onChange={() => setMotivoId(m.id)}
                    className="mt-0.5"
                    required
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">
                      {m.emoji ? `${m.emoji} ` : ""}
                      {m.nome}
                    </span>
                    {m.ajuda && <span className="block text-xs text-slate-500">{m.ajuda}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">📦</span>
          Produto
        </div>
        <ComboboxProdutoReepack
          clusters={clusters}
          tipos={tipos}
          buscarProdutos={buscarProdutosFefo}
          cookiePath="/fefo"
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="quantidade">Quantidade</label>
            <input
              id="quantidade"
              name="quantidade"
              type="number"
              inputMode="numeric"
              min={1}
              required
              className={campo}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="unidade">Unidade</label>
            <select id="unidade" name="unidade" required className={campo} defaultValue="caixa">
              {UNIDADES_FEFO.map((u) => (
                <option key={u} value={u}>{ROTULO_UNIDADE_FEFO[u]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">📅</span>
          Validades
        </div>

        {/* Aparece no instante em que a validade é digitada. Vermelho e
            grande de propósito: abaixo de 45 dias o padrão manda segregar,
            e esse é o aviso que decide se dá tempo de vender ou se virou
            perda. Um texto pequeno em cinza passaria batido. */}
        {prazo?.critico && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border-2 border-red-500 bg-red-50 p-4"
          >
            <span className="text-2xl leading-none">🚨</span>
            <div className="min-w-0">
              <p className="text-base font-extrabold uppercase text-red-800">{prazo.texto}</p>
              <p className="mt-0.5 text-sm font-medium text-red-700">
                Abaixo dos {DIAS_VALIDADE_CRITICA} dias do padrão — este produto deve estar
                segregado. Avise a liderança agora.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={rotulo} htmlFor="validade">Validade do palete encontrado</label>
            <input
              id="validade"
              name="validade"
              type="date"
              required
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              className={`${campo} ${prazo?.critico ? "border-red-500 ring-2 ring-red-200" : ""}`}
            />
            {prazo && !prazo.critico && (
              <p className="mt-1 text-xs text-slate-500">{prazo.texto}</p>
            )}
          </div>
          <div>
            <label className={rotulo} htmlFor="menor_validade">
              Menor validade no estoque <span className="normal-case text-slate-400">(opcional)</span>
            </label>
            <input
              id="menor_validade"
              name="menor_validade"
              type="date"
              value={menorValidade}
              onChange={(e) => setMenorValidade(e.target.value)}
              className={campo}
            />
            {datasInvertidas ? (
              <p className="mt-1 text-xs font-semibold text-red-600">
                A menor validade não pode ser maior que a do palete encontrado.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">
                Se você não souber, deixe em branco — o controle completa depois.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">📍</span>
          Onde está
        </div>
        {depositos.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Nenhum depósito cadastrado ainda. Peça ao Admin para cadastrar em Produtividade do
            Armazém &gt; Configuração &gt; FEFO.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotulo} htmlFor="deposito_id">Depósito</label>
              <select
                id="deposito_id"
                name="deposito_id"
                required
                className={campo}
                value={depositoId}
                onChange={(e) => setDepositoId(e.target.value)}
              >
                <option value="" disabled>Escolha</option>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="rua_id">Rua</label>
              <select
                id="rua_id"
                name="rua_id"
                required
                className={campo}
                // Trocar o depósito remonta a lista, e o React zera a
                // escolha sozinho porque o valor antigo não existe mais
                // entre as opções. Desabilitado antes da escolha: um
                // select de ruas vazio faria a pessoa achar que travou.
                disabled={!depositoId}
                defaultValue=""
                key={depositoId}
              >
                <option value="" disabled>
                  {depositoId ? "Escolha" : "Escolha o depósito antes"}
                </option>
                {ruasVisiveis.map((r) => (
                  <option key={r.id} value={r.id}>Rua {r.nome}</option>
                ))}
              </select>
              {depositoId && ruasVisiveis.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  Este depósito está sem ruas cadastradas. Avise o Admin.
                </p>
              )}
            </div>
          </div>
        )}
        <div>
          <label className={rotulo} htmlFor="ponto">Ponto exato (opcional)</label>
          <input
            id="ponto"
            name="ponto"
            maxLength={120}
            placeholder="Ex: nível 2, no fundo da rua"
            className={campo}
          />
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-800">
          <input type="checkbox" name="rua_bloqueada" className="h-4 w-4" />
          🔒 A rua foi bloqueada
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className={rotulo} htmlFor="foto">Foto (opcional)</label>
          <input id="foto" name="foto" type="file" accept="image/*" capture="environment" className={campo} />
        </div>
        <div>
          <label className={rotulo} htmlFor="observacao">Observação (opcional)</label>
          <textarea id="observacao" name="observacao" rows={3} maxLength={500} className={campo} />
        </div>
      </div>

      <BotaoEnviar
        textoEnviando="Enviando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
      >
        🚨 Informar quebra de FEFO
      </BotaoEnviar>
    </form>
  );
}
