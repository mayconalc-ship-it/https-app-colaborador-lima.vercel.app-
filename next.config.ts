import type { NextConfig } from "next";
import { mudancasDeEndereco } from "./src/lib/gestao";

const nextConfig: NextConfig = {
  /**
   * As telas que se mudaram para a area de Gestao.
   *
   * 308, permanente: o time salva a tela na inicial do celular, e para
   * muita gente esse atalho e o unico caminho que ela usa. Mover rota sem
   * redirect quebraria esse atalho em silencio -- a pessoa toca e cai num
   * 404, e a conclusao natural dela e que "o app parou de funcionar".
   *
   * A lista sai do proprio catalogo dos paineis, para nao existir a
   * chance de um painel mudar de endereco e o redirect ficar para tras.
   */
  redirects() {
    return Promise.resolve(mudancasDeEndereco());
  },
  images: {
    qualities: [75, 100],
    // As fotos do jornal moram no bucket público do Supabase, e chegam do
    // jeito que o RH mandou -- foto de celular de 4 MB, quase sempre. Sem
    // liberar o host aqui o <Image> recusa a URL; com ele, o Next entrega
    // WebP do tamanho da tela, que é o que faz a imagem chegar junto com o
    // texto em vez de depois dele.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // O armazenamento do Supabase responde `Cache-Control: no-cache` e
    // IGNORA o cacheControl pedido no envio -- conferido em 22/08/2026,
    // inclusive num arquivo recém-subido só para o teste. Sem isto o
    // otimizador respeitaria a origem e rebaixaria a foto de novo a cada
    // visita, que é justamente o que estoura o tráfego do plano gratuito.
    //
    // A documentação diz que vale o MAIOR entre este número e o cabeçalho
    // da origem, então é aqui que o prazo é decidido de fato.
    //
    // 31 dias é agressivo e seguro ao mesmo tempo, porque todo caminho no
    // bucket carrega carimbo de tempo (ver lib/storage): trocar a foto
    // gera um endereço novo, e endereço novo é entrada nova no cache. Não
    // existe o caso "mesma URL, conteúdo diferente" que tornaria um prazo
    // longo perigoso -- e é bom que não exista, porque o cache do
    // otimizador não tem como ser invalidado à mão.
    minimumCacheTTL: 2678400,
    // AVIF primeiro: é bem menor que WebP para foto de câmera, que é o
    // grosso do que passa por aqui. Quem não suporta cai no WebP.
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
