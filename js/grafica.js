/* ===================== Gráfica de barras apiladas =====================
   Columnas por categoría (día, turno, línea) con a tiempo / tarde / no surtido apilados desde la base.
   Leyenda siempre visible, total sobre cada columna y detalle al pasar el cursor; la tabla de al lado da los números. */
const SERIES=[{key:"ok",label:"A tiempo",color:"var(--c-ok)"},{key:"late",label:"Tarde",color:"var(--c-late)"},{key:"miss",label:"No surtido",color:"var(--c-miss)"}];
function niceMax(m){
  if(m<=4) return Math.max(1,m);
  const p=Math.pow(10,Math.floor(Math.log10(m/4))), step=[1,2,5,10].map(x=>x*p).find(s=>m/s<=5);
  return Math.ceil(m/step)*step;
}
// cats: [{label, ok, late, miss}] en el orden a mostrar.
function barChart(cats,{titulo="",alto=220}={}){
  if(!cats.length) return `<div class="empty">Sin surtidos que ya tocaran en este periodo.</div>`;
  const max=niceMax(Math.max(...cats.map(c=>c.ok+c.late+c.miss))), ticks=[0,1,2,3,4].map(i=>max*i/4).filter((v,i,a)=>Number.isInteger(v)&&a.indexOf(v)===i);
  const pocos=cats.length<=14;
  return `<div class="chart" role="img" aria-label="${esc(titulo)}: ${cats.map(c=>`${c.label} ${c.ok} a tiempo, ${c.late} tarde, ${c.miss} no surtidos`).join("; ")}">
    <div class="ch-legend">${SERIES.map(s=>`<span><i style="background:${s.color}"></i>${s.label}</span>`).join("")}</div>
    <div class="ch-plot" style="height:${alto}px">
      ${ticks.map(v=>`<div class="ch-grid" style="bottom:${v/max*100}%"><span class="ch-y">${fmtN(v)}</span></div>`).join("")}
      <div class="ch-cols">${cats.map(c=>{
        const tot=c.ok+c.late+c.miss, segs=SERIES.filter(s=>c[s.key]>0);
        const tip=`<b>${esc(c.label)}</b>${SERIES.map(s=>`<div><i style="background:${s.color}"></i>${s.label}: <b>${fmtN(c[s.key])}</b></div>`).join("")}<div class="ch-tip-f">${tot?Math.round(c.ok/tot*100):0}% a tiempo · ${fmtN(tot)} surtidos</div>`;
        return `<div class="ch-col" tabindex="0" data-tip="${esc(tip)}">
          ${pocos&&tot?`<span class="ch-tot">${fmtN(tot)}</span>`:""}
          <div class="ch-stack">${segs.map((s,i)=>`<i class="${i===segs.length-1?"top":""}" style="height:${c[s.key]/max*alto}px;background:${s.color}"></i>`).join("")}</div></div>`;
      }).join("")}</div>
    </div>
    <div class="ch-xs">${cats.map(c=>`<span title="${esc(c.label)}">${pocos||cats.indexOf(c)%Math.ceil(cats.length/10)===0?esc(c.label):""}</span>`).join("")}</div>
  </div>`;
}
// Un solo cuadro de detalle para todas las gráficas.
(function(){
  let tip=null;
  const show=el=>{ if(!tip){ tip=document.createElement("div"); tip.className="ch-tip panel"; document.body.appendChild(tip); }
    tip.innerHTML=el.dataset.tip; tip.hidden=false; const r=el.getBoundingClientRect(), w=tip.offsetWidth;
    tip.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+"px"; tip.style.top=Math.max(8,r.top-tip.offsetHeight-6)+"px"; };
  const hide=()=>{ if(tip) tip.hidden=true; };
  document.addEventListener("mouseover",e=>{ const c=e.target.closest(".ch-col"); c?show(c):hide(); });
  document.addEventListener("focusin",e=>{ const c=e.target.closest(".ch-col"); c?show(c):hide(); });
  document.addEventListener("scroll",hide,true);
})();
