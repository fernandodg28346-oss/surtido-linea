/* ===================== Plan de producción =====================
   Un plan se postea cfg().anticipacion horas antes del inicio de su turno. Altas, cambios y bajas de planes que arrancan
   dentro de ese plazo (o ya arrancaron) quedan pendientes hasta que Gerencia o el administrador las aprueba: mientras tanto el plan vigente
   no cambia y un alta pendiente no genera surtidos. */
const PLAN_CAMPOS={wo:"WO",cantidad:"Cantidad",uph:"UPH",turno:"Turno",linea:"Línea"};
// Work order del ensamble, p. ej. CTI002647: letras y números (guion permitido), 4 a 20 caracteres, en mayúsculas.
const normWO=v=>String(v??"").trim().toUpperCase();
const validWO=v=>/^[A-Z0-9][A-Z0-9-]{3,19}$/.test(v);
const PEND_LABEL={alta:"Alta",cambio:"Cambio",baja:"Baja"};
function hoursAhead(p){ return (shiftStart(p.fecha,p.turno).getTime()-Date.now())/3600000; }
// Rolar: un plan posteado en tiempo y forma (creado con la anticipación requerida respecto a su turno original)
// se puede recorrer a un turno posterior sin aprobación, mientras no haya arrancado.
function planOrigen(p){ return p.original||{fecha:p.fecha,turno:p.turno}; }
function postedOnTime(p){ const o=planOrigen(p); return !!p.creado && (shiftStart(o.fecha,o.turno).getTime()-p.creado)/3600000>=cfg().anticipacion; }
function rollBlock(p){
  if(p.pendiente) return "Tiene una solicitud pendiente de aprobación.";
  if(!postedOnTime(p)) return `No se posteó con ${fmtHoras(cfg().anticipacion)} de anticipación; para moverlo usa Editar (requiere aprobación).`;
  if(p.inicioReal) return "El ensamble ya se inició.";
  return "";
}
function nextShift(fecha,turno){
  const ts=Object.keys(cfg().turnos), i=ts.indexOf(turno);
  if(i>=0&&i<ts.length-1) return {fecha,turno:ts[i+1]};
  const d=new Date(fecha+"T00:00:00"); d.setDate(d.getDate()+1);
  return {fecha:d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"),turno:ts[0]};
}
// Requiere aprobación si alguno de los planes (p. ej. el actual y el editado) inicia dentro del plazo.
function needsApproval(...plans){ return !can.approve() && plans.some(p=>hoursAhead(p)<cfg().anticipacion); }
const fmtHoras=h=>fmtN(h,1)+" h";
const fmtFechaHora=d=>d.toLocaleString("es-MX",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
function activePlans(){ return Object.values(S.plan).filter(p=>p.pendiente?.tipo!=="alta"); }
function histEntry(accion,extra){ return Object.assign({accion,ts:Date.now(),por:S.me.gafete,porNombre:S.me.nombre},extra||{}); }
function solicitud(tipo,extra){ return Object.assign({tipo,ts:Date.now(),por:S.me.gafete,porNombre:S.me.nombre},extra||{}); }
function withoutPend(p,accion){ const n=Object.assign({},p,{historial:[...(p.historial||[]),histEntry(accion,{solicito:p.pendiente?.porNombre||""})]}); delete n.pendiente; return n; }
function pendDetail(p){
  const q=p.pendiente;
  if(q.tipo==="alta") return `Agregar ${fmtN(p.cantidad)} pzs${planUph(p)?` a ${fmtN(planUph(p))} UPH`:""}${p.wo?` · WO <span class="mono">${esc(p.wo)}</span>`:""}`;
  if(q.tipo==="baja") return "Quitar del plan";
  return Object.entries(q.cambios||{}).map(([k,v])=>`${PLAN_CAMPOS[k]||k}: <span class="mono">${esc(p[k]??"—")}</span> → <b class="mono">${esc(v??"—")}</b>`).join("<br>");
}
async function resolvePlan(p,ok){
  const q=p.pendiente; if(!q) return;
  const accion=(ok?"aprobó ":"rechazó ")+q.tipo;
  if(q.tipo==="alta") return ok?Store.set("plan",p._id,withoutPend(p,accion)):Store.del("plan",p._id);
  if(q.tipo==="baja") return ok?Store.del("plan",p._id):Store.set("plan",p._id,withoutPend(p,accion));
  return Store.set("plan",p._id,Object.assign(withoutPend(p,accion),ok?q.cambios:{}));
}
function viewPlan(app){
  const ed=can.editPlan(), ap=can.approve(), c=cfg();
  const rows=Object.values(S.plan).sort((a,b)=>(b.fecha+a.turno+a.linea).localeCompare(a.fecha+b.turno+b.linea));
  const pend=rows.filter(p=>p.pendiente).sort((a,b)=>a.pendiente.ts-b.pendiente.ts);
  const ens=Object.values(S.bom).map(b=>b.ensamble).sort();
  const libreTxt=fmtFechaHora(new Date(Date.now()+c.anticipacion*3600000));
  app.innerHTML=`
  <div class="view-head"><div><h2>Plan de producción</h2><p>Qué ensamble corre, cuántas piezas, a qué UPH, en qué turno y en qué línea. Con el UPH se calcula el consumo por hora de cada NP del BOM (UPH × cantidad por unidad).</p></div>
  ${ed?`<div class="row"><button class="btn" id="tpl-plan">Plantilla Excel</button><label class="btn file-btn">Cargar Excel<input type="file" id="xl-plan" accept=".xlsx,.xls,.csv"></label></div>`:""}</div>
  ${ed&&c.anticipacion>0?`<div class="note" style="margin-bottom:16px">El plan se postea con <b>${fmtHoras(c.anticipacion)}</b> de anticipación al inicio del turno: ahora entran sin aprobación los turnos que inician del <b>${esc(libreTxt)}</b> en adelante. ${ap?"Como Gerencia, tus altas, cambios y bajas se aplican directo.":"Altas, cambios o bajas de turnos que inician antes se envían a <b>aprobación de Gerencia</b> y no cuentan en el surtido hasta aprobarse."}</div>`:""}
  ${pend.length&&(ed||ap)?`<div class="panel" style="margin-bottom:16px;border-color:var(--warn)"><div class="ph"><h3>Pendientes de aprobación de Gerencia</h3><span class="pill p-warn">${pend.length}</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Solicitud</th><th>Plan</th><th>Detalle</th><th>Solicitó</th><th></th></tr></thead>
    <tbody>${pend.map(p=>`<tr><td><span class="pill p-warn">${PEND_LABEL[p.pendiente.tipo]}</span></td>
      <td><span class="mono">${esc(p.fecha)}</span> · ${esc(p.turno)} · <b>${esc(p.linea)}</b> · <span class="mono">${esc(p.ensamble)}</span></td>
      <td class="small">${pendDetail(p)}</td>
      <td>${esc(p.pendiente.porNombre||"")}<div class="small muted">${new Date(p.pendiente.ts).toLocaleString("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div></td>
      <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">${ap?`<button class="btn ok" data-aprobar="${p._id}">Aprobar</button><button class="btn" data-rechazar="${p._id}">Rechazar</button>`
        :`<button class="btn ghost" data-cancelar="${p._id}">Cancelar solicitud</button>`}</div></td></tr>`).join("")}</tbody></table></div></div>`:""}
  ${ed?`<div class="panel" style="margin-bottom:16px"><div class="pb">
    <form id="f-plan" class="row">
      <div class="fld"><label for="p-fecha">Fecha</label><input type="date" id="p-fecha" value="${S.sel.fecha}" required></div>
      <div class="fld"><label for="p-ens">Ensamble</label><input id="p-ens" class="w-m" list="dl-ens" required><datalist id="dl-ens">${ens.map(e=>`<option value="${esc(e)}">`).join("")}</datalist></div>
      <div class="fld"><label for="p-wo">WO</label><input id="p-wo" class="w-s" required autocomplete="off" placeholder="CTI002647" style="text-transform:uppercase" title="Work order del ensamble"></div>
      <div class="fld"><label for="p-cant">Cantidad</label><input id="p-cant" type="number" min="1" class="w-s" required></div>
      <div class="fld"><label for="p-turno">Turno</label><select id="p-turno">${Object.keys(c.turnos).map(t=>`<option>${t}</option>`).join("")}</select></div>
      <div class="fld"><label for="p-linea">Línea</label><input id="p-linea" class="w-s" required></div>
      <div class="fld"><label for="p-uph">UPH</label><input id="p-uph" type="number" min="1" class="w-xs" title="Unidades por hora del ensamble; con él se calcula el consumo de cada NP"></div>
      <div class="fld"><label for="p-arr">Arranque</label><select id="p-arr"><option value="turno">Al inicio del turno</option><option value="manual">Manual (Iniciar ensamble)</option></select></div>
      <button class="btn pri">Agregar al plan</button>
    </form></div></div>`:""}
  <div class="panel"><div class="tbl-wrap"><table>
    <thead><tr><th>Fecha</th><th>Turno</th><th>Línea</th><th>Ensamble</th><th>WO</th><th class="num">Cantidad</th><th class="num">UPH</th><th class="num">Horas</th><th>BOM</th><th>Arranque</th>${ed?"<th></th>":""}</tr></thead>
    <tbody>${rows.length?rows.map(p=>{const u=planUph(p),hasB=!!S.bom[safeId(p.ensamble)];return`<tr${p.pendiente?.tipo==="alta"?' style="opacity:.6"':""}>
      <td class="mono" style="white-space:nowrap">${esc(p.fecha)}</td><td>${esc(p.turno)}</td><td><b>${esc(p.linea)}</b></td><td class="mono">${esc(p.ensamble)}${p.pendiente?`<div><span class="pill p-warn" title="Pendiente de aprobación de Gerencia">${PEND_LABEL[p.pendiente.tipo]} pendiente</span></div>`:""}${p.original?`<div class="small muted" style="font-family:var(--f-body);white-space:nowrap">Rolado desde ${esc(p.original.fecha)} ${esc(p.original.turno)}</div>`:""}</td>
      <td class="mono">${p.wo?esc(p.wo):'<span class="pill p-bad">Falta</span>'}</td><td class="num">${fmtN(p.cantidad)}</td><td class="num">${u?fmtN(u):'<span class="pill p-bad">Falta</span>'}</td><td class="num">${u?fmtN(p.cantidad/u,1):"—"}</td>
      <td>${hasB?'<span class="pill p-ok">Cargado</span>':'<span class="pill p-bad">Falta BOM</span>'}</td>
      <td>${startLabel(p)}</td>
      ${ed?`<td><div class="row" style="flex-wrap:nowrap">${p.pendiente?'<span class="small muted">En aprobación</span>':`${(rb=>`<button class="btn ghost" data-roll-plan="${p._id}" ${rb?`disabled title="${esc(rb)}"`:'title="Recorrer a otro turno sin aprobación"'}>Rolar</button>`)(rollBlock(p))}<button class="btn ghost" data-edit-plan="${p._id}">Editar</button><button class="btn danger" data-del-plan="${p._id}">Quitar</button>`}</div></td>`:""}</tr>`}).join(""):`<tr><td colspan="11" class="empty">No hay plan cargado. ${ed?"Agrega una fila arriba o carga el Excel del plan.":""}</td></tr>`}</tbody>
  </table></div></div>`;
  app.querySelectorAll("[data-aprobar],[data-rechazar]").forEach(b=>b.onclick=()=>{
    const ok=!!b.dataset.aprobar, p=S.plan[b.dataset.aprobar||b.dataset.rechazar]; if(!p?.pendiente) return;
    const t=p.pendiente.tipo, que=`${PEND_LABEL[t].toLowerCase()} de ${p.ensamble} (${p.fecha}, ${p.linea})`;
    confirmBox(ok?`¿Aprobar ${que}?${t==="baja"?" La fila se quitará del plan.":t==="cambio"?" El cambio se aplica al plan vigente.":" Empezará a generar surtidos."}`:`¿Rechazar ${que}?${t==="alta"?" La fila se descarta.":" El plan vigente se queda como está."}`,
      ok?"Aprobar":"Rechazar",async()=>{ if(await safeWrite(()=>resolvePlan(p,ok))) toast(`${ok?"Aprobado":"Rechazado"}: ${que}.`); });
  });
  if(!ed) return;
  app.querySelectorAll("[data-cancelar]").forEach(b=>b.onclick=()=>{
    const p=S.plan[b.dataset.cancelar]; if(!p?.pendiente) return;
    confirmBox(`¿Cancelar la solicitud de ${PEND_LABEL[p.pendiente.tipo].toLowerCase()} de ${p.ensamble}?`,"Cancelar solicitud",
      ()=>safeWrite(()=>p.pendiente.tipo==="alta"?Store.del("plan",p._id):Store.set("plan",p._id,withoutPend(p,"canceló "+p.pendiente.tipo))));
  });
  document.getElementById("f-plan").onsubmit=async e=>{e.preventDefault();
    const p={fecha:ffv("p-fecha"),ensamble:ffv("p-ens"),wo:normWO(ffv("p-wo")),cantidad:Number(ffv("p-cant")),turno:ffv("p-turno"),linea:ffv("p-linea"),uph:Number(ffv("p-uph"))||null,arranque:ffv("p-arr"),creado:Date.now(),por:S.me.gafete};
    if(!validWO(p.wo)) return toast("Captura la WO del ensamble (letras y números, p. ej. CTI002647).");
    if(!planUph(p)) return toast(`Captura el UPH de ${p.ensamble}: con él se calcula el consumo de cada NP.`);
    const req=needsApproval(p);
    if(req) p.pendiente=solicitud("alta");
    p.historial=[histEntry(req?"solicitó alta":"alta")];
    S.sel.fecha=p.fecha;
    if(await safeWrite(()=>Store.set("plan",newId(),p))) toast(req?`Enviado a aprobación de Gerencia: ${p.ensamble} en ${p.linea} (menos de ${fmtHoras(c.anticipacion)} antes del inicio del turno).`:"Agregado: "+p.ensamble+" en "+p.linea);
  };
  app.querySelectorAll("[data-del-plan]").forEach(b=>b.onclick=()=>{
    const p=S.plan[b.dataset.delPlan];
    if(needsApproval(p)) confirmBox(`${p.ensamble} del ${p.fecha} (${p.turno}) inicia en menos de ${fmtHoras(cfg().anticipacion)}. ¿Solicitar a Gerencia quitarlo del plan?`,"Solicitar baja",
      async()=>{ if(await safeWrite(()=>Store.set("plan",p._id,Object.assign({},p,{pendiente:solicitud("baja")})))) toast("Baja enviada a aprobación de Gerencia."); });
    else confirmBox("¿Quitar esta fila del plan?","Quitar",()=>safeWrite(()=>Store.del("plan",p._id)));
  });
  app.querySelectorAll("[data-edit-plan]").forEach(b=>b.onclick=()=>openPlanEdit(S.plan[b.dataset.editPlan]));
  app.querySelectorAll("[data-roll-plan]").forEach(b=>b.onclick=()=>openPlanRoll(S.plan[b.dataset.rollPlan]));
  document.getElementById("tpl-plan").onclick=()=>downloadXlsx("plantilla_plan.xlsx",[["Fecha","Ensamble","WO","Cantidad","Turno","Linea","UPH","Arranque"],[today(),"ENS-1001","CTI002647",480,"T1","L1",60,"turno"],[today(),"ENS-2002","CTI002648",200,"T1","L2",40,"manual"]]);
  document.getElementById("xl-plan").onchange=e=>readXlsx(e.target.files[0],async rows=>{
    let n=0, bad=0, sinUph=0, nPend=0, sinWo=0;
    for(const r of rows){
      const g=k=>pick(r,k);
      const p={fecha:xlDate(g(["fecha","date"])),ensamble:String(g(["ensamble","assembly","modelo"])||"").trim(),wo:normWO(g(["wo","workorder","work order","orden","ot"])),cantidad:Number(g(["cantidad","qty","piezas"])),turno:String(g(["turno","shift"])||"").trim().toUpperCase(),linea:String(g(["linea","línea","line"])||"").trim(),uph:Number(g(["uph"]))||null,arranque:/manual/i.test(String(g(["arranque","inicio","start"])||""))?"manual":"turno",creado:Date.now(),por:S.me.gafete};
      if(/^\d$/.test(p.turno)) p.turno="T"+p.turno;
      if(!p.fecha||!p.ensamble||!(p.cantidad>0)||!p.turno||!p.linea){bad++;continue;}
      if(!validWO(p.wo)){sinWo++;continue;}
      const req=needsApproval(p); if(req){ p.pendiente=solicitud("alta"); nPend++; }
      p.historial=[histEntry(req?"solicitó alta":"alta",{origen:"Excel"})];
      await Store.set("plan",newId(),p); n++; if(!planUph(p)) sinUph++;
    }
    toast(`Plan: ${n} filas cargadas${nPend?` (${nPend} enviadas a aprobación de Gerencia)`:""}${bad?`, ${bad} ignoradas por datos incompletos`:""}${sinWo?`, ${sinWo} ignoradas por no traer WO válida`:""}${sinUph?`, ${sinUph} sin UPH (no calculan surtido hasta capturarlo)`:""}.`);
  });
}
function openPlanRoll(p){
  const root=document.getElementById("modal-root"), c=cfg(), nx=nextShift(p.fecha,p.turno), o=planOrigen(p);
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="pr-t">
    <div class="ph"><h3 id="pr-t">Rolar plan</h3><button class="btn ghost" id="pr-x">Cancelar</button></div>
    <form class="pb" id="f-pr">
      <div class="note"><b class="mono">${esc(p.ensamble)}</b> · ${fmtN(p.cantidad)} pzs · Línea <b>${esc(p.linea)}</b><br>
        Turno actual: <b>${esc(p.fecha)} ${esc(p.turno)}</b>${p.original?` (posteado para ${esc(o.fecha)} ${esc(o.turno)})`:""}.
        Se posteó en tiempo, así que se recorre a un turno posterior <b>sin aprobación</b>.</div>
      <div class="row">
        <div class="fld"><label for="pr-fecha">Nueva fecha</label><input type="date" id="pr-fecha" value="${nx.fecha}" min="${esc(p.fecha)}" required></div>
        <div class="fld"><label for="pr-turno">Nuevo turno</label><select id="pr-turno">${Object.keys(c.turnos).map(t=>`<option ${nx.turno===t?"selected":""}>${t}</option>`).join("")}</select></div>
      </div>
      <div class="err" id="pr-err"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn pri">Rolar plan</button></div>
    </form></div></div>`;
  const close=()=>root.innerHTML="", err=m=>document.getElementById("pr-err").textContent=m;
  document.getElementById("pr-x").onclick=close;
  document.getElementById("f-pr").onsubmit=async e=>{e.preventDefault();
    const fecha=ffv("pr-fecha"), turno=ffv("pr-turno");
    if(shiftStart(fecha,turno)<=shiftStart(p.fecha,p.turno)) return err("Elige un turno posterior al actual.");
    const btn=e.target.querySelector("button.pri"); btn.disabled=true;
    // Los surtidos ya confirmados quedan ligados a la fecha del plan; si ya hay alguno, el plan ya arrancó.
    let usados=0; try{ usados=Object.keys(await Store.fetch("surtidos",{field:"planId",value:p._id})).length; }catch(x){ btn.disabled=false; return err("No se pudo comprobar los surtidos del plan. Revisa la conexión."); }
    if(usados){ btn.disabled=false; return err(`Ya tiene ${usados} surtido${usados>1?"s":""} confirmado${usados>1?"s":""}: el plan ya arrancó y no se puede rolar.`); }
    const next=Object.assign({},p,{fecha,turno,original:o,historial:[...(p.historial||[]),histEntry("roló",{de:p.fecha+" "+p.turno,a:fecha+" "+turno})]});
    if(await safeWrite(()=>Store.set("plan",p._id,next))){ close(); toast(`${p.ensamble} rolado a ${fecha} ${turno}.`); } else btn.disabled=false;
  };
}
function openPlanEdit(p){
  const root=document.getElementById("modal-root"), c=cfg(), req=needsApproval(p);
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="pe-t">
    <div class="ph"><h3 id="pe-t">Editar plan</h3><button class="btn ghost" id="pe-x">Cancelar</button></div>
    <form class="pb" id="f-pe">
      <div class="note"><b class="mono">${esc(p.ensamble)}</b> · ${esc(p.fecha)}${req?`<br>Inicia en menos de ${fmtHoras(c.anticipacion)}: el cambio se envía a <b>aprobación de Gerencia</b> y el plan vigente no cambia hasta aprobarse.`:""}</div>
      <div class="row">
        <div class="fld"><label for="pe-wo">WO</label><input id="pe-wo" class="w-s" value="${esc(p.wo||"")}" required autocomplete="off" placeholder="CTI002647" style="text-transform:uppercase"></div>
        <div class="fld"><label for="pe-cant">Cantidad</label><input id="pe-cant" type="number" min="1" class="w-s" value="${esc(p.cantidad)}" required></div>
        <div class="fld"><label for="pe-uph">UPH</label><input id="pe-uph" type="number" min="1" class="w-xs" value="${esc(p.uph||"")}" placeholder="${S.bom[safeId(p.ensamble)]?.uph?"BOM":""}"></div>
        <div class="fld"><label for="pe-turno">Turno</label><select id="pe-turno">${Object.keys(c.turnos).map(t=>`<option ${p.turno===t?"selected":""}>${t}</option>`).join("")}</select></div>
        <div class="fld"><label for="pe-linea">Línea</label><input id="pe-linea" class="w-s" value="${esc(p.linea)}" required></div>
      </div>
      <div class="err" id="pe-err"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn pri">${req?"Enviar a aprobación":"Guardar cambios"}</button></div>
    </form></div></div>`;
  const close=()=>root.innerHTML="";
  document.getElementById("pe-x").onclick=close;
  document.getElementById("f-pe").onsubmit=async e=>{e.preventDefault();
    const nv={wo:normWO(ffv("pe-wo")),cantidad:Number(ffv("pe-cant")),uph:Number(ffv("pe-uph"))||null,turno:ffv("pe-turno"),linea:ffv("pe-linea")};
    const cambios={}; Object.keys(nv).forEach(k=>{ if((p[k]??null)!==nv[k]) cambios[k]=nv[k]; });
    if(!Object.keys(cambios).length) return close();
    if(!validWO(nv.wo)) return document.getElementById("pe-err").textContent="Captura la WO del ensamble (letras y números, p. ej. CTI002647).";
    if(!planUph(Object.assign({},p,nv))) return document.getElementById("pe-err").textContent=`Captura el UPH de ${p.ensamble}.`;
    const req=needsApproval(p,Object.assign({},p,nv));
    const next=req?Object.assign({},p,{pendiente:solicitud("cambio",{cambios})})
      :Object.assign({},p,cambios,{historial:[...(p.historial||[]),histEntry("cambio",{cambios})]});
    if(await safeWrite(()=>Store.set("plan",p._id,next))){ close(); toast(req?"Cambio enviado a aprobación de Gerencia.":"Plan actualizado."); }
  };
}
