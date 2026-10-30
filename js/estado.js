/* ===================== Estado ===================== */
const S={gafetes:{},bom:{},plan:{},surtidos:{},eventos:{},config:{},
  me:null, view:null, sel:{fecha:today(),turno:"",linea:"",bom:null,bomDel:new Set()}, ready:false};
const DEFAULT_CFG={pct:20, tolerancia:10, anticipacionHoras:24, turnos:{T1:{inicio:"06:00",fin:"14:00"},T2:{inicio:"14:00",fin:"22:00"},T3:{inicio:"22:00",fin:"06:00"}}};
function cfg(){ const c=S.config.general||{}; return {pct:Math.max(20,Number(c.pct)||20), tolerancia:Number(c.tolerancia)||DEFAULT_CFG.tolerancia,
  // Horas antes del inicio del turno del plan. Si solo existe el ajuste anterior en días, se convierte.
  anticipacion:c.anticipacionHoras!=null?Math.max(0,Number(c.anticipacionHoras)||0):c.anticipacion!=null?Math.max(0,Number(c.anticipacion)||0)*24:DEFAULT_CFG.anticipacionHoras, turnos:Object.assign({},DEFAULT_CFG.turnos,c.turnos||{})}; }

const ROLES={
  admin:{label:"Administrador",tabs:["lineas","surtido","plan","bom","metricas","reportes","gafetes"]},
  planeador:{label:"Planeador",tabs:["plan","bom","lineas","surtido","metricas","reportes"]},
  materialista:{label:"Materialista",tabs:["lineas","surtido"]},
  lider:{label:"Líder de línea",tabs:["lineas","surtido","metricas","reportes"]},
  gerente:{label:"Gerencia",tabs:["plan","lineas","surtido","metricas","reportes"]},
  supervisor:{label:"Supervisor",tabs:["lineas","metricas","reportes","surtido","plan"]},
  receptor:{label:"Recibe material (sin acceso)",tabs:[]}
};
// Íconos del menú lateral (trazo, heredan el color del texto).
const TAB_ICON={
  lineas:'<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
  surtido:'<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  plan:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  bom:'<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
  metricas:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  reportes:'<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/>',
  gafetes:'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17c1-2 2.5-3 4-3s3 1 4 3"/>'
};
const TAB_LABEL={lineas:"Líneas",surtido:"Surtido",plan:"Plan de producción",bom:"BOM",metricas:"Métricas",reportes:"Reportes",gafetes:"Gafetes y ajustes"};
const can={
  editPlan:()=>["admin","planeador","gerente"].includes(S.me?.rol),
  // Aprueba altas, cambios y bajas del plan dentro del plazo de anticipación; sus propios cambios no requieren aprobación.
  approve:()=>["admin","gerente"].includes(S.me?.rol),
  confirm:()=>["admin","materialista","lider"].includes(S.me?.rol),
  // Paros de línea, reconteos y arranque de ensambles.
  ops:()=>["admin","planeador","materialista","lider"].includes(S.me?.rol),
  admin:()=>S.me?.rol==="admin"
};

function today(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtT=d=>String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
const fmtN=(n,dp=0)=>Number(n).toLocaleString("es-MX",{maximumFractionDigits:dp,minimumFractionDigits:0});
function userByBadge(b){ b=String(b||"").trim(); return Object.values(S.gafetes).find(u=>String(u.gafete)===b)||null; }
function toast(msg){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3200); }
