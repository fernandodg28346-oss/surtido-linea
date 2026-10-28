/* ===================== BOM ===================== */
function viewBom(app){
  const ed=can.editPlan();
  const list=Object.values(S.bom).sort((a,b)=>a.ensamble.localeCompare(b.ensamble));
  if(!S.sel.bom||!S.bom[S.sel.bom]) S.sel.bom=list[0]?._id||null;
  const cur=S.sel.bom?S.bom[S.sel.bom]:null;
  const del=S.sel.bomDel; [...del].forEach(id=>{ if(!S.bom[id]) del.delete(id); });
  const allSel=list.length>0&&del.size===list.length;
  app.innerHTML=`
  <div class="view-head"><div><h2>BOM · materiales por ensamble</h2><p>Cada NP con su estación, cantidad por unidad y cantidad de empaque (lo que cabe en la estación). El UPH se captura en el plan de producción; aquí es opcional y solo se usa si el plan no trae uno.</p></div>
  ${ed?`<div class="row"><button class="btn" id="tpl-bom">Plantilla Excel</button><label class="btn file-btn">Cargar Excel<input type="file" id="xl-bom" accept=".xlsx,.xls,.csv"></label></div>`:""}</div>
  <div class="grid2">
    <div class="panel"><div class="ph"><h3>Ensambles</h3><span class="muted small">${list.length}</span></div>
      ${ed?`<div class="pb" style="border-bottom:1px solid var(--line)"><form id="f-ens" class="row">
        <div class="fld" style="flex:1"><label for="e-id">Ensamble</label><input id="e-id" required></div>
        <div class="fld"><label for="e-uph">UPH <span class="muted">(opcional)</span></label><input id="e-uph" type="number" min="1" class="w-xs" placeholder="Plan"></div>
        <button class="btn pri">Crear</button></form></div>`:""}
      ${ed&&list.length?`<div class="bulk"><label><input type="checkbox" id="bom-all" ${allSel?"checked":""}> Seleccionar todos</label>
        <button class="btn danger" id="bom-del-sel" ${del.size?"":"disabled"}>Eliminar seleccionados (${del.size})</button></div>`:""}
      <div class="tbl-wrap"><table><tbody>${list.length?list.map(b=>`<tr style="cursor:pointer;${b._id===S.sel.bom?"background:var(--accent-soft)":""}" data-sel-bom="${b._id}">
        ${ed?`<td style="width:32px"><input type="checkbox" data-bom-chk="${b._id}" ${del.has(b._id)?"checked":""} aria-label="Seleccionar ${esc(b.ensamble)}"></td>`:""}
        <td class="mono"><b>${esc(b.ensamble)}</b><div class="small muted">${esc(b.desc||"")}</div></td><td class="num small">${(b.items||[]).length} NP</td><td class="num small">${b.uph?fmtN(b.uph)+" UPH":"UPH del plan"}</td></tr>`).join(""):`<tr><td class="empty">Sin ensambles. ${ed?"Crea uno o carga el Excel del BOM.":""}</td></tr>`}</tbody></table></div>
    </div>
    <div class="panel">${cur?`
      <div class="ph"><div><h3 class="mono">${esc(cur.ensamble)}</h3></div>
        ${ed?`<div class="row"><div class="fld"><label for="cur-uph">UPH <span class="muted">(opcional)</span></label><input id="cur-uph" type="number" min="1" class="w-xs" placeholder="Plan" value="${cur.uph||""}"></div><button class="btn danger" id="del-ens">Eliminar ensamble</button></div>`:`<span class="muted">${cur.uph?fmtN(cur.uph)+" UPH":"UPH del plan"}</span>`}</div>
      ${ed?`<div class="pb" style="border-bottom:1px solid var(--line)"><form id="f-item" class="row">
        <div class="fld"><label for="i-np">NP</label><input id="i-np" class="w-m" required></div>
        <div class="fld"><label for="i-desc">Descripción</label><input id="i-desc" class="w-m"></div>
        <div class="fld"><label for="i-est">Estación</label><input id="i-est" class="w-xs" required></div>
        <div class="fld"><label for="i-q">Cant./unidad</label><input id="i-q" type="number" step="any" min="0.0001" class="w-xs" value="1" required></div>
        <div class="fld"><label for="i-emp">Empaque</label><input id="i-emp" type="number" min="1" class="w-xs" required></div>
        <button class="btn pri">Agregar NP</button></form></div>`:""}
      <div class="tbl-wrap"><table><thead><tr><th>Estación</th><th>NP</th><th>Descripción</th><th class="num">Cant./unidad</th><th class="num">Empaque</th>${ed?"<th></th>":""}</tr></thead>
      <tbody>${(cur.items||[]).length?[...cur.items].map((it,i)=>({it,i})).sort((a,b)=>String(a.it.estacion).localeCompare(String(b.it.estacion),undefined,{numeric:true})).map(({it,i})=>`<tr>
        <td><b>${esc(it.estacion)}</b></td><td class="mono">${esc(it.np)}</td><td>${esc(it.desc||"")}</td><td class="num">${fmtN(it.qtyPer,4)}</td><td class="num">${it.empaque?fmtN(it.empaque):"—"}</td>
        ${ed?`<td><button class="btn danger" data-del-item="${i}">Quitar</button></td>`:""}</tr>`).join(""):`<tr><td colspan="6" class="empty">Este ensamble no tiene NP. Agrégalos arriba.</td></tr>`}</tbody></table></div>
    `:`<div class="empty">Selecciona o crea un ensamble.</div>`}</div>
  </div>`;
  app.querySelectorAll("[data-sel-bom]").forEach(r=>r.onclick=()=>{S.sel.bom=r.dataset.selBom;render();});
  if(!ed) return;
  app.querySelectorAll("[data-bom-chk]").forEach(c=>{
    c.onclick=e=>e.stopPropagation();
    c.onchange=()=>{ c.checked?del.add(c.dataset.bomChk):del.delete(c.dataset.bomChk); render(); };
  });
  if(list.length){
    document.getElementById("bom-all").onchange=e=>{ del.clear(); if(e.target.checked) list.forEach(b=>del.add(b._id)); render(); };
    document.getElementById("bom-del-sel").onclick=()=>{
      const ids=[...del]; if(!ids.length) return;
      const enPlan=ids.filter(id=>Object.values(S.plan).some(p=>safeId(p.ensamble)===id)).length;
      confirmBox(`¿Eliminar ${ids.length} ensamble${ids.length>1?"s":""} y su BOM?${enPlan?` ${enPlan} se usa${enPlan>1?"n":""} en el plan de producción y dejará${enPlan>1?"n":""} de calcular surtidos.`:""} No se puede deshacer.`,"Eliminar",async()=>{
        if(await safeWrite(()=>Store.delMany("bom",ids))){ del.clear(); toast(`${ids.length} ensamble${ids.length>1?"s":""} eliminado${ids.length>1?"s":""}.`); }
      });
    };
  }
  document.getElementById("tpl-bom").onclick=()=>downloadXlsx("plantilla_bom.xlsx",[["Ensamble","NP","Descripcion","Estacion","CantidadPorUnidad","Empaque"],["ENS-1001","NP-55021","Tornillo M4x10","E10",4,1000],["ENS-1001","NP-30877","Arnés principal","E20",1,40]]);
  document.getElementById("f-ens").onsubmit=async e=>{e.preventDefault(); const id=ffv("e-id"); const k=safeId(id);
    if(S.bom[k]) {S.sel.bom=k; render(); return toast("El ensamble ya existe.");}
    const nb={ensamble:id,uph:Number(ffv("e-uph"))||null,items:[]};
    // Se agrega localmente para que la vista no regrese al primer ensamble si otro dato se refresca antes.
    if(await safeWrite(()=>Store.set("bom",k,nb))){ S.bom[k]=Object.assign({_id:k},nb); S.sel.bom=k; render(); } };
  if(!cur) { bindBomImport(); return; }
  const saveCur=items=>safeWrite(()=>Store.set("bom",cur._id,Object.assign({},cur,items?{items}:{})));
  document.getElementById("cur-uph").onchange=e=>{cur.uph=Number(e.target.value)||null; saveCur(); toast("UPH actualizado");};
  document.getElementById("del-ens").onclick=()=>confirmBox(`¿Eliminar el ensamble ${cur.ensamble} y su BOM?`,"Eliminar",()=>safeWrite(()=>Store.del("bom",cur._id)));
  document.getElementById("f-item").onsubmit=e=>{e.preventDefault();
    saveCur([...(cur.items||[]),{np:ffv("i-np"),desc:ffv("i-desc"),estacion:ffv("i-est"),qtyPer:Number(ffv("i-q")),empaque:Number(ffv("i-emp"))}]); };
  app.querySelectorAll("[data-del-item]").forEach(b=>b.onclick=()=>{const it=[...cur.items]; it.splice(Number(b.dataset.delItem),1); saveCur(it);});
  bindBomImport();
}
function bindBomImport(){
  document.getElementById("xl-bom").onchange=e=>readXlsx(e.target.files[0],async rows=>{
    const groups={}; let bad=0;
    rows.forEach(r=>{const g=k=>pick(r,k);
      const ens=String(g(["ensamble","assembly","modelo"])||"").trim(), np=String(g(["np","numero de parte","part number","pn"])||"").trim();
      const est=String(g(["estacion","estación","station"])||"").trim();
      if(!ens||!np||!est){bad++;return;}
      const grp=groups[ens]=groups[ens]||{ensamble:ens,uph:null,items:[]};
      const u=Number(g(["uph"])); if(u) grp.uph=u;
      grp.items.push({np,desc:String(g(["descripcion","descripción","desc","descripcionnp"])||""),estacion:est,qtyPer:Number(g(["cantidadporunidad","cant/unidad","qtyper","cantidad","qty"]))||1,empaque:Number(g(["empaque","cantidadempaque","pack","capacidad"]))||null});
    });
    let n=0; for(const ens of Object.keys(groups)){ const k=safeId(ens), prev=S.bom[k]; const gr=groups[ens]; if(!gr.uph&&prev) gr.uph=prev.uph||null; await Store.set("bom",k,gr); n++; }
    toast(`BOM: ${n} ensambles cargados (reemplazan su lista de NP)${bad?`, ${bad} filas ignoradas`:""}.`);
  });
}
