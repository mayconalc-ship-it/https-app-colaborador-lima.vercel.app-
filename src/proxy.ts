import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { precisaTrocarSenha } from "@/lib/senha";
import { CABECALHO_USUARIO } from "@/lib/sessao-headers";

const PUBLIC_PATHS = ["/login"];
const ROTA_DEFINIR_SENHA = "/definir-senha";

export async function proxy(request: NextRequest) {
  // O proxy ja valida o token no Supabase. Repassamos o id do usuario para a
  // renderizacao por cabecalho, evitando uma segunda validacao (que custava
  // outra ida ate o Supabase em toda navegacao).
  const cabecalhos = new Headers(request.headers);
  // Sempre apagamos antes: assim um cabecalho forjado de fora nunca sobrevive.
  cabecalhos.delete(CABECALHO_USUARIO);

  let response = NextResponse.next({ request: { headers: cabecalhos } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request: { headers: cabecalhos } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims confere a assinatura do token com a chave pública do projeto,
  // em memória (~1ms). O getUser antigo ia até o Supabase a cada navegação,
  // o que sozinho custava a maior parte do tempo de abertura das telas.
  // Se a verificação local falhar por qualquer motivo, caímos no getUser.
  let user: { id: string; user_metadata?: Record<string, unknown> } | null =
    null;

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (!claimsError && claimsData?.claims?.sub) {
    user = {
      id: claimsData.claims.sub,
      user_metadata: claimsData.claims.user_metadata as Record<string, unknown>,
    };
  } else {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Enquanto o colaborador nao trocar a senha padrao, so pode acessar a tela
  // de definir senha (e o logout, que roda no proprio cliente).
  if (
    user &&
    precisaTrocarSenha(user.user_metadata) &&
    request.nextUrl.pathname !== ROTA_DEFINIR_SENHA
  ) {
    const url = request.nextUrl.clone();
    url.pathname = ROTA_DEFINIR_SENHA;
    return NextResponse.redirect(url);
  }

  // Ja trocou: nao faz sentido continuar nessa tela
  if (
    user &&
    !precisaTrocarSenha(user.user_metadata) &&
    request.nextUrl.pathname === ROTA_DEFINIR_SENHA
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (user) {
    cabecalhos.set(CABECALHO_USUARIO, user.id);
    response = NextResponse.next({ request: { headers: cabecalhos } });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
