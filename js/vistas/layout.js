/* ===================== Layout: plano de planta con las estaciones de surtido =====================
   sl_config "layout": {img:{w,h,v}, zonas:[{id,linea,estacion,etiqueta,x,y,w,h}]} con x, y, w, h en fracción del plano (0–1).
   La imagen va aparte en sl_config "layout_img" ({data: data URL}) y solo se lee al abrir esta pestaña.
   Cada zona es una estación de una línea (o la línea completa si no tiene estación) y se colorea con su estado de surtido. */
const LY={img:null, edit:false, draft:null, sel:null, drag:null, cargando:false};
const LY_ESTADO={
  due:{l:"Surtido vencido",c:"bad"}, soon:{l:"Surtido en menos de 15 min",c:"warn"}, ok:{l:"Al 100%",c:"ok"},
  stop:{l:"Línea detenida",c:"warn"}, wait:{l:"Esperando arranque",c:"idle"}, err:{l:"Falta BOM o UPH",c:"idle"}, none:{l:"Sin plan",c:"idle"}
};
const layoutCfg=()=>LY.draft||S.config.layout||{zonas:[]};
// Imagen del plano: se pide una vez por versión (img.v) para no cargarla con el resto de la configuración.
async function cargarImagenLayout(){
  const v=S.config.layout?.img?.v; if(!v||LY.cargando||(LY.img&&LY.img.v===v)) return;
  LY.cargando=true;
  try{ const {data,error}=await Store.sb.from("sl_config").select("data").eq("id","layout_img").maybeSingle();
    if(error) throw error; LY.img={v,url:data?.data?.data||""}; }
  catch(e){ toast("No se pudo cargar el plano ("+(e.message||e.code)+")."); }
  finally{ LY.cargando=false; if(S.view==="layout") render(); }
}
// Estado de cada zona a partir del tablero de líneas (mismo cálculo que la pestaña Líneas).
function estadoZona(z,board){
  const l=board.find(x=>x.linea===z.linea); if(!l) return {k:"none"};
  if(l.paro) return {k:"stop",l};
  if(!z.estacion) return {k:l.state,l,pend:l.pend};
  const st=l.st[z.estacion], pend=l.pend.filter(x=>x.it.estacion===z.estacion);
  if(!st) return {k:l.waiting.length&&!l.total?"wait":l.err.length&&!l.total?"err":"none",l,pend};
  return {k:st.due?"due":st.soon?"soon":"ok",l,pend};
}
const zonaNombre=z=>z.etiqueta||(z.linea+(z.estacion?" · Est. "+z.estacion:""));
function estacionesBom(){ return [...new Set(Object.values(S.bom).flatMap(b=>(b.items||[]).map(it=>String(it.estacion||"").trim())).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})); }
function lineasLayout(){ return [...new Set([...lineasCat(),...Object.values(S.plan).map(p=>p.linea).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})); }

