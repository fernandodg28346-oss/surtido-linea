/* ===================== Reportes =====================
   Rango de fechas (hasta 62 días) con exportación a Excel o CSV. Los surtidos y eventos del rango se leen
   al cambiar las fechas; el cumplimiento se recalcula día por día con el mismo motor del surtido (dayTrips). */
const REPORTES={
  cumplimiento:"Cumplimiento por día y turno",
  surtidos:"Surtidos confirmados",
  tardias:"Entregas tardías",
  eventos:"Paros y reconteos",
  plan:"Plan de producción (con WO)"
};
const MAX_DIAS=62;
function addDays(f,n){ const d=new Date(f+"T00:00:00"); d.setDate(d.getDate()+n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function datesBetween(a,b){ const out=[]; for(let f=a;f<=b&&out.length<=MAX_DIAS;f=addDays(f,1)) out.push(f); return out; }
const fmtDia=f=>new Date(f+"T00:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short"});
const fmtHora=ts=>ts?fmtT(new Date(ts)):"";
const isLate=r=>r.ts-r.programado>cfg().tolerancia*60000;

function viewReportes(app){
  const R=S.rep=S.rep||{hasta:today(),desde:addDays(today(),-6),tipo:"cumplimiento",turno:"",linea:"",key:null,data:null,loading:false,error:""};
  const c=cfg(), dias=datesBetween(R.desde,R.hasta), rangoOk=R.desde<=R.hasta&&dias.length<=MAX_DIAS;
  const key=R.desde+"|"+R.hasta;
  if(rangoOk&&R.key!==key&&!R.loading){
    R.loading=true; R.error="";
    Promise.all([Store.fetchRange("surtidos","fecha",R.desde,R.hasta),Store.fetchRange("eventos","fecha",R.desde,R.hasta)])
      .then(([surtidos,eventos])=>{ R.data={surtidos,eventos}; R.key=key; })
      .catch(e=>{ R.error="No se pudieron leer los datos ("+(e.message||e.code)+")."; R.key=key; R.data=null; })
      .finally(()=>{ R.loading=false; if(S.view==="reportes") render(); });
  }
  const lineas=[...new Set(Object.values(S.plan).map(p=>p.linea))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const rep=rangoOk&&R.data&&R.key===key&&!R.loading?buildReport(R,dias):null;
  app.innerHTML=`
  <div class="view-head"><div><h2>Reportes</h2><p>Elige el periodo y el reporte. Se descarga completo en Excel o CSV con los filtros aplicados. "Tarde" = confirmado después de ${c.tolerancia} min de la hora programada.</p></div>
    <div class="row"><button class="btn" id="rp-xlsx" ${rep&&rep.rows.length?"":"disabled"}>Descargar Excel</button><button class="btn" id="rp-csv" ${rep&&rep.rows.length?"":"disabled"}>Descargar CSV</button></div></div>
  <div class="filters">
    <div class="fld"><label for="rp-tipo">Reporte</label><select id="rp-tipo">${Object.entries(REPORTES).map(([k,v])=>`<option value="${k}" ${R.tipo===k?"selected":""}>${v}</option>`).join("")}</select></div>
    <div class="fld"><label for="rp-desde">Desde</label><input type="date" id="rp-desde" value="${R.desde}"></div>
    <div class="fld"><label for="rp-hasta">Hasta</label><input type="date" id="rp-hasta" value="${R.hasta}"></div>
    <div class="fld"><label for="rp-turno">Turno</label><select id="rp-turno"><option value="">Todos</option>${Object.keys(c.turnos).map(t=>`<option ${R.turno===t?"selected":""}>${t}</option>`).join("")}</select></div>
    <div class="fld"><label for="rp-linea">Línea</label><select id="rp-linea"><option value="">Todas</option>${lineas.map(l=>`<option ${R.linea===l?"selected":""}>${esc(l)}</option>`).join("")}</select></div>
    <div class="row" style="gap:6px">${[["Hoy",0],["7 días",6],["30 días",29]].map(([l,n])=>`<button class="btn ghost" data-rango="${n}">${l}</button>`).join("")}</div>
  </div>
  ${!rangoOk?`<div class="panel empty">${R.desde>R.hasta?"La fecha inicial debe ser anterior o igual a la final.":`Elige un periodo de hasta ${MAX_DIAS} días.`}</div>`
   :R.error?`<div class="panel empty" style="color:var(--bad)">${esc(R.error)}</div>`
   :!rep?`<div class="panel empty">Cargando datos del periodo…</div>`
   :`${rep.kpis||""}${rep.chart?`<div class="panel" style="margin-bottom:16px"><div class="ph"><h3>${esc(rep.chartTitle)}</h3></div><div class="pb">${rep.chart}</div></div>`:""}
    <div class="panel"><div class="ph"><h3>${esc(REPORTES[R.tipo])}</h3><span class="muted small">${fmtN(rep.rows.length)} registro${rep.rows.length===1?"":"s"}${rep.rows.length>300?" · se muestran 300; la descarga trae todos":""}</span></div>
      <div class="tbl-wrap"><table><thead><tr>${rep.cols.map(c=>`<th class="${c.num?"num":""}">${esc(c.h)}</th>`).join("")}</tr></thead>
      <tbody>${rep.rows.length?rep.rows.slice(0,300).map(r=>`<tr>${r.map((v,i)=>`<td class="${rep.cols[i].num?"num":rep.cols[i].mono?"mono":""}">${rep.cols[i].fmt?rep.cols[i].fmt(v):esc(v)}</td>`).join("")}</tr>`).join("")
        :`<tr><td colspan="${rep.cols.length}" class="empty">Sin registros en este periodo con los filtros elegidos.</td></tr>`}</tbody></table></div></div>`}`;
  const set=(k,v)=>{ R[k]=v; render(); };
  document.getElementById("rp-tipo").onchange=e=>set("tipo",e.target.value);
  document.getElementById("rp-desde").onchange=e=>set("desde",e.target.value||R.desde);
  document.getElementById("rp-hasta").onchange=e=>set("hasta",e.target.value||R.hasta);
  document.getElementById("rp-turno").onchange=e=>set("turno",e.target.value);
  document.getElementById("rp-linea").onchange=e=>set("linea",e.target.value);
  app.querySelectorAll("[data-rango]").forEach(b=>b.onclick=()=>{ R.hasta=today(); R.desde=addDays(R.hasta,-Number(b.dataset.rango)); render(); });
  if(!rep) return;
  const name=`reporte_${R.tipo}_${R.desde}_a_${R.hasta}`, aoa=()=>[rep.cols.map(c=>c.h),...rep.rows];
  document.getElementById("rp-xlsx").onclick=()=>downloadXlsx(name+".xlsx",aoa());
  document.getElementById("rp-csv").onclick=()=>downloadCsv(name+".csv",aoa());
}

function buildReport(R,dias){
  const now=Date.now(), {surtidos,eventos}=R.data;
  const okFiltro=x=>(!R.turno||x.turno===R.turno)&&(!R.linea||x.linea===R.linea);
  const recs=Object.values(surtidos).filter(okFiltro).sort((a,b)=>a.ts-b.ts);
  const woOf=r=>r.wo||S.plan[r.planId]?.wo||"";
  const estadoPill=v=>v==="A tiempo"?'<span class="pill p-ok">A tiempo</span>':v==="Tarde"?'<span class="pill p-warn">Tarde</span>':v==="No surtido"?'<span class="pill p-bad">No surtido</span>':esc(v);
  if(R.tipo==="cumplimiento"){
    const porDia={}; Object.values(surtidos).forEach(r=>{(porDia[r.fecha]=porDia[r.fecha]||{})[r._id]=r;});
    const evDia={}; Object.values(eventos).forEach(e=>{(evDia[e.fecha]=evDia[e.fecha]||{})[e._id]=e;});
    const trips=dias.flatMap(f=>dayTrips(f,porDia[f]||{},evDia[f]||{},now)).filter(okFiltro);
    const filas=tally(trips,t=>t.fecha+"|"+t.turno+"|"+t.linea).sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));
    const tot=filas.reduce((o,f)=>({ok:o.ok+f.ok,late:o.late+f.late,miss:o.miss+f.miss}),{ok:0,late:0,miss:0}), n=tot.ok+tot.late+tot.miss;
    const pct=(a,b)=>b?Math.round(a/b*100):0;
    const porFecha=tally(trips,t=>t.fecha), byF=Object.fromEntries(porFecha.map(x=>[x.key,x]));
    return {
      kpis:`<div class="kpis">
        <div class="panel kpi"><div class="lbl">Cumplimiento</div><div class="v">${pct(tot.ok+tot.late,n)}%</div><div class="s">${fmtN(tot.ok+tot.late)} de ${fmtN(n)} surtidos que tocaban</div></div>
        <div class="panel kpi"><div class="lbl">A tiempo</div><div class="v">${pct(tot.ok,n)}%</div><div class="s">${fmtN(tot.ok)} surtido${tot.ok===1?"":"s"}</div></div>
        <div class="panel kpi"><div class="lbl">Tarde</div><div class="v">${fmtN(tot.late)}</div><div class="s">${pct(tot.late,n)}% del total</div></div>
        <div class="panel kpi"><div class="lbl">No surtidos</div><div class="v">${fmtN(tot.miss)}</div><div class="s">${pct(tot.miss,n)}% del total</div></div></div>`,
      chartTitle:"Surtidos por día",
      chart:barChart(dias.filter(f=>byF[f]).map(f=>Object.assign({label:fmtDia(f)},byF[f])),{titulo:"Surtidos por día"}),
      cols:[{h:"Fecha",mono:true},{h:"Turno"},{h:"Línea"},{h:"Programados",num:true},{h:"A tiempo",num:true},{h:"Tarde",num:true},{h:"No surtidos",num:true},{h:"% cumplimiento",num:true},{h:"% a tiempo",num:true}],
      rows:filas.map(f=>{ const [fecha,turno,linea]=f.key.split("|"), t=f.ok+f.late+f.miss; return [fecha,turno,linea,t,f.ok,f.late,f.miss,pct(f.ok+f.late,t),pct(f.ok,t)]; })
    };
  }
  if(R.tipo==="surtidos"||R.tipo==="tardias"){
    const rows=(R.tipo==="tardias"?recs.filter(isLate).sort((a,b)=>(b.ts-b.programado)-(a.ts-a.programado)):recs).map(r=>[
      r.fecha,r.turno,r.linea,r.ensamble,woOf(r),r.estacion,r.np,Number(r.cantidad)||0,fmtHora(r.programado),fmtHora(r.ts),
      Math.round((r.ts-r.programado)/6000)/10,isLate(r)?"Tarde":"A tiempo",r.surtioNombre||"",r.recibioNombre||""]);
    return {
      cols:[{h:"Fecha",mono:true},{h:"Turno"},{h:"Línea"},{h:"Ensamble",mono:true},{h:"WO",mono:true},{h:"Estación"},{h:"NP",mono:true},{h:"Cantidad",num:true},{h:"Programado",mono:true},{h:"Surtido",mono:true},{h:"Retraso (min)",num:true},{h:"Estado",fmt:estadoPill},{h:"Surtió"},{h:"Recibió"}],
      rows
    };
  }
  if(R.tipo==="eventos"){
    const evs=Object.values(eventos).filter(e=>(!R.linea||e.linea===R.linea)&&(!R.turno||e.tipo==="paro"||S.plan[e.planId]?.turno===R.turno)).sort((a,b)=>(a.ts||a.inicio)-(b.ts||b.inicio));
    return {
      cols:[{h:"Fecha",mono:true},{h:"Hora",mono:true},{h:"Tipo"},{h:"Línea"},{h:"Detalle"},{h:"Duración (min)",num:true},{h:"Motivo"},{h:"Registró"}],
      rows:evs.map(e=>e.tipo==="paro"
        ?[e.fecha,fmtHora(e.inicio),"Paro",e.linea,e.fin?"Hasta "+fmtHora(e.fin):"En curso",Math.round(((e.fin||now)-e.inicio)/60000),e.motivo||"",e.porNombre||""]
        :[e.fecha,fmtHora(e.ts),"Reconteo",e.linea,`${e.estacion} · ${e.np}: ${e.cantidad} pzs (esperado ${e.esperado})`,"",e.motivo||"",e.porNombre||""])
    };
  }
  const plans=Object.values(S.plan).filter(p=>p.fecha>=R.desde&&p.fecha<=R.hasta&&okFiltro(p)).sort((a,b)=>(a.fecha+a.turno+a.linea).localeCompare(b.fecha+b.turno+b.linea,undefined,{numeric:true}));
  return {
    cols:[{h:"Fecha",mono:true},{h:"Turno"},{h:"Línea"},{h:"Ensamble",mono:true},{h:"WO",mono:true},{h:"Cantidad",num:true},{h:"UPH",num:true},{h:"Estado"},{h:"Rolado desde"}],
    rows:plans.map(p=>[p.fecha,p.turno,p.linea,p.ensamble,p.wo||"",Number(p.cantidad)||0,planUph(p)||"",p.pendiente?PEND_LABEL[p.pendiente.tipo]+" pendiente":"Vigente",p.original?p.original.fecha+" "+p.original.turno:""])
  };
}
