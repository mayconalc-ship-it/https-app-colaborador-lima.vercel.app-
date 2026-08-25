"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import type { Fabrica, Transportadora } from "@/lib/produtividade-armazem";
import { registrarAtendimento } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

let contador = 0;
function novaChave() {
  contador += 1;
  return `nf-${contador}`;
}

function ListaNotas({ titulo, prefixo }: { titulo: string; prefixo: "produto" | "remessa" }) {
  const [chaves, setChaves] = useState<string[]>([novaChave()]);

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-xs font-bold uppercase text-slate-500">{titulo}</h3>
      {chaves.map((chave, i) => (
        <div key={chave} className="flex items-end gap-2">
          <div className="flex-1">
            {i === 0 && <label className={rotulo}>Número</label>}
            <input name={`nf_${prefixo}_numero`} required className={campo} />
          </div>
          <div className="w-20">
            {i === 0 && <label className={rotulo}>Série</label>}
            <input name={`nf_${prefixo}_serie`} required className={campo} />
          </div>
          {chaves.length > 1 && (
            <button
              type="button"
              onClick={() => setChaves((atual) => atual.filter((c) => c !== chave))}
              className="mb-2 shrink-0 text-xs font-semibold text-red-600 hover:underline"
            >
              Remover
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setChaves((atual) => [...atual, novaChave()])}
        className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-600 hover:border-primary hover:text-primary"
      >
        + Adicionar NF {titulo.toLowerCase()}
      </button>
    </div>
  );
}

export function FormPortaria({
  fabricas,
  transportadoras,
}: {
  fabricas: Fabrica[];
  transportadoras: Transportadora[];
}) {
  const [cargaAgendada, setCargaAgendada] = useState(false);

  return (
    <form action={registrarAtendimento} className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="fabrica_id">Fornecedor/Fábrica</label>
            <select id="fabrica_id" name="fabrica_id" required className={campo}>
              {fabricas.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="transportadora_id">Transportador</label>
            <select id="transportadora_id" name="transportadora_id" required className={campo}>
              {transportadoras.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={rotulo} htmlFor="numero_dt">Número da DT</label>
          <input id="numero_dt" name="numero_dt" required className={campo} />
        </div>

        <div>
          <label className={rotulo} htmlFor="motorista_nome">Nome do motorista</label>
          <input id="motorista_nome" name="motorista_nome" required className={campo} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="placa_cavalo">Placa do cavalo</label>
            <input id="placa_cavalo" name="placa_cavalo" maxLength={10} required className={campo} />
          </div>
          <div>
            <label className={rotulo} htmlFor="placa_carreta">Placa da carreta</label>
            <input id="placa_carreta" name="placa_carreta" maxLength={10} required className={campo} />
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              name="carga_agendada"
              checked={cargaAgendada}
              onChange={(e) => setCargaAgendada(e.target.checked)}
              className="h-4 w-4"
            />
            Carga agendada
          </label>
          <p className="mt-1 text-xs text-slate-500">
            {cargaAgendada
              ? "O TMA será medido a partir do horário agendado abaixo."
              : "Sem agendamento, o TMA é medido a partir deste apontamento da portaria."}
          </p>
          {cargaAgendada && (
            <div className="mt-2">
              <label className={rotulo} htmlFor="agendamento_em">Data/hora do agendamento</label>
              <input
                id="agendamento_em"
                name="agendamento_em"
                type="datetime-local"
                required={cargaAgendada}
                className={campo}
              />
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500">
          A portaria é você, registrada automaticamente pela sessão. O horário de chegada é
          carimbado agora, no momento de salvar.
        </p>
      </div>

      <ListaNotas titulo="NFs Produto" prefixo="produto" />
      <ListaNotas titulo="NFs Remessa" prefixo="remessa" />

      <BotaoEnviar
        textoEnviando="Registrando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Registrar chegada
      </BotaoEnviar>
    </form>
  );
}
