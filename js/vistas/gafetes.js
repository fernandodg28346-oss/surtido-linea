/* ===================== Usuarios (gafetes) ===================== */
// Solicitudes de acceso (sl_solicitudes), en vivo mientras el administrador las ve.
let solWatch=null;
function watchSolicitudes(){
  if(solWatch) return;
  const load=async()=>{ const {data,error}=await Store.sb.from("sl_solicitudes").select("*").order("creado");
    S.solicitudes=error?[]:data; if(S.view==="gafetes") render(true); };
  solWatch=Store.sb.channel("sl_sol_"+newId()).on("postgres_changes",{event:"*",schema:"public",table:"sl_solicitudes"},load).subscribe();
  load();
}
function viewGafetes(app){
  watchSolicitudes();
  const q=(S.sel.qGaf||"").toLowerCase(), sols=S.solicitudes||[];
  const all=Object.values(S.gafetes).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const us=all.filter(u=>!q||(u.gafete+" "+u.nombre+" "+(u.area||"")).toLowerCase().includes(q));
  const roleOpts=sel=>Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${sel===k?"selected":""}>${v.label}</option>`).join("");
  app.innerHTML=`
  <div class="view-head"><div><h2>Usuarios</h2><p>Cada persona entra con su correo y contraseña. Crea su cuenta en Supabase (Authentication → Users → Add user); al entrar, la persona envía su solicitud y aquí la apruebas, lo que liga la cuenta a su gafete y le da un rol. Quien solo recibe material no necesita cuenta; basta con registrar su gafete.</p></div>
  <div class="row"><button class="btn" id="tpl-gaf">Plantilla Excel</button><label class="btn file-btn">Cargar Excel<input type="file" id="xl-gaf" accept=".xlsx,.xls,.csv"></label></div></div>
  ${sols.length?`<div class="panel" style="margin-bottom:16px;border-color:var(--warn)"><div class="ph"><h3>Solicitudes de acceso</h3><span class="pill p-warn">${sols.length}</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Gafete</th><th>Enviada</th><th></th></tr></thead>
    <tbody>${sols.map(s=>{ const g=userByBadge(s.gafete); return `<tr><td><b>${esc(s.nombre)}</b></td><td>${esc(s.email)}</td>
      <td class="mono">${esc(s.gafete)}${g?`<div class="small muted" style="font-family:var(--f-body)">Registrado: ${esc(g.nombre)}${g.user_id?" (ya tiene cuenta)":""}</div>`:""}</td>
      <td class="small">${new Date(s.creado).toLocaleString("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</td>
      <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn ok" data-aprobar-sol="${s.user_id}">Aprobar</button><button class="btn" data-rechazar-sol="${s.user_id}">Rechazar</button></div></td></tr>`; }).join("")}</tbody></table></div></div>`:""}
  <div class="grid2">
    <div class="stack">
      <div class="panel"><div class="ph"><h3>Registrar gafete</h3></div><div class="pb"><form id="f-user" class="stack">
        <div class="fld"><label for="u-g">Gafete</label><input id="u-g" required autocomplete="off" placeholder="Escanea o teclea"></div>
        <div class="fld"><label for="u-n">Nombre</label><input id="u-n" required></div>
        <div class="fld"><label for="u-a">Área o línea</label><input id="u-a" list="dl-areas" placeholder="Ej. L1, Almacén"><datalist id="dl-areas">${lineasCat().map(l=>`<option value="${esc(l)}">`).join("")}</datalist></div>
        <div class="fld"><label for="u-r">Rol</label><select id="u-r">${roleOpts("receptor")}</select></div>
        <button class="btn pri">Registrar gafete</button>
        <p class="small muted" style="margin:0">Para personas sin cuenta, como quien recibe material. Quien usa la app necesita una cuenta: créala en Supabase y aprueba su solicitud arriba.</p></form></div></div>
    </div>
    <div class="panel"><div class="ph"><h3>Gafetes registrados</h3>
      <div class="row"><input id="g-q" placeholder="Buscar gafete, nombre o área" value="${esc(S.sel.qGaf||"")}" aria-label="Buscar gafete"><span class="muted small">${us.length} de ${all.length}</span></div></div>
      <div class="tbl-wrap"><table>
      <thead><tr><th>Gafete</th><th>Nombre</th><th>Cuenta</th><th>Área</th><th>Rol</th><th></th></tr></thead>
      <tbody>${us.length?us.map(u=>`<tr><td class="mono">${esc(u.gafete)}</td><td>${esc(u.nombre)}</td><td class="small">${u.user_id?esc(u.email||"Con cuenta"):'<span class="muted">Sin cuenta</span>'}</td><td>${esc(u.area||"")}</td>
        <td><select data-rol="${u._id}" aria-label="Rol de ${esc(u.nombre)}" ${u.gafete===S.me.gafete?"disabled":""}>${roleOpts(u.rol)}</select></td>
        <td>${u.gafete===S.me.gafete?'<span class="muted small">Tú</span>':`<div class="row" style="flex-wrap:nowrap">${u.user_id?`<button class="btn ghost" data-unlink="${u._id}" title="La cuenta deja de entrar; el gafete se conserva para recibir material">Quitar acceso</button>`:""}<button class="btn danger" data-del-user="${u._id}">Dar de baja</button></div>`}</td></tr>`).join(""):`<tr><td colspan="6" class="empty">Ningún gafete coincide con la búsqueda.</td></tr>`}</tbody></table></div></div>
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
      // Conserva la cuenta ligada (user_id, email) de un gafete que ya existía.
      const next=Object.assign({},prev||{},{gafete:g,nombre:nom,area:String(pick(r,["area","área","linea","línea"])??"").trim(),rol}); delete next._id;
      await Store.set("gafetes",prev?prev._id:safeId(g),next); n++; }
    toast(`Gafetes: ${n} registrados o actualizados${bad?`, ${bad} filas sin gafete o nombre`:""}.`);
  });
  app.querySelectorAll("[data-rol]").forEach(s=>s.onchange=()=>{const u=S.gafetes[s.dataset.rol]; safeWrite(()=>Store.set("gafetes",u._id,Object.assign({},u,{rol:s.value})));});
  app.querySelectorAll("[data-unlink]").forEach(b=>b.onclick=()=>{ const u=S.gafetes[b.dataset.unlink];
    confirmBox(`¿Quitar el acceso de ${u.nombre} (${u.email||"cuenta"})? Ya no podrá entrar a la app; su gafete se conserva para recibir material.`,"Quitar acceso",()=>{
      const n=Object.assign({},u); delete n.user_id; delete n.email; return safeWrite(()=>Store.set("gafetes",u._id,n)); }); });
  app.querySelectorAll("[data-aprobar-sol]").forEach(b=>b.onclick=()=>openApprove(sols.find(s=>s.user_id===b.dataset.aprobarSol)));
  app.querySelectorAll("[data-rechazar-sol]").forEach(b=>b.onclick=()=>{ const s=sols.find(x=>x.user_id===b.dataset.rechazarSol);
    confirmBox(`¿Rechazar la solicitud de ${s.nombre} (${s.email})? Podrá volver a enviarla.`,"Rechazar",async()=>{
      if(await safeWrite(async()=>{ const {error}=await Store.sb.from("sl_solicitudes").delete().eq("user_id",s.user_id); if(error) throw error; })) toast("Solicitud rechazada."); }); });
  app.querySelectorAll("[data-del-user]").forEach(b=>b.onclick=()=>{const u=S.gafetes[b.dataset.delUser]; confirmBox(`¿Dar de baja a ${u.nombre}?`,"Dar de baja",()=>safeWrite(()=>Store.del("gafetes",u._id)));});
}

