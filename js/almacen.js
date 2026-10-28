/* ===================== Almacén: Supabase (tablas sl_*, una fila = {id, data jsonb}) =====================
   Cada tabla se lee completa (o filtrada por fecha) y se vuelve a leer cuando Realtime avisa de un cambio. */
const Store={
  sb:null, session:null, equipo:"",
  init(){ this.sb=window.supabase.createClient(SL_CONFIG.supabaseUrl,SL_CONFIG.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true}}); },
  async fetch(col,filter){
    const out={}; let from=0;
    for(;;){
      let q=this.sb.from("sl_"+col).select("id,data");
      if(filter) q=q.eq("data->>"+filter.field,filter.value);
      const {data,error}=await q.order("id").range(from,from+999);
      if(error) throw error;
      data.forEach(r=>{out[r.id]=Object.assign({},r.data,{_id:r.id});});
      if(data.length<1000) break; from+=1000;
    }
    return out;
  },
  watch(col,cb,filter){
    let alive=true, timer=null;
    const load=async()=>{ try{ const m=await this.fetch(col,filter); if(alive) cb(m); }catch(e){ if(alive) toast("No se pudieron leer los datos ("+(e.message||e.code)+")."); } };
    const soon=()=>{ clearTimeout(timer); timer=setTimeout(load,250); };
    const ch=this.sb.channel("sl_"+col+"_"+newId())
      .on("postgres_changes",{event:"*",schema:"public",table:"sl_"+col},soon)
      .subscribe(st=>{ if(st==="SUBSCRIBED") soon(); });
    load();
    const onFocus=()=>soon(); window.addEventListener("focus",onFocus);
    return ()=>{ alive=false; clearTimeout(timer); this.sb.removeChannel(ch); window.removeEventListener("focus",onFocus); };
  },
  async set(col,id,data){
    const body=JSON.parse(JSON.stringify(data)); delete body._id;
    const {error}=await this.sb.from("sl_"+col).upsert({id,data:body,actualizado:new Date().toISOString()});
    if(error) throw error;
  },
  async insert(col,id,data){
    const body=JSON.parse(JSON.stringify(data)); delete body._id;
    const {error}=await this.sb.from("sl_"+col).insert({id,data:body});
    if(error) throw error;
  },
  async del(col,id){
    const {error}=await this.sb.from("sl_"+col).delete().eq("id",id);
    if(error) throw error;
  },
  async delMany(col,ids){
    for(let i=0;i<ids.length;i+=200){
      const {error}=await this.sb.from("sl_"+col).delete().in("id",ids.slice(i,i+200));
      if(error) throw error;
    }
  }
};
const safeId=s=>String(s).trim().replace(/[^A-Za-z0-9_\-.~:@+]/g,"-").slice(0,120)||"x";
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
