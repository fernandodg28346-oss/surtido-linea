/* ===================== Métricas ===================== */
function viewMetricas(app){
  const c=cfg(), now=Date.now();
  const plans=activePlans().filter(p=>p.fecha===S.sel.fecha&&(!S.sel.turno||p.turno===S.sel.turno));
  const byLine={}; let tot=0,done=0,onTime=0,due=0,delays=[];
  plans.forEach(p=>computeItems(p).items.forEach(it=>it.trips.forEach(t=>{
    const s=tripStatus(t,now); const L=byLine[p.linea]=byLine[p.linea]||{tot:0,ok:0,late:0,due:0};
    tot++; L.tot++;
    if(s.done){done++; if(s.key==="done"){onTime++;L.ok++;}else L.late++; if(t.at) delays.push((s.done.ts-t.at.getTime())/60000);}
    else if(s.key==="due"){due++;L.due++;}
  })));
  const recs=Object.values(S.surtidos).filter(r=>r.fecha===S.sel.fecha&&(!S.sel.turno||r.turno===S.sel.turno)).sort((a,b)=>b.ts-a.ts);
  const byMat={}; recs.forEach(r=>{const m=byMat[r.surtio]=byMat[r.surtio]||{nombre:r.surtioNombre,n:0,pzs:0,late:0}; m.n++; m.pzs+=Number(r.cantidad)||0; if(r.ts-r.programado>c.tolerancia*60000) m.late++;});
  const vencidosAhora=due;
  const evs=Object.values(S.eventos).filter(e=>e.fecha===S.sel.fecha&&(!S.sel.turno||e.tipo==="paro"||S.plan[e.planId]?.turno===S.sel.turno)).sort((a,b)=>(b.ts||b.inicio)-(a.ts||a.inicio));
  const pct=(a,b)=>b?Math.round(a/b*100):0;
  const avgDelay=delays.length?delays.reduce((a,b)=>a+b,0)/delays.length:0;
  const elapsed=plans.reduce((n,p)=>n+computeItems(p).items.reduce((m,it)=>m+it.trips.filter(t=>t.at&&t.at.getTime()<=now).length,0),0);
  const lines=Object.keys(byLine).sort();
  app.innerHTML=`
  <div class="view-head"><div><h2>Métricas de surtido</h2><p>Cumplimiento contra el programa calculado del plan. "A tiempo" = confirmado dentro de ${c.tolerancia} min de la hora programada.</p></div></div>
  <div class="filters">
    <div class="fld"><label for="m-fecha">Fecha</label><input type="date" id="m-fecha" value="${S.sel.fecha}"></div>
    <div class="fld"><label for="m-turno">Turno</label><select id="m-turno"><option value="">Todos</option>${Object.keys(c.turnos).map(t=>`<option ${S.sel.turno===t?"selected":""}>${t}</option>`).join("")}</select></div>
  </div>
  <div class="kpis">
    <div class="panel kpi"><div class="lbl">Cumplimiento a la fecha</div><div class="v">${pct(done,elapsed)}%</div><div class="s">${done} de ${elapsed} surtidos que ya tocaban</div><div class="meter"><i style="width:${pct(done,elapsed)}%"></i></div></div>
    <div class="panel kpi"><div class="lbl">A tiempo</div><div class="v">${pct(onTime,done)}%</div><div class="s">${onTime} de ${done} confirmados</div><div class="meter"><i style="width:${pct(onTime,done)}%;background:var(--ok)"></i></div></div>
    <div class="panel kpi"><div class="lbl">Vencidos ahora</div><div class="v ${vencidosAhora?"bad":""}" style="${vencidosAhora?"color:var(--bad)":""}">${vencidosAhora}</div><div class="s">Sin confirmar después de su hora</div></div>
    <div class="panel kpi"><div class="lbl">Retraso promedio</div><div class="v">${delays.length?fmtN(avgDelay,1):"—"}<span style="font-size:18px"> min</span></div><div class="s">${tot} surtidos programados en el día</div></div>
  </div>
  <div class="grid2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
    <div class="panel"><div class="ph"><h3>Por línea</h3><span class="small muted"><span class="pill p-ok">A tiempo</span> <span class="pill p-warn">Tarde</span></span></div><div class="pb">
      ${lines.length?`<div class="bars">${lines.map(l=>{const L=byLine[l];return`<div class="bar-row"><b>${esc(l)}</b>
        <div class="bar-track" title="${L.ok} a tiempo, ${L.late} tarde, ${L.due} vencidos de ${L.tot}"><s style="width:${pct(L.ok+L.late,L.tot)}%"></s><i style="width:${pct(L.ok,L.tot)}%"></i></div>
        <span class="mono small">${L.ok+L.late}/${L.tot}${L.due?` · <span style="color:var(--bad)">${L.due} venc.</span>`:""}</span></div>`}).join("")}</div>`:`<div class="empty">Sin plan para esta fecha.</div>`}
    </div></div>
    <div class="panel"><div class="ph"><h3>Por materialista</h3></div><div class="tbl-wrap"><table>
      <thead><tr><th>Materialista</th><th class="num">Surtidos</th><th class="num">Piezas</th><th class="num">Tarde</th></tr></thead>
      <tbody>${Object.keys(byMat).length?Object.entries(byMat).sort((a,b)=>b[1].n-a[1].n).map(([g,m])=>`<tr><td>${esc(m.nombre)} <span class="muted mono small">${esc(g)}</span></td><td class="num">${m.n}</td><td class="num">${fmtN(m.pzs)}</td><td class="num">${m.late}</td></tr>`).join(""):`<tr><td colspan="4" class="empty">Sin surtidos confirmados.</td></tr>`}</tbody></table></div></div>
  </div>
  <div class="panel" style="margin-top:16px"><div class="ph"><h3>Bitácora de surtidos</h3><span class="muted small">${recs.length} registros</span></div><div class="tbl-wrap"><table>
    <thead><tr><th>Hora</th><th>Prog.</th><th>Línea</th><th>Estación</th><th>NP</th><th class="num">Cant.</th><th>Surtió</th><th>Recibió</th><th>Estado</th></tr></thead>
    <tbody>${recs.length?recs.slice(0,200).map(r=>{const late=r.ts-r.programado>c.tolerancia*60000;return`<tr><td class="mono">${fmtT(new Date(r.ts))}</td><td class="mono muted">${fmtT(new Date(r.programado))}</td><td>${esc(r.linea)}</td><td>${esc(r.estacion)}</td><td class="mono">${esc(r.np)}</td><td class="num">${fmtN(r.cantidad)}</td><td>${esc(r.surtioNombre)}</td><td>${esc(r.recibioNombre)}</td><td>${late?'<span class="pill p-warn">Tarde</span>':'<span class="pill p-ok">A tiempo</span>'}</td></tr>`}).join(""):`<tr><td colspan="9" class="empty">Aún no hay surtidos confirmados en esta fecha.</td></tr>`}</tbody></table></div></div>
  <div class="panel" style="margin-top:16px"><div class="ph"><h3>Paros y reconteos</h3><span class="muted small">${evs.length} registros</span></div><div class="tbl-wrap"><table>
    <thead><tr><th>Hora</th><th>Tipo</th><th>Línea</th><th>Detalle</th><th>Motivo</th><th>Registró</th></tr></thead>
    <tbody>${evs.length?evs.map(e=>e.tipo==="paro"?`<tr><td class="mono">${fmtT(new Date(e.inicio))}</td><td><span class="pill p-warn">Paro</span></td><td>${esc(e.linea)}</td>
      <td>${e.fin?`Hasta ${fmtT(new Date(e.fin))} · ${ago((e.fin-e.inicio)/60000)}`:`<b style="color:var(--warn)">En curso</b> · ${ago((now-e.inicio)/60000)}`}</td><td>${esc(e.motivo||"")}</td><td>${esc(e.porNombre||"")}</td></tr>`
      :`<tr><td class="mono">${fmtT(new Date(e.ts))}</td><td><span class="pill p-acc">Reconteo</span></td><td>${esc(e.linea)}</td>
      <td><span class="mono">${esc(e.estacion)} · ${esc(e.np)}</span> · ${fmtN(e.cantidad)} pzs (esperado ≈ ${fmtN(e.esperado)})</td><td>${esc(e.motivo||"")}</td><td>${esc(e.porNombre||"")}</td></tr>`).join("")
      :`<tr><td colspan="6" class="empty">Sin paros ni reconteos en esta fecha.</td></tr>`}</tbody></table></div></div>`;
  document.getElementById("m-fecha").onchange=e=>{S.sel.fecha=e.target.value;render();};
  document.getElementById("m-turno").onchange=e=>{S.sel.turno=e.target.value;render();};
}
