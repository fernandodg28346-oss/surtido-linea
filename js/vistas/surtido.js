/* ===================== Surtido ===================== */
function viewSurtido(app){
  const c=cfg(), now=Date.now();
  const plans=activePlans().filter(p=>p.fecha===S.sel.fecha);
  const lineas=[...new Set(plans.map(p=>p.linea))].sort();
  if(S.sel.linea && !lineas.includes(S.sel.linea)) S.sel.linea="";
  const shown=plans.filter(p=>(!S.sel.turno||p.turno===S.sel.turno)&&(!S.sel.linea||p.linea===S.sel.linea));
  // agrupa por línea+estación
  const stations={}; const errors=[]; let tot=0,done=0,due=0,next=null;
  shown.forEach(p=>{ const r=computeItems(p); if(r.error) errors.push(r.error);
    r.items.forEach(it=>{ const key=p.linea+"|"+it.estacion;
      const st=stations[key]=stations[key]||{linea:p.linea,estacion:it.estacion,rows:[]};
      const statuses=it.trips.map(t=>({t,s:tripStatus(t,now)}));
      tot+=statuses.length; done+=statuses.filter(x=>x.s.done).length; due+=statuses.filter(x=>x.s.key==="due").length;
      const nxt=statuses.find(x=>!x.s.done); if(nxt&&nxt.t.at&&(!next||nxt.t.at<next)) next=nxt.t.at;
      st.rows.push({p,it,statuses,nxt});
    });
  });
  const stList=Object.values(stations).sort((a,b)=>(a.linea+a.estacion).localeCompare(b.linea+b.estacion,undefined,{numeric:true}));
  const atOf=r=>r.nxt&&r.nxt.t.at?r.nxt.t.at.getTime():Infinity;
  stList.forEach(s=>s.rows.sort((a,b)=>atOf(a)-atOf(b)));
  const ctlLines=[...new Set(shown.map(p=>p.linea))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  app.innerHTML=`
  <div class="view-head"><div><h2>Surtido de línea</h2><p>NP a surtir por estación según el plan. Punto de reorden al ${c.pct}% de la capacidad de la estación; cada surtido repone el ${100-c.pct}%. ${can.confirm()?"Confirma cada surtido con tu gafete y el de quien recibe.":""}</p></div></div>
  <div class="filters">
    <div class="fld"><label for="s-fecha">Fecha</label><input type="date" id="s-fecha" value="${S.sel.fecha}"></div>
    <div class="fld"><label for="s-turno">Turno</label><select id="s-turno"><option value="">Todos</option>${Object.keys(c.turnos).map(t=>`<option ${S.sel.turno===t?"selected":""}>${t}</option>`).join("")}</select></div>
    <div class="fld"><label for="s-linea">Línea</label><select id="s-linea"><option value="">Todas</option>${lineas.map(l=>`<option ${S.sel.linea===l?"selected":""}>${esc(l)}</option>`).join("")}</select></div>
    <span class="muted small" style="margin-left:auto">Actualizado ${fmtT(new Date())}</span>
  </div>
  <div class="summary">
    <div><div class="lbl">Surtidos programados</div><div class="v">${tot}</div></div>
    <div><div class="lbl">Confirmados</div><div class="v ok">${done}</div></div>
    <div><div class="lbl">Vencidos</div><div class="v ${due?"bad":""}">${due}</div></div>
    <div><div class="lbl">Siguiente surtido</div><div class="v">${next?fmtT(next):"—"}</div></div>
  </div>
  ${errors.length?`<div class="note" style="margin-bottom:16px;border-color:var(--bad);color:var(--bad)">${[...new Set(errors)].map(esc).join(" · ")}. Corrígelo en BOM o Plan.</div>`:""}
  ${ctlLines.length?`<div class="panel" style="margin-bottom:16px"><div class="ph"><h3>Control de línea</h3><span class="muted small">Paros y arranques recorren el programa de surtido</span></div>
    ${ctlLines.map(l=>lineCtl(l,shown.filter(p=>p.linea===l),now)).join("")}</div>`:""}
  ${stList.length?`<div class="stations">${stList.map(st=>`
    <section class="panel station"><div class="ph"><h3><span class="st-id">${esc(st.linea)}</span> Estación ${esc(st.estacion)}</h3><span class="muted small">${st.rows.length} NP</span></div>
    ${st.rows.map(r=>npRow(r,now)).join("")}</section>`).join("")}</div>`
  :shown.length?"":`<div class="panel empty">No hay plan para ${esc(S.sel.fecha)}${S.sel.turno?" turno "+esc(S.sel.turno):""}. ${can.editPlan()?"Cárgalo en la pestaña Plan de producción.":"Pide al planeador que cargue el plan."}</div>`}`;
  document.getElementById("s-fecha").onchange=e=>{S.sel.fecha=e.target.value;render();};
  document.getElementById("s-turno").onchange=e=>{S.sel.turno=e.target.value;render();};
  document.getElementById("s-linea").onchange=e=>{S.sel.linea=e.target.value;render();};
  app.querySelectorAll("[data-confirm]").forEach(b=>b.onclick=()=>{
    const [pid,idx,est,np]=JSON.parse(b.dataset.confirm); const p=S.plan[pid];
    const it=computeItems(p).items.find(x=>x.estacion===est&&x.np===np); openConfirm(p,it,it.trips.find(t=>t.k===idx));
  });
  app.querySelectorAll("[data-recount]").forEach(b=>b.onclick=()=>{
    const [pid,est,np]=JSON.parse(b.dataset.recount); const p=S.plan[pid];
    openRecount(p,computeItems(p).items.find(x=>x.estacion===est&&x.np===np));
  });
  bindLineOps(app);
}
// Fila de control por línea: paro/reanudación y arranque de cada ensamble del plan.
function lineCtl(linea,plans,now){
  const paro=activeStop(S.sel.fecha,linea), ops=can.ops();
  const paros=lineStops(S.sel.fecha,linea).filter(e=>e.fin), perdido=paros.reduce((n,e)=>n+(e.fin-e.inicio),0)/60000;
  return `<div class="ctl-row">
    <div class="ctl-line"><span class="st-id">${esc(linea)}</span>
      ${paro?`<span class="pill p-warn">Detenida desde ${fmtT(new Date(paro.inicio))} · ${ago((now-paro.inicio)/60000)}</span>${paro.motivo?`<span class="small muted">${esc(paro.motivo)}</span>`:""}`:'<span class="pill p-ok">En operación</span>'}
      ${paros.length?`<span class="small muted">${paros.length} paro${paros.length>1?"s":""} hoy · ${ago(perdido)}</span>`:""}</div>
    <div>${ops?stopBtn(S.sel.fecha,linea):""}</div>
    <div class="ctl-plans">${plans.map(p=>{
      const confirmed=Object.values(S.surtidos).some(r=>r.planId===p._id);
      const act=!ops?"":!planStart(p)?`<button class="btn ok" data-start-plan="${p._id}">Iniciar ensamble</button>`
        :(!p.inicioReal&&!confirmed?`<button class="btn ghost" data-unstart-plan="${p._id}" title="El ensamble no arrancó al inicio del turno: deja sus surtidos en espera hasta que se inicie">No ha arrancado</button>`:"");
      return `<div class="ctl-plan"><span class="grow"><b class="mono">${esc(p.ensamble)}</b> <span class="muted">·${p.wo?` WO <span class="mono">${esc(p.wo)}</span> ·`:""} ${esc(p.turno)} · ${fmtN(p.cantidad)} pzs</span></span>${startLabel(p)}${act}</div>`;
    }).join("")}</div>
  </div>`;
}
function startLabel(p){
  if(p.inicioReal) return `<span class="pill p-acc">Iniciado ${fmtT(new Date(p.inicioReal))}</span>`;
  if(p.arranque==="manual") return '<span class="pill p-idle">Esperando arranque</span>';
  return `<span class="small muted">Inicio de turno ${esc(cfg().turnos[p.turno]?.inicio||"")}</span>`;
}
function stopBtn(fecha,linea){
  const paro=activeStop(fecha,linea);
  return paro?`<button class="btn ok" data-resume="${paro._id}">Reanudar línea</button>`
    :`<button class="btn" data-stop="${esc(linea)}" style="border-color:var(--warn);color:var(--warn)">Línea detenida</button>`;
}
function bindLineOps(app){
  app.querySelectorAll("[data-stop]").forEach(b=>b.onclick=()=>openStop(b.dataset.stop));
  app.querySelectorAll("[data-resume]").forEach(b=>b.onclick=()=>{
    const e=S.eventos[b.dataset.resume]; if(!e) return;
    confirmBox(`¿Reanudar la línea ${e.linea}? Estuvo detenida ${ago((Date.now()-e.inicio)/60000)}; los surtidos pendientes se recorren ese tiempo.`,"Reanudar",async()=>{
      if(await safeWrite(()=>Store.set("eventos",e._id,Object.assign({},e,{fin:Date.now(),finPor:S.me.gafete,finPorNombre:S.me.nombre})))) toast(`Línea ${e.linea} reanudada.`);
    });
  });
  app.querySelectorAll("[data-start-plan]").forEach(b=>b.onclick=()=>{
    const p=S.plan[b.dataset.startPlan];
    confirmBox(`¿Iniciar el ensamble ${p.ensamble} en ${p.linea} ahora (${fmtT(new Date())})? El primer surtido, con la estación llena, queda programado a esta hora.`,"Iniciar ensamble",async()=>{
      if(await safeWrite(()=>Store.set("plan",p._id,Object.assign({},p,{arranque:"manual",inicioReal:Date.now(),inicioPor:S.me.gafete,inicioPorNombre:S.me.nombre})))) toast(`${p.ensamble} iniciado en ${p.linea}.`);
    });
  });
  app.querySelectorAll("[data-unstart-plan]").forEach(b=>b.onclick=()=>{
    const p=S.plan[b.dataset.unstartPlan];
    confirmBox(`¿${p.ensamble} no arrancó al inicio del turno? Sus surtidos quedan en espera hasta que alguien presione "Iniciar ensamble".`,"Dejar en espera",
      ()=>safeWrite(()=>Store.set("plan",p._id,Object.assign({},p,{arranque:"manual",inicioReal:null}))));
  });
}
function openStop(linea){
  const root=document.getElementById("modal-root");
  const motivos=["Falla de máquina","Falta de material","Calidad","Cambio de modelo","Junta o comida","Otro"];
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="st-t">
    <div class="ph"><h3 id="st-t">Línea ${esc(linea)} detenida</h3><button class="btn ghost" id="st-x">Cancelar</button></div>
    <div class="pb">
      <div class="note">Desde ahora (${fmtT(new Date())}) los surtidos de la línea quedan en pausa y no se pueden confirmar. Al reanudar, los pendientes se recorren el tiempo que estuvo detenida.</div>
      <div class="fld"><label for="st-m">Motivo</label><select id="st-m">${motivos.map(m=>`<option>${m}</option>`).join("")}</select></div>
      <div class="fld"><label for="st-n">Nota <span class="muted">(opcional)</span></label><input id="st-n" autocomplete="off"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn pri" id="st-ok">Registrar paro</button></div>
    </div></div></div>`;
  const close=()=>root.innerHTML="";
  document.getElementById("st-x").onclick=close;
  document.getElementById("st-ok").onclick=async e=>{
    if(activeStop(S.sel.fecha,linea)){ close(); return toast(`La línea ${linea} ya está detenida.`); }
    e.target.disabled=true; const nota=ffv("st-n");
    const ev={tipo:"paro",fecha:S.sel.fecha,linea,inicio:Date.now(),fin:null,motivo:ffv("st-m")+(nota?" · "+nota:""),por:S.me.gafete,porNombre:S.me.nombre};
    if(await safeWrite(()=>Store.set("eventos",newId(),ev))){ close(); toast(`Paro registrado en ${linea}.`); } else e.target.disabled=false;
  };
}
function openRecount(p,it){
  const root=document.getElementById("modal-root"), now=Date.now();
  const est=estimateOnHand(it,now);
  const kDesde=it.trips.filter(t=>S.surtidos[t.id]).reduce((m,t)=>Math.max(m,t.k+1),0);
  const motivos=["Material entregado por otra área (purga)","Conteo distinto al esperado","Material dañado o retirado","Otro"];
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="rc-t">
    <div class="ph"><h3 id="rc-t">Recontar material</h3><button class="btn ghost" id="rc-x">Cancelar</button></div>
    <div class="pb">
      <div class="note"><b class="mono">${esc(it.np)}</b> · Línea <b>${esc(p.linea)}</b>, estación <b>${esc(it.estacion)}</b> · ${esc(p.ensamble)}<br>
        Estimado en estación según el programa: <b class="mono">≈ ${fmtN(est)} pzs</b> · punto de reorden ${fmtN(it.rop)} / ${fmtN(it.cap)}</div>
      <div class="fld"><label for="rc-q">Piezas contadas en la estación</label><input id="rc-q" type="number" min="0" step="1" class="badge-in" style="margin-top:0" inputmode="numeric" autocomplete="off"></div>
      <div class="fld"><label for="rc-m">Motivo</label><select id="rc-m">${motivos.map(m=>`<option>${m}</option>`).join("")}</select></div>
      <div class="fld"><label for="rc-n">Nota <span class="muted">(opcional)</span></label><input id="rc-n" autocomplete="off"></div>
      <p class="small muted" style="margin:0">Los surtidos ya confirmados se conservan; los pendientes se recalculan a partir de lo contado.</p>
      <div class="err" id="rc-err"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn pri" id="rc-ok">Guardar reconteo</button></div>
    </div></div></div>`;
  const close=()=>root.innerHTML="";
  document.getElementById("rc-x").onclick=close;
  const q=document.getElementById("rc-q"); q.focus();
  q.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); document.getElementById("rc-ok").click(); } };
  document.getElementById("rc-ok").onclick=async e=>{
    const n=Number(q.value);
    if(q.value===""||!(n>=0)) return document.getElementById("rc-err").textContent="Escribe cuántas piezas hay en la estación.";
    e.target.disabled=true; const nota=ffv("rc-n");
    const ev={tipo:"reconteo",fecha:p.fecha,planId:p._id,linea:p.linea,ensamble:p.ensamble,estacion:it.estacion,np:it.np,cantidad:Math.round(n),esperado:est,kDesde,
      ts:Date.now(),motivo:ffv("rc-m")+(nota?" · "+nota:""),por:S.me.gafete,porNombre:S.me.nombre};
    if(await safeWrite(()=>Store.insert("eventos",newId(),ev))){ close(); toast(`Reconteo guardado: ${fmtN(n)} pzs de ${it.np}. Surtidos recalculados.`); }
    else e.target.disabled=false;
  };
}
function npRow({p,it,statuses,nxt},now){
  const cls={done:"done",late:"late",due:"due",soon:"",sched:"",stop:"stop"};
  const pillOf=k=>({due:'<span class="pill p-bad">Vencido</span>',soon:'<span class="pill p-warn">Próximo</span>',sched:'<span class="pill p-idle">Programado</span>',stop:'<span class="pill p-warn">Línea detenida</span>'}[k]);
  const allDone=!nxt, rc=it.recs[it.recs.length-1];
  return `<div class="np-row">
    <div style="min-width:0"><div class="np">${esc(it.np)} <span class="muted" style="font-family:var(--f-body);font-weight:400;font-size:13px">${esc(it.desc||"")}</span></div>
      <div class="plan-line">${esc(p.ensamble)}${p.wo?` · WO <span class="mono">${esc(p.wo)}</span>`:""} · ${esc(p.turno)} · ${fmtN(p.cantidad)} pzs</div>
      <div class="np-meta"><span>Cada <b>${fmtInterval(it.intervalMin)}</b></span><span>Surtir <b>${fmtN(it.repl)}</b></span><span>Reorden en <b>${fmtN(it.rop)}</b> / ${fmtN(it.cap)}</span><span>Consumo <b>${fmtN(it.rate,1)}</b>/h</span></div></div>
    <div class="np-act">${allDone?'<span class="pill p-ok">Completo</span>':`${pillOf(nxt.s.key)}<span class="mono small">${nxt.t.at?fmtT(nxt.t.at):"En pausa"} · ${fmtN(nxt.t.qty)} pzs</span>
      ${can.confirm()&&nxt.t.at?`<button class="btn ${nxt.s.key==="due"?"ok":"pri"}" data-confirm='${esc(JSON.stringify([p._id,nxt.t.k,it.estacion,it.np]))}'>Confirmar surtido</button>`:""}`}
      ${can.ops()?`<button class="btn ghost" data-recount='${esc(JSON.stringify([p._id,it.estacion,it.np]))}'>Recontar material</button>`:""}</div>
    ${rc?`<div class="recount-line">Reconteo ${fmtT(new Date(rc.ts))}: ${fmtN(rc.cantidad)} pzs (esperado ≈ ${fmtN(rc.esperado)}) · ${esc(rc.motivo)} · ${esc(rc.porNombre)}</div>`:""}
    <div class="trips" aria-label="Surtidos del turno">${statuses.map(x=>`<span class="trip ${cls[x.s.key]} ${nxt&&x===nxt?"next":""}" title="${x.s.done?"Surtió "+esc(x.s.done.surtioNombre)+" · recibió "+esc(x.s.done.recibioNombre)+" · "+fmtT(new Date(x.s.done.ts)):x.t.at?"Programado "+fmtT(x.t.at):"En pausa: línea detenida"}">${x.s.done&&!x.t.at?fmtT(new Date(x.s.done.ts)):x.t.at?fmtT(x.t.at):"pausa"}</span>`).join("")}</div>
  </div>`;
}
const fmtInterval=m=>m>=60?(Math.floor(m/60)+" h "+String(Math.round(m%60)).padStart(2,"0")+" min"):Math.max(1,Math.round(m))+" min";

