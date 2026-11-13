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
    <button class="btn" id="ly-cat">Líneas y estaciones</button>
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
  on("ly-cat","onclick",editarCatalogo);
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
      <div class="small muted">Línea <b>${esc(z.linea)}</b>${z.estacion?` · estación <b>${esc(z.estacion)}</b>`:" · toda la línea"}${e.l?` · ${[...e.l.ens].map(esc).join(", ")}`:""}${operadoresDe(z.linea)?` · requiere <b>${txtOperadores(operadoresDe(z.linea))}</b>`:""}</div>
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
// Alta o cambio de una zona: línea y estación del catálogo (o nuevas, que se agregan al catálogo al aplicar) y nombre
// opcional. Sin estación, la zona es la línea completa.
function editarZona(z,rect){
  const root=document.getElementById("modal-root"), nueva=!z, lineas=lineasLayout();
  const v=z||{linea:S.sel.linea||lineas[0]||"",estacion:"",etiqueta:""};
  const NUEVA="__nueva__";
  // Estaciones del BOM que aún no están en el catálogo: se sugieren al escribir una nueva.
  const sugeridas=estacionesBom().filter(e=>!enCatalogo(e));
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="ez-t">
    <div class="ph"><h3 id="ez-t">${nueva?"Nueva estación en el plano":"Estación en el plano"}</h3><button class="btn ghost" id="ez-x">Cancelar</button></div>
    <form class="pb" id="f-ez">
      <div class="row">
        <div class="fld" style="flex:1"><label for="ez-l">Línea</label><select id="ez-l">${lineas.map(l=>`<option ${l===v.linea?"selected":""}>${esc(l)}</option>`).join("")}
          ${v.linea&&!lineas.includes(v.linea)?`<option selected>${esc(v.linea)}</option>`:""}<option value="${NUEVA}" ${lineas.length||v.linea?"":"selected"}>+ Nueva línea…</option></select></div>
        <div class="fld" style="flex:1" id="ez-ln-w" hidden><label for="ez-ln">Nombre de la línea nueva</label><input id="ez-ln" autocomplete="off" style="text-transform:uppercase" placeholder="Ej. ROBOT 6"></div>
        <div class="fld" id="ez-lo-w" hidden><label for="ez-lo">Operadores por turno</label><input id="ez-lo" type="number" min="1" step="1" class="w-xs" inputmode="numeric" title="Personas de surtido que requiere la línea en cada turno para no detenerse"></div>
      </div>
      <div class="row">
        <div class="fld" style="flex:1"><label for="ez-e">Estación</label><select id="ez-e"></select></div>
        <div class="fld" style="flex:1" id="ez-en-w" hidden><label for="ez-en">Nombre de la estación nueva</label><input id="ez-en" list="ez-sug" autocomplete="off" placeholder="Ej. Robot 6">
          <datalist id="ez-sug">${sugeridas.map(e=>`<option value="${esc(e)}">`).join("")}</datalist></div>
      </div>
      <div class="fld"><label for="ez-n">Nombre en el plano <span class="muted">(opcional)</span></label><input id="ez-n" autocomplete="off" value="${esc(v.etiqueta||"")}" placeholder="Por defecto: línea y estación"></div>
      <p class="small muted" style="margin:0">Las líneas y estaciones nuevas se agregan al catálogo: son las que se eligen en el plan de producción y en el BOM.</p>
      <div class="err" id="ez-err"></div>
      <div class="row" style="justify-content:space-between">${nueva?"<span></span>":`<button type="button" class="btn danger" id="ez-del">Quitar del plano</button>`}<button class="btn pri">${nueva?"Agregar":"Aplicar"}</button></div>
    </form></div></div>`;
  const close=()=>{ root.innerHTML=""; render(); };
  const selL=document.getElementById("ez-l"), selE=document.getElementById("ez-e"), err=document.getElementById("ez-err");
  const lineaElegida=()=>selL.value===NUEVA?ffv("ez-ln").toUpperCase():selL.value;
  // Opciones de estación según la línea: toda la línea, sus estaciones del catálogo, la actual (si no está) y nueva.
  // Al cambiar de línea solo se conserva la estación si también existe en la nueva.
  const llenarEst=(prev,inicial)=>{
    const l=selL.value===NUEVA?"":selL.value, ests=l?estacionesCat(l):[];
    const actual=inicial&&prev&&!ests.some(e=>e.toLowerCase()===prev.toLowerCase())?prev:"";
    selE.innerHTML=`<option value="">Toda la línea</option>${ests.map(e=>`<option ${prev&&e.toLowerCase()===prev.toLowerCase()?"selected":""}>${esc(e)}</option>`).join("")}
      ${actual?`<option selected value="${esc(actual)}">${esc(actual)} (se agregará al catálogo)</option>`:""}<option value="${NUEVA}">+ Nueva estación…</option>`;
    mostrar();
  };
  const mostrar=()=>{ document.getElementById("ez-ln-w").hidden=document.getElementById("ez-lo-w").hidden=selL.value!==NUEVA; document.getElementById("ez-en-w").hidden=selE.value!==NUEVA; };
  selL.onchange=()=>{ llenarEst(selE.value===NUEVA?"":selE.value); if(selL.value===NUEVA) document.getElementById("ez-ln").focus(); };
  selE.onchange=()=>{ mostrar(); if(selE.value===NUEVA) document.getElementById("ez-en").focus(); };
  llenarEst(v.estacion,true);
  document.getElementById("ez-x").onclick=close;
  const del=document.getElementById("ez-del");
  if(del) del.onclick=()=>{ const mb=mapaBorrador(); mb.zonas=mb.zonas.filter(x=>x.id!==z.id); LY.sel=null; close(); };
  document.getElementById("f-ez").onsubmit=async e=>{ e.preventDefault(); err.textContent="";
    const linea=lineaElegida(), estacion=selE.value===NUEVA?ffv("ez-en"):selE.value;
    if(!linea) return err.textContent="Escribe el nombre de la línea nueva.";
    const ops=Math.round(Number(ffv("ez-lo")));
    if(selL.value===NUEVA&&!(ops>=1)) return err.textContent="Indica cuántos operadores de surtido requiere la línea por turno.";
    if(selE.value===NUEVA&&!estacion) return err.textContent="Escribe el nombre de la estación nueva.";
    const mb=mapaBorrador();
    const otra=mb.zonas.find(x=>x.id!==z?.id&&normEst(x.linea)===normEst(linea)&&normEst(x.estacion)===normEst(estacion));
    if(otra) return err.textContent=`${estacion?"La estación "+estacion+" de "+linea:"La línea "+linea} ya está marcada en este mapa.`;
    const btn=e.submitter||e.target.querySelector(".btn.pri"); btn.disabled=true;
    if(!await agregarCatalogo(linea,estacion,"",selL.value===NUEVA?ops:null)){ btn.disabled=false; return; }
    // Usa el nombre tal como quedó en el catálogo (p. ej. «Robot 4» aunque se escriba «robot 4»).
    const lc=lineasCat().find(l=>l.toUpperCase()===linea.toUpperCase())||linea;
    const ec=estacion?(estacionesCat(lc).find(x=>x.toLowerCase()===estacion.toLowerCase())||estacion):"";
    const val={linea:lc,estacion:ec,etiqueta:ffv("ez-n")};
    if(nueva){ const id=newId(); mb.zonas.push(Object.assign({id},val,rect)); LY.sel=id; }
    else Object.assign(mb.zonas.find(x=>x.id===z.id)||{},val);
    close(); };
  (selL.value===NUEVA?document.getElementById("ez-ln"):selE).focus();
}

// Catálogo de líneas y estaciones (solo administrador): agregar y quitar. Lo que ya está en el plan, el BOM o el plano
// se conserva al quitarlo del catálogo; solo deja de ofrecerse en las listas.
function editarCatalogo(){
  const root=document.getElementById("modal-root");
  const items=()=>JSON.parse(JSON.stringify(S.config.lineas?.items||[])).sort((a,b)=>ordenNum(a.nombre,b.nombre));
  const guardar=async list=>{ const ok=await safeWrite(()=>Store.set("config","lineas",{items:list})); if(ok) S.config.lineas={items:list}; pintar(); return ok; };
  const usoLinea=l=>{ const n=Object.values(S.plan).filter(p=>p.linea===l).length, z=layoutCfg().mapas.reduce((k,m)=>k+(m.zonas||[]).filter(x=>x.linea===l).length,0);
    return [n?`${n} plan${n>1?"es":""}`:"",z?`${z} zona${z>1?"s":""} del plano`:""].filter(Boolean).join(" y "); };
  const usoEst=(l,e)=>{ const b=Object.values(S.bom).filter(x=>(x.items||[]).some(it=>normEst(it.estacion)===normEst(e))).length,
    z=layoutCfg().mapas.reduce((k,m)=>k+(m.zonas||[]).filter(x=>x.linea===l&&normEst(x.estacion)===normEst(e)).length,0);
    return [b?`${b} BOM`:"",z?`${z} zona${z>1?"s":""} del plano`:""].filter(Boolean).join(" y "); };
  // Zonas ya marcadas en los planos cuya línea o estación aún no está en el catálogo (datos de antes del catálogo).
  const pendientes=()=>{ const out=[], cat=items();
    layoutCfg().mapas.forEach(m=>(m.zonas||[]).forEach(z=>{ const l=cat.find(x=>x.nombre.toUpperCase()===String(z.linea).toUpperCase());
      const falta=!l||(z.estacion&&!(l.estaciones||[]).some(e=>normEst(e.nombre)===normEst(z.estacion)));
      if(falta&&!out.some(o=>normEst(o.linea)===normEst(z.linea)&&normEst(o.estacion)===normEst(z.estacion))) out.push({linea:z.linea,estacion:z.estacion||""}); }));
    return out; };
  const pintar=()=>{ const list=items(), pend=pendientes();
    root.innerHTML=`<div class="scrim"><div class="panel modal ly-catalogo" role="dialog" aria-modal="true" aria-labelledby="ct-t">
      <div class="ph"><h3 id="ct-t">Líneas y estaciones</h3><button class="btn ghost" id="ct-x">Cerrar</button></div>
      <div class="pb">
        <form id="f-ct" class="row"><div class="fld" style="flex:1"><label for="ct-n">Línea nueva</label><input id="ct-n" required autocomplete="off" style="text-transform:uppercase"></div>
          <div class="fld" style="flex:1"><label for="ct-d">Descripción <span class="muted">(opcional)</span></label><input id="ct-d" autocomplete="off"></div>
          <div class="fld"><label for="ct-o">Operadores por turno</label><input id="ct-o" type="number" min="1" step="1" class="w-xs" required inputmode="numeric"></div><button class="btn pri">Agregar línea</button></form>
        ${pend.length?`<div class="note" style="margin-top:12px">${pend.length} línea${pend.length>1?"s o estaciones marcadas":" o estación marcada"} en los planos no ${pend.length>1?"están":"está"} en el catálogo: ${pend.slice(0,8).map(x=>esc(x.linea+(x.estacion?" · "+x.estacion:""))).join(", ")}${pend.length>8?"…":""}.
          <button class="btn" id="ct-plano" style="margin-left:8px">Agregar${pend.length>1?"las":"la"}</button></div>`:""}
        <div class="ct-lista">${list.length?list.map(l=>`<div class="ct-linea">
          <div class="row"><b>${esc(l.nombre)}</b><span class="muted small">${esc(l.descripcion||"")}</span>
            <label class="small ct-ops" style="margin-left:auto">Operadores por turno <input type="number" min="1" step="1" inputmode="numeric" value="${Number(l.operadores)>0?l.operadores:""}" data-ct-op="${esc(l.nombre)}" aria-label="Operadores por turno en ${esc(l.nombre)}" ${Number(l.operadores)>0?"":'class="falta" placeholder="Falta"'}></label>
            <button class="btn danger" data-ct-dl="${esc(l.nombre)}">Quitar línea</button></div>
          <div class="ct-ests">${(l.estaciones||[]).sort((a,b)=>ordenNum(a.nombre,b.nombre)).map(e=>`<span class="ct-est">${esc(e.nombre)}<button type="button" aria-label="Quitar ${esc(e.nombre)}" data-ct-de='${esc(JSON.stringify([l.nombre,e.nombre]))}'>×</button></span>`).join("")||'<span class="muted small">Sin estaciones</span>'}
            <form class="ct-add" data-ct-ae="${esc(l.nombre)}"><input aria-label="Estación nueva en ${esc(l.nombre)}" placeholder="+ Estación" list="ct-sug" autocomplete="off"></form></div>
        </div>`).join(""):'<p class="muted">Aún no hay líneas.</p>'}</div>
        <datalist id="ct-sug">${estacionesBom().filter(e=>!enCatalogo(e)).map(e=>`<option value="${esc(e)}">`).join("")}</datalist>
        <p class="small muted" style="margin:0">También se agregan al marcar una zona en el plano. Quitar una línea o estación no cambia el plan, el BOM ni el plano: solo deja de ofrecerse en las listas.</p>
      </div></div></div>`;
    document.getElementById("ct-x").onclick=()=>{ root.innerHTML=""; render(); };
    const bp=document.getElementById("ct-plano");
    if(bp) bp.onclick=async()=>{ const l2=items();
      pend.forEach(x=>{ const ln=String(x.linea).trim(); let l=l2.find(y=>y.nombre.toUpperCase()===ln.toUpperCase());
        if(!l){ l={nombre:ln,descripcion:"",estaciones:[]}; l2.push(l); } l.estaciones=l.estaciones||[];
        if(x.estacion&&!l.estaciones.some(e=>normEst(e.nombre)===normEst(x.estacion))) l.estaciones.push({nombre:x.estacion}); });
      if(await guardar(l2)) toast("Líneas y estaciones del plano agregadas al catálogo."); };
    document.getElementById("f-ct").onsubmit=async e=>{ e.preventDefault(); const n=ffv("ct-n").toUpperCase();
      if(list.some(l=>l.nombre.toUpperCase()===n)) return toast(`La línea ${n} ya está en el catálogo.`);
      const o=Math.round(Number(ffv("ct-o"))); if(!(o>=1)) return toast("Indica cuántos operadores requiere la línea por turno.");
      if(await guardar([...list,{nombre:n,descripcion:ffv("ct-d"),operadores:o,estaciones:[]}])) toast(`Línea ${n} agregada.`); };
    root.querySelectorAll("[data-ct-op]").forEach(i=>i.onchange=async()=>{ const o=Math.round(Number(i.value)), l=list.find(x=>x.nombre===i.dataset.ctOp);
      if(!(o>=1)){ toast("Los operadores deben ser 1 o más."); return pintar(); }
      l.operadores=o; if(await guardar(list)) toast(`${l.nombre}: ${txtOperadores(o)}.`); });
    root.querySelectorAll("[data-ct-ae]").forEach(f=>f.onsubmit=async e=>{ e.preventDefault(); const est=f.querySelector("input").value.trim(); if(!est) return;
      const l=list.find(x=>x.nombre===f.dataset.ctAe); l.estaciones=l.estaciones||[];
      if(l.estaciones.some(x=>x.nombre.toLowerCase()===est.toLowerCase())) return toast(`${l.nombre} ya tiene la estación ${est}.`);
      l.estaciones.push({nombre:est}); if(await guardar(list)){ toast(`Estación ${est} agregada a ${l.nombre}.`); root.querySelector(`[data-ct-ae="${CSS.escape(l.nombre)}"] input`)?.focus(); } });
    root.querySelectorAll("[data-ct-dl]").forEach(b=>b.onclick=()=>{ const n=b.dataset.ctDl, u=usoLinea(n);
      confirmBox(`¿Quitar la línea ${n} y sus estaciones del catálogo?${u?` Se usa en ${u}; eso se conserva.`:""}`,"Quitar",()=>guardar(list.filter(x=>x.nombre!==n)),pintar); });
    root.querySelectorAll("[data-ct-de]").forEach(b=>b.onclick=()=>{ const [n,e]=JSON.parse(b.dataset.ctDe), u=usoEst(n,e);
      const quitar=async()=>{ const l=list.find(x=>x.nombre===n); l.estaciones=l.estaciones.filter(x=>x.nombre!==e); await guardar(list); };
      if(u) confirmBox(`¿Quitar la estación ${e} de ${n}? Se usa en ${u}; eso se conserva.`,"Quitar",quitar,pintar); else quitar(); });
  };
  pintar();
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
// Lo que pasa por una flecha en la fecha y turno elegidos: piezas asignadas, pendientes de mover y el siguiente movimiento.
function vivoFlecha(g){
  const asg=Object.values(flujoVivo().porProductor).filter(r=>r.p.fecha===S.sel.fecha&&(!S.sel.turno||r.p.turno===S.sel.turno))
    .flatMap(r=>r.asign).filter(a=>g.con.some(c=>c.hijo===a.p.ensamble&&c.padre===a.d.c.ensamble&&normEst(c.item.estacion)===normEst(a.d.estacion)));
  if(!asg.length) return null;
  const movs=asg.flatMap(a=>a.movs).filter(x=>!S.surtidos[x.t.id]&&x.hora).sort((a,b)=>a.hora-b.hora);
  return {total:asg.reduce((n,a)=>n+a.qty,0),pend:asg.reduce((n,a)=>n+a.movs.filter(x=>!S.surtidos[x.t.id]).reduce((k,x)=>k+x.qty,0),0),sig:movs[0]||null};
}
function etiquetasFlechas(flechas,img,editable){
  return flechas.map((g,i)=>{ const p=geoFlecha(g,img.w,img.h), v=editable?null:vivoFlecha(g);
    const txt=textoFlecha(g)+(v?(v.pend?` · mover ${fmtN(v.pend)} pzs`:" · movido"):"");
    const tit=g.con.map(c=>`${c.hijo} → ${c.padre} (est. ${c.item.estacion}, ${c.item.qtyPer} pza/u)`).join("\n")
      +(v?`\n${fmtN(v.total)} pzs a la siguiente estación${v.sig?` · siguiente: ${fmtN(v.sig.qty)} pzs a las ${fmtT(v.sig.hora)}`:""}`:"");
    return `<${editable?"button":"span"} class="ly-flecha${v?.pend?" vivo":""}" ${editable?`data-flecha="${i}"`:""} style="left:${p.lx*100}%;top:${p.ly*100}%"
      title="${esc(tit)}">${esc(txt)}${v?.sig?`<small> ${fmtT(v.sig.hora)}</small>`:""}</${editable?"button":"span"}>`; }).join("");
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
