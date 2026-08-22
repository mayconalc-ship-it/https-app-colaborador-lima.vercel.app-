import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
