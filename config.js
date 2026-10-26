// Conexión pública a Supabase. Esta clave (anon) está hecha para ir en el navegador:
// lo que protege los datos son las reglas RLS de las tablas sl_* (solo equipos autorizados).
// Nunca pongas aquí la clave service_role.
window.SL_CONFIG = {
  supabaseUrl: "https://alkukgmfwiwxymwezedl.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsa3VrZ21md2l3eHltd2V6ZWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3Njc5NTAsImV4cCI6MjEwODM0Mzk1MH0.QbPSGfRvduj6kMBEpnECIsC70GDOZAuZlVBiNYND4eY"
};
