/* ===================== Acceso con correo y contraseña (Supabase Auth) =====================
   El administrador crea las cuentas en Supabase (el registro abierto está desactivado). Con su cuenta, cada persona
   envía una solicitud (sl_solicitudes) y entra cuando el administrador la aprueba en Usuarios, que liga la cuenta a
   su gafete y le da un rol. */
const authUrl=()=>location.origin+location.pathname;
function authError(e){
  const m=String(e?.message||e||"");
  if(/invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
  if(/email not confirmed/i.test(m)) return "Tu correo aún no está confirmado. Abre el enlace que te enviamos y vuelve a intentarlo.";
  if(/signups not allowed|signup_disabled/i.test(m)) return "El registro de cuentas nuevas está desactivado. Pide al administrador que active el registro o que cree tu cuenta.";
  if(/already registered|already exists/i.test(m)) return "Ese correo ya tiene cuenta. Inicia sesión con tu contraseña.";
  if(/password should be at least|weak password/i.test(m)) return "La contraseña es muy corta o muy simple. Usa al menos 8 caracteres.";
  if(/for security purposes|rate limit|too many/i.test(m)) return "Demasiados intentos. Espera un momento y vuelve a intentarlo.";
  if(/fetch|network/i.test(m)) return "Sin conexión. Revisa el internet y vuelve a intentar.";
  return m||"No se pudo completar. Intenta de nuevo.";
}
function authCard(inner){ return `<div class="login"><div class="card panel">${inner}</div></div>`; }
function renderAuth(app,modo,aviso){
  const links=[["login","Iniciar sesión"],["olvido","¿Olvidaste tu contraseña?"]].filter(([k])=>k!==modo)
    .map(([k,l])=>`<button type="button" class="btn ghost" data-auth="${k}" style="padding:2px 8px">${l}</button>`).join(" · ");
  const forms={
    login:`<div class="lbl">Surtido de Línea</div><h2>Inicia sesión</h2>
      <form id="f-auth" class="stack">
        <div class="fld"><label for="a-email">Correo</label><input id="a-email" type="email" autocomplete="username" required></div>
        <div class="fld"><label for="a-pass">Contraseña</label><input id="a-pass" type="password" autocomplete="current-password" required></div>
        <button class="btn pri">Iniciar sesión</button></form>`,
    olvido:`<div class="lbl">Surtido de Línea</div><h2>Recupera tu contraseña</h2>
      <p class="muted">Te enviaremos un enlace a tu correo para crear una nueva.</p>
      <form id="f-auth" class="stack">
        <div class="fld"><label for="a-email">Correo</label><input id="a-email" type="email" autocomplete="username" required></div>
        <button class="btn pri">Enviar enlace</button></form>`
  };
  app.innerHTML=authCard(`${forms[modo]}${aviso?`<p class="note" style="margin-top:14px">${aviso}</p>`:""}<div class="err" id="a-err"></div><p class="hint">${links}</p>${modo==="login"?`<p class="hint">¿No tienes cuenta? Pide al administrador que la cree.</p>`:""}`);
  app.querySelectorAll("[data-auth]").forEach(b=>b.onclick=()=>renderAuth(app,b.dataset.auth));
  const f=document.getElementById("f-auth"), err=document.getElementById("a-err"), btn=f.querySelector("button.pri");
  f.querySelector("input").focus();
  f.onsubmit=async e=>{ e.preventDefault(); err.textContent=""; btn.disabled=true;
    try{
      const email=ffv("a-email"), sb=Store.sb.auth;
      if(modo==="login"){
        const {error}=await sb.signInWithPassword({email,password:document.getElementById("a-pass").value});
        if(error) throw error; location.reload(); return;
      }
      if(modo==="olvido"){
        const {error}=await sb.resetPasswordForEmail(email,{redirectTo:authUrl()});
        if(error) throw error; return renderAuth(app,"login",`Si <b>${esc(email)}</b> tiene cuenta, te llegará un enlace para crear una nueva contraseña.`);
      }
    }catch(x){ err.textContent=authError(x); btn.disabled=false; }
  };
}
async function sendSolicitud(user,nombre,gafete){
  const {error}=await Store.sb.from("sl_solicitudes").insert({user_id:user.id,email:user.email,nombre,gafete});
  if(error&&error.code!=="23505") throw error; // 23505: ya había una solicitud
}
// Cuenta sin gafete ligado: solicitud pendiente, o formulario para enviarla.
async function renderPending(app,session){
  const u=session.user, md=u.user_metadata||{}, salir=`<button class="btn" id="a-out">Cerrar sesión</button>`;
  const {data:sol,error}=await Store.sb.from("sl_solicitudes").select("*").eq("user_id",u.id).maybeSingle();
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
    <form id="f-sol" class="stack">
      <div class="fld"><label for="s-nombre">Nombre</label><input id="s-nombre" value="${esc(md.nombre||"")}" required></div>
      <div class="fld"><label for="s-gafete">Número de gafete</label><input id="s-gafete" value="${esc(md.gafete||"")}" inputmode="numeric" autocomplete="off" required></div>
      <button class="btn pri">Solicitar acceso</button></form>
    <div class="err" id="s-err"></div><p class="hint">${salir}</p>`);
  bindOut();
  document.getElementById("f-sol").onsubmit=async e=>{ e.preventDefault();
    try{ await sendSolicitud(u,ffv("s-nombre"),ffv("s-gafete")); renderPending(app,session); }
    catch(x){ document.getElementById("s-err").textContent=authError(x); } };
}
function renderNoAccess(app,g){
  app.innerHTML=authCard(`<div class="lbl">Sin acceso</div><h2>Tu cuenta no tiene acceso</h2>
    <p class="muted">${esc(g.nombre)} está registrado solo para recibir material. Pide al administrador que te asigne otro rol en Usuarios.</p>
    <button class="btn" id="a-out">Cerrar sesión</button>`);
  bindOut();
}
// Enlace de "olvidé mi contraseña": la sesión de recuperación permite fijar una nueva.
function renderNewPassword(app){
  S.recovery=true;
  app.innerHTML=authCard(`<div class="lbl">Recuperar contraseña</div><h2>Crea una nueva contraseña</h2>
    <form id="f-np" class="stack">
      <div class="fld"><label for="np-1">Nueva contraseña</label><input id="np-1" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="fld"><label for="np-2">Repítela</label><input id="np-2" type="password" autocomplete="new-password" minlength="8" required></div>
      <button class="btn pri">Guardar contraseña</button></form><div class="err" id="np-err"></div>`);
  document.getElementById("f-np").onsubmit=async e=>{ e.preventDefault(); const err=document.getElementById("np-err");
    const p=document.getElementById("np-1").value; if(p!==document.getElementById("np-2").value) return err.textContent="Las contraseñas no coinciden.";
    const {error}=await Store.sb.auth.updateUser({password:p});
    if(error) return err.textContent=authError(error);
    history.replaceState(null,"",authUrl()); location.reload(); };
}
const bindOut=()=>{ const b=document.getElementById("a-out"); if(b) b.onclick=()=>Store.sb.auth.signOut(); };
