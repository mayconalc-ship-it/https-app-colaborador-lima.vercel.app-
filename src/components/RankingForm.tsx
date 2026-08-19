"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { CampoCategoria } from "@/components/CampoCategoria";
import { NOMES_TIME, TIMES, type TimeRanking } from "@/lib/ranking-categorias";

export function RankingForm({
  action,
  sugestoes,
  timeInicial = "DU",
  mesInicial,
}: {
  action: (formData: FormData) => void;
  sugestoes: Record<TimeRanking, string[]>;
  /** Time e mês do último envio, vindos da URL. Ver o comentário abaixo. */
  timeInicial?: TimeRanking;
  mesInicial?: string;
}) {
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const mesPadrao = mesInicial ?? mesAtual;

  const [time, setTime] = useState<TimeRanking>(timeInicial);

  // Cada envio recarrega a tela. Dependendo do que muda no HTML, o React ora
  // remonta este formulário (e o time voltaria para DU), ora o reaproveita
  // (e o time ficaria preso no anterior). Sincronizar com o que a URL trouxe
  // resolve os dois casos: o time só muda quando alguém clica no botão --
  // que é o que evita a foto do AL entrar como DU.
  const [timeDaUrl, setTimeDaUrl] = useState<TimeRanking>(timeInicial);
  if (timeDaUrl !== timeInicial) {
    setTimeDaUrl(timeInicial);
    setTime(timeInicial);
  }

  return (
    <form
      action={action}
      className="mb-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Time
        </label>
        <div className="flex gap-2">
          {TIMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTime(t)}
              className={`flex-1 rounded-xl border py-2 text-sm font-semibold ${
                time === t
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">{NOMES_TIME[time]}</p>
        <input type="hidden" name="time" value={time} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Categoria de premiação
        </label>
        <CampoCategoria
          time={time}
          sugestoes={sugestoes}
          className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
        />
        <p className="mt-1 text-xs text-slate-400">
          Digite o nome da premiação ou escolha uma já usada. Só aparecem no app
          as categorias enviadas.
        </p>
      </div>

      <div>
        <label
          htmlFor="mes_ano"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Mês
        </label>
        {/* key: o campo é não-controlado, então só volta ao mês do último
            envio se o React recriar o input. Sem isso, quem lança fotos de um
            mês fechado veria o campo saltar para o mês corrente. */}
        <input
          key={mesPadrao}
          id="mes_ano"
          name="mes_ano"
          type="month"
          defaultValue={mesPadrao}
          required
          className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="arquivo"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Foto do ganhador
        </label>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          accept=".png,.jpg,.jpeg"
          required
          className="w-full rounded-xl border border-slate-200 p-2 text-sm"
        />
      </div>

      {/* A foto do ranking sobe junto: em 4G de revenda isso leva segundos,
          e sem retorno nenhum o dedo vai de novo no botão. */}
      <BotaoEnviar
        textoEnviando="Enviando..."
        className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
      >
        Enviar
      </BotaoEnviar>
    </form>
  );
}
