"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoAdicionarLinha } from "@/components/BotaoMais";
import { SelectComCadastroRapido } from "@/components/SelectComCadastroRapido";
import { ComboboxNome } from "@/components/produtividade-armazem/ComboboxNome";
import type { Fabrica, Transportadora } from "@/lib/produtividade-armazem";
import { formatarPlaca } from "@/lib/carretas";
import { buscarMotoristas } from "@/app/admin/produtividade-armazem/actions";
import {
  criarFabricaRapida,
  criarTransportadoraRapida,
} from "@/app/produtividade-armazem/catalogos-rapidos";
import { criarMotoristaRapido, registrarAtendimento } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

let contador = 0;
function novaChave() {
  contador += 1;
  return `nf-${contador}`;
}

function apenasDigitos(v: string) {
  return v.replace(/\D/g, "");
}

function ListaNotas({
  titulo,
  prefixo,
  somenteNumeros = false,
}: {
  titulo: string;
  prefixo: "produto" | "remessa";
  somenteNumeros?: boolean;
}) {
  const [chaves, setChaves] = useState<string[]>([novaChave()]);

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500">
        📄 {titulo}
        {somenteNumeros && <span className="font-normal normal-case text-slate-400">(só números)</span>}
      </h3>
      {chaves.map((chave, i) => (
        <div key={chave} className="flex items-end gap-2">
          <div className="flex-1">
            {i === 0 && <label className={rotulo}>Número</label>}
            <input
              name={`nf_${prefixo}_numero`}
              required
              inputMode={somenteNumeros ? "numeric" : "text"}
              onChange={
                somenteNumeros
                  ? (e) => {
                      e.target.value = apenasDigitos(e.target.value);
                    }
                  : undefined
              }
              className={campo}
            />
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
      <BotaoAdicionarLinha onClick={() => setChaves((atual) => [...atual, novaChave()])}>
        Adicionar {titulo.toLowerCase()}
      </BotaoAdicionarLinha>
    </div>
  );
}

export function FormPortaria({
  fabricas,
  transportadoras,
  podeEditarCatalogo = false,
}: {
  fabricas: Fabrica[];
  transportadoras: Transportadora[];
  podeEditarCatalogo?: boolean;
}) {
  const [cargaAgendada, setCargaAgendada] = useState(false);
  const [motorista, setMotorista] = useState("");
  const [placaCavalo, setPlacaCavalo] = useState("");
  const [placaCarreta, setPlacaCarreta] = useState("");

  return (
    <form action={registrarAtendimento} className="space-y-4">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">🏭</span>
          Origem da carga
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="fabrica_id">Fornecedor/Fábrica</label>
            <SelectComCadastroRapido
              id="fabrica_id"
              name="fabrica_id"
              required
              opcoes={fabricas.map((f) => ({ valor: f.id, rotulo: f.nome }))}
              criarRapido={podeEditarCatalogo ? criarFabricaRapida : undefined}
              campos={[{ nome: "nome", rotulo: "Nome da fábrica" }]}
              tituloCadastro="Nova fábrica"
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="transportadora_id">Transportador</label>
            <SelectComCadastroRapido
              id="transportadora_id"
              name="transportadora_id"
              required
              opcoes={transportadoras.map((t) => ({ valor: t.id, rotulo: t.nome }))}
              criarRapido={podeEditarCatalogo ? criarTransportadoraRapida : undefined}
              campos={[{ nome: "nome", rotulo: "Nome da transportadora" }]}
              tituloCadastro="Nova transportadora"
            />
          </div>
        </div>

        <div>
          <label className={rotulo} htmlFor="numero_dt">Número da DT</label>
          <input id="numero_dt" name="numero_dt" required className={campo} />
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">🚛</span>
          Veículo e motorista
        </div>

        <div>
          <label className={rotulo}>Nome do motorista</label>
          <ComboboxNome
            nome={motorista}
            onChange={setMotorista}
            buscar={buscarMotoristas}
            placeholder="Digite o nome do motorista"
            required
            criarRapido={criarMotoristaRapido}
          />
          <input type="hidden" name="motorista_nome" value={motorista} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="placa_cavalo">Placa do cavalo</label>
            <input
              id="placa_cavalo"
              name="placa_cavalo"
              value={placaCavalo}
              onChange={(e) => setPlacaCavalo(formatarPlaca(e.target.value))}
              placeholder="AAA-0A00"
              maxLength={8}
              required
              className={`${campo} font-mono uppercase tracking-wider`}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="placa_carreta">Placa da carreta</label>
            <input
              id="placa_carreta"
              name="placa_carreta"
              value={placaCarreta}
              onChange={(e) => setPlacaCarreta(formatarPlaca(e.target.value))}
              placeholder="AAA-0A00"
              maxLength={8}
              required
              className={`${campo} font-mono uppercase tracking-wider`}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <input
            type="checkbox"
            name="carga_agendada"
            checked={cargaAgendada}
            onChange={(e) => setCargaAgendada(e.target.checked)}
            className="h-4 w-4"
          />
          ⏰ Carga agendada
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
        <p className="mt-3 text-xs text-slate-400">
          A portaria é você, registrada automaticamente pela sessão. O horário de chegada é
          carimbado agora, no momento de salvar.
        </p>
      </div>

      <ListaNotas titulo="NFs Produto" prefixo="produto" somenteNumeros />
      <ListaNotas titulo="NFs Remessa" prefixo="remessa" somenteNumeros />

      <BotaoEnviar
        textoEnviando="Registrando..."
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
      >
        ✅ Registrar chegada
      </BotaoEnviar>
    </form>
  );
}
