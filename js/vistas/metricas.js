/* ===================== Métricas =====================
   Periodo por día (en vivo con los datos del día seleccionado), semana ISO o rango de fechas (hasta 62 días,
   leído de la base y refrescado cada 30 s si incluye hoy), con filtros de turno y línea. Todo se calcula con dayTrips. */
// Semana ISO "AAAA-Www" de una fecha AAAA-MM-DD, y sus fechas de lunes a domingo.
function isoWeek(f){
  const d=new Date(f+"T00:00:00"); d.setDate(d.getDate()+3-(d.getDay()+6)%7);
  const y=d.getFullYear(), w1=new Date(y,0,4);
  return y+"-W"+String(1+Math.round(((d-w1)/864e5-3+(w1.getDay()+6)%7)/7)).padStart(2,"0");
}
function weekDates(w){
  const m=/^(\d{4})-W(\d{2})$/.exec(w||""); if(!m) return null;
  const jan4=new Date(Number(m[1]),0,4), mon=new Date(jan4); mon.setDate(jan4.getDate()-(jan4.getDay()+6)%7+(Number(m[2])-1)*7);
  const f=mon.getFullYear()+"-"+String(mon.getMonth()+1).padStart(2,"0")+"-"+String(mon.getDate()).padStart(2,"0");
  return {desde:f,hasta:addDays(f,6)};
}
// Últimas 26 semanas (y la seleccionada, si es más antigua), de la más reciente a la más antigua.
function weekOptions(sel){
  const ws=[]; for(let i=0;i<26;i++) ws.push(isoWeek(addDays(today(),-7*i)));
  if(sel&&!ws.includes(sel)) ws.push(sel);
  return ws.map(w=>{ const r=weekDates(w); return `<option value="${w}" ${w===sel?"selected":""}>Sem ${Number(w.slice(6))} · ${fmtDia(r.desde)} – ${fmtDia(r.hasta)}</option>`; }).join("");
}
// Surtidos y eventos de un rango, en caché; se vuelven a leer si cambia el rango o, si incluye hoy, cada 30 s.
const MET_RANGE={key:null,data:null,loading:false,error:"",at:0};
function metRangeData(desde,hasta){
  const R=MET_RANGE, key=desde+"|"+hasta, stale=R.key!==key||(hasta>=today()&&Date.now()-R.at>30000);
  if(stale&&!R.loading){
    R.loading=true;
    Promise.all([Store.fetchRange("surtidos","fecha",desde,hasta),Store.fetchRange("eventos","fecha",desde,hasta)])
      .then(([surtidos,eventos])=>{ R.data={surtidos,eventos}; R.error=""; })
      .catch(e=>{ R.error="No se pudieron leer los datos ("+(e.message||e.code)+")."; R.data=null; })
      .finally(()=>{ R.key=key; R.at=Date.now(); R.loading=false; if(S.view==="metricas") render(true); });
  }
  return R.key===key?R:{data:null,loading:true,error:""};
}

