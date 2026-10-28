/* ===================== Sesión del equipo (Supabase Auth) ===================== */
function renderDeviceLogin(app){
  app.innerHTML=`<div class="login"><div class="card panel">
    <div class="lbl">Paso 1 · Equipo</div><h2>Inicia sesión del equipo</h2>
    <form id="f-dev" class="stack">
      <div class="fld"><label for="d-email">Correo de la cuenta de equipo</label><input id="d-email" type="email" autocomplete="username" required></div>
      <div class="fld"><label for="d-pass">Contraseña</label><input id="d-pass" type="password" autocomplete="current-password" required></div>
      <button class="btn pri">Iniciar sesión</button>
      <div class="err" id="d-err"></div>
    </form></div></div>`;
  document.getElementById("f-dev").onsubmit=async e=>{e.preventDefault();
    const err=document.getElementById("d-err"); err.textContent="";
    const {error}=await Store.sb.auth.signInWithPassword({email:ffv("d-email"),password:document.getElementById("d-pass").value});
    if(error) err.textContent=error.message==="Invalid login credentials"?"Correo o contraseña incorrectos.":error.message;
    else location.reload();
  };
}
function renderNotAuthorized(app,session,error){
  app.innerHTML=`<div class="login"><div class="card panel">
    <div class="lbl">Equipo sin autorización</div><h2>Esta cuenta no puede usar el surtido</h2>
    <p class="muted">${error?"No se pudo comprobar la autorización: "+esc(error.message):"La cuenta <b>"+esc(session.user.email)+"</b> inició sesión, pero no está dada de alta como equipo de surtido."}</p>
    <p class="note">Pide al administrador que la autorice. Identificador de la cuenta: <span class="mono">${esc(session.user.id)}</span></p>
    <button class="btn" id="dev-out">Cerrar sesión del equipo</button></div></div>`;
  document.getElementById("dev-out").onclick=()=>Store.sb.auth.signOut();
}

function login(badge){
  const u=userByBadge(badge); if(!u) return false;
  if(!ROLES[u.rol]||!ROLES[u.rol].tabs.length){ S.loginMsg=`${u.nombre} está registrado solo para recibir material; no tiene acceso a la app.`; return false; }
  S.me=u; try{ sessionStorage.setItem("sl_me",u.gafete); }catch(e){}
  S.view=ROLES[u.rol]?.tabs[0]||"surtido"; render(); return true;
}
function logout(){ S.me=null; S.view=null; try{ sessionStorage.removeItem("sl_me"); }catch(e){} render(); }

function render(soft){
  if(!S.ready) return;
  if(surtFecha!==S.sel.fecha) watchDia();
  if(S.me){ S.me=userByBadge(S.me.gafete); if(!S.me) return logout(); }
  if(!S.me && S.pendingBadge){ const b=S.pendingBadge; S.pendingBadge=null; if(login(b)) return; }
  const top=document.getElementById("top"), app=document.getElementById("app");
  if(!S.me){ top.hidden=true; if(!soft) renderLogin(app); return; }
  if(soft && document.querySelector(".scrim")) return;
  const active=document.activeElement; if(soft && active && active.matches("input,select") && app.contains(active)) return;
  top.hidden=false;
  const tabs=ROLES[S.me.rol].tabs; if(!tabs.includes(S.view)) S.view=tabs[0];
  const nPend=Object.values(S.plan).filter(p=>p.pendiente).length;
  document.getElementById("tabs").innerHTML=tabs.map(t=>`<button data-tab="${t}" ${S.view===t?'aria-current="page"':""} title="${TAB_LABEL[t]}" aria-label="${TAB_LABEL[t]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TAB_ICON[t]}</svg><span class="t">${TAB_LABEL[t]}</span>${t==="plan"&&can.approve()&&nPend?`<span class="tab-n" title="${nPend} pendiente(s) de aprobación">${nPend}</span>`:""}</button>`).join("");
  document.getElementById("who").innerHTML=`<span class="nm">${esc(S.me.nombre)}</span><span class="role">${esc(ROLES[S.me.rol].label)}</span><button id="logout" title="Salir (${esc(S.me.nombre)})" aria-label="Salir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg><span class="t">Salir</span></button>`;
  document.getElementById("conn").textContent="● "+Store.equipo;
  ({lineas:viewLineas,surtido:viewSurtido,plan:viewPlan,bom:viewBom,metricas:viewMetricas,gafetes:viewGafetes})[S.view](app);
}
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-tab]"); if(t){ S.view=t.dataset.tab; render(); return; }
  if(e.target.closest("#logout")) logout();
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

/* ===================== Login con gafete ===================== */
function renderLogin(app){
  const noUsers=!Object.keys(S.gafetes).length;
  if(noUsers){
    app.innerHTML=`<div class="login"><div class="card panel">
      <div class="lbl">Primer uso</div><h2>Registra al administrador</h2>
      <p class="muted">Aún no hay gafetes registrados. La primera persona registrada será administrador y podrá dar de alta al resto del personal con su gafete.</p>
      <form id="f-first" class="stack">
        <div class="fld"><label for="ff-g">Número de gafete</label><input id="ff-g" required autocomplete="off"></div>
        <div class="fld"><label for="ff-n">Nombre</label><input id="ff-n" required></div>
        <button class="btn pri">Crear administrador</button>
      </form></div></div>`;
    document.getElementById("f-first").onsubmit=async e=>{e.preventDefault();
      const g=ffv("ff-g"), n=ffv("ff-n"); if(!g||!n) return;
      try{ await Store.set("gafetes",safeId(g),{gafete:g,nombre:n,rol:"admin"}); S.pendingBadge=g; }catch(err){ toast("No se pudo guardar: "+(err.code||err.message)); }
    };
    return;
  }
  app.innerHTML=`<div class="login"><div class="card panel">
    <div class="lbl">Acceso a planta</div><h2>Escanea tu gafete</h2>
    <input id="badge" class="badge-in" autocomplete="off" inputmode="numeric" placeholder="••••••" aria-label="Número de gafete">
    <div class="err" id="badge-err"></div>
    <p class="hint">El lector de gafetes escribe el número y envía Enter. También puedes teclearlo.</p>
    <p class="hint">Equipo: <b>${esc(Store.equipo)}</b> · <button class="btn ghost" id="dev-out" style="padding:2px 8px">Cerrar sesión del equipo</button></p>
  </div></div>`;
  const inp=document.getElementById("badge"); inp.focus();
  document.getElementById("dev-out").onclick=()=>Store.sb.auth.signOut();
  inp.onkeydown=e=>{ if(e.key==="Enter"){ S.loginMsg=""; if(!login(inp.value)){ document.getElementById("badge-err").textContent=S.loginMsg||"Gafete "+inp.value+" no registrado. Pide al administrador que lo registre en Gafetes."; inp.select(); } } };
}
const ffv=id=>document.getElementById(id).value.trim();
