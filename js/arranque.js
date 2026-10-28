/* ===================== Arranque ===================== */
(async function boot(){
  const app=document.getElementById("app");
  if(!window.supabase||!window.SL_CONFIG){ app.innerHTML='<div class="panel empty">No se pudo cargar la conexión con Supabase. Revisa el internet del equipo y el archivo config.js.</div>'; return; }
  Store.init();
  Store.sb.auth.onAuthStateChange(ev=>{ if(ev==="SIGNED_OUT") location.reload(); });
  const {data:{session}}=await Store.sb.auth.getSession();
  if(!session) return renderDeviceLogin(app);
  Store.session=session;
  const {data:eq,error}=await Store.sb.from("sl_equipos").select("nombre").eq("user_id",session.user.id).maybeSingle();
  if(error||!eq) return renderNotAuthorized(app,session,error);
  Store.equipo=eq.nombre||session.user.email;
  try{ const b=sessionStorage.getItem("sl_me"); if(b) S.pendingBadge=b; }catch(e){}
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
