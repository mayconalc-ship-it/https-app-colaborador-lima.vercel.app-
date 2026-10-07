"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { ComboboxProdutoReepack } from "@/components/produtividade-armazem/ComboboxProdutoReepack";
import { SeletorDePessoa, type PessoaEncontrada } from "@/components/admin/SeletorDePessoa";
import { ROTULO_TURNO, TURNOS, type Turno } from "@/lib/produtividade-armazem";
import { NF_DIGITOS_MAX, ROTULO_UNIDADE_WQI, UNIDADES_WQI, type ItemCatalogoWqi } from "@/lib/wqi";
import { buscarProdutosWqi, buscarResponsaveisWqi, registrarBaixaWqi } from "./actions";
import { CampoFoto } from "@/components/CampoFoto";
import { FormNoLugar } from "@/components/FormNoLugar";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";
// Sem overflow-hidden: a lista do SeletorDePessoa cai por cima e seria cortada.
const cartao = "space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

function Titulo({ emoji, texto }: { emoji: string; texto: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">{emoji}</span>
      {texto}
    </div>
  );
}

export function FormBaixaWqi({
  clusters,
  tipos,
  motivos,
  locais,
  turnoSugerido,
  hoje,
}: {
  clusters: string[];
  tipos: string[];
  motivos: ItemCatalogoWqi[];
  locais: ItemCatalogoWqi[];
  turnoSugerido: Turno;
  hoje: string;
}) {
  const semCatalogo = motivos.length === 0 || locais.length === 0;

  // O COLABORADOR, OBRIGATÓRIO E NO TOPO (06/10/2026, pedido do dono): uma
  // pessoa escolhida na busca, ou "Não tem colaborador" marcado de
  // propósito. A ação do servidor recusa os mesmos casos.
  const [pessoa, setPessoa] = useState<PessoaEncontrada | null>(null);
  const [semColaborador, setSemColaborador] = useState(false);
  const [faltaColaborador, setFaltaColaborador] = useState(false);
  // Muda a cada baixa salva: zera a busca. O form.reset() não alcança o
  // estado do seletor, e a próxima baixa sairia com a pessoa da anterior.
  const [envio, setEnvio] = useState(0);
  const [notaFiscal, setNotaFiscal] = useState("");

  return (
    <FormNoLugar
      acao={registrarBaixaWqi}
      className="space-y-4"
      limparAoSalvar
      antesDeEnviar={async () => {
        if (pessoa || semColaborador) return true;
        setFaltaColaborador(true);
        document.getElementById("cartao-colaborador")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return false;
      }}
      aoSalvar={() => {
        setPessoa(null);
        setSemColaborador(false);
        setNotaFiscal("");
        setEnvio((n) => n + 1);
      }}
    >
      {semCatalogo && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Faltam motivos ou locais cadastrados. Peça ao Admin para cadastrar em Produtividade do
          Armazém &gt; Configuração &gt; WQI.
        </p>
      )}

      <div
        id="cartao-colaborador"
        className={`${cartao} ${faltaColaborador ? "border-red-300 ring-2 ring-red-200" : ""}`}
      >
        <Titulo emoji="🧑‍🏭" texto="Colaborador (quem manuseava)" />
        {!semColaborador && (
          <SeletorDePessoa
            buscar={buscarResponsaveisWqi}
            campoId="responsavel_id"
            placeholder="Digite o nome do colaborador"
            chaveDeReset={String(envio)}
            aoEscolher={(p) => {
              setPessoa(p);
              if (p) setFaltaColaborador(false);
            }}
          />
        )}
        <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700 has-[:checked]:border-amber-300 has-[:checked]:bg-amber-50">
          <input
            type="checkbox"
            checked={semColaborador}
            onChange={(e) => {
              setSemColaborador(e.target.checked);
              setPessoa(null);
              setFaltaColaborador(false);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary"
          />
          <span>
            <strong>Não tem colaborador</strong>
            <span className="block text-xs text-slate-500">
              Ninguém manuseava, ou não foi possível identificar quem.
            </span>
          </span>
        </label>
        <input type="hidden" name="sem_colaborador" value={semColaborador ? "1" : ""} />
        {faltaColaborador && (
          <p className="text-sm font-medium text-red-700">
            Obrigatório: escolha o colaborador na busca ou marque &quot;Não tem colaborador&quot;.
          </p>
        )}
        <p className="text-xs text-slate-500">A função vai junto, do cadastro da pessoa.</p>
      </div>

      <div className={cartao}>
        <Titulo emoji="📅" texto="Quando" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={rotulo} htmlFor="data_ocorrido">Data do ocorrido</label>
            <input id="data_ocorrido" name="data_ocorrido" type="date" required max={hoje} defaultValue={hoje} className={campo} />
          </div>
          <div>
            <label className={rotulo} htmlFor="turno">Turno</label>
            <select id="turno" name="turno" required defaultValue={turnoSugerido} className={campo}>
              {TURNOS.map((t) => (
                <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={cartao}>
        <Titulo emoji="📦" texto="Produto quebrado" />
        <ComboboxProdutoReepack clusters={clusters} tipos={tipos} buscarProdutos={buscarProdutosWqi} cookiePath="/wqi" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="quantidade">Quantidade</label>
            <input id="quantidade" name="quantidade" type="number" inputMode="numeric" min={1} step={1} required className={campo} />
          </div>
          <div>
            <label className={rotulo} htmlFor="unidade">Unidade</label>
            {/* Unidade por padrão: é como a planilha contava (99,9% das linhas). */}
            <select id="unidade" name="unidade" required defaultValue="unidade" className={campo}>
              {UNIDADES_WQI.map((u) => (
                <option key={u} value={u}>{ROTULO_UNIDADE_WQI[u]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={cartao}>
        <Titulo emoji="📝" texto="O que aconteceu" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={rotulo} htmlFor="motivo_id">Motivo</label>
            <select id="motivo_id" name="motivo_id" required defaultValue="" className={campo}>
              <option value="" disabled>Escolha</option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="local_id">Local</label>
            <select id="local_id" name="local_id" required defaultValue="" className={campo}>
              <option value="" disabled>Escolha</option>
              {locais.map((l) => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={rotulo} htmlFor="nota_fiscal">
            Nota fiscal <span className="normal-case text-slate-400">(opcional)</span>
          </label>
          {/* SÓ DÍGITOS (06/10/2026): `inputMode` muda o teclado do
              celular, mas não impede letra -- no computador passava
              qualquer coisa. Letra some ao digitar, como no QR e nas
              Carretas; o servidor recusa o que escapar. */}
          <input
            id="nota_fiscal"
            name="nota_fiscal"
            value={notaFiscal}
            onChange={(e) => setNotaFiscal(e.target.value.replace(/\D/g, "").slice(0, NF_DIGITOS_MAX))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Só números"
            className={campo}
          />
        </div>
      </div>

      <div className={cartao}>
        <div>
          <label className={rotulo} htmlFor="foto">Foto da evidência (opcional)</label>
          <CampoFoto id="foto" name="foto" accept="image/*" capture="environment" className={campo} />
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
        💸 Registrar baixa WQI
      </BotaoEnviar>
    </FormNoLugar>
  );
}
