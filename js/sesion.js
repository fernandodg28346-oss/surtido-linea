/* ===================== Sesión y navegación ===================== */
// Cierra la sesión en este equipo aunque falle la red o Supabase no responda.
async function logout(){
  if(logout.enCurso) return; logout.enCurso=true;
  try{ await Promise.race([Store.sb.auth.signOut({scope:"local"}),new Promise(r=>setTimeout(r,3000))]); }catch(e){}
  // Solo la sesión de este proyecto de Supabase (sb-<proyecto>-auth-token y su code-verifier).
  try{ const pre="sb-"+new URL(SL_CONFIG.supabaseUrl).hostname.split(".")[0]+"-"; Object.keys(localStorage).filter(k=>k.startsWith(pre)).forEach(k=>localStorage.removeItem(k)); }catch(e){}
  location.reload();
}
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
  if(S.view==="layout"){ S.view="lineas"; S.sel.vistaLineas="layout"; } // el layout antes era una pestaña aparte
  if(!tabs.includes(S.view)) S.view=tabs[0];
  const nPend=Object.values(S.plan).filter(p=>p.pendiente).length;
  document.getElementById("tabs").innerHTML=tabs.map(t=>`<button data-tab="${t}" ${S.view===t?'aria-current="page"':""} title="${TAB_LABEL[t]}" aria-label="${TAB_LABEL[t]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TAB_ICON[t]}</svg><span class="t">${TAB_LABEL[t]}</span>${t==="plan"&&can.approve()&&nPend?`<span class="tab-n" title="${nPend} pendiente(s) de aprobación">${nPend}</span>`:""}</button>`).join("");
  const sinLeer=S.avisos.filter(a=>!a.leido).length, ic=d=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  document.getElementById("who").innerHTML=`<span class="nm" title="${esc(Store.email)}">${esc(S.me.nombre)}</span><span class="role">${esc(ROLES[S.me.rol].label)}</span>
    <div class="acts"><button id="avisos" title="Avisos" aria-label="Avisos${sinLeer?": "+sinLeer+" sin leer":""}">${ic('<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 003.4 0"/>')}<span class="t">Avisos</span>${sinLeer?`<span class="tab-n">${sinLeer}</span>`:""}</button>
    <button id="chpass" title="Cambiar contraseña" aria-label="Cambiar contraseña">${ic('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>')}<span class="t">Contraseña</span></button>
    <button id="theme" title="Cambiar tema" aria-label="Cambiar a tema ${curTheme()==="dark"?"claro":"oscuro"}">${curTheme()==="dark"?ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>')+'<span class="t">Claro</span>':ic('<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>')+'<span class="t">Oscuro</span>'}</button>
    <button id="logout" title="Salir (${esc(S.me.nombre)})" aria-label="Salir">${ic('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>')}<span class="t">Salir</span></button></div>`;
  document.getElementById("conn").textContent="● "+Store.email;
  ({lineas:viewLineas,surtido:viewSurtido,plan:viewPlan,bom:viewBom,metricas:viewMetricas,gafetes:viewGafetes,ajustes:viewAjustes})[S.view](app);
}
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-tab]"); if(t){ S.view=t.dataset.tab; render(); return; }
  if(e.target.closest("#logout")) logout();
  if(e.target.closest("#chpass")) openChangePassword();
  if(e.target.closest("#avisos")) openAvisos();
  if(e.target.closest("#theme")){ setTheme(curTheme()==="dark"?"light":"dark"); render(); }
});

// Tema claro u oscuro: sin elegir, sigue al del sistema; cada equipo recuerda el que eligió.
const curTheme=()=>{ const t=document.documentElement.getAttribute("data-theme"); return t||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"); };
function setTheme(t){ document.documentElement.setAttribute("data-theme",t); try{ localStorage.setItem("sl_tema",t); }catch(e){} }

const ffv=id=>document.getElementById(id).value.trim();
