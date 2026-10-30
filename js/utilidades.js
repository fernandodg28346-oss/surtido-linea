/* ===================== Utilidades ===================== */
async function safeWrite(fn){
  try{ await fn(); return true; }
  catch(e){ const code=e&&e.code;
    toast(code==="23505"?"Este surtido ya fue confirmado por otra persona.":
      code==="42501"?"Este equipo no tiene permiso para guardar. Pide al administrador que lo autorice.":
      /fetch|network/i.test(e.message||"")?"Sin conexión. Revisa el internet y vuelve a intentar.":
      "No se pudo guardar ("+(e.message||code)+").");
    return false; }
}
function confirmBox(msg,label,fn){
  const root=document.getElementById("modal-root");
  root.innerHTML=`<div class="scrim"><div class="panel modal" role="dialog" aria-modal="true"><div class="pb"><p style="margin:0">${esc(msg)}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" id="cb-n">Cancelar</button><button class="btn pri" id="cb-y">${esc(label)}</button></div></div></div></div>`;
  document.getElementById("cb-n").onclick=()=>root.innerHTML="";
  document.getElementById("cb-y").onclick=()=>{root.innerHTML=""; fn();};
}
const norm=s=>String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[\s_]/g,"");
function pick(row,keys){ const nk=keys.map(norm); for(const k of Object.keys(row)){ if(nk.includes(norm(k))) return row[k]; } return undefined; }
function xlDate(v){
  if(v==null||v==="") return "";
  if(v instanceof Date) return v.getFullYear()+"-"+String(v.getMonth()+1).padStart(2,"0")+"-"+String(v.getDate()).padStart(2,"0");
  if(typeof v==="number"){ const d=new Date(Math.round((v-25569)*86400000)); return d.toISOString().slice(0,10); }
  const s=String(v).trim(); let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
  m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); if(m){ const y=m[3].length===2?"20"+m[3]:m[3]; return y+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0"); }
  return "";
}
function readXlsx(file,cb){
  if(!file) return; if(!window.XLSX) return toast("No se pudo cargar el lector de Excel. Revisa tu conexión.");
  const fr=new FileReader();
  fr.onload=async()=>{ try{ const wb=XLSX.read(new Uint8Array(fr.result),{type:"array",cellDates:true});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
      if(!rows.length) return toast("El archivo no tiene filas.");
      await cb(rows);
    }catch(e){ toast("No se pudo leer el archivo: "+e.message); } };
  fr.readAsArrayBuffer(file);
}
async function downloadXlsx(name,aoa){
  if(!window.XLSX) return toast("No se pudo cargar el generador de Excel.");
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),"Datos");
  await saveFile(name,new Uint8Array(XLSX.write(wb,{bookType:"xlsx",type:"array"})),aoa);
}
// CSV en UTF-8 con BOM para que Excel respete acentos; comas como separador.
async function downloadCsv(name,aoa){
  const cell=v=>{ const s=v==null?"":String(v); return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  const text="\ufeff"+aoa.map(r=>r.map(cell).join(",")).join("\r\n");
  await saveFile(name,new TextEncoder().encode(text),aoa);
}
async function saveFile(name,data,aoa){
  let dl=null; try{ dl=window.claude&&await window.claude.use("downloads"); }catch(e){}
  if(dl){ try{ await dl.save({filename:name,data}); }catch(e){ if(e.code!=="declined") toast("No se pudo descargar ("+e.code+")."); } return; }
  try{ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([data])); a.download=name; a.click(); }
  catch(e){ toast("Columnas: "+aoa[0].join(", ")); }
}
