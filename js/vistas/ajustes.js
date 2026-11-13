/* ===================== Ajustes =====================
   Parámetros de surtido y catálogo de líneas y estaciones (sl_config: "general" y "lineas"). Solo el administrador.
   El catálogo se edita en Líneas → Layout → Editar layout; aquí se consulta y se carga desde Excel. */
function viewAjustes(app){
  const c=cfg(), lineas=lineasCat(), q=(S.sel.qLin||"").toLowerCase();
  const enPlan=l=>Object.values(S.plan).filter(p=>p.linea===l).length;
  const shown=(S.config.lineas?.items||[]).filter(x=>!q||(x.nombre+" "+(x.descripcion||"")+" "+(x.estaciones||[]).map(e=>e.nombre).join(" ")).toLowerCase().includes(q)).sort((a,b)=>a.nombre.localeCompare(b.nombre,undefined,{numeric:true}));
  const fuera=estacionesBom().filter(e=>!enCatalogo(e));
  app.innerHTML=`
  <div class="view-head"><div><h2>Ajustes</h2><p>Parámetros del cálculo de surtido y catálogo de líneas y estaciones. Las líneas del catálogo son las que se eligen en el plan de producción y sus estaciones, las del BOM.</p></div></div>
  <div class="grid2">
    <div class="stack">
      <div class="panel"><div class="ph"><h3>Parámetros de surtido</h3></div><div class="pb"><form id="f-cfg" class="stack">
        <div class="row"><div class="fld"><label for="c-pct">Punto de reorden %</label><input id="c-pct" type="number" min="20" max="90" value="${c.pct}" class="w-xs"></div>
        <div class="fld"><label for="c-tol">Tolerancia min</label><input id="c-tol" type="number" min="0" value="${c.tolerancia}" class="w-xs"></div>
        <div class="fld"><label for="c-ant">Anticipación del plan (horas)</label><input id="c-ant" type="number" min="0" step="0.5" value="${c.anticipacion}" class="w-xs" title="Horas antes del inicio del turno. Altas, cambios o bajas con menos anticipación requieren aprobación de Gerencia. 0 = no se requiere aprobación."></div></div>
        ${Object.entries(c.turnos).map(([t,v])=>`<div class="row"><div class="fld"><label>${t}</label><span class="mono">Turno</span></div>
          <div class="fld"><label for="c-${t}-i">Inicio</label><input type="time" id="c-${t}-i" value="${v.inicio}"></div>
          <div class="fld"><label for="c-${t}-f">Fin</label><input type="time" id="c-${t}-f" value="${v.fin}"></div></div>`).join("")}
        <p class="small muted" style="margin:0">El punto de reorden nunca baja de 20%. Con anticipación 0, el plan se modifica sin aprobación de Gerencia.</p>
        <button class="btn pri">Guardar parámetros</button></form></div></div>
    </div>
    <div class="panel"><div class="ph"><h3>Líneas y estaciones</h3>
      <div class="row"><button class="btn" id="tpl-lin">Plantilla Excel</button><label class="btn file-btn">Cargar Excel<input type="file" id="xl-lin" accept=".xlsx,.xls,.csv"></label><button class="btn pri" id="ir-layout">Editar en el layout</button></div></div>
      <div class="pb" style="border-bottom:1px solid var(--line)"><p class="small muted" style="margin:0">Se agregan y quitan en <b>Líneas → Layout → Editar layout</b>, al marcar cada zona del plano o con <b>Líneas y estaciones</b>. El Excel agrega las que falten (columnas Linea, Estacion y Descripcion).</p>
        ${fuera.length?`<div class="note" style="margin-top:10px;border-color:var(--warn)"><b>${fuera.length}</b> estación${fuera.length>1?"es":""} del BOM no ${fuera.length>1?"están":"está"} en el catálogo: ${fuera.slice(0,12).map(esc).join(", ")}${fuera.length>12?"…":""}. Agréga${fuera.length>1?"las":"la"} a su línea para elegir${fuera.length>1?"las":"la"} de la lista.</div>`:""}</div>
      <div class="pb" style="padding-bottom:0"><div class="row"><input id="l-q" placeholder="Buscar línea o estación" value="${esc(S.sel.qLin||"")}" aria-label="Buscar línea o estación"><span class="muted small">${shown.length} de ${lineas.length}</span></div></div>
      <div class="tbl-wrap"><table>
      <thead><tr><th>Línea</th><th>Estaciones</th><th class="num">Planes</th></tr></thead>
      <tbody>${shown.length?shown.map(x=>`<tr><td><b>${esc(x.nombre)}</b>${x.descripcion?`<div class="small muted">${esc(x.descripcion)}</div>`:""}</td>
        <td>${(x.estaciones||[]).length?[...x.estaciones].sort((a,b)=>ordenNum(a.nombre,b.nombre)).map(e=>`<span class="ct-est" style="padding-right:10px">${esc(e.nombre)}</span>`).join(" "):'<span class="muted small">Sin estaciones</span>'}</td><td class="num">${enPlan(x.nombre)}</td></tr>`).join("")
        :`<tr><td colspan="3" class="empty">${lineas.length?"Ninguna línea coincide con la búsqueda.":"Aún no hay líneas. Agrégalas en Líneas → Layout → Editar layout. Mientras el catálogo esté vacío, la línea del plan se escribe a mano."}</td></tr>`}</tbody></table></div></div>
  </div>
  ${permisosPanel()}`;
  document.getElementById("f-cfg").onsubmit=async e=>{e.preventDefault();
    const turnos={}; Object.keys(c.turnos).forEach(t=>turnos[t]={inicio:ffv(`c-${t}-i`),fin:ffv(`c-${t}-f`)});
    const pct=Math.max(20,Number(ffv("c-pct"))||20);
    if(await safeWrite(()=>Store.set("config","general",{pct,tolerancia:Number(ffv("c-tol"))||0,anticipacionHoras:Math.max(0,Number(ffv("c-ant"))||0),turnos}))) toast("Parámetros guardados");};
  bindPermisos(app);
  const lq=document.getElementById("l-q");
  lq.oninput=()=>{ S.sel.qLin=lq.value; const pos=lq.selectionStart; render(); const n=document.getElementById("l-q"); n.focus(); n.setSelectionRange(pos,pos); };
  const items=()=>JSON.parse(JSON.stringify(S.config.lineas?.items||[]));
  const saveLineas=list=>safeWrite(()=>Store.set("config","lineas",{items:list}));
  document.getElementById("ir-layout").onclick=()=>{ S.sel.vistaLineas="layout"; try{ localStorage.setItem("sl_vista_lineas","layout"); }catch(e){} LY.edit=true; LY.modo="estaciones"; LY.draft=null; S.view="lineas"; render(); window.scrollTo(0,0); };
  document.getElementById("tpl-lin").onclick=()=>downloadXlsx("plantilla_lineas.xlsx",[["Linea","Estacion","Descripcion"],["L1","E10","Ensamble final"],["L1","E20","Ensamble final"],["L2","","SMT"]]);
  document.getElementById("xl-lin").onchange=e=>readXlsx(e.target.files[0],async rows=>{
    const list=items(); let n=0,ne=0,upd=0,bad=0;
    rows.forEach(r=>{ const nombre=String(pick(r,["linea","línea","line","area","área"])??"").trim().toUpperCase(), descripcion=String(pick(r,["descripcion","descripción","desc"])??"").trim();
      const est=String(pick(r,["estacion","estación","station"])??"").trim();
      if(!nombre){bad++;return;}
      let l=list.find(x=>x.nombre.toUpperCase()===nombre);
      if(l){ if(descripcion&&descripcion!==l.descripcion){ l.descripcion=descripcion; upd++; } } else { l={nombre,descripcion,estaciones:[]}; list.push(l); n++; }
      l.estaciones=l.estaciones||[];
      if(est&&!l.estaciones.some(e=>e.nombre.toLowerCase()===est.toLowerCase())){ l.estaciones.push({nombre:est}); ne++; } });
    if(await saveLineas(list)) toast(`Catálogo: ${n} líneas y ${ne} estaciones agregadas${upd?`, ${upd} descripciones actualizadas`:""}${bad?`, ${bad} filas sin línea`:""}.`);
  });
}

