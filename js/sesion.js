/* ===================== Sesión y navegación ===================== */
const logout=()=>Store.sb.auth.signOut();
function render(soft){
  if(!S.ready) return;
  if(surtFecha!==S.sel.fecha) watchDia();
  // El usuario es el gafete ligado a la cuenta; si el administrador le quita el acceso, se recarga y ve por qué.
  S.me=Object.values(S.gafetes).find(u=>u.user_id===S.uid)||null;
  if(!S.me||!ROLES[S.me.rol]||S.me.rol==="receptor"){ if(!S.reloading){ S.reloading=true; location.reload(); } return; }
  const top=document.getElementById("top"), app=document.getElementById("app");
  const tabs=tabsOf(S.me.rol);
  if(!tabs.length){ top.hidden=true; return renderNoAccess(app,S.me); }
  if(soft && document.querySelector(".scrim")) return;
  const active=document.activeElement; if(soft && active && active.matches("input,select") && app.contains(active)) return;
  top.hidden=false;
  if(!tabs.includes(S.view)) S.view=tabs[0];
  const nPend=Object.values(S.plan).filter(p=>p.pendiente).length;
  document.getElementById("tabs").innerHTML=tabs.map(t=>`<button data-tab="${t}" ${S.view===t?'aria-current="page"':""} title="${TAB_LABEL[t]}" aria-label="${TAB_LABEL[t]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TAB_ICON[t]}</svg><span class="t">${TAB_LABEL[t]}</span>${t==="plan"&&can.approve()&&nPend?`<span class="tab-n" title="${nPend} pendiente(s) de aprobación">${nPend}</span>`:""}</button>`).join("");
  document.getElementById("who").innerHTML=`<span class="nm">${esc(S.me.nombre)}</span><span class="role">${esc(ROLES[S.me.rol].label)}</span><button id="logout" title="Salir (${esc(S.me.nombre)})" aria-label="Salir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg><span class="t">Salir</span></button><button id="chpass" title="Cambiar contraseña" aria-label="Cambiar contraseña"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg><span class="t">Contraseña</span></button>`;
  document.getElementById("conn").textContent="● "+Store.email;
  ({lineas:viewLineas,surtido:viewSurtido,plan:viewPlan,bom:viewBom,metricas:viewMetricas,gafetes:viewGafetes,ajustes:viewAjustes})[S.view](app);
}
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-tab]"); if(t){ S.view=t.dataset.tab; render(); return; }
  if(e.target.closest("#logout")) logout();
  if(e.target.closest("#chpass")) openChangePassword();
  if(e.target.closest("#side-toggle")) setMenuCollapsed(!document.querySelector(".shell").classList.contains("collapsed"));
});

// Menú lateral contraído o expandido; cada equipo recuerda cómo lo dejó.
function setMenuCollapsed(c){
  document.querySelector(".shell").classList.toggle("collapsed",c);
  const b=document.getElementById("side-toggle"), lbl=c?"Expandir menú":"Contraer menú";
  b.setAttribute("aria-expanded",String(!c)); b.setAttribute("aria-label",lbl); b.title=lbl;
  try{ localStorage.setItem("sl_menu_contraido",c?"1":"0"); }catch(e){}
}
try{ if(localStorage.getItem("sl_menu_contraido")==="1") setMenuCollapsed(true); }catch(e){}

const ffv=id=>document.getElementById(id).value.trim();
