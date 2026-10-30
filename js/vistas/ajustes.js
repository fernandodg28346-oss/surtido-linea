/* ===================== Ajustes =====================
   Parámetros de surtido y catálogo de líneas (sl_config: "general" y "lineas"). Solo el administrador. */
function viewAjustes(app){
  const c=cfg(), lineas=lineasCat(), q=(S.sel.qLin||"").toLowerCase();
  const enPlan=l=>Object.values(S.plan).filter(p=>p.linea===l).length;
  const shown=(S.config.lineas?.items||[]).filter(x=>!q||(x.nombre+" "+(x.descripcion||"")).toLowerCase().includes(q)).sort((a,b)=>a.nombre.localeCompare(b.nombre,undefined,{numeric:true}));
  app.innerHTML=`
  <div class="view-head"><div><h2>Ajustes</h2><p>Parámetros del cálculo de surtido y catálogo de líneas. Las líneas del catálogo son las que se eligen en el plan de producción.</p></div></div>
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
    <div class="panel"><div class="ph"><h3>Catálogo de líneas</h3>
      <div class="row"><button class="btn" id="tpl-lin">Plantilla Excel</button><label class="btn file-btn">Cargar Excel<input type="file" id="xl-lin" accept=".xlsx,.xls,.csv"></label></div></div>
      <div class="pb" style="border-bottom:1px solid var(--line)"><form id="f-lin" class="row">
        <div class="fld"><label for="l-n">Línea</label><input id="l-n" class="w-s" required autocomplete="off"></div>
        <div class="fld" style="flex:1"><label for="l-d">Descripción <span class="muted">(opcional)</span></label><input id="l-d" autocomplete="off"></div>
        <button class="btn pri">Agregar línea</button></form></div>
      <div class="pb" style="padding-bottom:0"><div class="row"><input id="l-q" placeholder="Buscar línea" value="${esc(S.sel.qLin||"")}" aria-label="Buscar línea"><span class="muted small">${shown.length} de ${lineas.length}</span></div></div>
      <div class="tbl-wrap"><table>
      <thead><tr><th>Línea</th><th>Descripción</th><th class="num">Planes</th><th></th></tr></thead>
      <tbody>${shown.length?shown.map(x=>`<tr><td><b>${esc(x.nombre)}</b></td><td>${esc(x.descripcion||"")}</td><td class="num">${enPlan(x.nombre)}</td>
        <td><button class="btn danger" data-del-lin="${esc(x.nombre)}">Quitar</button></td></tr>`).join("")
        :`<tr><td colspan="4" class="empty">${lineas.length?"Ninguna línea coincide con la búsqueda.":"Aún no hay líneas. Mientras el catálogo esté vacío, la línea del plan se escribe a mano."}</td></tr>`}</tbody></table></div></div>
  </div>`;
  document.getElementById("f-cfg").onsubmit=async e=>{e.preventDefault();
    const turnos={}; Object.keys(c.turnos).forEach(t=>turnos[t]={inicio:ffv(`c-${t}-i`),fin:ffv(`c-${t}-f`)});
    const pct=Math.max(20,Number(ffv("c-pct"))||20);
    if(await safeWrite(()=>Store.set("config","general",{pct,tolerancia:Number(ffv("c-tol"))||0,anticipacionHoras:Math.max(0,Number(ffv("c-ant"))||0),turnos}))) toast("Parámetros guardados");};
  const lq=document.getElementById("l-q");
  lq.oninput=()=>{ S.sel.qLin=lq.value; const pos=lq.selectionStart; render(); const n=document.getElementById("l-q"); n.focus(); n.setSelectionRange(pos,pos); };
  const items=()=>[...(S.config.lineas?.items||[])];
  const saveLineas=list=>safeWrite(()=>Store.set("config","lineas",{items:list}));
  document.getElementById("f-lin").onsubmit=async e=>{e.preventDefault();
    const nombre=ffv("l-n").toUpperCase(), descripcion=ffv("l-d");
    if(lineas.some(l=>l.toUpperCase()===nombre)) return toast(`La línea ${nombre} ya está en el catálogo.`);
    if(await saveLineas([...items(),{nombre,descripcion}])){ toast(`Línea ${nombre} agregada.`); }
  };
  app.querySelectorAll("[data-del-lin]").forEach(b=>b.onclick=()=>{ const l=b.dataset.delLin, n=enPlan(l);
    confirmBox(`¿Quitar la línea ${l} del catálogo?${n?` Tiene ${n} plan${n>1?"es":""}; esos planes se conservan, pero ya no se podrá elegir para planes nuevos.`:""}`,"Quitar",
      ()=>saveLineas(items().filter(x=>x.nombre!==l))); });
  document.getElementById("tpl-lin").onclick=()=>downloadXlsx("plantilla_lineas.xlsx",[["Linea","Descripcion"],["L1","Ensamble final"],["L2","SMT"]]);
  document.getElementById("xl-lin").onchange=e=>readXlsx(e.target.files[0],async rows=>{
    const list=items(); let n=0,upd=0,bad=0;
    rows.forEach(r=>{ const nombre=String(pick(r,["linea","línea","line","area","área"])??"").trim().toUpperCase(), descripcion=String(pick(r,["descripcion","descripción","desc"])??"").trim();
      if(!nombre){bad++;return;}
      const prev=list.find(x=>x.nombre.toUpperCase()===nombre);
      if(prev){ if(descripcion) prev.descripcion=descripcion; upd++; } else { list.push({nombre,descripcion}); n++; } });
    if(await saveLineas(list)) toast(`Líneas: ${n} agregadas${upd?`, ${upd} actualizadas`:""}${bad?`, ${bad} filas sin línea`:""}.`);
  });
}
