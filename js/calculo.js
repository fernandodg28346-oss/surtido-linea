/* ===================== Cálculo de surtido =====================
   Por NP en estación: consumo/h = UPH × cant. por unidad.
   Capacidad en estación = cantidad de empaque (o 1 h de consumo si no se indica).
   Punto de reorden = capacidad × %(mín. 20 %). Se surte al llegar a ese punto,
   reponiendo capacidad − punto de reorden. Frecuencia = reposición ÷ consumo/h.
   El programa corre en minutos de producción desde el arranque del ensamble: los paros de la línea
   no cuentan (los surtidos se recorren) y, mientras la línea está detenida, los surtidos siguientes quedan en pausa.
   Un reconteo reprograma los surtidos aún no confirmados a partir de lo que realmente hay en la estación. */
function shiftStart(fecha,turno){
  const t=cfg().turnos[turno]||{inicio:"06:00"}; const [h,m]=t.inicio.split(":").map(Number);
  const d=new Date(fecha+"T00:00:00"); d.setHours(h,m||0,0,0); return d;
}
// Arranque del ensamble: al inicio del turno, o cuando alguien presiona "Iniciar ensamble" (arranque manual).
function planStart(p){ if(p.inicioReal) return new Date(p.inicioReal); return p.arranque==="manual"?null:shiftStart(p.fecha,p.turno); }
function planUph(p){ return Number(p.uph)||Number(S.bom[safeId(p.ensamble)]?.uph)||0; }
function lineStops(fecha,linea){ return Object.values(S.eventos).filter(e=>e.tipo==="paro"&&e.fecha===fecha&&e.linea===linea); }
function activeStop(fecha,linea){ return lineStops(fecha,linea).find(e=>!e.fin)||null; }
function recountsOf(p,est,np){ return Object.values(S.eventos).filter(e=>e.tipo==="reconteo"&&e.planId===p._id&&e.estacion===est&&e.np===np).sort((a,b)=>a.ts-b.ts); }
// Convierte entre minutos de producción y hora real, saltando los paros de la línea.
function timeline(p,start){
  const stops=lineStops(p.fecha,p.linea).map(s=>[Math.max(s.inicio,start),s.fin||Infinity]).filter(([a,b])=>b>a).sort((x,y)=>x[0]-y[0]);
  return {
    wall(min){ let t=start, rem=min*60000;
      for(const [a,b] of stops){ if(b<=t) continue; if(a>t){ if(rem<=a-t) return t+rem; rem-=a-t; } if(b===Infinity) return Infinity; t=b; }
      return t+rem; },
    eff(T){ let t=start, m=0;
      for(const [a,b] of stops){ if(T<=t) break; if(b<=t) continue; if(a>t) m+=Math.min(T,a)-t; t=Math.max(t,b); }
      if(T>t) m+=T-t; return m/60000; }
  };
}
function computeItems(p){
  const b=S.bom[safeId(p.ensamble)]; if(!b) return {error:"Sin BOM para el ensamble "+p.ensamble, items:[]};
  const uph=planUph(p); if(!uph) return {error:"Falta UPH en el plan para "+p.ensamble, items:[]};
  const start=planStart(p); if(!start) return {waiting:true, items:[]};
  const pct=cfg().pct/100, tl=timeline(p,start.getTime());
  const items=(b.items||[]).map(it=>{
    const est=String(it.estacion||"—"), qpu=Number(it.qtyPer)||1, rate=uph*qpu;
    const cap=Number(it.empaque)>0?Number(it.empaque):Math.ceil(rate);
    const rop=Math.ceil(cap*pct), repl=Math.max(1,cap-rop);
    const intervalMin=repl/rate*60, total=Math.ceil(Number(p.cantidad)*qpu);
    const mk=(k,qty,eff)=>{ const w=tl.wall(eff); return {k,qty,eff,at:w===Infinity?null:new Date(w),id:safeId(p._id+"__"+it.estacion+"__"+it.np+"__"+k)}; };
    let trips=[], rem=total, k=0;
    while(rem>0 && k<500){
      const q=Math.min(k===0?cap:repl,rem);
      trips.push(mk(k,q,k*intervalMin));
      rem-=q; k++;
    }
    // Cada reconteo conserva los surtidos ya confirmados y reprograma el resto con lo contado en la estación.
    const recs=recountsOf(p,est,it.np);
    recs.forEach(r=>{
      const e=tl.eff(r.ts), qty=Number(r.cantidad)||0, consumed=Math.min(total,rate*e/60);
      trips=trips.filter(t=>t.k<r.kDesde&&S.surtidos[t.id]);
      let left=Math.max(0,Math.ceil(total-consumed-qty)), n=0;
      const first=e+Math.max(0,(qty-rop)/rate*60);
      while(left>0 && n<500){ const q=Math.min(repl,left); trips.push(mk(r.kDesde+n,q,first+n*intervalMin)); left-=q; n++; }
    });
    return {np:it.np,desc:it.desc,estacion:est,qpu,rate,cap,rop,repl,intervalMin,total,trips,recs,tl};
  });
  return {items};
}
// Piezas que deberían estar en la estación ahora: último reconteo (o cero) + surtidos confirmados después − consumo.
function estimateOnHand(it,now){
  const r=it.recs[it.recs.length-1], fromK=r?r.kDesde:0;
  const delivered=it.trips.filter(t=>t.k>=fromK&&S.surtidos[t.id]).reduce((n,t)=>n+(Number(S.surtidos[t.id].cantidad)||0),0);
  const used=it.rate*(it.tl.eff(now)-(r?it.tl.eff(r.ts):0))/60;
  return Math.max(0,Math.round((r?Number(r.cantidad):0)+delivered-used));
}
// Cada surtido programado de una fecha con su resultado, a partir de los surtidos y eventos de ESA fecha
// (sirve para fechas distintas a la seleccionada, p. ej. reportes). Estado: "ok" a tiempo, "late" tarde,
// "miss" no surtido (ya tocaba y no se confirmó), "sched" aún no toca, "stop" en pausa por paro.
function dayTrips(fecha,surtidos,eventos,now){
  const prev=[S.surtidos,S.eventos]; S.surtidos=surtidos; S.eventos=eventos;
  const out=[];
  try{
    activePlans().filter(p=>p.fecha===fecha).forEach(p=>computeItems(p).items.forEach(it=>it.trips.forEach(t=>{
      const s=tripStatus(t,now), d=s.done;
      out.push({fecha,turno:p.turno,linea:p.linea,ensamble:p.ensamble,wo:(d&&d.wo)||p.wo||"",estacion:it.estacion,np:it.np,cantidad:t.qty,
        programado:t.at?t.at.getTime():null,real:d?d.ts:null,retraso:d&&t.at?(d.ts-t.at.getTime())/60000:null,
        estado:d?(s.key==="late"?"late":"ok"):s.key==="due"?"miss":s.key==="stop"?"stop":"sched",
        surtio:d?d.surtioNombre:"",recibio:d?d.recibioNombre:""});
    })));
  }finally{ S.surtidos=prev[0]; S.eventos=prev[1]; }
  return out;
}
const ESTADO_LABEL={ok:"A tiempo",late:"Tarde",miss:"No surtido",sched:"Programado",stop:"En pausa"};
// Cuenta a tiempo / tarde / no surtido por la llave que regresa keyFn.
function tally(trips,keyFn){
  const g={};
  trips.forEach(t=>{ if(!["ok","late","miss"].includes(t.estado)) return; const k=keyFn(t); const o=g[k]=g[k]||{key:k,ok:0,late:0,miss:0}; o[t.estado]++; });
  return Object.values(g);
}
function tripStatus(t,now){
  const done=S.surtidos[t.id];
  if(done){ const late=!!t.at&&(done.ts-t.at.getTime())>cfg().tolerancia*60000; return {key:late?"late":"done",done}; }
  if(!t.at) return {key:"stop"};
  if(now>t.at.getTime()) return {key:"due"};
  if(t.at.getTime()-now<15*60000) return {key:"soon"};
  return {key:"sched"};
}