// Permisos por rol: tabla de privilegios × roles. Los cambios se acumulan en un borrador hasta "Guardar permisos".
function permDraft(){
  if(!S.sel.permDraft) S.sel.permDraft=Object.fromEntries(ROLES_CONFIG.map(r=>[r,permsOf(r)]));
  return S.sel.permDraft;
}
function permisosPanel(){
  const d=permDraft(), saved=Object.fromEntries(ROLES_CONFIG.map(r=>[r,permsOf(r)]));
  const dirty=JSON.stringify(d)!==JSON.stringify(saved);
  const grupos=[...new Set(PRIVS.map(p=>p.g))];
  return `<div class="panel" style="margin-top:16px"><div class="ph"><div><h3>Permisos por rol</h3>
      <p class="small muted" style="margin:2px 0 0">El administrador tiene todos los privilegios y es el único con Usuarios y Ajustes. "Recibe material" no entra a la app.</p></div>
    <div class="row">${dirty?'<span class="pill p-warn">Cambios sin guardar</span>':""}<button class="btn" id="pm-def">Valores por defecto</button><button class="btn pri" id="pm-save" ${dirty?"":"disabled"}>Guardar permisos</button></div></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Privilegio</th><th style="text-align:center">${esc(ROLES.admin.label)}</th>${ROLES_CONFIG.map(r=>`<th style="text-align:center">${esc(ROLES[r].label)}</th>`).join("")}</tr></thead>
      <tbody>${grupos.map(g=>`<tr><td colspan="${ROLES_CONFIG.length+2}" class="lbl" style="background:var(--panel-2)">${g}</td></tr>`+
        PRIVS.filter(p=>p.g===g).map(p=>`<tr><td>${esc(p.l)}</td><td style="text-align:center"><input type="checkbox" checked disabled aria-label="${esc(p.l)}: ${esc(ROLES.admin.label)}"></td>${ROLES_CONFIG.map(r=>
          `<td style="text-align:center"><input type="checkbox" data-perm="${r}|${p.k}" ${d[r][p.k]?"checked":""} aria-label="${esc(p.l)}: ${esc(ROLES[r].label)}"></td>`).join("")}</tr>`).join("")).join("")}
      <tr><td class="small muted">Acceso</td><td style="text-align:center" class="small">Todo</td>${ROLES_CONFIG.map(r=>{ const n=TAB_ORDER.filter(t=>d[r]["tab:"+t]).length;
        return `<td style="text-align:center" class="small">${n?`${n} pestaña${n>1?"s":""}`:'<span style="color:var(--bad);font-weight:600">Sin acceso</span>'}</td>`; }).join("")}</tr>
      </tbody></table></div>
    <div class="pb" style="padding-top:8px"><p class="small muted" style="margin:0">Dar una acción también da su pestaña; quitar una pestaña quita las acciones que dependen de ella. Un rol sin pestañas no puede entrar a la app.</p></div></div>`;
}
function bindPermisos(app){
  const d=permDraft();
  app.querySelectorAll("[data-perm]").forEach(c=>c.onchange=()=>{
    const [r,k]=c.dataset.perm.split("|"), p=PRIVS.find(x=>x.k===k);
    d[r][k]=c.checked;
    if(c.checked&&p.tab) d[r]["tab:"+p.tab]=true;
    if(!c.checked&&k.startsWith("tab:")) PRIVS.filter(x=>x.tab===k.slice(4)).forEach(x=>d[r][x.k]=false);
    render();
  });
  document.getElementById("pm-def").onclick=()=>{ S.sel.permDraft=Object.fromEntries(ROLES_CONFIG.map(r=>[r,defaultPerms(r)])); render(); };
  document.getElementById("pm-save").onclick=async()=>{
    const sin=ROLES_CONFIG.filter(r=>!TAB_ORDER.some(t=>d[r]["tab:"+t]));
    const go=async()=>{ if(await safeWrite(()=>Store.set("config","permisos",{roles:d}))){ S.sel.permDraft=null; toast("Permisos guardados."); } };
    if(sin.length) confirmBox(`${sin.map(r=>ROLES[r].label).join(", ")} quedará${sin.length>1?"n":""} sin pestañas y no podrá${sin.length>1?"n":""} entrar a la app. ¿Guardar de todos modos?`,"Guardar",go);
    else go();
  };
}
