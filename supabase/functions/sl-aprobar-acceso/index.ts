// Aprueba una solicitud de acceso: crea la cuenta (o usa la que ya existe con ese correo), la liga al gafete con
// el rol elegido y marca la solicitud como aprobada. Solo la puede llamar un administrador de Surtido de Línea.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ROLES = ["admin", "planeador", "materialista", "lider", "gerente", "supervisor"];
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
// Mismo identificador de fila que usa la app para un gafete nuevo.
const safeId = (s: string) => String(s).trim().replace(/[^A-Za-z0-9_\-.~:@+]/g, "-").slice(0, 120) || "x";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: esAdmin, error: eAdmin } = await caller.rpc("sl_es_admin");
  if (eAdmin || esAdmin !== true) return json(403, { error: "Solo el administrador puede aprobar solicitudes." });
  const { data: { user: quien } } = await caller.auth.getUser();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "Solicitud inválida." }); }
  const id = String(body.solicitud_id ?? "");
  const rol = String(body.rol ?? "");
  const gafete = String(body.gafete ?? "").trim();
  const nombre = String(body.nombre ?? "").trim();
  const area = String(body.area ?? "").trim();
  const password = String(body.password ?? "");
  if (!ROLES.includes(rol)) return json(400, { error: "Rol inválido." });
  if (!gafete || !nombre) return json(400, { error: "Faltan el gafete o el nombre." });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: sol } = await admin.from("sl_solicitudes_acceso").select("*").eq("id", id).maybeSingle();
  if (!sol || sol.estado !== "pendiente") return json(404, { error: "La solicitud ya no está pendiente." });
  const email = String(sol.email).toLowerCase();

  // Cuenta: se crea con la contraseña inicial; si el correo ya tiene cuenta, se usa esa y no se toca su contraseña.
  let userId = "", existente = false;
  const creado = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre, gafete, debe_cambiar: true },
  });
  if (creado.data?.user) {
    userId = creado.data.user.id;
  } else {
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const u = data?.users.find((x) => (x.email ?? "").toLowerCase() === email);
      if (u) { userId = u.id; existente = true; }
      if (!data || data.users.length < 200) break;
    }
    if (!userId) {
      const msg = String(creado.error?.message ?? "");
      return json(400, { error: /password/i.test(msg) ? "La contraseña inicial debe tener al menos 8 caracteres." : "No se pudo crear la cuenta: " + msg });
    }
  }

  // Gafete: el registrado con ese número (si lo hay) o uno nuevo; una cuenta se liga a un solo gafete.
  const { data: porNumero } = await admin.from("sl_gafetes").select("id,data").eq("data->>gafete", gafete).limit(1);
  const { data: porId } = await admin.from("sl_gafetes").select("id,data").eq("id", safeId(gafete)).limit(1);
  const actual = porNumero?.[0] ?? porId?.[0];
  if (actual?.data?.user_id && actual.data.user_id !== userId) {
    return json(409, { error: `El gafete ${gafete} ya está ligado a otra cuenta (${actual.data.email ?? ""}).` });
  }
  const { data: otros } = await admin.from("sl_gafetes").select("id,data").eq("data->>user_id", userId);
  for (const o of otros ?? []) {
    if (o.id === actual?.id) continue;
    const d = { ...o.data }; delete d.user_id; delete d.email;
    await admin.from("sl_gafetes").update({ data: d, actualizado: new Date().toISOString() }).eq("id", o.id);
  }
  const data = { ...(actual?.data ?? {}), gafete, nombre, area: area || actual?.data?.area || "", rol, email, user_id: userId };
  const { error: eG } = await admin.from("sl_gafetes").upsert({ id: actual?.id ?? safeId(gafete), data, actualizado: new Date().toISOString() });
  if (eG) return json(500, { error: "No se pudo ligar el gafete: " + eG.message });

  await admin.from("sl_solicitudes_acceso")
    .update({ estado: "aprobada", revisado: new Date().toISOString(), revisado_por: quien?.email ?? "" }).eq("id", id);
  return json(200, { ok: true, existente, email });
});
