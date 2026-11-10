// Restablece la contraseña de una cuenta ligada a un gafete de Surtido de Línea: le pone una contraseña temporal y marca
// que debe crear la suya al entrar. Solo la puede llamar un administrador de Surtido de Línea. La cuenta es la misma de
// Control de Personal (mismo proyecto de Supabase), así que la contraseña nueva aplica también ahí.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: esAdmin, error: eAdmin } = await caller.rpc("sl_es_admin");
  if (eAdmin || esAdmin !== true) return json(403, { error: "Solo el administrador puede restablecer contraseñas." });
  const { data: { user: quien } } = await caller.auth.getUser();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "Solicitud inválida." }); }
  const userId = String(body.user_id ?? "");
  const password = String(body.password ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json(400, { error: "Cuenta inválida." });
  if (password.length < 8) return json(400, { error: "La contraseña temporal debe tener al menos 8 caracteres." });
  if (quien?.id === userId) return json(400, { error: "Para tu propia cuenta usa Contraseña en el menú." });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // Solo cuentas ligadas a un gafete de Surtido: no toca cuentas que solo usa Control de Personal.
  const { data: gaf } = await admin.from("sl_gafetes").select("id,data").eq("data->>user_id", userId).limit(1);
  if (!gaf?.length) return json(404, { error: "Esa cuenta no está ligada a ningún gafete de Surtido de Línea." });

  const { data: u, error: eU } = await admin.auth.admin.getUserById(userId);
  if (eU || !u?.user) return json(404, { error: "No se encontró la cuenta." });
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password, user_metadata: { ...(u.user.user_metadata ?? {}), debe_cambiar: true },
  });
  if (error) return json(400, { error: /password/i.test(error.message) ? "La contraseña temporal no es válida: " + error.message : "No se pudo restablecer: " + error.message });
  return json(200, { ok: true, email: u.user.email });
});