function openConfirm(p,it,trip){
  const root=document.getElementById("modal-root");
  // Quien surte es el materialista con sesión; quien recibe solo escanea su gafete y con eso queda registrado.
  const s=S.me;
  if(!trip||!trip.at) return toast("La línea está detenida: el surtido queda en pausa hasta reanudarla.");
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="mc-t">
    <div class="ph"><h3 id="mc-t">Confirmar surtido</h3><button class="btn ghost" id="mc-x">Cancelar</button></div>
    <div class="pb">
      <div class="note"><b class="mono">${esc(it.np)}</b> · ${fmtN(trip.qty)} pzs → Línea <b>${esc(p.linea)}</b>, estación <b>${esc(it.estacion)}</b>${p.wo?` · WO <b class="mono">${esc(p.wo)}</b>`:""}<br>Programado ${fmtT(trip.at)} · surtido ${it.trips.indexOf(trip)+1} de ${it.trips.length} · Surte <b>${esc(s.nombre)}</b></div>
      <div class="fld"><label for="mc-r">Quien recibe: escanea su gafete</label><input id="mc-r" class="badge-in" style="margin-top:0" autocomplete="off" inputmode="numeric" placeholder="••••••"></div>
      <div class="err" id="mc-err"></div>
    </div></div></div>`;
  const close=()=>root.innerHTML="";
  document.getElementById("mc-x").onclick=close;
  const inp=document.getElementById("mc-r"), err=document.getElementById("mc-err");
  inp.focus();
  inp.onkeydown=async e=>{
    if(e.key!=="Enter") return; e.preventDefault(); err.textContent="";
    const r=userByBadge(inp.value);
    const fail=m=>{ err.textContent=m; inp.select(); };
    if(!r) return fail(`El gafete ${inp.value} no está registrado. Regístralo en la sección Gafetes.`);
    if(r.gafete===s.gafete) return fail("Quien recibe debe ser una persona distinta a quien surte.");
    const rec={planId:p._id,fecha:p.fecha,turno:p.turno,linea:p.linea,ensamble:p.ensamble,wo:p.wo||"",estacion:it.estacion,np:it.np,k:trip.k,
      programado:trip.at.getTime(),cantidad:trip.qty,ts:Date.now(),surtio:s.gafete,surtioNombre:s.nombre,recibio:r.gafete,recibioNombre:r.nombre};
    inp.disabled=true;
    const ok=await safeWrite(()=>Store.insert("surtidos",trip.id,rec));
    if(ok){ close(); toast(`Surtido registrado: ${it.np} en ${p.linea}/${it.estacion}. Recibió ${r.nombre}.`); }
    else { inp.disabled=false; inp.select(); }
  };
}
