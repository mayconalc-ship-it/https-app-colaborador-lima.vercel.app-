"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  ehFuturo,
  formatarDataHora,
  utcParaDatetimeLocal,
  type Editoria,
} from "@/lib/comunicados";
import { AREAS } from "@/lib/areas";

type Comunicado = {
  id: number;
  titulo: string;
  resumo: string | null;
  texto: string;
  categoria: string;
  destaque: boolean;
  data: string;
  imagem_url: string | null;
  publicar_em?: string | null;
  lembrete_em?: string | null;
  lembrete_areas?: string[] | null;
  lembrete_cargos?: string[] | null;
  lembrete_mensagem?: string | null;
  lembrete_enviado_em?: string | null;
};

/**
 * Lista de marcação que fica recolhida até alguém precisar dela.
 *
 * Nasceu porque o lembrete cresceu para dois filtros (área e cargo): com
 * as duas listas abertas, o campo mais importante -- a data do disparo --
 * sumia no meio de dezenas de caixinhas. Recolhido, o resumo no cabeçalho
 * já diz para quem o lembrete vai, sem precisar abrir.
 *
 * "Todos" aqui é a AUSÊNCIA de marcação, não todas as opções marcadas.
 * É a regra que o disparo já usava (lista vazia = revenda inteira) e
 * evita a armadilha de congelar a lista: um cargo cadastrado depois
 * continua recebendo, em vez de ficar de fora por não existir no dia em
 * que o lembrete foi montado.
 */
function ListaRecolhida({
  nome,
  titulo,
  opcoes,
  rotuloTodos,
  iniciais,
}: {
  nome: string;
  titulo: string;
  opcoes: { valor: string; rotulo: string }[];
  rotuloTodos: string;
  iniciais: string[];
}) {
  const [marcados, setMarcados] = useState<string[]>(
    iniciais.filter((v) => opcoes.some((o) => o.valor === v)),
  );

  const alternar = (valor: string) =>
    setMarcados((atual) =>
      atual.includes(valor)
        ? atual.filter((v) => v !== valor)
        : [...atual, valor],
    );

  const resumo =
    marcados.length === 0
      ? rotuloTodos
      : opcoes
          .filter((o) => marcados.includes(o.valor))
          .map((o) => o.rotulo)
          .join(", ");

  return (
    <details className="rounded-xl border border-slate-200">
      <summary className="cursor-pointer p-3 text-sm font-medium text-slate-700">
        {titulo}{" "}
        <span className="font-normal text-slate-400">— {resumo}</span>
      </summary>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
        <label
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
            marcados.length === 0
              ? "border-primary bg-primary-soft font-semibold text-primary"
              : "border-slate-200 text-slate-700"
          }`}
        >
          <input
            type="checkbox"
            checked={marcados.length === 0}
            onChange={() => setMarcados([])}
            className="h-4 w-4 rounded border-slate-300 text-primary"
          />
          {rotuloTodos}
        </label>
        {opcoes.map((o) => (
          <label
            key={o.valor}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              name={nome}
              value={o.valor}
              checked={marcados.includes(o.valor)}
              onChange={() => alternar(o.valor)}
              className="h-4 w-4 rounded border-slate-300 text-primary"
            />
            {o.rotulo}
          </label>
        ))}
      </div>
    </details>
  );
}

/**
 * O palpite ao clicar em "Agendar": amanhã às 8h.
 *
 * Um campo vazio faria o RH digitar dia, mês, ano e hora na mão para
 * cada matéria do plano do mês. Amanhã cedo é o agendamento mais comum e
 * já vem certo na maioria das vezes -- e quando não vem, mexer numa hora
 * preenchida é mais rápido que preencher tudo.
 */
function amanhaCedo() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T08:00`;
}

