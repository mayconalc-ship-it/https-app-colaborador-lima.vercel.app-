import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { LinkDoGuia } from "@/components/LinkDoGuia";
import { BaseFornecedores } from "@/components/manutencao/BaseFornecedores";
import { getPerfil } from "@/lib/sessao";
import { exigirRevenda } from "@/lib/revendas";
import { temAcessoModulo } from "@/lib/require-admin";
import { MODULO_MANUTENCAO, ModuloNaoInstalado } from "@/lib/manutencao-server";
import { lerFornecedores } from "@/lib/manutencao-raci-server";
import { AvisoNaoInstalado } from "../manutencao/AvisoNaoInstalado";

export const dynamic = "force-dynamic";

/**
 * BASE DE FORNECEDORES -- o V.3 do DPO 2.2: disponível para TODA a
 * unidade consultar. Por isso a tela não pede módulo nenhum, só estar
 * logado numa revenda; incluir e atualizar fica com o time da manutenção.
 */
async function carregar(revendaId: string) {
  try {
    const [fornecedores, podeEditar] = await Promise.all([lerFornecedores(revendaId), temAcessoModulo(MODULO_MANUTENCAO)]);
    return { tipo: "ok" as const, fornecedores, podeEditar };
  } catch (e) {
    if (e instanceof ModuloNaoInstalado) return { tipo: "nao-instalado" as const };
    throw e;
  }
}

export default async function FornecedoresPage() {
  if (!(await getPerfil())) redirect("/login");
  const revendaId = await exigirRevenda("/");

  const dados = await carregar(revendaId);
  if (dados.tipo === "nao-instalado") {
    return <AvisoNaoInstalado titulo="☎️ Fornecedores" migration="157 (Fornecedores e RACI)" />;
  }

  return (
    <div>
      <PageHeader
        title="☎️ Fornecedores"
        subtitle="Contatos de manutenção, emergência e apoio na rota. Toque para ligar."
      />
      <LinkDoGuia slug="consultar-fornecedores" className="mb-4" />
      <BaseFornecedores fornecedores={dados.fornecedores} podeEditar={dados.podeEditar} />
    </div>
  );
}
