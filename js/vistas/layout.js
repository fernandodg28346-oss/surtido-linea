/* ===================== Layout: mapas de planta con las estaciones de surtido (vista "Layout" de la pestaña Líneas) =====================
   sl_config "layout": {mapas:[{id,nombre,img:{w,h,v,key},zonas:[{id,linea,estacion,etiqueta,x,y,w,h}]}]}, con x, y, w, h en
   fracción del plano (0–1). Cada mapa es un site o un área. La imagen de cada mapa va aparte en sl_config img.key
   ({data: data URL}) y solo se lee al abrir esta pestaña. El formato anterior (un solo plano: {img, zonas} con la imagen
   en "layout_img") se lee como un mapa llamado "Planta".
   Cada zona es una estación de una línea (o la línea completa si no tiene estación) y se colorea con su estado de surtido. */
const LY={imgs:{}, cargando:new Set(), edit:false, modo:"estaciones", origen:null, draft:null, sel:null, drag:null};
// Ensamble final cuyo flujo se dibuja sobre el plano ("" = ninguno); cada equipo recuerda el último.
try{ S.sel.flujoLy=localStorage.getItem("sl_flujo")||""; }catch(e){ S.sel.flujoLy=""; }
const LY_ESTADO={
  due:{l:"Surtido vencido",c:"bad"}, soon:{l:"Surtido en menos de 15 min",c:"warn"}, ok:{l:"Al 100%",c:"ok"},
  stop:{l:"Línea detenida",c:"warn"}, wait:{l:"Esperando arranque",c:"idle"}, err:{l:"Falta BOM o UPH",c:"idle"}, none:{l:"Sin plan",c:"idle"}
};
function mapasDe(L){
  if(!L) return [];
  if(Array.isArray(L.mapas)) return L.mapas;
  return L.img||(L.zonas||[]).length?[{id:"planta",nombre:"Planta",img:L.img?Object.assign({key:"layout_img"},L.img):null,zonas:L.zonas||[]}]:[];
}
const layoutCfg=()=>LY.draft||{mapas:mapasDe(S.config.layout)};
// Mapa elegido en este equipo (se recuerda); si ya no existe, el primero.
try{ S.sel.mapa=localStorage.getItem("sl_mapa")||""; }catch(e){}
function elegirMapa(id){ S.sel.mapa=id; try{ localStorage.setItem("sl_mapa",id); }catch(e){} }
function mapaActual(L){ return L.mapas.find(m=>m.id===S.sel.mapa)||L.mapas[0]||null; }
// Imagen del plano: se pide una vez por versión (img.v) para no cargarla con el resto de la configuración.
async function cargarImagenMapa(m){
  const im=m?.img; if(!im||LY.cargando.has(im.key)||LY.imgs[im.key]?.v===im.v) return;
  LY.cargando.add(im.key);
  try{ const {data,error}=await Store.sb.from("sl_config").select("data").eq("id",im.key).maybeSingle();
    if(error) throw error; LY.imgs[im.key]={v:im.v,url:data?.data?.data||""}; }
  catch(e){ toast("No se pudo cargar el plano ("+(e.message||e.code)+")."); }
  finally{ LY.cargando.delete(im.key); if(S.view==="lineas"&&S.sel.vistaLineas==="layout") render(); }
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
  const L=layoutCfg(), m=mapaActual(L), img=m?.img, editando=LY.edit&&can.admin();
  cargarImagenMapa(m);
  const c=cfg(), now=Date.now(), board=lineBoard(S.sel.fecha,S.sel.turno,now);
  const zonas=(m?.zonas||[]).map(z=>Object.assign({},z,{e:estadoZona(z,board)}));
  const cuenta=k=>zonas.filter(z=>z.e.k===k).length;
  const vencidas=mp=>(mp.zonas||[]).filter(z=>estadoZona(z,board).k==="due").length;
  const zoom=S.sel.zoomLy||1, cache=img&&LY.imgs[img.key], url=cache&&cache.v===img.v?cache.url:"";
  const flujo=editando&&LY.modo==="flujo", finales=finalesConFlujo(), fin=finales.includes(S.sel.flujoLy)?S.sel.flujoLy:"";
  const fl=fin&&m?flechasDe(fin,m.zonas||[]):null;
  const selFlujo=finales.length||flujo?`<div class="fld"><label for="y-flujo">Mostrar flujo de</label><select id="y-flujo"><option value="">${flujo?"Todas las conexiones":"Sin flujo"}</option>${finales.map(f=>`<option ${f===fin?"selected":""}>${esc(f)}</option>`).join("")}</select></div>`:"";
  // En el modo Flujo de la edición, sin un ensamble elegido se ven todas las conexiones del mapa.
  const flechas=fl?fl.flechas:flujo&&m?finales.flatMap(f=>flechasDe(f,m.zonas||[]).flechas).filter((g,i,a)=>a.findIndex(x=>x.o.id===g.o.id&&x.d.id===g.d.id)===i):[];
  const selector=L.mapas.length?`<div class="fld"><label for="y-mapa">Mapa</label><select id="y-mapa">${L.mapas.map(mp=>{ const n=editando?0:vencidas(mp);
    return `<option value="${esc(mp.id)}" ${mp.id===m?.id?"selected":""}>${esc(mp.nombre)}${n?` · ${n} vencida${n>1?"s":""}`:""}</option>`; }).join("")}</select></div>`:"";
  app.innerHTML=`
  <div class="view-head"><div><h2>Estado de líneas</h2><p>${flujo?"Toca la estación que <b>produce</b> el subensamble y luego la que lo <b>consume</b> para conectarlas. Toca la etiqueta de una flecha para cambiar o quitar la conexión.":editando?"Arrastra sobre el plano para marcar una estación. Toca una zona para cambiarla; arrástrala para moverla o usa la esquina para cambiar su tamaño.":"Cada estación se colorea con su estado de surtido. Toca una para ver qué NP surtir."}</p></div>
    <div class="row">${editando?"":vistaLineasSwitch()}${can.admin()?`${editando?`<button class="btn" id="ly-cancel">${LY.draft?"Cancelar":"Terminar"}</button><button class="btn pri" id="ly-save" ${LY.draft?"":"disabled"}>Guardar estaciones</button>`
      :`<button class="btn" id="ly-edit">Editar layout</button>`}`:""}</div></div>
  ${editando?`<div class="filters ly-mapas">${selector}
    <div class="fld"><label>Editar</label><div class="seg" role="group" aria-label="Qué editar">${[["estaciones","Estaciones"],["flujo","Flujo"]].map(([k,l])=>`<button type="button" data-modo="${k}" aria-pressed="${LY.modo===k}">${l}</button>`).join("")}</div></div>
    ${flujo?selFlujo:""}
    <button class="btn" id="ly-new">Nuevo mapa</button>
    ${m?`<button class="btn" id="ly-ren">Renombrar</button><label class="btn file-btn">${img?"Cambiar plano":"Subir plano"}<input type="file" id="ly-file" accept="image/*"></label><button class="btn danger" id="ly-delmap">Eliminar mapa</button>`:""}
    ${m?`<span class="muted small" style="margin-left:auto">${(m.zonas||[]).length} estaciones marcadas</span>`:""}</div>`
  :`<div class="filters">${selector}${selFlujo}
    <div class="fld"><label for="y-fecha">Fecha</label><input type="date" id="y-fecha" value="${S.sel.fecha}"></div>
    <div class="fld"><label for="y-turno">Turno</label><select id="y-turno"><option value="">Todos</option>${Object.keys(c.turnos).map(t=>`<option ${S.sel.turno===t?"selected":""}>${t}</option>`).join("")}</select></div>
    <span class="muted small" style="margin-left:auto">Actualizado ${fmtT(new Date())} · se refresca cada 30 s</span>
  </div>
  ${m?`<div class="ly-leyenda">${["due","soon","ok","stop","none"].map(k=>`<span class="ly-key ly-${k}"><i></i>${LY_ESTADO[k].l}${k==="none"?"":` <b class="num">${cuenta(k)}</b>`}</span>`).join("")}</div>`:""}`}
  ${!m?`<div class="panel empty">${can.admin()?(editando?"Crea el primer mapa con <b>Nuevo mapa</b>; luego sube su plano y marca las estaciones.":"Aún no hay mapas. Presiona <b>Editar layout</b> para crear uno, subir su plano y marcar las estaciones."):"El administrador aún no ha configurado el layout de la planta."}</div>`
  :!img?`<div class="panel empty">${editando?`Sube el plano de <b>${esc(m.nombre)}</b> (imagen JPG o PNG) para empezar a marcar las estaciones.`:`El mapa <b>${esc(m.nombre)}</b> aún no tiene plano.`}</div>`
  :`<div class="ly-tools row"><span class="muted small">Zoom</span>${[1,1.5,2,3].map(z=>`<button class="btn ${zoom===z?"pri":"ghost"}" data-zoom="${z}">${z*100}%</button>`).join("")}</div>
  <div class="ly-scroll panel"><div class="ly-plano ${editando&&!flujo?"editando":""} ${flujo?"conectando":""}" id="ly-plano" style="width:${zoom*100}%;aspect-ratio:${img.w}/${img.h}">
    ${url?`<img src="${url}" alt="Plano: ${esc(m.nombre)}" draggable="false">`:`<div class="empty">${cache&&cache.v===img.v?"No se encontró la imagen del plano. Súbela de nuevo en Editar layout.":"Cargando plano…"}</div>`}
    ${svgFlechas(flechas,img)}
    ${zonas.map(z=>`<button class="ly-zona ly-${z.e.k} ${LY.sel===z.id||(flujo&&LY.origen===z.id)?"sel":""}" data-zona="${esc(z.id)}" style="left:${z.x*100}%;top:${z.y*100}%;width:${z.w*100}%;height:${z.h*100}%"
      title="${esc(zonaNombre(z))}: ${esc(LY_ESTADO[z.e.k]?.l||"")}${z.e.pend?.length?` (${z.e.pend.length} vencido${z.e.pend.length>1?"s":""})`:""}"><span>${z.etiqueta?`<b>${esc(z.etiqueta)}</b>`:z.estacion?`<b>${esc(z.estacion)}</b> <small>${esc(z.linea)}</small>`:`<b>${esc(z.linea)}</b>`}</span>${!editando&&z.e.pend?.length?`<em class="ly-n">${z.e.pend.length}</em>`:""}${editando&&!flujo?'<i class="ly-asa" data-asa="1"></i>':""}</button>`).join("")}
    ${etiquetasFlechas(flechas,img,flujo)}
  </div></div>
  ${fl?pasosFlujo(fin,fl):""}`}`;
  bindVistaLineas(app);
  const on=(id,ev,fn)=>{ const el=document.getElementById(id); if(el) el[ev]=fn; };
  on("y-mapa","onchange",e=>{ elegirMapa(e.target.value); LY.sel=null; render(); });
  on("y-flujo","onchange",e=>{ S.sel.flujoLy=e.target.value; try{ localStorage.setItem("sl_flujo",e.target.value); }catch(x){} render(); });
  app.querySelectorAll("[data-modo]").forEach(b=>b.onclick=()=>{ LY.modo=b.dataset.modo; LY.origen=null; LY.sel=null; render(); });
  on("y-fecha","onchange",e=>{S.sel.fecha=e.target.value;render();});
  on("y-turno","onchange",e=>{S.sel.turno=e.target.value;render();});
  app.querySelectorAll("[data-zoom]").forEach(b=>b.onclick=()=>{S.sel.zoomLy=Number(b.dataset.zoom); render();});
  on("ly-edit","onclick",()=>{LY.edit=true; LY.draft=null; LY.sel=null; render();});
  on("ly-cancel","onclick",()=>{ const salir=()=>{LY.edit=false; LY.draft=null; LY.sel=null; render();};
    if(LY.draft) confirmBox("¿Descartar los cambios a las estaciones?","Descartar",salir); else salir(); });
  on("ly-save","onclick",()=>guardarLayout(true));
  on("ly-new","onclick",()=>nombreMapa(null));
  on("ly-ren","onclick",()=>nombreMapa(m));
  on("ly-delmap","onclick",()=>eliminarMapa(m));
  on("ly-file","onchange",e=>subirPlano(m,e.target.files[0]));
  const plano=document.getElementById("ly-plano"); if(!plano) return;
  if(flujo){
    // Conectar: primer toque = estación que produce; segundo = estación que consume.
    app.querySelectorAll("[data-zona]").forEach(b=>b.onclick=()=>{ const z=(m.zonas||[]).find(x=>x.id===b.dataset.zona); if(!z) return;
      if(!LY.origen||LY.origen===z.id){ LY.origen=LY.origen===z.id?null:z.id; return render(); }
      const o=(m.zonas||[]).find(x=>x.id===LY.origen); LY.origen=null; editarConexion(o,z); });
    app.querySelectorAll("[data-flecha]").forEach(b=>b.onclick=()=>{ const g=flechas[Number(b.dataset.flecha)]; if(g) editarConexion(g.o,g.d); });
  }
  else if(editando) bindEdicionLayout(plano);
  else app.querySelectorAll("[data-zona]").forEach(b=>b.onclick=()=>{ const z=zonas.find(x=>x.id===b.dataset.zona); if(z) abrirZona(z); });
}
// Detalle de una zona en la operación: estado y NP vencidos, con acceso directo a la pestaña Surtido.
function abrirZona(z){
  const root=document.getElementById("modal-root"), e=z.e, est=LY_ESTADO[e.k]||LY_ESTADO.none;
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

/* ---------- Edición (solo administrador) ----------
   Las estaciones se cambian en un borrador y se aplican con "Guardar estaciones". Crear, renombrar o eliminar un mapa
   y subir su plano se guardan al momento (junto con el borrador, si lo hay). */
function borradorLayout(){ if(!LY.draft) LY.draft={mapas:JSON.parse(JSON.stringify(mapasDe(S.config.layout)))}; return LY.draft; }
const mapaBorrador=()=>{ const d=borradorLayout(); return d.mapas.find(x=>x.id===S.sel.mapa)||d.mapas[0]; };
async function guardarLayout(terminar){
  const d=borradorLayout();
  if(!await safeWrite(()=>Store.set("config","layout",d))) return false;
  // Se aplica ya en este equipo; la relectura de la configuración llega después.
  S.config.layout=JSON.parse(JSON.stringify(d)); LY.draft=null; if(terminar){ LY.edit=false; LY.sel=null; toast("Estaciones guardadas"); } render(); return true;
}
function nombreMapa(m){
  const root=document.getElementById("modal-root");
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="nm-t">
    <div class="ph"><h3 id="nm-t">${m?"Renombrar mapa":"Nuevo mapa"}</h3><button class="btn ghost" id="nm-x">Cancelar</button></div>
    <form class="pb" id="f-nm"><div class="fld"><label for="nm-n">Nombre del mapa</label><input id="nm-n" required autocomplete="off" maxlength="60" value="${esc(m?.nombre||"")}" placeholder="Site o área, p. ej. GDL Norte · B2"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn pri">${m?"Guardar":"Crear mapa"}</button></div></form></div></div>`;
  document.getElementById("nm-x").onclick=()=>root.innerHTML="";
  document.getElementById("nm-n").focus();
  document.getElementById("f-nm").onsubmit=async e=>{ e.preventDefault(); const nombre=ffv("nm-n"); if(!nombre) return;
    const d=borradorLayout();
    if(d.mapas.some(x=>x.nombre.toLowerCase()===nombre.toLowerCase()&&x.id!==m?.id)) return toast("Ya hay un mapa con ese nombre.");
    if(m) d.mapas.find(x=>x.id===m.id).nombre=nombre;
    else{ const id=newId(); d.mapas.push({id,nombre,img:null,zonas:[]}); elegirMapa(id); }
    root.innerHTML=""; if(await guardarLayout(false)) toast(m?"Mapa renombrado":"Mapa creado"); };
}
function eliminarMapa(m){
  if(!m) return;
  confirmBox(`¿Eliminar el mapa «${m.nombre}» con su plano y sus ${(m.zonas||[]).length} estaciones marcadas? No se puede deshacer.`,"Eliminar mapa",async()=>{
    const d=borradorLayout(); d.mapas=d.mapas.filter(x=>x.id!==m.id);
    if(!await guardarLayout(false)) return;
    // La imagen solo se borra si ningún otro mapa la usa.
    if(m.img&&!d.mapas.some(x=>x.img?.key===m.img.key)) await safeWrite(()=>Store.del("config",m.img.key));
    elegirMapa(d.mapas[0]?.id||""); toast("Mapa eliminado"); render();
  });
}
// Reduce el plano a 2400 px por lado como máximo para que quepa en la base (WebP, o JPEG si el navegador no lo genera).
function subirPlano(m,file){
  if(!m||!file) return; if(!/^image\//.test(file.type)) return toast("Elige una imagen (JPG o PNG).");
  const fr=new FileReader();
  fr.onload=()=>{ const im=new Image();
    im.onload=async()=>{
      const k=Math.min(1,2400/Math.max(im.naturalWidth,im.naturalHeight)), w=Math.round(im.naturalWidth*k), h=Math.round(im.naturalHeight*k);
      const cv=document.createElement("canvas"); cv.width=w; cv.height=h; const cx=cv.getContext("2d");
      cx.fillStyle="#fff"; cx.fillRect(0,0,w,h); cx.drawImage(im,0,0,w,h);
      let url=cv.toDataURL("image/webp",0.85); if(!url.startsWith("data:image/webp")) url=cv.toDataURL("image/jpeg",0.85);
      if(url.length>3e6) return toast("El plano es demasiado pesado aun reducido. Usa una imagen más simple o de menor resolución.");
      const v=Date.now(), key=m.img?.key||"layout_img_"+m.id;
      if(!await safeWrite(()=>Store.set("config",key,{data:url}))) return;
      // Las zonas se guardan en fracciones del plano, así que se conservan al cambiar la imagen.
      const mb=borradorLayout().mapas.find(x=>x.id===m.id); mb.img={w,h,v,key}; LY.imgs[key]={v,url};
      if(await guardarLayout(false)) toast("Plano guardado");
    };
    im.onerror=()=>toast("No se pudo leer la imagen."); im.src=fr.result; };
  fr.readAsDataURL(file);
}
function bindEdicionLayout(plano){
  const pos=e=>{ const r=plano.getBoundingClientRect(); return {x:Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),y:Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))}; };
  plano.onpointerdown=e=>{
    if(e.button>0) return;
    const zb=e.target.closest("[data-zona]"), p=pos(e);
    if(zb){ const z=mapaBorrador().zonas.find(x=>x.id===zb.dataset.zona); if(!z) return;
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
  if(del) del.onclick=()=>{ const mb=mapaBorrador(); mb.zonas=mb.zonas.filter(x=>x.id!==z.id); LY.sel=null; close(); };
  document.getElementById("f-ez").onsubmit=e=>{ e.preventDefault();
    const val={linea:ffv("ez-l"),estacion:ffv("ez-e"),etiqueta:ffv("ez-n")}; if(!val.linea) return;
    const mb=mapaBorrador();
    if(nueva){ const id=newId(); mb.zonas.push(Object.assign({id},val,rect)); LY.sel=id; }
    else Object.assign(mb.zonas.find(x=>x.id===z.id)||{},val);
    close(); };
  document.getElementById(lineas.length?"ez-e":"ez-l").focus();
}

/* ---------- Flujo sobre el plano ---------- */
// Punto del borde de una zona en dirección a (tx, ty), en unidades del plano.
function bordeZona(z,W,H,tx,ty){
  const cx=(z.x+z.w/2)*W, cy=(z.y+z.h/2)*H, hw=z.w*W/2, hh=z.h*H/2, dx=tx-cx, dy=ty-cy;
  const t=Math.min(hw/Math.max(Math.abs(dx),1e-6), hh/Math.max(Math.abs(dy),1e-6));
  return [cx+dx*Math.min(t,1), cy+dy*Math.min(t,1)];
}
// Geometría de cada flecha: del borde de la zona que produce al de la que consume, con una curva suave.
function geoFlecha(g,W,H){
  const ox=(g.o.x+g.o.w/2)*W, oy=(g.o.y+g.o.h/2)*H, dx=(g.d.x+g.d.w/2)*W, dy=(g.d.y+g.d.h/2)*H;
  const [x1,y1]=bordeZona(g.o,W,H,dx,dy), [x2,y2]=bordeZona(g.d,W,H,ox,oy);
  const mx=(x1+x2)/2, my=(y1+y2)/2, len=Math.hypot(x2-x1,y2-y1)||1, k=Math.min(0.18*len,W*0.04);
  const cx=mx-(y2-y1)/len*k, cy=my+(x2-x1)/len*k;
  return {d:`M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`, lx:(mx+cx)/2/W, ly:(my+cy)/2/H};
}
function svgFlechas(flechas,img){
  if(!flechas.length) return "";
  const W=img.w, H=img.h, sw=Math.max(2,W/320);
  return `<svg class="ly-flechas" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><marker id="ly-punta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="#0f5f8c"/></marker></defs>
    ${flechas.map(g=>`<path d="${geoFlecha(g,W,H).d}" fill="none" stroke="#ffffff" stroke-width="${sw*2.2}" stroke-linecap="round"/><path d="${geoFlecha(g,W,H).d}" fill="none" stroke="#0f5f8c" stroke-width="${sw}" stroke-linecap="round" marker-end="url(#ly-punta)"/>`).join("")}</svg>`;
}
const textoFlecha=g=>g.con.length===1?`${g.con[0].hijo} · ${fmtN(Number(g.con[0].item.qtyPer)||1,4)} pza/u`:`${g.con.length} subensambles`;
function etiquetasFlechas(flechas,img,editable){
  return flechas.map((g,i)=>{ const p=geoFlecha(g,img.w,img.h);
    return `<${editable?"button":"span"} class="ly-flecha" ${editable?`data-flecha="${i}"`:""} style="left:${p.lx*100}%;top:${p.ly*100}%"
      title="${esc(g.con.map(c=>`${c.hijo} → ${c.padre} (est. ${c.item.estacion}, ${c.item.qtyPer} pza/u)`).join("\n"))}">${esc(textoFlecha(g))}</${editable?"button":"span"}>`; }).join("");
}
// Pasos del flujo de un ensamble final, debajo del plano.
function pasosFlujo(fin,fl){
  // Una fila por subensamble y ensamble que lo consume, con todas sus estaciones.
  const filas=[]; conexionesDe(fin).forEach(c=>{ const f=filas.find(x=>x.hijo===c.hijo&&x.padre===c.padre);
    if(f) f.items.push(c.item); else filas.push({hijo:c.hijo,padre:c.padre,items:[c.item],sinMapa:false}); });
  filas.forEach(f=>f.sinMapa=fl.sinMapa.some(c=>c.hijo===f.hijo&&c.padre===f.padre));
  const con=filas, pr=e=>{ const p=produceDe(e); return p?esc(p.linea)+(p.estacion&&normEst(p.estacion)!==normEst(p.linea)?" · "+esc(p.estacion):""):'<span class="muted">sin línea</span>'; };
  return `<div class="panel" style="margin-top:12px"><div class="ph"><h3>Flujo de <span class="mono">${esc(fin)}</span></h3><span class="muted small">${con.length} subensamble${con.length===1?"":"s"}${fl.sinMapa.length?` · ${fl.sinMapa.length} paso${fl.sinMapa.length>1?"s":""} sin zona en este mapa (en gris)`:""}</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Subensamble</th><th>Se produce en</th><th>Se consume en</th><th class="num">Pza/u</th><th class="num">Empaque</th></tr></thead><tbody>
    ${con.map(c=>`<tr${c.sinMapa?' class="muted"':""}><td class="mono">${esc(c.hijo)}</td><td>${pr(c.hijo)}</td><td><span class="mono">${esc(c.padre)}</span> · est. ${c.items.map(it=>esc(it.estacion)).join(", ")}</td><td class="num">${[...new Set(c.items.map(it=>fmtN(Number(it.qtyPer)||1,4)))].join(" / ")}</td><td class="num">${[...new Set(c.items.map(it=>it.empaque?fmtN(it.empaque):"—"))].join(" / ")}</td></tr>`).join("")}
    </tbody></table></div></div>`;
}
// Conexión entre dos estaciones del plano: qué subensambles salen de la de origen (o) y en qué ensamble se consumen
// en la de destino (d). Se guarda en el BOM: el subensamble queda producido en o, y el padre lo lleva en su estación.
function editarConexion(o,d,padreElegido){
  const root=document.getElementById("modal-root"), ensambles=Object.values(S.bom).map(b=>b.ensamble).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const estD=d.estacion||d.linea, ok=(a,b)=>normEst(a)===normEst(b);
  // Padre por defecto: el que ya consume algo de o en d, el que se produce en d, o el que tiene NP en esa estación.
  const yaConectado=Object.values(S.bom).find(b=>(b.items||[]).some(it=>esEnsamble(it.np)&&ok(it.estacion,estD)&&(produceDe(it.np)||{}).linea&&ok(produceDe(it.np).linea,o.linea)));
  const padre=padreElegido||yaConectado?.ensamble||Object.values(S.bom).find(b=>ok(produceDe(b.ensamble)?.linea,d.linea))?.ensamble
    ||Object.values(S.bom).find(b=>(b.items||[]).some(it=>ok(it.estacion,estD)))?.ensamble||ensambles[0]||"";
  const bp=bomDe(padre), estacion=(bp?.items||[]).find(it=>ok(it.estacion,estD))?.estacion||estD;
  // Filas: los subensambles que el padre ya lleva en esa estación y vienen de o (marcados), y los demás ensambles para
  // agregarlos. Los que llegan a esa estación desde otra línea no se muestran ni se tocan.
  const deO=it=>esEnsamble(it.np)&&ok(it.estacion,estacion)&&(!produceDe(it.np)||ok(produceDe(it.np).linea,o.linea));
  const actuales=(bp?.items||[]).filter(deO);
  const deOtras=(bp?.items||[]).filter(it=>esEnsamble(it.np)&&ok(it.estacion,estacion)&&!deO(it));
  const otros=ensambles.filter(e=>e!==padre&&!(bp?.items||[]).some(it=>it.np===e&&ok(it.estacion,estacion)));
  const fila=(np,it,on)=>{ const b=bomDe(np); return `<tr><td><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-hijo="${esc(np)}" ${on?"checked":""}><span class="mono">${esc(np)}</span></label>
    ${on&&produceDe(np)&&!ok(produceDe(np).linea,o.linea)?`<div class="small" style="color:var(--warn)">Hoy se produce en ${esc(produceDe(np).linea)}</div>`:""}</td>
    <td><input type="number" step="any" min="0.0001" class="w-xs" data-q="${esc(np)}" value="${it?.qtyPer??1}" aria-label="Piezas por unidad de ${esc(np)}"></td>
    <td><input type="number" min="1" class="w-xs" data-emp="${esc(np)}" value="${it?.empaque??""}" aria-label="Empaque de ${esc(np)}"></td>
    <td><input type="number" min="1" class="w-xs" data-uph="${esc(np)}" value="${b?.uph??""}" placeholder="Plan" aria-label="UPH de ${esc(np)}"></td></tr>`; };
  root.innerHTML=`<div class="scrim"><div class="panel modal ly-conexion" role="dialog" aria-modal="true" aria-labelledby="cx-t">
    <div class="ph"><h3 id="cx-t">${esc(zonaNombre(o))} → ${esc(zonaNombre(d))}</h3><button class="btn ghost" id="cx-x">Cancelar</button></div>
    <form class="pb" id="f-cx">
      <div class="row"><div class="fld" style="flex:1"><label for="cx-p">Ensamble que los consume</label><select id="cx-p">${ensambles.map(e=>`<option ${e===padre?"selected":""}>${esc(e)}</option>`).join("")}</select></div>
        <div class="fld"><label for="cx-e">Estación donde se consumen</label><input id="cx-e" class="w-s" value="${esc(estacion)}" required></div></div>
      <div class="small muted">Marca los subensambles que se producen en <b>${esc(zonaNombre(o))}</b> y pasan a esta estación. Desmarcar uno lo quita del BOM de <span class="mono">${esc(padre)}</span> en esa estación.${deOtras.length?` Otros ${deOtras.length} subensambles llegan a esta estación desde otras líneas y no cambian.`:""}</div>
      <div class="tbl-wrap" style="max-height:300px;overflow:auto"><table><thead><tr><th>Subensamble</th><th>Pza/u</th><th>Empaque</th><th>UPH</th></tr></thead><tbody>
        ${actuales.map(it=>fila(it.np,it,true)).join("")}${otros.map(e=>fila(e,null,false)).join("")}
      </tbody></table></div>
      <div class="err" id="cx-err"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn pri">Guardar conexión</button></div>
    </form></div></div>`;
  const close=()=>{ root.innerHTML=""; render(); };
  document.getElementById("cx-x").onclick=close;
  document.getElementById("cx-p").onchange=e=>editarConexion(o,d,e.target.value);
  document.getElementById("f-cx").onsubmit=async e=>{ e.preventDefault();
    const err=m=>document.getElementById("cx-err").textContent=m, est=ffv("cx-e"), val=(k,np)=>root.querySelector(`[data-${k}="${CSS.escape(np)}"]`)?.value;
    if(!bomDe(padre)) return err("Elige el ensamble que los consume.");
    const filas=[...root.querySelectorAll("[data-hijo]")], marcados=filas.filter(c=>c.checked).map(c=>c.dataset.hijo), quitar=filas.filter(c=>!c.checked).map(c=>c.dataset.hijo);
    for(const np of marcados){ if(!(Number(val("emp",np))>0)) return err(`Falta el empaque de ${np}: las piezas que caben en la estación, para calcular sus movimientos.`); }
    const b=Object.assign({},bomDe(padre)); let items=(b.items||[]).filter(it=>!(quitar.includes(it.np)&&ok(it.estacion,est)));
    marcados.forEach(np=>{ const nuevo={qtyPer:Number(val("q",np))||1,empaque:Number(val("emp",np))};
      const i=items.findIndex(it=>it.np===np&&ok(it.estacion,est));
      if(i>=0) items[i]=Object.assign({},items[i],nuevo); else items.push(Object.assign({np,desc:bomDe(np)?.desc||"",estacion:est},nuevo)); });
    b.items=items;
    if(!await safeWrite(()=>Store.set("bom",b._id,b))) return;
    for(const np of marcados){ const h=Object.assign({},bomDe(np)), u=Number(val("uph",np))||null;
      h.produce={linea:o.linea,estacion:o.estacion||""}; if(u) h.uph=u;
      if(!await safeWrite(()=>Store.set("bom",h._id,h))) return; }
    toast(marcados.length?`Conexión guardada: ${marcados.length} subensamble${marcados.length>1?"s":""} de ${zonaNombre(o)} a ${padre}.`:"Conexión quitada.");
    close(); };
}