// Aprobar: liga la cuenta al gafete (el existente o uno nuevo) con un rol que entra a la app.
function openApprove(sol){
  const root=document.getElementById("modal-root"), prev=userByBadge(sol.gafete);
  const roles=Object.entries(ROLES).filter(([,v])=>v.tabs.length), def=prev&&ROLES[prev.rol]?.tabs.length?prev.rol:"materialista";
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="ap-t">
    <div class="ph"><h3 id="ap-t">Aprobar acceso</h3><button class="btn ghost" id="ap-x">Cancelar</button></div>
    <form class="pb" id="f-ap">
      <div class="note"><b>${esc(sol.email)}</b> pidió acceso como <b>${esc(sol.nombre)}</b>.</div>
      <div class="fld"><label for="ap-g">Gafete</label><input id="ap-g" value="${esc(sol.gafete)}" required autocomplete="off"></div>
      <div class="fld"><label for="ap-n">Nombre</label><input id="ap-n" value="${esc(prev?.nombre||sol.nombre)}" required></div>
      <div class="fld"><label for="ap-a">Área o línea</label><input id="ap-a" value="${esc(prev?.area||"")}" list="dl-ap"><datalist id="dl-ap">${lineasCat().map(l=>`<option value="${esc(l)}">`).join("")}</datalist></div>
      <div class="fld"><label for="ap-r">Rol</label><select id="ap-r">${roles.map(([k,v])=>`<option value="${k}" ${k===def?"selected":""}>${v.label}</option>`).join("")}</select></div>
      <div class="err" id="ap-err"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn ok">Aprobar</button></div>
    </form></div></div>`;
  const close=()=>root.innerHTML="", err=m=>document.getElementById("ap-err").textContent=m;
  document.getElementById("ap-x").onclick=close;
  document.getElementById("f-ap").onsubmit=async e=>{ e.preventDefault();
    const g=ffv("ap-g"), nombre=ffv("ap-n"), area=ffv("ap-a"), rol=ffv("ap-r"), cur=userByBadge(g);
    if(cur?.user_id&&cur.user_id!==sol.user_id) return err(`El gafete ${g} ya está ligado a la cuenta ${cur.email||""}.`);
    const ok=await safeWrite(async()=>{
      // Una cuenta se liga a un solo gafete: si ya tenía otro, se le quita.
      for(const o of Object.values(S.gafetes).filter(u=>u.user_id===sol.user_id&&u.gafete!==g)){ const n=Object.assign({},o); delete n.user_id; delete n.email; await Store.set("gafetes",o._id,n); }
      const data=Object.assign({},cur||{},{gafete:g,nombre,area,rol,email:sol.email,user_id:sol.user_id}); delete data._id;
      await Store.set("gafetes",cur?cur._id:safeId(g),data);
      const {error}=await Store.sb.from("sl_solicitudes").delete().eq("user_id",sol.user_id); if(error) throw error;
    });
    if(ok){ close(); toast(`${nombre} ya tiene acceso como ${ROLES[rol].label}.`); }
  };
}