function viewMetricas(app){
  const c=cfg(), now=Date.now();
  const M=S.met=S.met||{modo:"dia",semana:isoWeek(today()),desde:addDays(today(),-6),hasta:today(),linea:""};
  const per=M.modo==="dia"?{desde:S.sel.fecha,hasta:S.sel.fecha}:M.modo==="semana"?weekDates(M.semana):{desde:M.desde,hasta:M.hasta};
  const dias=per&&per.desde<=per.hasta?datesBetween(per.desde,per.hasta):[], rangoOk=dias.length>0&&dias.length<=MAX_DIAS;
  const lineas=[...new Set([...lineasCat(),...Object.values(S.plan).map(p=>p.linea)])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  let src=null, msg="";
  if(!rangoOk) msg=per&&per.desde>per.hasta?"La fecha inicial debe ser anterior o igual a la final.":`Elige un periodo de hasta ${MAX_DIAS} días.`;
  else if(M.modo==="dia") src={surtidos:S.surtidos,eventos:S.eventos};
  else { const R=metRangeData(per.desde,per.hasta); if(R.error) msg=R.error; else if(R.data) src=R.data; else msg="Cargando datos del periodo…"; }
  const filtros=`<div class="filters">
    <div class="fld"><label for="m-modo">Periodo</label><select id="m-modo">${[["dia","Día"],["semana","Semana"],["rango","Rango de fechas"]].map(([k,v])=>`<option value="${k}" ${M.modo===k?"selected":""}>${v}</option>`).join("")}</select></div>
    ${M.modo==="dia"?`<div class="fld"><label for="m-fecha">Fecha</label><input type="date" id="m-fecha" value="${S.sel.fecha}"></div>`
      :M.modo==="semana"?`<div class="fld"><label for="m-semana">Semana</label><select id="m-semana">${weekOptions(M.semana)}</select></div>`
      :`<div class="fld"><label for="m-desde">Desde</label><input type="date" id="m-desde" value="${M.desde}"></div><div class="fld"><label for="m-hasta">Hasta</label><input type="date" id="m-hasta" value="${M.hasta}"></div>`}
    <div class="fld"><label for="m-turno">Turno</label><select id="m-turno"><option value="">Todos</option>${Object.keys(c.turnos).map(t=>`<option ${S.sel.turno===t?"selected":""}>${t}</option>`).join("")}</select></div>
    <div class="fld"><label for="m-linea">Línea</label><select id="m-linea"><option value="">Todas</option>${lineas.map(l=>`<option ${M.linea===l?"selected":""}>${esc(l)}</option>`).join("")}</select></div>
  </div>`;
  const head=`<div class="view-head"><div><h2>Métricas de surtido</h2><p>Cumplimiento contra el programa calculado del plan. "A tiempo" = confirmado dentro de ${c.tolerancia} min de la hora programada; "No surtido" = ya tocaba y no se confirmó.</p></div></div>`;
  if(!src){ app.innerHTML=head+filtros+`<div class="panel empty">${esc(msg)}</div>`; bindMetricas(M); return; }

  const okF=x=>(!S.sel.turno||x.turno===S.sel.turno)&&(!M.linea||x.linea===M.linea);
  const porDia={}, evDia={};
  Object.values(src.surtidos).forEach(r=>{(porDia[r.fecha]=porDia[r.fecha]||{})[r._id]=r;});
  Object.values(src.eventos).forEach(e=>{(evDia[e.fecha]=evDia[e.fecha]||{})[e._id]=e;});
  const trips=dias.flatMap(f=>dayTrips(f,porDia[f]||{},evDia[f]||{},now)).filter(okF);
  const recs=Object.values(src.surtidos).filter(r=>dias.includes(r.fecha)&&okF(r)).sort((a,b)=>b.ts-a.ts);
  const evs=Object.values(src.eventos).filter(e=>dias.includes(e.fecha)&&(!M.linea||e.linea===M.linea)&&(!S.sel.turno||e.tipo==="paro"||S.plan[e.planId]?.turno===S.sel.turno)).sort((a,b)=>(b.ts||b.inicio)-(a.ts||a.inicio));
  const n={ok:0,late:0,miss:0,sched:0}; trips.forEach(t=>{ if(t.estado in n) n[t.estado]++; else if(t.estado==="stop") n.sched++; });
  const tocaban=n.ok+n.late+n.miss, pct=(a,b)=>b?Math.round(a/b*100):0;
  const delays=trips.filter(t=>t.retraso!=null).map(t=>t.retraso), avgDelay=delays.length?delays.reduce((a,b)=>a+b,0)/delays.length:0;
  const catsBy=(keyFn,order,label)=>{ const g=Object.fromEntries(tally(trips,keyFn).map(x=>[x.key,x])); return order.filter(k=>g[k]).map(k=>Object.assign({label:label?label(k):k},g[k])); };
  const turnoCats=catsBy(t=>t.turno,Object.keys(c.turnos));
  const lineaCats=catsBy(t=>t.linea,[...new Set(trips.map(t=>t.linea))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})));
  const diaCats=dias.length>1?catsBy(t=>t.fecha,dias,fmtDia):[];
  const byMat={}; recs.forEach(r=>{const m=byMat[r.surtio]=byMat[r.surtio]||{nombre:r.surtioNombre,n:0,pzs:0,late:0}; m.n++; m.pzs+=Number(r.cantidad)||0; if(isLate(r)) m.late++;});
  const tardias=recs.filter(isLate).sort((a,b)=>(b.ts-b.programado)-(a.ts-a.programado));
  const varios=dias.length>1, fh=r=>(varios?fmtDia(r.fecha)+" ":"")+fmtT(new Date(r.ts));
  const resumen=(titulo,cats,etiq)=>`<div class="panel"><div class="ph"><h3>${titulo}</h3></div><div class="tbl-wrap"><table>
      <thead><tr><th>${etiq}</th><th class="num">A tiempo</th><th class="num">Tarde</th><th class="num">No surtidos</th><th class="num">% a tiempo</th></tr></thead>
      <tbody>${cats.length?cats.map(t=>{const k=t.ok+t.late+t.miss;return`<tr><td><b>${esc(t.label)}</b></td><td class="num">${t.ok}</td><td class="num">${t.late}</td><td class="num">${t.miss}</td><td class="num">${pct(t.ok,k)}%</td></tr>`}).join(""):`<tr><td colspan="5" class="empty">Sin surtidos que ya tocaran.</td></tr>`}</tbody></table></div></div>`;
  app.innerHTML=head+filtros+`
  <div class="kpis">
    <div class="panel kpi"><div class="lbl">Cumplimiento</div><div class="v">${pct(n.ok+n.late,tocaban)}%</div><div class="s">${fmtN(n.ok+n.late)} de ${fmtN(tocaban)} surtidos que ya tocaban</div><div class="meter"><i style="width:${pct(n.ok+n.late,tocaban)}%"></i></div></div>
    <div class="panel kpi"><div class="lbl">A tiempo</div><div class="v">${pct(n.ok,n.ok+n.late)}%</div><div class="s">${fmtN(n.ok)} de ${fmtN(n.ok+n.late)} confirmados</div><div class="meter"><i style="width:${pct(n.ok,n.ok+n.late)}%;background:var(--ok)"></i></div></div>
    <div class="panel kpi"><div class="lbl">No surtidos</div><div class="v" style="${n.miss?"color:var(--bad)":""}">${fmtN(n.miss)}</div><div class="s">Ya tocaban y no se confirmaron</div></div>
    <div class="panel kpi"><div class="lbl">Retraso promedio</div><div class="v">${delays.length?fmtN(avgDelay,1):"—"}<span style="font-size:18px"> min</span></div><div class="s">${fmtN(trips.length)} surtidos programados en el periodo</div></div>
  </div>
  ${varios?`<div class="panel" style="margin-bottom:16px"><div class="ph"><h3>Por día</h3><span class="small muted">${fmtDia(per.desde)} – ${fmtDia(per.hasta)}</span></div><div class="pb">${barChart(diaCats,{titulo:"Surtidos por día",alto:200})}</div></div>`:""}
  <div class="grid2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-bottom:16px">
    <div class="panel"><div class="ph"><h3>Por turno</h3><span class="small muted">Surtidos que ya tocaban</span></div><div class="pb">${barChart(turnoCats,{titulo:"Surtidos por turno",alto:200})}</div></div>
    ${resumen("Resumen por turno",turnoCats,"Turno")}
  </div>
  <div class="grid2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-bottom:16px">
    <div class="panel"><div class="ph"><h3>Por línea</h3><span class="small muted">Surtidos que ya tocaban</span></div><div class="pb">${barChart(lineaCats,{titulo:"Surtidos por línea",alto:200})}</div></div>
    ${resumen("Resumen por línea",lineaCats,"Línea")}
  </div>
  <div class="panel"><div class="ph"><h3>Por materialista</h3></div><div class="tbl-wrap"><table>
    <thead><tr><th>Materialista</th><th class="num">Surtidos</th><th class="num">Piezas</th><th class="num">Tarde</th></tr></thead>
    <tbody>${Object.keys(byMat).length?Object.entries(byMat).sort((a,b)=>b[1].n-a[1].n).map(([g,m])=>`<tr><td>${esc(m.nombre)} <span class="muted mono small">${esc(g)}</span></td><td class="num">${m.n}</td><td class="num">${fmtN(m.pzs)}</td><td class="num">${m.late}</td></tr>`).join(""):`<tr><td colspan="4" class="empty">Sin surtidos confirmados.</td></tr>`}</tbody></table></div></div>
  <div class="panel" style="margin-top:16px"><div class="ph"><h3>Entregas tardías</h3><span class="muted small">${tardias.length} de ${recs.length} confirmados · más de ${c.tolerancia} min de retraso</span></div><div class="tbl-wrap"><table>
    <thead><tr>${varios?"<th>Fecha</th>":""}<th>Turno</th><th>Prog.</th><th>Surtido</th><th class="num">Retraso</th><th>Línea</th><th>Estación</th><th>NP</th><th>WO</th><th>Surtió</th></tr></thead>
    <tbody>${tardias.length?tardias.slice(0,100).map(r=>`<tr>${varios?`<td class="mono">${esc(r.fecha)}</td>`:""}<td>${esc(r.turno)}</td><td class="mono muted">${fmtT(new Date(r.programado))}</td><td class="mono">${fmtT(new Date(r.ts))}</td><td class="num" style="color:var(--warn);font-weight:600">${ago((r.ts-r.programado)/60000)}</td><td>${esc(r.linea)}</td><td>${esc(r.estacion)}</td><td class="mono">${esc(r.np)}</td><td class="mono">${esc(r.wo||S.plan[r.planId]?.wo||"—")}</td><td>${esc(r.surtioNombre)}</td></tr>`).join(""):`<tr><td colspan="${varios?10:9}" class="empty">Sin entregas tardías en el periodo.</td></tr>`}</tbody></table></div></div>
  <div class="panel" style="margin-top:16px"><div class="ph"><h3>Bitácora de surtidos</h3><span class="muted small">${recs.length} registro${recs.length===1?"":"s"}${recs.length>200?" · se muestran 200; el detalle completo está en Reportes":""}</span></div><div class="tbl-wrap"><table>
    <thead><tr><th>Hora</th><th>Prog.</th><th>Línea</th><th>Estación</th><th>NP</th><th class="num">Cant.</th><th>Surtió</th><th>Recibió</th><th>Estado</th></tr></thead>
    <tbody>${recs.length?recs.slice(0,200).map(r=>`<tr><td class="mono">${fh(r)}</td><td class="mono muted">${fmtT(new Date(r.programado))}</td><td>${esc(r.linea)}</td><td>${esc(r.estacion)}</td><td class="mono">${esc(r.np)}</td><td class="num">${fmtN(r.cantidad)}</td><td>${esc(r.surtioNombre)}</td><td>${esc(r.recibioNombre)}</td><td>${isLate(r)?'<span class="pill p-warn">Tarde</span>':'<span class="pill p-ok">A tiempo</span>'}</td></tr>`).join(""):`<tr><td colspan="9" class="empty">Aún no hay surtidos confirmados en el periodo.</td></tr>`}</tbody></table></div></div>
  <div class="panel" style="margin-top:16px"><div class="ph"><h3>Paros y reconteos</h3><span class="muted small">${evs.length} registro${evs.length===1?"":"s"}</span></div><div class="tbl-wrap"><table>
    <thead><tr><th>Hora</th><th>Tipo</th><th>Línea</th><th>Detalle</th><th>Motivo</th><th>Registró</th></tr></thead>
    <tbody>${evs.length?evs.map(e=>e.tipo==="paro"?`<tr><td class="mono">${(varios?fmtDia(e.fecha)+" ":"")+fmtT(new Date(e.inicio))}</td><td><span class="pill p-warn">Paro</span></td><td>${esc(e.linea)}</td>
      <td>${e.fin?`Hasta ${fmtT(new Date(e.fin))} · ${ago((e.fin-e.inicio)/60000)}`:`<b style="color:var(--warn)">En curso</b> · ${ago((now-e.inicio)/60000)}`}</td><td>${esc(e.motivo||"")}</td><td>${esc(e.porNombre||"")}</td></tr>`
      :`<tr><td class="mono">${(varios?fmtDia(e.fecha)+" ":"")+fmtT(new Date(e.ts))}</td><td><span class="pill p-acc">Reconteo</span></td><td>${esc(e.linea)}</td>
      <td><span class="mono">${esc(e.estacion)} · ${esc(e.np)}</span> · ${fmtN(e.cantidad)} pzs (esperado ≈ ${fmtN(e.esperado)})</td><td>${esc(e.motivo||"")}</td><td>${esc(e.porNombre||"")}</td></tr>`).join("")
      :`<tr><td colspan="6" class="empty">Sin paros ni reconteos en el periodo.</td></tr>`}</tbody></table></div></div>`;
  bindMetricas(M);
}
function bindMetricas(M){
  const on=(id,fn)=>{ const el=document.getElementById(id); if(el) el.onchange=e=>{ fn(e.target.value); render(); }; };
  on("m-modo",v=>M.modo=v);
  on("m-fecha",v=>{ if(v) S.sel.fecha=v; });
  on("m-semana",v=>{ if(v) M.semana=v; });
  on("m-desde",v=>{ if(v) M.desde=v; });
  on("m-hasta",v=>{ if(v) M.hasta=v; });
  on("m-turno",v=>S.sel.turno=v);
  on("m-linea",v=>M.linea=v);
}
