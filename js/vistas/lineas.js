/* ===================== Líneas: tablero de estado =====================
   Una línea está al 100 % cuando todos los surtidos cuya hora ya llegó están confirmados. */
function lineBoard(fecha,turno,now){
  const L={};
  activePlans().filter(p=>p.fecha===fecha&&(!turno||p.turno===turno)).forEach(p=>{
    const ln=L[p.linea]=L[p.linea]||{linea:p.linea,ens:new Set(),turnos:new Set(),ok:0,due:0,soon:0,total:0,done:0,pend:[],st:{},err:[],waiting:[],paro:activeStop(fecha,p.linea)};
    ln.ens.add(p.ensamble); ln.turnos.add(p.turno);
    const r=computeItems(p); if(r.error) ln.err.push(r.error); if(r.waiting) ln.waiting.push(p);
    r.items.forEach(it=>{
      const st=ln.st[it.estacion]=ln.st[it.estacion]||{due:0,soon:0};
      it.trips.forEach(t=>{ const s=tripStatus(t,now); ln.total++; if(s.done) ln.done++;
        if(t.at&&t.at.getTime()<=now){ if(s.done) ln.ok++; else {ln.due++; st.due++; ln.pend.push({p,it,t,min:(now-t.at.getTime())/60000});} }
        else if(s.key==="soon"){ ln.soon++; st.soon++; }
      });
    });
  });
  return Object.values(L).map(l=>{
    l.pct=l.ok+l.due?Math.floor(l.ok/(l.ok+l.due)*100):100;
    l.state=l.paro?"stop":l.err.length&&!l.total?"err":l.due?"due":l.soon?"soon":l.waiting.length&&!l.total?"wait":"ok";
    l.pend.sort((a,b)=>b.min-a.min); return l;
  }).sort((a,b)=>(b.due-a.due)||a.linea.localeCompare(b.linea,undefined,{numeric:true}));
}
function viewLineas(app){
  const c=cfg(), now=Date.now(), lines=lineBoard(S.sel.fecha,S.sel.turno,now);
  const al100=lines.filter(l=>l.state==="ok"||l.state==="soon").length, falt=lines.filter(l=>l.state==="due").length;
  const pendNP=lines.reduce((n,l)=>n+l.due,0);
  const pill={ok:'<span class="pill p-ok">Al 100%</span>',soon:'<span class="pill p-warn">Al 100% · surtido próximo</span>',due:'<span class="pill p-bad">Falta resurtir</span>',err:'<span class="pill p-idle">Falta BOM o UPH en el plan</span>',stop:'<span class="pill p-warn">Línea detenida</span>',wait:'<span class="pill p-idle">Esperando arranque</span>'};
  app.innerHTML=`
  <div class="view-head"><div><h2>Estado de líneas</h2><p>Una línea está al 100% cuando todos los surtidos que ya tocaban están confirmados. Las que tienen surtidos vencidos aparecen primero.</p></div></div>
  <div class="filters">
    <div class="fld"><label for="l-fecha">Fecha</label><input type="date" id="l-fecha" value="${S.sel.fecha}"></div>
    <div class="fld"><label for="l-turno">Turno</label><select id="l-turno"><option value="">Todos</option>${Object.keys(c.turnos).map(t=>`<option ${S.sel.turno===t?"selected":""}>${t}</option>`).join("")}</select></div>
    <span class="muted small" style="margin-left:auto">Actualizado ${fmtT(new Date())} · se refresca cada 30 s</span>
  </div>
  <div class="summary">
    <div><div class="lbl">Líneas con plan</div><div class="v">${lines.length}</div></div>
    <div><div class="lbl">Al 100%</div><div class="v ok">${al100}</div></div>
    <div><div class="lbl">Falta resurtir</div><div class="v ${falt?"bad":""}">${falt}</div></div>
    <div><div class="lbl">Surtidos vencidos</div><div class="v ${pendNP?"bad":""}">${pendNP}</div></div>
  </div>
  ${lines.length?`<div class="lines">${lines.map(l=>`
    <section class="panel line-card st-${l.state}">
      <div class="lc-head"><div><div class="lc-name">${esc(l.linea)}</div><div class="small muted">${[...l.ens].map(esc).join(", ")} · ${[...l.turnos].join(", ")}</div></div>
        <div class="lc-pct num">${l.state==="err"||l.state==="wait"?"—":l.pct+"%"}</div></div>
      <div class="lc-body">
        ${pill[l.state]}
        ${l.paro?`<div class="small" style="color:var(--warn)">Detenida desde ${fmtT(new Date(l.paro.inicio))} (${ago((now-l.paro.inicio)/60000)})${l.paro.motivo?" · "+esc(l.paro.motivo):""}. Los surtidos siguientes están en pausa.</div>`:""}
        ${l.waiting.length?`<div class="small muted">${l.waiting.length} ensamble${l.waiting.length>1?"s":""} esperando arranque: ${l.waiting.map(p=>esc(p.ensamble)).join(", ")}</div>`:""}
        <div class="meter"><i style="width:${l.pct}%;background:var(${l.state==="due"?"--bad":"--ok"})"></i></div>
        <div class="small muted">${l.ok} de ${l.ok+l.due} surtidos al momento · ${l.done}/${l.total} del día${l.soon?` · ${l.soon} en los próximos 15 min`:""}</div>
        <div class="st-chips" aria-label="Estaciones">${Object.entries(l.st).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).map(([e,s])=>`<span class="st-chip ${s.due?"due":s.soon?"soon":"ok"}" title="Estación ${esc(e)}: ${s.due?s.due+" vencido(s)":s.soon?"surtido próximo":"al 100%"}">${esc(e)}</span>`).join("")}</div>
        ${l.pend.length?`<div class="pend"><div class="lbl">Pendiente de resurtir</div>${l.pend.slice(0,6).map(x=>`<div class="pend-row"><span class="mono"><b>${esc(x.it.estacion)}</b> · ${esc(x.it.np)}</span><span class="mono">${fmtN(x.t.qty)} pzs</span><span class="late-by">hace ${ago(x.min)}</span></div>`).join("")}${l.pend.length>6?`<div class="small muted">y ${l.pend.length-6} más</div>`:""}</div>`:""}
        ${l.err.length?`<div class="small" style="color:var(--bad)">${[...new Set(l.err)].map(esc).join(" · ")}</div>`:""}
        <div class="row"><button class="btn ${l.state==="due"?"pri":""}" data-go-line="${esc(l.linea)}">Ver surtido de ${esc(l.linea)}</button>${can.ops()?stopBtn(S.sel.fecha,l.linea):""}</div>
      </div>
    </section>`).join("")}</div>`
  :`<div class="panel empty">No hay plan para ${esc(S.sel.fecha)}${S.sel.turno?" turno "+esc(S.sel.turno):""}. ${can.editPlan()?"Cárgalo en la pestaña Plan de producción.":"Pide al planeador que cargue el plan."}</div>`}`;
  document.getElementById("l-fecha").onchange=e=>{S.sel.fecha=e.target.value;render();};
  document.getElementById("l-turno").onchange=e=>{S.sel.turno=e.target.value;render();};
  app.querySelectorAll("[data-go-line]").forEach(b=>b.onclick=()=>{S.sel.linea=b.dataset.goLine; S.view="surtido"; render();});
  bindLineOps(app);
}
const ago=m=>m<60?Math.max(1,Math.round(m))+" min":Math.floor(m/60)+" h "+String(Math.round(m%60)).padStart(2,"0")+" min";
