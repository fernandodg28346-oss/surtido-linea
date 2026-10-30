/* ===================== Arranque ===================== */
(async function boot(){
  const app=document.getElementById("app");
  if(!window.supabase||!window.SL_CONFIG){ app.innerHTML='<div class="panel empty">No se pudo cargar la conexión con Supabase. Revisa el internet del equipo y el archivo config.js.</div>'; return; }
  // El enlace de "olvidé mi contraseña" llega con type=recovery; el cliente lo borra de la URL al iniciar.
  const recovery=/type=recovery/.test(location.hash);
  Store.init();
  Store.sb.auth.onAuthStateChange(ev=>{ if(ev==="SIGNED_OUT") location.reload(); if(ev==="PASSWORD_RECOVERY") renderNewPassword(app); });
  const {data:{session}}=await Store.sb.auth.getSession();
  if(S.recovery) return;
  if(session&&recovery) return renderNewPassword(app);
  if(!session) return renderAuth(app,"login");
  if(session.user.user_metadata?.debe_cambiar) return renderNewPassword(app,true);
  Store.session=session; Store.email=session.user.email; S.uid=session.user.id;
  const {data:mine,error}=await Store.sb.from("sl_gafetes").select("id,data").eq("data->>user_id",S.uid).maybeSingle();
  if(error){ app.innerHTML=authCard(`<h2>No se pudo revisar tu acceso</h2><p class="err">${esc(authError(error))}</p><button class="btn" id="a-out">Cerrar sesión</button>`); return bindOut(); }
  if(!mine) return renderPending(app,session);
  if(mine.data.rol==="receptor"||!ROLES[mine.data.rol]) return renderNoAccess(app,mine.data);
  const pending=new Set(["gafetes","bom","plan","config","surtidos","eventos"]);
  const first=c=>m=>{ S[c]=m; pending.delete(c); if(!pending.size) S.ready=true; if(S.ready) render(); };
  ["gafetes","bom","plan","config"].forEach(c=>Store.watch(c,first(c)));
  watchDia(first);
  setInterval(()=>{ if(["surtido","metricas","lineas"].includes(S.view)) render(true); },30000);
})();
// Los surtidos y los eventos (paros, reconteos) se leen solo para la fecha seleccionada.
let diaUnsub=[], surtFecha=null;
function watchDia(first){
  diaUnsub.forEach(u=>u());
  surtFecha=S.sel.fecha; S.surtidos={}; S.eventos={};
  diaUnsub=["surtidos","eventos"].map(c=>Store.watch(c,first?first(c):(m=>{S[c]=m; render(true);}),{field:"fecha",value:surtFecha}));
}
