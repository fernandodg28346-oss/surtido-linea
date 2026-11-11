/* ===================== Flujo entre procesos =====================
   El flujo sale del BOM: si el BOM de un ensamble (padre) tiene como NP a otro ensamble (subensamble), ese subensamble
   se produce en su línea y se consume en la estación del padre. Cada ensamble guarda dónde se produce en
   produce:{linea, estacion}. Un ensamble final (empaque) es el que no es subensamble de ningún otro. */
const normEst=s=>String(s??"").trim().toLowerCase();
const bomDe=ens=>S.bom[safeId(ens)]||null;
const esEnsamble=np=>!!bomDe(np);
// Subensambles que consume un ensamble: [{np, estacion, qtyPer, empaque}] (uno por NP y estación).
function hijosDe(ens){ return (bomDe(ens)?.items||[]).filter(it=>esEnsamble(it.np)); }
// Ensambles que consumen a uno dado, con la estación donde lo consumen.
function padresDe(ens){
  const out=[]; Object.values(S.bom).forEach(b=>(b.items||[]).forEach(it=>{ if(it.np===ens) out.push({padre:b.ensamble,item:it}); })); return out;
}
// Ensambles finales con al menos un subensamble: los que se pueden elegir en "Mostrar flujo de".
function finalesConFlujo(){
  return Object.values(S.bom).filter(b=>hijosDe(b.ensamble).length&&!padresDe(b.ensamble).length)
    .map(b=>b.ensamble).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
// Todas las conexiones del árbol de un ensamble final: {hijo, padre, item}, de los subensambles hacia el final.
function conexionesDe(final){
  const out=[], vistos=new Set();
  const ir=ens=>{ if(vistos.has(ens)) return; vistos.add(ens); hijosDe(ens).forEach(it=>{ out.push({hijo:it.np,padre:ens,item:it}); ir(it.np); }); };
  ir(final); return out;
}
// Dónde se produce un ensamble: lo capturado en su BOM o, si no, la línea donde está planeado.
function produceDe(ens){
  const b=bomDe(ens); if(b?.produce?.linea) return b.produce;
  const p=Object.values(S.plan).find(x=>x.ensamble===ens); return p?{linea:p.linea,estacion:""}:null;
}
// Zona del mapa para una línea y estación (sin distinguir mayúsculas), de la más precisa a la más general: la estación
// exacta de la línea; una línea que se llama como la estación (BOM con estaciones nombradas como la línea, p. ej.
// «Robot 5»); la línea completa; una estación con ese nombre en otra línea; o, sin estación, cualquier zona de la línea.
function zonaPara(zonas,linea,estacion){
  const L=normEst(linea), E=normEst(estacion);
  return (E&&zonas.find(z=>normEst(z.linea)===L&&normEst(z.estacion)===E))
    ||(E&&E!==L&&(zonas.find(z=>normEst(z.linea)===E&&(!z.estacion||normEst(z.estacion)===E))))
    ||(L&&zonas.find(z=>normEst(z.linea)===L&&!z.estacion))
    ||(E&&zonas.find(z=>normEst(z.estacion)===E))
    ||(L&&!E&&zonas.find(z=>normEst(z.linea)===L))
    ||null;
}
// Conexiones de un ensamble final ubicadas en las zonas de un mapa, agrupadas por par origen → destino.
// Las que no tienen zona de origen o de destino en este mapa quedan en "sinMapa".
function flechasDe(final,zonas){
  const grupos={}, sinMapa=[];
  conexionesDe(final).forEach(c=>{
    const pr=produceDe(c.hijo), pp=produceDe(c.padre);
    const o=pr?zonaPara(zonas,pr.linea,pr.estacion):null, d=zonaPara(zonas,pp?.linea,c.item.estacion);
    if(!o||!d||o.id===d.id){ sinMapa.push(c); return; }
    const k=o.id+">"+d.id; (grupos[k]=grupos[k]||{o,d,con:[]}).con.push(c);
  });
  return {flechas:Object.values(grupos),sinMapa};
}

/* ===================== Flujo en vivo =====================
   Lo que produce una línea de un subensamble se asigna a los planes que lo consumen, en orden de arranque, desde el
   turno en que se produce hasta el fin del turno siguiente. Lo asignado se mueve directo a la estación que lo consume
   siguiendo su punto de reorden (los mismos surtidos que calcula computeItems para ese NP); lo que no tiene consumo en
   ese horizonte es excedente y va al almacén. Si lo que se produce no alcanza, el resto llega del almacén como siempre. */
function shiftEnd(fecha,turno){
  const t=cfg().turnos[turno]||{}, s=shiftStart(fecha,turno), [h,m]=String(t.fin||"").split(":").map(Number);
  if(!(h>=0)) return new Date(s.getTime()+8*3600000);
  const e=new Date(s); e.setHours(h,m||0,0,0); if(e<=s) e.setDate(e.getDate()+1); return e;
}
// Hasta dónde busca consumo lo que se produce en un plan: el fin del turno siguiente.
function horizonteFlujo(p){ const n=nextShift(p.fecha,p.turno); return shiftEnd(n.fecha,n.turno).getTime(); }
let _flujoCache=null;
// Calcula una vez por cambio de datos y minuto. Regresa {porProductor:{planId:{...}}, porConsumo:{"planId|estación|np":{...}}}.
function flujoVivo(){
  const llave=[S.plan,S.bom,S.surtidos,S.eventos,S.config.general,Math.floor(Date.now()/60000)];
  if(_flujoCache&&_flujoCache.llave.every((x,i)=>x===llave[i])) return _flujoCache.r;
  const r=calcFlujo(); _flujoCache={llave,r}; return r;
}
function calcFlujo(){
  const porProductor={}, porConsumo={}, planes=activePlans();
  const ini=p=>(planStart(p)||shiftStart(p.fecha,p.turno)).getTime();
  const orden=(a,b)=>ini(a)-ini(b)||String(a.linea).localeCompare(String(b.linea));
  // Subensambles con algún ensamble que los consume.
  const subs=[...new Set(planes.map(p=>p.ensamble))].filter(e=>padresDe(e).length);
  subs.forEach(sub=>{
    const prods=planes.filter(p=>p.ensamble===sub).sort(orden);
    // Demanda: cada surtido del subensamble en cada estación de los planes que lo consumen, en orden de hora.
    const pend=[];
    planes.filter(c=>c.ensamble!==sub).forEach(c=>{
      if(!(bomDe(c.ensamble)?.items||[]).some(it=>it.np===sub)) return;
      computeItems(c).items.filter(it=>it.np===sub).forEach(it=>{
        const k=c._id+"|"+it.estacion+"|"+sub; if(porConsumo[k]) return;
        const d=porConsumo[k]={c,estacion:it.estacion,np:sub,inicio:ini(c),demanda:it.total,resta:it.total,de:[],movs:[]};
        it.trips.forEach(t=>pend.push({d,t,falta:t.qty}));
      });
    });
    const hora=x=>x.t.at?x.t.at.getTime():Infinity;
    pend.sort((a,b)=>hora(a)-hora(b)||a.d.inicio-b.d.inicio||a.t.k-b.t.k);
    prods.forEach(p=>{
      const total=Math.ceil(Number(p.cantidad)||0), desde=shiftStart(p.fecha,p.turno).getTime(), hasta=horizonteFlujo(p);
      const r=porProductor[p._id]={p,sub,total,asign:[],asignado:0,excedente:0,uph:planUph(p),inicio:planStart(p),horizonte:new Date(hasta)};
      const tl=r.inicio&&r.uph?timeline(p,r.inicio.getTime()):null;
      let usado=0;
      pend.forEach(x=>{
        if(usado>=total||x.falta<=0||x.d.inicio<desde||x.d.inicio>=hasta) return;
        const m=Math.min(total-usado,x.falta); usado+=m; x.falta-=m; x.d.resta-=m;
        let a=r.asign.find(y=>y.d===x.d); if(!a){ a={p,d:x.d,qty:0,movs:[]}; r.asign.push(a); x.d.de.push(a); }
        a.qty+=m;
        // Hora en que la línea que produce ya tiene esas piezas; el movimiento es a esa hora o a la del surtido, la más tarde.
        const w=tl?tl.wall(usado/r.uph*60):null, lista=w==null||w===Infinity?null:new Date(w);
        const mov={t:x.t,qty:m,lista,a,hora:x.t.at&&lista?new Date(Math.max(x.t.at.getTime(),lista.getTime())):null};
        a.movs.push(mov); x.d.movs.push(mov);
      });
      r.asignado=usado; r.excedente=total-usado;
    });
  });
  return {porProductor,porConsumo};
}
// Texto corto para el Plan de producción y el layout.
function flujoDePlan(p){ const f=flujoVivo(); return {prod:f.porProductor[p._id]||null,cons:Object.values(f.porConsumo).filter(d=>d.c._id===p._id&&d.de.length)}; }
