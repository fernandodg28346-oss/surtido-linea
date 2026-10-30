/* ===================== Gafetes ===================== */
function viewGafetes(app){
  const q=(S.sel.qGaf||"").toLowerCase();
  const all=Object.values(S.gafetes).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const us=all.filter(u=>!q||(u.gafete+" "+u.nombre+" "+(u.area||"")).toLowerCase().includes(q));
  const roleOpts=sel=>Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${sel===k?"selected":""}>${v.label}</option>`).join("");
  app.innerHTML=`
  <div class="view-head"><div><h2>Gafetes</h2><p>Registro de cada gafete y la persona a la que pertenece. Quien recibe material en línea solo necesita estar registrado aquí; el rol define si además puede entrar a la app y qué ve.</p></div>
  <div class="row"><button class="btn" id="tpl-gaf">Plantilla Excel</button><label class="btn file-btn">Cargar Excel<input type="file" id="xl-gaf" accept=".xlsx,.xls,.csv"></label></div></div>
  <div class="grid2">
    <div class="stack">
      <div class="panel"><div class="ph"><h3>Registrar gafete</h3></div><div class="pb"><form id="f-user" class="stack">
        <div class="fld"><label for="u-g">Gafete</label><input id="u-g" required autocomplete="off" placeholder="Escanea o teclea"></div>
        <div class="fld"><label for="u-n">Nombre</label><input id="u-n" required></div>
        <div class="fld"><label for="u-a">Área o línea</label><input id="u-a" list="dl-areas" placeholder="Ej. L1, Almacén"><datalist id="dl-areas">${lineasCat().map(l=>`<option value="${esc(l)}">`).join("")}</datalist></div>
        <div class="fld"><label for="u-r">Rol</label><select id="u-r">${roleOpts("receptor")}</select></div>
        <button class="btn pri">Registrar gafete</button></form></div></div>
    </div>
    <div class="panel"><div class="ph"><h3>Gafetes registrados</h3>
      <div class="row"><input id="g-q" placeholder="Buscar gafete, nombre o área" value="${esc(S.sel.qGaf||"")}" aria-label="Buscar gafete"><span class="muted small">${us.length} de ${all.length}</span></div></div>
      <div class="tbl-wrap"><table>
      <thead><tr><th>Gafete</th><th>Nombre</th><th>Área</th><th>Rol</th><th></th></tr></thead>
      <tbody>${us.length?us.map(u=>`<tr><td class="mono">${esc(u.gafete)}</td><td>${esc(u.nombre)}</td><td>${esc(u.area||"")}</td>
        <td><select data-rol="${u._id}" aria-label="Rol de ${esc(u.nombre)}" ${u.gafete===S.me.gafete?"disabled":""}>${roleOpts(u.rol)}</select></td>
        <td>${u.gafete===S.me.gafete?'<span class="muted small">Tú</span>':`<button class="btn danger" data-del-user="${u._id}">Dar de baja</button>`}</td></tr>`).join(""):`<tr><td colspan="5" class="empty">Ningún gafete coincide con la búsqueda.</td></tr>`}</tbody></table></div></div>
  </div>`;
  const gq=document.getElementById("g-q");
  gq.oninput=()=>{ S.sel.qGaf=gq.value; const pos=gq.selectionStart; render(); const n=document.getElementById("g-q"); n.focus(); n.setSelectionRange(pos,pos); };
  document.getElementById("f-user").onsubmit=async e=>{e.preventDefault(); const g=ffv("u-g");
    if(userByBadge(g)) return toast("Ese gafete ya está registrado.");
    if(await safeWrite(()=>Store.set("gafetes",safeId(g),{gafete:g,nombre:ffv("u-n"),area:ffv("u-a"),rol:ffv("u-r")}))){ toast("Gafete registrado"); e.target.reset(); }};
  document.getElementById("tpl-gaf").onclick=()=>downloadXlsx("plantilla_gafetes.xlsx",[["Gafete","Nombre","Area","Rol"],["100245","Nombre Apellido","L1","receptor"],["100246","Nombre Apellido","Almacén","materialista"]]);
  document.getElementById("xl-gaf").onchange=e=>readXlsx(e.target.files[0],async rows=>{
    const roleOf=v=>{ const n=norm(v||""); return Object.keys(ROLES).find(k=>norm(k)===n||norm(ROLES[k].label).startsWith(n))||"receptor"; };
    let n=0,bad=0;
    for(const r of rows){ const g=String(pick(r,["gafete","badge","numero","num"])??"").trim(), nom=String(pick(r,["nombre","name"])??"").trim();
      if(!g||!nom){bad++;continue;}
      const prev=userByBadge(g);
      // Un archivo no cambia el rol de quien ya es administrador.
      const rol=prev&&prev.rol==="admin"?"admin":roleOf(pick(r,["rol","role"]));
      await Store.set("gafetes",safeId(g),{gafete:g,nombre:nom,area:String(pick(r,["area","área","linea","línea"])??"").trim(),rol}); n++; }
    toast(`Gafetes: ${n} registrados o actualizados${bad?`, ${bad} filas sin gafete o nombre`:""}.`);
  });
  app.querySelectorAll("[data-rol]").forEach(s=>s.onchange=()=>{const u=S.gafetes[s.dataset.rol]; safeWrite(()=>Store.set("gafetes",u._id,Object.assign({},u,{rol:s.value})));});
  app.querySelectorAll("[data-del-user]").forEach(b=>b.onclick=()=>{const u=S.gafetes[b.dataset.delUser]; confirmBox(`¿Dar de baja a ${u.nombre}?`,"Dar de baja",()=>safeWrite(()=>Store.del("gafetes",u._id)));});
}