export function ComunicadoForm({
  action,
  comunicado,
  aoCancelar,
  cargosDisponiveis,
  editorias,
}: {
  action: (formData: FormData) => void;
  comunicado?: Comunicado;
  aoCancelar?: () => void;
  cargosDisponiveis: string[];
  /** Cadastro da revenda -- ver /admin/comunicados/editorias. */
  editorias: Editoria[];
}) {
  // A matéria que está sendo editada pode estar numa editoria que foi
  // desativada depois. Mantê-la selecionada evita que uma simples correção
  // de vírgula jogue a matéria para "geral" sem ninguém pedir.
  const editoriasVisiveis = editorias.some(
    (e) => e.id === comunicado?.categoria,
  )
    ? editorias
    : [
        ...editorias,
        ...(comunicado?.categoria
          ? [
              {
                id: comunicado.categoria,
                rotulo: comunicado.categoria,
                emoji: "📰",
                cor: "cinza",
                classe: "",
              },
            ]
          : []),
      ];

  const [categoria, setCategoria] = useState(
    comunicado?.categoria ??
      (editorias.some((e) => e.id === "geral")
        ? "geral"
        : (editorias[0]?.id ?? "geral")),
  );
  // Agendamento que JÁ PASSOU não volta como agendamento: a matéria está
  // no ar, e reabrir o formulário mostrando "agendada para o dia 12" só
  // faria o RH achar que ela ainda está na fila.
  const [publicarEm, setPublicarEm] = useState(
    comunicado?.publicar_em && ehFuturo(comunicado.publicar_em)
      ? utcParaDatetimeLocal(comunicado.publicar_em)
      : "",
  );
  const agendando = publicarEm !== "";
  // O dia é o DAQUI, não o de Greenwich: `toISOString()` converte para
  // UTC mesmo rodando no navegador, e às 21h de terça já devolvia
  // quarta -- a matéria nascia datada de amanhã.
  const hoje = new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });

  return (
    <form action={action} className="space-y-4">
      {comunicado && <input type="hidden" name="id" value={comunicado.id} />}

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Editoria
        </label>
        <div className="flex flex-wrap gap-2">
          {editoriasVisiveis.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setCategoria(e.id)}
              className={`rounded-full border px-3 py-2 text-sm ${
                categoria === e.id
                  ? "border-primary bg-primary-soft font-semibold text-primary"
                  : "border-slate-200 text-slate-700"
              }`}
            >
              {e.emoji} {e.rotulo}
            </button>
          ))}
        </div>
        <input type="hidden" name="categoria" value={categoria} />
      </div>

      <div>
        <label
          htmlFor="titulo"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Título
        </label>
        <input
          id="titulo"
          name="titulo"
          required
          defaultValue={comunicado?.titulo}
          placeholder="Ex: Campanha de uso de EPI começa segunda"
          className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="resumo"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Chamada <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id="resumo"
          name="resumo"
          defaultValue={comunicado?.resumo ?? ""}
          placeholder="Uma frase curta que aparece na capa"
          className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="texto"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Conteúdo
        </label>
        <textarea
          id="texto"
          name="texto"
          required
          rows={7}
          defaultValue={comunicado?.texto}
          placeholder="Escreva a notícia. Pule linha para separar parágrafos."
          className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="imagem"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Foto {comunicado?.imagem_url && "(mantém a atual)"}
        </label>
        <input
          id="imagem"
          name="imagem"
          type="file"
          accept=".png,.jpg,.jpeg"
          className="w-full rounded-xl border border-slate-200 p-2 text-sm"
        />
      </div>

      {/* ---- Quando a matéria entra no jornal ------------------------
          As duas opções na cara, e não um campo opcional escondido: é a
          escolha que muda tudo o que acontece depois (o que o
          colaborador vê, quando o sino toca) e é o que permite escrever
          o plano de comunicação do mês inteiro numa tarde só. */}
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">
          🗓️ Quando entra no jornal
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPublicarEm("")}
            className={`rounded-full border px-3 py-2 text-sm ${
              agendando
                ? "border-slate-200 text-slate-700"
                : "border-primary bg-primary-soft font-semibold text-primary"
            }`}
          >
            Publicar agora
          </button>
          <button
            type="button"
            onClick={() => setPublicarEm((atual) => atual || amanhaCedo())}
            className={`rounded-full border px-3 py-2 text-sm ${
              agendando
                ? "border-primary bg-primary-soft font-semibold text-primary"
                : "border-slate-200 text-slate-700"
            }`}
          >
            ⏰ Agendar
          </button>
        </div>

        {agendando ? (
          <div className="space-y-2">
            <label
              htmlFor="publicar_em"
              className="block text-sm font-medium text-slate-700"
            >
              Publicar automaticamente em
            </label>
            <input
              id="publicar_em"
              name="publicar_em"
              type="datetime-local"
              required
              value={publicarEm}
              onChange={(e) => setPublicarEm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
            <p className="text-xs text-slate-400">
              Até lá a matéria não aparece para o colaborador. A data da
              notícia no jornal passa a ser a do agendamento.
            </p>
            <p className="text-xs text-slate-400">
              <strong className="text-slate-500">A matéria entra na hora
              exata</strong>, mas o aviso no sino e o push podem demorar até
              cerca de uma hora depois — quem dispara é um robô externo, e o
              GitHub não garante o minuto.
            </p>
          </div>
        ) : (
          <div>
            <label
              htmlFor="data"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Data da publicação
            </label>
            <input
              id="data"
              name="data"
              type="date"
              defaultValue={comunicado?.data ?? hoje}
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </div>
        )}
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
        <input
          type="checkbox"
          name="destaque"
          defaultChecked={comunicado?.destaque}
          className="h-5 w-5 accent-[#0b4da2]"
        />
        <span className="text-sm text-slate-700">
          <strong>Matéria de capa</strong> — aparece grande no topo do jornal
        </span>
      </label>

      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          🔔 Lembrete agendado{" "}
          <span className="font-normal text-slate-400">(opcional)</span>
        </summary>
        <div className="mt-3 space-y-3">
          {comunicado?.lembrete_enviado_em && (
            <p className="rounded-lg bg-green-50 p-2 text-xs text-green-700">
              Já disparado em {formatarDataHora(comunicado.lembrete_enviado_em)}
              . Mudar a data/hora abaixo reabre o disparo.
            </p>
          )}

          <div>
            <label
              htmlFor="lembrete_em"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Disparar em
            </label>
            <input
              id="lembrete_em"
              name="lembrete_em"
              type="datetime-local"
              defaultValue={
                comunicado?.lembrete_em
                  ? utcParaDatetimeLocal(comunicado.lembrete_em)
                  : ""
              }
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">
              Quem recebe{" "}
              <span className="font-normal text-slate-400">
                (área e cargo se cruzam)
              </span>
            </p>
            <div className="space-y-2">
              <ListaRecolhida
                nome="lembrete_areas"
                titulo="🏢 Área"
                rotuloTodos="Todas as áreas"
                opcoes={AREAS.map((a) => ({ valor: a.id, rotulo: a.rotulo }))}
                iniciais={comunicado?.lembrete_areas ?? []}
              />
              {cargosDisponiveis.length > 0 && (
                <ListaRecolhida
                  nome="lembrete_cargos"
                  titulo="👤 Cargo"
                  rotuloTodos="Todos os cargos"
                  opcoes={cargosDisponiveis.map((c) => ({
                    valor: c,
                    rotulo: c,
                  }))}
                  iniciais={comunicado?.lembrete_cargos ?? []}
                />
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="lembrete_mensagem"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Texto do lembrete{" "}
              <span className="font-normal text-slate-400">
                (vazio = usa o título)
              </span>
            </label>
            <input
              id="lembrete_mensagem"
              name="lembrete_mensagem"
              defaultValue={comunicado?.lembrete_mensagem ?? ""}
              placeholder="Ex: O treinamento é hoje às 14h, não esqueça!"
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </div>

          <p className="text-xs text-slate-400">
            O lembrete chega pelo sino e pelo push, separado da publicação.
            Pode sair até cerca de uma hora depois da marcada — então não
            use para avisar de algo que começa em minutos.
          </p>
        </div>
      </details>

      <div className="flex gap-2">
        {/* Publicar sobe a imagem do comunicado antes de gravar. É a ação
            mais lenta do Modo Liderança, e era a que menos dizia estar
            acontecendo -- o botão ficava aceso e parado até a página trocar. */}
        <BotaoEnviar
          textoEnviando={comunicado ? "Salvando..." : "Publicando..."}
          className="flex-1 rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
        >
          {comunicado ? "Salvar alterações" : "Publicar"}
        </BotaoEnviar>
        {aoCancelar && (
          <button
            type="button"
            onClick={aoCancelar}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-white"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