function viewLayout(app){
  if(LY.drag) return; // no redibujar a media edición
  const L=layoutCfg(), img=S.config.layout?.img, editando=LY.edit&&can.admin();
  cargarImagenLayout();
  const c=cfg(), now=Date.now(), board=lineBoard(S.sel.fecha,S.sel.turno,now);
  const zonas=(L.zonas||[]).map(z=>Object.assign({},z,{e:estadoZona(z,board)}));
  const cuenta=k=>zonas.filter(z=>z.e.k===k).length;
  const zoom=S.sel.zoomLy||1, url=LY.img&&LY.img.v===img?.v?LY.img.url:"";
  app.innerHTML=`
  <div class="view-head"><div><h2>Layout de planta</h2><p>${editando?"Arrastra sobre el plano para marcar una estación. Toca una zona para cambiarla; arrástrala para moverla o usa la esquina para cambiar su tamaño.":"Cada estación se colorea con su estado de surtido. Toca una para ver qué NP surtir."}</p></div>
    ${can.admin()?`<div class="row">${editando?`<label class="btn file-btn">${img?"Cambiar plano":"Subir plano"}<input type="file" id="ly-file" accept="image/*"></label><button class="btn" id="ly-cancel">Cancelar</button><button class="btn pri" id="ly-save" ${LY.draft?"":"disabled"}>Guardar layout</button>`
      :`<button class="btn" id="ly-edit">Editar layout</button>`}</div>`:""}</div>
  ${editando?"":`<div class="filters">
    <div class="fld"><label for="y-fecha">Fecha</label><input type="date" id="y-fecha" value="${S.sel.fecha}"></div>
    <div class="fld"><label for="y-turno">Turno</label><select id="y-turno"><option value="">Todos</option>${Object.keys(c.turnos).map(t=>`<option ${S.sel.turno===t?"selected":""}>${t}</option>`).join("")}</select></div>
    <span class="muted small" style="margin-left:auto">Actualizado ${fmtT(new Date())} · se refresca cada 30 s</span>
  </div>
  <div class="ly-leyenda">${["due","soon","ok","stop","none"].map(k=>`<span class="ly-key ly-${k}"><i></i>${LY_ESTADO[k].l}${k==="none"?"":` <b class="num">${cuenta(k)}</b>`}</span>`).join("")}</div>`}
  ${!img?`<div class="panel empty">${can.admin()?(editando?"Sube el plano de la planta (imagen JPG o PNG) para empezar a marcar las estaciones.":"Aún no hay plano. Presiona <b>Editar layout</b> para subirlo y marcar las estaciones."):"El administrador aún no ha configurado el layout de la planta."}</div>`
  :`<div class="ly-tools row"><span class="muted small">Zoom</span>${[1,1.5,2,3].map(z=>`<button class="btn ${zoom===z?"pri":"ghost"}" data-zoom="${z}">${z*100}%</button>`).join("")}
    ${editando?`<span class="muted small" style="margin-left:auto">${(L.zonas||[]).length} estaciones marcadas</span>`:""}</div>
  <div class="ly-scroll panel"><div class="ly-plano ${editando?"editando":""}" id="ly-plano" style="width:${zoom*100}%;aspect-ratio:${img.w}/${img.h}">
    ${url?`<img src="${url}" alt="Plano de la planta" draggable="false">`:`<div class="empty">${LY.img&&LY.img.v===img.v?"No se encontró la imagen del plano. Súbela de nuevo en Editar layout.":"Cargando plano…"}</div>`}
    ${zonas.map(z=>`<button class="ly-zona ly-${z.e.k} ${LY.sel===z.id?"sel":""}" data-zona="${esc(z.id)}" style="left:${z.x*100}%;top:${z.y*100}%;width:${z.w*100}%;height:${z.h*100}%"
      title="${esc(zonaNombre(z))}: ${esc(LY_ESTADO[z.e.k]?.l||"")}${z.e.pend?.length?` (${z.e.pend.length} vencido${z.e.pend.length>1?"s":""})`:""}"><span>${z.etiqueta?`<b>${esc(z.etiqueta)}</b>`:z.estacion?`<b>${esc(z.estacion)}</b> <small>${esc(z.linea)}</small>`:`<b>${esc(z.linea)}</b>`}</span>${!editando&&z.e.pend?.length?`<em class="ly-n">${z.e.pend.length}</em>`:""}${editando?'<i class="ly-asa" data-asa="1"></i>':""}</button>`).join("")}
  </div></div>`}`;
  if(!editando){
    document.getElementById("y-fecha").onchange=e=>{S.sel.fecha=e.target.value;render();};
    document.getElementById("y-turno").onchange=e=>{S.sel.turno=e.target.value;render();};
  }
  app.querySelectorAll("[data-zoom]").forEach(b=>b.onclick=()=>{S.sel.zoomLy=Number(b.dataset.zoom); render();});
  const ed=document.getElementById("ly-edit"); if(ed) ed.onclick=()=>{LY.edit=true; LY.draft=null; LY.sel=null; render();};
  const cn=document.getElementById("ly-cancel"); if(cn) cn.onclick=()=>{ const salir=()=>{LY.edit=false; LY.draft=null; LY.sel=null; render();};
    if(LY.draft) confirmBox("¿Descartar los cambios al layout?","Descartar",salir); else salir(); };
  const sv=document.getElementById("ly-save"); if(sv) sv.onclick=guardarLayout;
  const fi=document.getElementById("ly-file"); if(fi) fi.onchange=e=>subirPlano(e.target.files[0]);
  const plano=document.getElementById("ly-plano"); if(!plano) return;
  if(editando) bindEdicionLayout(plano);
  else app.querySelectorAll("[data-zona]").forEach(b=>b.onclick=()=>{ const z=zonas.find(x=>x.id===b.dataset.zona); if(z) abrirZona(z); });
}
// Detalle de una zona en la operación: estado y NP vencidos, con acceso directo a la pestaña Surtido.
function abrirZona(z){
  const root=document.getElementById("modal-root"), e=z.e, est=LY_ESTADO[e.k]||LY_ESTADO.none, now=Date.now();
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="lz-t">
    <div class="ph"><h3 id="lz-t">${esc(zonaNombre(z))}</h3><button class="btn ghost" id="lz-x">Cerrar</button></div>
    <div class="pb"><div><span class="pill p-${est.c}">${est.l}</span></div>
      <div class="small muted">Línea <b>${esc(z.linea)}</b>${z.estacion?` · estación <b>${esc(z.estacion)}</b>`:" · toda la línea"}${e.l?` · ${[...e.l.ens].map(esc).join(", ")}`:""}</div>
      ${e.l?.paro?`<div class="small" style="color:var(--warn)">Detenida desde ${fmtT(new Date(e.l.paro.inicio))}. Los surtidos siguientes están en pausa.</div>`:""}
      ${e.pend?.length?`<div class="pend"><div class="lbl">Pendiente de resurtir</div>${e.pend.slice(0,8).map(x=>`<div class="pend-row"><span class="mono"><b>${esc(x.it.estacion)}</b> · ${esc(x.it.np)}</span><span class="mono">${fmtN(x.t.qty)} pzs</span><span class="late-by">hace ${ago(x.min)}</span></div>`).join("")}${e.pend.length>8?`<div class="small muted">y ${e.pend.length-8} más</div>`:""}</div>`
        :e.k==="none"?`<p class="muted" style="margin:0">No hay plan para esta ${z.estacion?"estación":"línea"} en ${esc(S.sel.fecha)}${S.sel.turno?" turno "+esc(S.sel.turno):""}.</p>`:""}
      ${e.k!=="none"?`<div class="row" style="justify-content:flex-end"><button class="btn pri" id="lz-go">Ir a surtir</button></div>`:""}</div></div></div>`;
  document.getElementById("lz-x").onclick=()=>root.innerHTML="";
  const go=document.getElementById("lz-go");
  if(go) go.onclick=()=>{ root.innerHTML=""; S.sel.linea=z.linea; S.sel.focoSt=z.estacion?z.linea+"|"+z.estacion:""; S.view=tabsOf(S.me.rol).includes("surtido")?"surtido":"lineas"; render(); };
}

/* ---------- Edición (solo administrador) ---------- */
function borradorLayout(){ if(!LY.draft) LY.draft=JSON.parse(JSON.stringify(S.config.layout||{zonas:[]})); LY.draft.zonas=LY.draft.zonas||[]; return LY.draft; }
// Reduce el plano a 2400 px por lado como máximo para que quepa en la base (WebP, o JPEG si el navegador no lo genera).
function subirPlano(file){
  if(!file) return; if(!/^image\//.test(file.type)) return toast("Elige una imagen (JPG o PNG).");
  const fr=new FileReader();
  fr.onload=()=>{ const im=new Image();
    im.onload=async()=>{
      const k=Math.min(1,2400/Math.max(im.naturalWidth,im.naturalHeight)), w=Math.round(im.naturalWidth*k), h=Math.round(im.naturalHeight*k);
      const cv=document.createElement("canvas"); cv.width=w; cv.height=h; const cx=cv.getContext("2d");
      cx.fillStyle="#fff"; cx.fillRect(0,0,w,h); cx.drawImage(im,0,0,w,h);
      let url=cv.toDataURL("image/webp",0.85); if(!url.startsWith("data:image/webp")) url=cv.toDataURL("image/jpeg",0.85);
      if(url.length>3e6) return toast("El plano es demasiado pesado aun reducido. Usa una imagen más simple o de menor resolución.");
      const v=Date.now();
      if(!await safeWrite(()=>Store.set("config","layout_img",{data:url}))) return;
      const d=borradorLayout(); d.img={w,h,v}; LY.img={v,url};
      // Las zonas se guardan en fracciones del plano, así que se conservan al cambiar la imagen.
      if(await safeWrite(()=>Store.set("config","layout",d))){ LY.draft=null; toast("Plano guardado"); }
      render();
    };
    im.onerror=()=>toast("No se pudo leer la imagen."); im.src=fr.result; };
  fr.readAsDataURL(file);
}
async function guardarLayout(){
  const d=borradorLayout();
  if(await safeWrite(()=>Store.set("config","layout",d))){ LY.draft=null; LY.edit=false; LY.sel=null; toast("Layout guardado"); render(); }
}
function bindEdicionLayout(plano){
  const pos=e=>{ const r=plano.getBoundingClientRect(); return {x:Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),y:Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))}; };
  plano.onpointerdown=e=>{
    if(e.button>0) return;
    const zb=e.target.closest("[data-zona]"), p=pos(e);
    if(zb){ const z=borradorLayout().zonas.find(x=>x.id===zb.dataset.zona); if(!z) return;
      LY.drag={modo:e.target.dataset.asa?"tam":"mover",z,el:zb,p0:p,o:{x:z.x,y:z.y,w:z.w,h:z.h},movio:false}; }
    else{ const el=document.createElement("div"); el.className="ly-zona ly-nueva"; plano.appendChild(el);
      LY.drag={modo:"nueva",el,p0:p,movio:false}; }
    plano.setPointerCapture(e.pointerId); e.preventDefault();
  };
  plano.onpointermove=e=>{ const d=LY.drag; if(!d) return; const p=pos(e), dx=p.x-d.p0.x, dy=p.y-d.p0.y;
    if(Math.abs(dx)+Math.abs(dy)>0.004) d.movio=true;
    let r;
    if(d.modo==="nueva") r={x:Math.min(p.x,d.p0.x),y:Math.min(p.y,d.p0.y),w:Math.abs(dx),h:Math.abs(dy)};
    else if(d.modo==="mover") r={x:Math.min(1-d.o.w,Math.max(0,d.o.x+dx)),y:Math.min(1-d.o.h,Math.max(0,d.o.y+dy)),w:d.o.w,h:d.o.h};
    else r={x:d.o.x,y:d.o.y,w:Math.max(0.01,Math.min(1-d.o.x,d.o.w+dx)),h:Math.max(0.01,Math.min(1-d.o.y,d.o.h+dy))};
    d.r=r; Object.assign(d.el.style,{left:r.x*100+"%",top:r.y*100+"%",width:r.w*100+"%",height:r.h*100+"%"});
  };
  plano.onpointerup=plano.onpointercancel=()=>{ const d=LY.drag; LY.drag=null; if(!d) return;
    if(d.modo==="nueva"){ d.el.remove(); if(d.movio&&d.r.w>0.008&&d.r.h>0.008) editarZona(null,d.r); return; }
    if(!d.movio) return editarZona(d.z);
    if(d.r){ Object.assign(d.z,d.r); LY.sel=d.z.id; }
    render();
  };
}
// Alta o cambio de una zona: línea (del catálogo o del plan), estación del BOM (o toda la línea) y nombre opcional.
function editarZona(z,rect){
  const root=document.getElementById("modal-root"), nueva=!z, lineas=lineasLayout(), ests=estacionesBom();
  const v=z||{linea:S.sel.linea||lineas[0]||"",estacion:"",etiqueta:""};
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="ez-t">
    <div class="ph"><h3 id="ez-t">${nueva?"Nueva estación en el plano":"Estación en el plano"}</h3><button class="btn ghost" id="ez-x">Cancelar</button></div>
    <form class="pb" id="f-ez">
      <div class="fld"><label for="ez-l">Línea</label>${lineas.length?`<select id="ez-l" required>${lineas.map(l=>`<option ${l===v.linea?"selected":""}>${esc(l)}</option>`).join("")}</select>`
        :`<input id="ez-l" required autocomplete="off" value="${esc(v.linea)}">`}</div>
      <div class="fld"><label for="ez-e">Estación</label><input id="ez-e" list="ez-ests" autocomplete="off" value="${esc(v.estacion)}" placeholder="Vacío = toda la línea">
        <datalist id="ez-ests">${ests.map(s=>`<option value="${esc(s)}">`).join("")}</datalist></div>
      <div class="fld"><label for="ez-n">Nombre en el plano <span class="muted">(opcional)</span></label><input id="ez-n" autocomplete="off" value="${esc(v.etiqueta||"")}" placeholder="Por defecto: línea y estación"></div>
      <p class="small muted" style="margin:0">La estación debe escribirse igual que en el BOM para que el plano muestre su estado.</p>
      <div class="row" style="justify-content:space-between">${nueva?"<span></span>":`<button type="button" class="btn danger" id="ez-del">Quitar del plano</button>`}<button class="btn pri">${nueva?"Agregar":"Aplicar"}</button></div>
    </form></div></div>`;
  const close=()=>{ root.innerHTML=""; render(); };
  document.getElementById("ez-x").onclick=close;
  const del=document.getElementById("ez-del");
  if(del) del.onclick=()=>{ const d=borradorLayout(); d.zonas=d.zonas.filter(x=>x.id!==z.id); LY.sel=null; close(); };
  document.getElementById("f-ez").onsubmit=e=>{ e.preventDefault();
    const val={linea:ffv("ez-l"),estacion:ffv("ez-e"),etiqueta:ffv("ez-n")}; if(!val.linea) return;
    const d=borradorLayout();
    if(nueva){ const id=newId(); d.zonas.push(Object.assign({id},val,rect)); LY.sel=id; }
    else Object.assign(d.zonas.find(x=>x.id===z.id)||{},val);
    close(); };
  document.getElementById(lineas.length?"ez-e":"ez-l").focus();
}
