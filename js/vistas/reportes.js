/* ===================== Reportes (sección de Métricas) =====================
   Construye cada reporte del periodo y filtros de Métricas, para verlo en tabla y descargarlo en Excel o CSV.
   El cumplimiento se recalcula día por día con el mismo motor del surtido (dayTrips). */
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

// Tabla de un reporte (se muestran 300 filas; la descarga trae todas).
function reportTable(rep,tipo){
  return `<div class="panel"><div class="ph"><h3>${esc(REPORTES[tipo])}</h3><span class="muted small">${fmtN(rep.rows.length)} registro${rep.rows.length===1?"":"s"}${rep.rows.length>300?" · se muestran 300; la descarga trae todos":""}</span></div>
    <div class="tbl-wrap"><table><thead><tr>${rep.cols.map(c=>`<th class="${c.num?"num":""}">${esc(c.h)}</th>`).join("")}</tr></thead>
    <tbody>${rep.rows.length?rep.rows.slice(0,300).map(r=>`<tr>${r.map((v,i)=>`<td class="${rep.cols[i].num?"num":rep.cols[i].mono?"mono":""}">${rep.cols[i].fmt?rep.cols[i].fmt(v):esc(v)}</td>`).join("")}</tr>`).join("")
      :`<tr><td colspan="${rep.cols.length}" class="empty">Sin registros en este periodo con los filtros elegidos.</td></tr>`}</tbody></table></div></div>`;
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
