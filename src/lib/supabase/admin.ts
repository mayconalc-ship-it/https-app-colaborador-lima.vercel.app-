import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com privilégios de administrador (service_role).
// NUNCA importar este arquivo em um componente/código que rode no navegador.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
