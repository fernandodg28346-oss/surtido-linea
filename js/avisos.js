/* ===================== Avisos =====================
   sl_avisos: los genera la base (cambios al plan por aprobar o resueltos, solicitudes de acceso, líneas detenidas y
   reanudadas). Cada quien ve los suyos; al tocarlos se marcan como leídos y llevan a la pestaña donde se atienden. */
const AV_TAB={plan:"plan",acceso:"gafetes",paro:"lineas"};
async function loadAvisos(){
  const {data,error}=await Store.sb.from("sl_avisos").select("*").order("creado",{ascending:false}).limit(100);
  if(error) return; S.avisos=data||[]; if(S.ready) render(true);
}
function watchAvisos(){
  loadAvisos();
  Store.sb.channel("sl_avisos_"+newId())
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"sl_avisos",filter:"para=eq."+S.uid},p=>{ loadAvisos(); if(p.new?.titulo) toast("Aviso: "+p.new.titulo); })
    .subscribe();
  window.addEventListener("focus",()=>loadAvisos());
}
async function marcarLeidos(ids){
  if(!ids.length) return true;
  const {error}=await Store.sb.from("sl_avisos").update({leido:true}).in("id",ids);
  if(error){ toast("No se pudieron marcar como leídos ("+(error.message||error.code)+")."); return false; }
  S.avisos.forEach(a=>{ if(ids.includes(a.id)) a.leido=true; }); return true;
}
function openAvisos(){
  const root=document.getElementById("modal-root"), list=S.avisos, nuevos=list.filter(a=>!a.leido);
  const cuando=t=>new Date(t).toLocaleString("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="av-t">
    <div class="ph"><h3 id="av-t">Avisos</h3><div class="row">${nuevos.length?'<button class="btn" id="av-all">Marcar todo como leído</button>':""}<button class="btn ghost" id="av-x">Cerrar</button></div></div>
    <div class="av-list">${list.length?list.map(a=>`<button class="av-item ${a.leido?"":"nuevo"}" data-av="${a.id}"><i class="dot" aria-hidden="true"></i>
      <div><div class="av-t"><b>${esc(a.titulo)}</b><span class="small muted" style="white-space:nowrap">${cuando(a.creado)}</span></div>
      <div class="small muted">${esc(a.detalle)}</div></div></button>`).join("")
      :'<div class="empty">No tienes avisos.</div>'}</div></div></div>`;
  const close=()=>{ root.innerHTML=""; render(); };
  document.getElementById("av-x").onclick=close;
  const all=document.getElementById("av-all"); if(all) all.onclick=async()=>{ if(await marcarLeidos(nuevos.map(a=>a.id))) openAvisos(); };
  root.querySelectorAll("[data-av]").forEach(b=>b.onclick=async()=>{
    const a=list.find(x=>x.id===b.dataset.av); if(!a) return;
    if(!a.leido) await marcarLeidos([a.id]);
    const tab=AV_TAB[a.tipo]; if(tab&&tabsOf(S.me.rol).includes(tab)) S.view=tab;
    close();
  });
}
