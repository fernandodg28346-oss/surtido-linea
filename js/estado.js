/* ===================== Estado ===================== */
const S={gafetes:{},bom:{},plan:{},surtidos:{},eventos:{},config:{},
  me:null, view:null, sel:{fecha:today(),turno:"",linea:"",bom:null,bomDel:new Set()}, ready:false};
const DEFAULT_CFG={pct:20, tolerancia:10, anticipacionHoras:24, turnos:{T1:{inicio:"06:00",fin:"14:00"},T2:{inicio:"14:00",fin:"22:00"},T3:{inicio:"22:00",fin:"06:00"}}};
function cfg(){ const c=S.config.general||{}; return {pct:Math.max(20,Number(c.pct)||20), tolerancia:Number(c.tolerancia)||DEFAULT_CFG.tolerancia,
  // Horas antes del inicio del turno del plan. Si solo existe el ajuste anterior en días, se convierte.
  anticipacion:c.anticipacionHoras!=null?Math.max(0,Number(c.anticipacionHoras)||0):c.anticipacion!=null?Math.max(0,Number(c.anticipacion)||0)*24:DEFAULT_CFG.anticipacionHoras, turnos:Object.assign({},DEFAULT_CFG.turnos,c.turnos||{})}; }

const ROLES={
  admin:{label:"Administrador",tabs:["lineas","surtido","plan","bom","metricas","gafetes","ajustes"]},
  planeador:{label:"Planeador",tabs:["plan","bom","lineas","surtido","metricas"]},
  materialista:{label:"Materialista",tabs:["lineas","surtido"]},
  lider:{label:"Líder de línea",tabs:["lineas","surtido","metricas"]},
  gerente:{label:"Gerencia",tabs:["plan","lineas","surtido","metricas"]},
  supervisor:{label:"Supervisor",tabs:["lineas","metricas","surtido","plan"]},
  receptor:{label:"Recibe material (sin acceso)",tabs:[]}
};
// Íconos del menú lateral (trazo, heredan el color del texto).
const TAB_ICON={
  lineas:'<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
  surtido:'<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  plan:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  bom:'<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
  metricas:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gafetes:'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17c1-2 2.5-3 4-3s3 1 4 3"/>',
  ajustes:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
};
const TAB_LABEL={lineas:"Líneas",surtido:"Surtido",plan:"Plan de producción",bom:"BOM",metricas:"Métricas y reportes",gafetes:"Usuarios",ajustes:"Ajustes"};
// Privilegios configurables por rol (Ajustes → Permisos por rol, guardados en sl_config "permisos").
// El administrador los tiene todos y es el único con Usuarios y Ajustes (la base solo le deja escribir gafetes a él);
// "Recibe material" no entra a la app. Sin configuración, cada rol conserva los privilegios de ROLES y PERM_DEFAULT.
const PRIVS=[
  {k:"tab:lineas",g:"Pestañas",l:"Líneas"},{k:"tab:surtido",g:"Pestañas",l:"Surtido"},{k:"tab:plan",g:"Pestañas",l:"Plan de producción"},
  {k:"tab:bom",g:"Pestañas",l:"BOM"},{k:"tab:metricas",g:"Pestañas",l:"Métricas y reportes"},
  {k:"editPlan",g:"Acciones",l:"Modificar el plan (agregar, editar, quitar, rolar, Excel)",tab:"plan"},
  {k:"approve",g:"Acciones",l:"Aprobar cambios al plan y modificarlo sin aprobación",tab:"plan"},
  {k:"editBom",g:"Acciones",l:"Editar BOM",tab:"bom"},
  {k:"confirm",g:"Acciones",l:"Confirmar surtidos",tab:"surtido"},
  {k:"ops",g:"Acciones",l:"Paros, reconteos e inicio de ensamble",tab:"surtido"}
];
const ROLES_CONFIG=["planeador","gerente","materialista","lider","supervisor"];
const PERM_DEFAULT={editPlan:["planeador","gerente"],approve:["gerente"],editBom:["planeador"],confirm:["materialista","lider"],ops:["planeador","materialista","lider"]};
const TAB_ORDER=["lineas","surtido","plan","bom","metricas"];
function defaultPerms(rol){
  const o={}; PRIVS.forEach(p=>{ o[p.k]=p.k.startsWith("tab:")?ROLES[rol].tabs.includes(p.k.slice(4)):PERM_DEFAULT[p.k].includes(rol); }); return o;
}
function permsOf(rol){ return Object.assign(defaultPerms(rol),S.config.permisos?.roles?.[rol]||{}); }
function perm(rol,k){ if(rol==="admin") return true; if(!ROLES_CONFIG.includes(rol)) return false; return !!permsOf(rol)[k]; }
// Pestañas del rol: primero las de su orden original, luego las que se le hayan dado.
function tabsOf(rol){
  if(rol==="admin") return ROLES.admin.tabs;
  const base=ROLES[rol]?.tabs||[];
  return [...base,...TAB_ORDER.filter(t=>!base.includes(t))].filter(t=>perm(rol,"tab:"+t));
}
const can={
  editPlan:()=>perm(S.me?.rol,"editPlan"),
  // Aprueba altas, cambios y bajas del plan dentro del plazo de anticipación; sus propios cambios no requieren aprobación.
  approve:()=>perm(S.me?.rol,"approve"),
  editBom:()=>perm(S.me?.rol,"editBom"),
  confirm:()=>perm(S.me?.rol,"confirm"),
  // Paros de línea, reconteos y arranque de ensambles.
  ops:()=>perm(S.me?.rol,"ops"),
  admin:()=>S.me?.rol==="admin"
};

function today(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtT=d=>String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
const fmtN=(n,dp=0)=>Number(n).toLocaleString("es-MX",{maximumFractionDigits:dp,minimumFractionDigits:0});
// Catálogo de líneas (Ajustes); vacío = la línea del plan se escribe a mano.
function lineasCat(){ return (S.config.lineas?.items||[]).map(x=>x.nombre).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})); }
function userByBadge(b){ b=String(b||"").trim(); return Object.values(S.gafetes).find(u=>String(u.gafete)===b)||null; }
function toast(msg){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3200); }
