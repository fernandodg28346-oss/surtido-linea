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
// Zona del mapa para una línea y estación (sin distinguir mayúsculas): la estación exacta, la línea completa, o una
// zona cuya estación o línea se llame como la estación buscada (BOM con estaciones nombradas como la línea).
function zonaPara(zonas,linea,estacion){
  const L=normEst(linea), E=normEst(estacion);
  return (E&&zonas.find(z=>normEst(z.linea)===L&&normEst(z.estacion)===E))
    ||(L&&zonas.find(z=>normEst(z.linea)===L&&!z.estacion))
    ||(E&&zonas.find(z=>normEst(z.estacion)===E))
    ||(E&&zonas.find(z=>normEst(z.linea)===E&&!z.estacion))
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
