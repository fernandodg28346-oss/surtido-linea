/* ===================== Acceso con correo y contraseña (Supabase Auth) =====================
   Quien no tiene acceso lo pide con "Solicitar acceso" (sl_solicitudes_acceso, sin necesidad de cuenta). El
   administrador la aprueba en Usuarios: la función sl-aprobar-acceso crea la cuenta con una contraseña inicial
   (o usa la que ya existe con ese correo) y la liga al gafete con un rol. En el primer ingreso con la contraseña
   inicial, la app pide crear una propia. */
const authUrl=()=>location.origin+location.pathname;
function authError(e){
  const m=String(e?.message||e||"");
  if(/invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
  if(/email not confirmed/i.test(m)) return "Tu correo aún no está confirmado. Pide al administrador que revise tu cuenta.";
  if(/signups not allowed|signup_disabled/i.test(m)) return "El registro directo está desactivado. Usa \"Solicitar acceso\".";
  if(/password should be at least|weak password/i.test(m)) return "La contraseña es muy corta o muy simple. Usa al menos 8 caracteres.";
  if(/same password|should be different/i.test(m)) return "La nueva contraseña debe ser distinta de la anterior.";
  if(/for security purposes|rate limit|too many/i.test(m)) return "Demasiados intentos. Espera un momento y vuelve a intentarlo.";
  if(/fetch|network/i.test(m)) return "Sin conexión. Revisa el internet y vuelve a intentar.";
  return m||"No se pudo completar. Intenta de nuevo.";
}
function authCard(inner){ return `<div class="login"><div class="card panel">${inner}</div></div>`; }
const solicitudCampos=(n,g,email)=>`
  <div class="fld"><label for="s-nombre">Nombre completo</label><input id="s-nombre" value="${esc(n||"")}" autocomplete="name" required minlength="2" maxlength="80"></div>
  <div class="fld"><label for="s-gafete">Número de gafete</label><input id="s-gafete" value="${esc(g||"")}" autocomplete="off" inputmode="numeric" required maxlength="30"></div>
  ${email===undefined?`<div class="fld"><label for="s-email">Correo</label><input id="s-email" type="email" autocomplete="email" required maxlength="120"></div>`:""}
  <div class="fld"><label for="s-area">Área o línea <span class="muted">(opcional)</span></label><input id="s-area" maxlength="60" autocomplete="off"></div>`;
async function enviarSolicitud(email){
  const {error}=await Store.sb.from("sl_solicitudes_acceso").insert({nombre:ffv("s-nombre"),gafete:ffv("s-gafete"),email:email.toLowerCase(),area:ffv("s-area")||null});
  if(error&&error.code==="23505") throw new Error("Ya hay una solicitud pendiente con ese correo. El administrador la revisará.");
  if(error) throw error;
}
function renderAuth(app,modo,aviso){
  const links=[["login","Iniciar sesión"],["solicitar","Solicitar acceso"],["olvido","¿Olvidaste tu contraseña?"]].filter(([k])=>k!==modo)
    .map(([k,l])=>`<button type="button" class="btn ghost" data-auth="${k}" style="padding:2px 8px">${l}</button>`).join(" · ");
  const forms={
    login:`<div class="lbl">Surtido de Línea</div><h2>Inicia sesión</h2>
      <form id="f-auth" class="stack">
        <div class="fld"><label for="a-email">Correo</label><input id="a-email" type="email" autocomplete="username" required></div>
        <div class="fld"><label for="a-pass">Contraseña</label><input id="a-pass" type="password" autocomplete="current-password" required></div>
        <button class="btn pri">Iniciar sesión</button></form>`,
    solicitar:`<div class="lbl">Surtido de Línea</div><h2>Solicitar acceso</h2>
      <p class="muted">Captura tus datos. El administrador los revisa y, al aprobar, te entrega tu contraseña inicial.</p>
      <form id="f-auth" class="stack">${solicitudCampos()}<button class="btn pri">Enviar solicitud</button></form>`,
    olvido:`<div class="lbl">Surtido de Línea</div><h2>Recupera tu contraseña</h2>
      <p class="muted">Te enviaremos un enlace a tu correo para crear una nueva. Si no te llega, pide al administrador una contraseña nueva.</p>
      <form id="f-auth" class="stack">
        <div class="fld"><label for="a-email">Correo</label><input id="a-email" type="email" autocomplete="username" required></div>
        <button class="btn pri">Enviar enlace</button></form>`
  };
  app.innerHTML=authCard(`${forms[modo]}${aviso?`<p class="note" style="margin-top:14px">${aviso}</p>`:""}<div class="err" id="a-err"></div><p class="hint">${links}</p>`);
  app.querySelectorAll("[data-auth]").forEach(b=>b.onclick=()=>renderAuth(app,b.dataset.auth));
  const f=document.getElementById("f-auth"), err=document.getElementById("a-err"), btn=f.querySelector("button.pri");
  f.querySelector("input").focus();
  f.onsubmit=async e=>{ e.preventDefault(); err.textContent=""; btn.disabled=true;
    try{
      if(modo==="login"){
        const {error}=await Store.sb.auth.signInWithPassword({email:ffv("a-email"),password:document.getElementById("a-pass").value});
        if(error) throw error; location.reload(); return;
      }
      if(modo==="solicitar"){
        const email=ffv("s-email"); await enviarSolicitud(email);
        return renderAuth(app,"login",`Solicitud enviada para <b>${esc(email)}</b>. Cuando el administrador la apruebe te entregará tu contraseña inicial; con ella inicia sesión aquí.`);
      }
      const email=ffv("a-email"), {error}=await Store.sb.auth.resetPasswordForEmail(email,{redirectTo:authUrl()});
      if(error) throw error; renderAuth(app,"login",`Si <b>${esc(email)}</b> tiene cuenta, te llegará un enlace para crear una nueva contraseña.`);
    }catch(x){ err.textContent=authError(x); btn.disabled=false; }
  };
}
// Cuenta que inició sesión pero no está ligada a un gafete: solicitud pendiente, o formulario para enviarla.
async function renderPending(app,session){
  const u=session.user, md=u.user_metadata||{}, salir=`<button class="btn" id="a-out">Cerrar sesión</button>`;
  const {data:sol,error}=await Store.sb.from("sl_solicitudes_acceso").select("*").eq("estado","pendiente").ilike("email",u.email).maybeSingle();
  if(error){ app.innerHTML=authCard(`<h2>No se pudo revisar tu acceso</h2><p class="err">${esc(authError(error))}</p>${salir}`); bindOut(); return; }
  if(sol){
    app.innerHTML=authCard(`<div class="lbl">Acceso pendiente</div><h2>Tu solicitud está en revisión</h2>
      <p class="muted">El administrador debe aprobarla en Usuarios. Entrarás automáticamente en cuanto lo haga.</p>
      <p class="note"><b>${esc(sol.nombre)}</b> · gafete <span class="mono">${esc(sol.gafete)}</span><br>${esc(sol.email)} · enviada ${new Date(sol.creado).toLocaleString("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</p>
      <div class="row"><button class="btn pri" id="a-chk">Revisar de nuevo</button>${salir}</div>`);
    bindOut(); document.getElementById("a-chk").onclick=()=>location.reload();
    const t=setInterval(async()=>{ const {data}=await Store.sb.from("sl_gafetes").select("id").eq("data->>user_id",u.id).maybeSingle(); if(data){ clearInterval(t); location.reload(); } },20000);
    return;
  }
  app.innerHTML=authCard(`<div class="lbl">Sin acceso</div><h2>Solicita acceso</h2>
    <p class="muted">Tu cuenta <b>${esc(u.email)}</b> aún no tiene acceso al surtido. Envía tu solicitud al administrador.</p>
    <form id="f-sol" class="stack">${solicitudCampos(md.nombre,md.gafete,u.email)}<button class="btn pri">Solicitar acceso</button></form>
    <div class="err" id="s-err"></div><p class="hint">${salir}</p>`);
  bindOut();
  document.getElementById("f-sol").onsubmit=async e=>{ e.preventDefault();
    try{ await enviarSolicitud(u.email); renderPending(app,session); }
    catch(x){ document.getElementById("s-err").textContent=authError(x); } };
}
function renderNoAccess(app,g){
  app.innerHTML=authCard(`<div class="lbl">Sin acceso</div><h2>Tu cuenta no tiene acceso</h2>
    <p class="muted">${g.rol==="receptor"?`${esc(g.nombre)} está registrado solo para recibir material. Pide al administrador que te asigne otro rol en Usuarios.`
      :`Tu rol (${esc(ROLES[g.rol]?.label||g.rol)}) no tiene ninguna pestaña habilitada. Pide al administrador que revise los permisos en Ajustes.`}</p>
    <button class="btn" id="a-out">Cerrar sesión</button>`);
  bindOut();
}
// Nueva contraseña: tras el enlace de recuperación, o en el primer ingreso con la contraseña inicial.
function renderNewPassword(app,primera){
  S.recovery=true;
  app.innerHTML=authCard(`<div class="lbl">${primera?"Primer ingreso":"Recuperar contraseña"}</div><h2>Crea tu contraseña</h2>
    ${primera?`<p class="muted">Entraste con la contraseña inicial que te dio el administrador. Crea una propia para continuar.</p>`:""}
    <form id="f-np" class="stack">
      <div class="fld"><label for="np-1">Nueva contraseña</label><input id="np-1" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="fld"><label for="np-2">Repítela</label><input id="np-2" type="password" autocomplete="new-password" minlength="8" required></div>
      <button class="btn pri">Guardar contraseña</button></form><div class="err" id="np-err"></div>
    ${primera?`<p class="hint"><button class="btn ghost" id="a-out" style="padding:2px 8px">Cerrar sesión</button></p>`:""}`);
  bindOut();
  document.getElementById("f-np").onsubmit=async e=>{ e.preventDefault(); const err=document.getElementById("np-err");
    const p=document.getElementById("np-1").value; if(p!==document.getElementById("np-2").value) return err.textContent="Las contraseñas no coinciden.";
    const {error}=await Store.sb.auth.updateUser({password:p,data:{debe_cambiar:false}});
    if(error) return err.textContent=authError(error);
    history.replaceState(null,"",authUrl()); location.reload(); };
}
// Cambiar la contraseña desde el menú, con la sesión abierta.
function openChangePassword(){
  const root=document.getElementById("modal-root");
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="cp-t">
    <div class="ph"><h3 id="cp-t">Cambiar contraseña</h3><button class="btn ghost" id="cp-x">Cancelar</button></div>
    <form class="pb" id="f-cp">
      <div class="fld"><label for="cp-1">Nueva contraseña</label><input id="cp-1" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="fld"><label for="cp-2">Repítela</label><input id="cp-2" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="err" id="cp-err"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn pri">Guardar</button></div></form></div></div>`;
  const close=()=>root.innerHTML="";
  document.getElementById("cp-x").onclick=close; document.getElementById("cp-1").focus();
  document.getElementById("f-cp").onsubmit=async e=>{ e.preventDefault(); const err=document.getElementById("cp-err");
    const p=document.getElementById("cp-1").value; if(p!==document.getElementById("cp-2").value) return err.textContent="Las contraseñas no coinciden.";
    const {error}=await Store.sb.auth.updateUser({password:p,data:{debe_cambiar:false}});
    if(error) return err.textContent=authError(error);
    close(); toast("Contraseña actualizada."); };
}
const bindOut=()=>{ const b=document.getElementById("a-out"); if(b) b.onclick=()=>Store.sb.auth.signOut(); };
