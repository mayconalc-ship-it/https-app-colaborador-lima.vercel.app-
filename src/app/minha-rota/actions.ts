"use server";

import { getPerfil } from "@/lib/sessao";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarMapa, type CidadeEntregas } from "@/lib/rotas";

export type RotaEncontrada = {
  data: string;
  mapa: string;
  veiculo: string | null;
  placa: string | null;
  motorista: string;
  kmPrev: number | null;
  tempoPrev: string | null;
  entregas: number | null;
  caixas: number | null;
  ocupacaoCaixas: number | null;
  peso: number | null;
  ocupacaoPeso: number | null;
  armazem: string | null;
  classificacao: string | null;
  cidades: CidadeEntregas[];
};

export type ResultadoConsulta =
  | { ok: true; rota: RotaEncontrada }
  | { ok: false; erro: string };

/**
 * Consulta a pré-rota só pelo número do mapa.
 *
 * O mapa é o identificador único do roteirizador -- confirmado contra a
 * base real (nenhuma repetição entre dias diferentes) e contra a própria
 * numeração, que sai sequencial a cada importação. Por isso não pedimos
 * mais a data ao colaborador.
 *
 * Mesmo assim, pegamos a rota mais RECENTE quando há mais de uma
 * combinação para o mesmo mapa: é uma rede de segurança, não a regra --
 * se algum dia a numeração se repetir entre meses, o app não quebra, só
 * responde com o dado mais novo em vez de um erro confuso.
 *
 * Lê do Supabase, nunca do Google: a planilha já foi importada. Isso é o
 * que torna a consulta instantânea mesmo com 40 motoristas perguntando ao
 * mesmo tempo, antes de sair.
 */
export async function consultarRota(
  mapaDigitado: string,
): Promise<ResultadoConsulta> {
  const perfil = await getPerfil();
  if (!perfil) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const mapa = normalizarMapa(mapaDigitado);
  if (!mapa) return { ok: false, erro: "Informe o número do mapa." };

  const admin = createAdminClient();

  const { data: rota } = await admin
    .from("rotas")
    .select(
      "data, mapa, mapa_original, veiculo, placa, motorista_codigo, km_prev, tempo_prev, entregas, caixas, ocupacao_caixas, peso, ocupacao_peso, armazem, classificacao, cidades",
    )
    .eq("mapa", mapa)
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rota) {
    return {
      ok: false,
      erro: "Não encontramos uma rota para este mapa.",
    };
  }

  // O roteirizador identifica o motorista por um código próprio. Quando o
  // Admin já cadastrou esse código no perfil da pessoa, mostramos o nome;
  // senão, o código cru -- melhor do que deixar o campo vazio.
  let motorista = rota.motorista_codigo ?? "—";
  if (rota.motorista_codigo) {
    const { data: pessoa } = await admin
      .from("profiles")
      .select("nome")
      .eq("codigo_rota", rota.motorista_codigo)
      .maybeSingle();
    if (pessoa?.nome) motorista = pessoa.nome;
  }

  return {
    ok: true,
    rota: {
      data: rota.data,
      mapa: rota.mapa_original || rota.mapa,
      veiculo: rota.veiculo,
      placa: rota.placa,
      motorista,
      kmPrev: rota.km_prev,
      tempoPrev: rota.tempo_prev,
      entregas: rota.entregas,
      caixas: rota.caixas,
      ocupacaoCaixas: rota.ocupacao_caixas,
      peso: rota.peso,
      ocupacaoPeso: rota.ocupacao_peso,
      armazem: rota.armazem,
      classificacao: rota.classificacao,
      cidades: (rota.cidades ?? []) as CidadeEntregas[],
    },
  };
}
