/* modules/backupClipboard.js */
(function(){
  "use strict";
  const FORMAT_VERSION = 1;

  function toast(msg){
    try{ if(window.UI && typeof UI.toast==="function") UI.toast(msg); else alert(msg); }catch(_){}
  }
  function nowISO(){ try{ return new Date().toISOString(); }catch(_){ return ""; } }

  function buildBackupObject(options={}){
    const { appName="Mantenimiento", prefix=null, excludeKeys=[] } = options;
    const storage = {};
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(!k) continue;
      if(prefix && !String(k).startsWith(prefix)) continue;
      if(excludeKeys.includes(k)) continue;
      storage[k]=localStorage.getItem(k);
    }
    return { meta:{ app:appName, format:"localStorage-backup", version:FORMAT_VERSION, createdAt: nowISO() }, storage };
  }

  function serializeBackup(obj){ return JSON.stringify(obj, null, 2); }

  async function writeClipboard(text){
    if(navigator.clipboard && typeof navigator.clipboard.writeText==="function"){
      await navigator.clipboard.writeText(text); return true;
    }
    const ta=document.createElement("textarea");
    ta.value=text; ta.setAttribute("readonly","readonly");
    ta.style.position="fixed"; ta.style.left="-9999px"; ta.style.top="0";
    document.body.appendChild(ta); ta.select();
    let ok=false; try{ ok=document.execCommand("copy"); }catch(_){ ok=false; }
    document.body.removeChild(ta);
    return ok;
  }

  async function readClipboard(){
    if(navigator.clipboard && typeof navigator.clipboard.readText==="function") return await navigator.clipboard.readText();
    throw new Error("Lectura directa del portapapeles no disponible. Pega manualmente en la ventana.");
  }

  async function copyBackupToClipboard(options={}){
    const obj = buildBackupObject(options);
    const text = serializeBackup(obj);
    const ok = await writeClipboard(text);
    if(!ok) throw new Error("No se pudo copiar al portapapeles (permiso o limitación del navegador).");
    toast("Copia de seguridad copiada al portapapeles.");
    return { bytes:text.length, keys:Object.keys(obj.storage).length };
  }

  function _stripCodeFences(s){
    const t=String(s||"").trim();
    if(!t.startsWith("```")) return t;
    const lines=t.split(/\r?\n/);
    if(lines.length<3) return t;
    lines.shift();
    if(String(lines[lines.length-1]).trim()==="```") lines.pop();
    return lines.join("\n").trim();
  }

  function _extractJsonCandidate(s){
    const t=_stripCodeFences(String(s||"").trim());
    if(!t) return "";
    if(t.startsWith("{") || t.startsWith("[")) return t;
    const fo=t.indexOf("{"), lo=t.lastIndexOf("}");
    if(fo!=-1 && lo!=-1 && lo>fo) return t.slice(fo,lo+1).trim();
    const fa=t.indexOf("["), la=t.lastIndexOf("]");
    if(fa!=-1 && la!=-1 && la>fa) return t.slice(fa,la+1).trim();
    return t;
  }

  function _normalizeBackupObject(obj){
    if(obj && typeof obj==="object" && obj.storage && typeof obj.storage==="object" && !Array.isArray(obj.storage)) return obj;
    if(obj && typeof obj==="object" && obj.data && typeof obj.data==="object" && !Array.isArray(obj.data))
      return { meta: obj.meta || { format:"localStorage-backup" }, storage: obj.data };
    if(obj && typeof obj==="object" && !Array.isArray(obj)){
      const keys=Object.keys(obj);
      const looks = keys.includes("meta") && keys.some(k=>k!=="meta");
      if(!looks) return { meta:{ format:"localStorage-backup", version:0 }, storage: obj };
    }
    if(Array.isArray(obj)){
      const storage={}; let ok=0;
      for(const it of obj){
        if(it && typeof it==="object" && ("key" in it) && ("value" in it)){
          storage[String(it.key)] = (it.value===null ? "null" : String(it.value)); ok++;
        }
      }
      if(ok>0) return { meta:{ format:"localStorage-backup", version:0 }, storage };
    }
    throw new Error("Formato de copia no reconocido.");
  }

  function parseBackupText(text){
    const cand=_extractJsonCandidate(text);
    if(!cand) throw new Error("El portapapeles está vacío. Pega el JSON manualmente en la ventana.");
    const trimmed=String(cand).trim();
    let obj;
    try{ obj=JSON.parse(trimmed); }
    catch(_){
      const noBom=trimmed.replace(/^\uFEFF/,"");
      try{ obj=JSON.parse(noBom); }
      catch(e){ throw new Error("El texto pegado no es un JSON válido (o está incompleto/truncado)."); }
    }
    return _normalizeBackupObject(obj);
  }

  function restoreFromBackupObject(obj, mode="replace"){
    const entries=Object.entries(obj.storage||{});
    let written=0, failed=0;
    const keepSync = {};
    ["cuaderno_sync_device_id_v1","cuaderno_sync_paired_device_id_v1"].forEach(k=>{ const v=localStorage.getItem(k); if(v!=null) keepSync[k]=v; });
    if(mode==="replace"){ try{ localStorage.clear(); }catch(_){ } }
    for(const [k,v] of Object.entries(keepSync)){ try{ localStorage.setItem(k, String(v)); }catch(_){} }
    for(const [k,v] of entries){
      try{ localStorage.setItem(k, v===null ? "null" : String(v)); written++; }
      catch(e){ console.error("Fallo al restaurar clave:", k, e); failed++; }
    }
    try{
      if(window.StorageMT){ const regs=StorageMT.loadRegistros(); StorageMT.saveRegistros(regs, "restauracion_json"); }
      if(window.FirebaseSyncMT){ FirebaseSyncMT.log("restauracion_json", { claves:written }); FirebaseSyncMT.pushAllLocal("restauracion_json"); }
    }catch(_){}
    return { written, failed, total: entries.length };
  }

  // --- TSV (Excel)
  function _toNumberES(s){
    const t=String(s||"").trim().replace(/\s+/g,"").replace(/\./g,"").replace(",", ".");
    const x=Number(t);
    return Number.isFinite(x) ? x : 0;
  }
  function _parseDecimalHours(s){
    const str=String(s||"");
    let m=str.match(/=\s*([0-9.,]+)/);
    if(m) return _toNumberES(m[1]);
    m=str.match(/([0-9]+,[0-9]+|[0-9]+\.[0-9]+)/);
    if(m) return _toNumberES(m[1]);
    m=str.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if(m){ const hh=Number(m[1])||0, mm=Number(m[2])||0; return hh + (mm/60); }
    return 0;
  }

  function _clean(s){ return String(s ?? "").trim(); }
  function _splitItems(s){
    return String(s||"").split(/\s*\|\s*|\r?\n/).map(x=>x.trim()).filter(Boolean);
  }
  function _parseLugar(txt){
    const t=_clean(txt);
    const parts=t.split(/\s+[—-]\s+/).map(x=>x.trim()).filter(Boolean);
    if(parts.length>=2) return { localidad:parts[0], ubicacion:parts.slice(1).join(" - ") };
    return { localidad:"", ubicacion:"" };
  }
  function _parseCompletadoItem(s){
    const raw=_clean(s);
    if(!raw) return null;
    const parts=raw.split(/\s+—\s+/).map(x=>x.trim()).filter(Boolean);
    const out={ texto:"", localidad:"", ubicacion:"", tiempo:"", materiales:[] };
    out.texto=parts.shift() || raw;
    for(const part of parts){
      if(/^Tiempo:/i.test(part)){ out.tiempo=_clean(part.replace(/^Tiempo:/i,"")); continue; }
      if(/^Mat:/i.test(part)){
        const mats=_clean(part.replace(/^Mat:/i,""));
        out.materiales=mats ? mats.split(/\s*,\s*/).map(m=>{
          const mm=String(m||"").match(/^(.*?)\s*\((.*?)\)\s*$/);
          return mm ? { nombre:_clean(mm[1]), cantidad:_clean(mm[2]) } : { nombre:_clean(m), cantidad:"" };
        }).filter(m=>m.nombre||m.cantidad) : [];
        continue;
      }
      if(!out.localidad && !out.ubicacion){
        const lugar=_parseLugar(part);
        if(lugar.localidad || lugar.ubicacion){ out.localidad=lugar.localidad; out.ubicacion=lugar.ubicacion; continue; }
      }
    }
    return out.texto || out.localidad || out.ubicacion || out.tiempo || out.materiales.length ? out : null;
  }
  function _parsePendienteItem(s){
    const raw=_clean(s);
    if(!raw) return null;
    const parts=raw.split(/\s+—\s+/).map(x=>x.trim()).filter(Boolean);
    const out={ texto:parts.shift() || raw, localidad:"", ubicacion:"" };
    if(parts.length){
      const lugar=_parseLugar(parts.join(" — "));
      out.localidad=lugar.localidad;
      out.ubicacion=lugar.ubicacion;
    }
    return out.texto || out.localidad || out.ubicacion ? out : null;
  }
  function _looksLikeTSV(text){
    const t=String(text||"").trim();
    if(!t) return false;
    const first=t.split(/\r?\n/)[0]||"";
    return first.includes("\t") && first.toLowerCase().includes("fecha");
  }
  function _parseTSVTable(text){
    const raw=String(text||"").replace(/\r/g,"");
    const lines=raw.split("\n");
    let hi=-1;
    for(let i=0;i<lines.length;i++){ if(lines[i].includes("\t")){ hi=i; break; } }
    if(hi===-1) throw new Error("No se detectó una tabla (faltan tabulaciones).");
    const headers=lines[hi].split("\t").map(h=>String(h||"").trim());
    const expected=headers.length;
    const rows=[]; let current=null;
    for(let i=hi+1;i<lines.length;i++){
      const line=lines[i];
      if(String(line).trim()==="") continue;
      const parts=String(line).split("\t");
      if(parts.length < expected){
        if(current) current[expected-1]=String(current[expected-1]||"")+"\n"+String(line);
        continue;
      }
      if(parts.length > expected){
        const head=parts.slice(0,expected-1);
        const tail=parts.slice(expected-1).join("\t");
        current=head.concat([tail]);
      }else current=parts;
      if(current.length < expected) current=current.concat(new Array(expected-current.length).fill(""));
      rows.push(current);
    }
    return { headers, rows };
  }
  function _safeId(){
    try{ if(window.StorageMT && typeof StorageMT.newId==="function") return StorageMT.newId(); }catch(_){}
    const d=new Date();
    const pad=(n)=>String(n).padStart(2,"0");
    const s=`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return "R"+s+"_"+Math.random().toString(16).slice(2,8).toUpperCase();
  }
  function _importFromTSV(text){
    const { headers, rows }=_parseTSVTable(text);
    const idx=(name)=>headers.findIndex(h=>String(h||"").trim().toLowerCase()===String(name).toLowerCase());
    const get=(r,name)=>{ const i=idx(name); return i>=0 ? String(r[i]||"").trim() : ""; };
    const out=[];
    for(const r of rows){
      const fecha=get(r,"Fecha");
      const empresa=get(r,"Empresa");
      const localidad=get(r,"Localidad");
      const ubicacion=get(r,"Ubicación") || get(r,"Ubicacion");
      const inicio=get(r,"Inicio");
      const fin=get(r,"Fin");
      const descanso=get(r,"Descanso");
      const totalHoras=get(r,"Total horas") || get(r,"Horas");
      const materiales=get(r,"Materiales");
      const cantidades=get(r,"Cantidades") || get(r,"Cant.");
      const completados=get(r,"Trabajos completados") || get(r,"Completado");
      const pendientes=get(r,"Trabajos pendientes") || get(r,"Pendiente");
      const observ=get(r,"Observaciones");
      const horasTrab=_parseDecimalHours(totalHoras);
      const matArr = (materiales || cantidades) ? [{ nombre: materiales||"", cantidad: cantidades||"" }] : [];
      const trabajosCompletados = _splitItems(completados).map(_parseCompletadoItem).filter(Boolean);
      const trabajosPendientes = _splitItems(pendientes).map(_parsePendienteItem).filter(Boolean);
      out.push({
        id:_safeId(),
        fecha: fecha || new Date().toISOString().slice(0,10),
        empresa: empresa || "",
        centros: (localidad || ubicacion) ? [{ localidad: localidad || "", ubicacion: ubicacion || "" }] : [],
        localidad: localidad || "",
        ubicacion: ubicacion || "",
        horaInicio: inicio || "",
        horaFin: fin || "",
        descanso: descanso || "00:00",
        horasLegales: 8,
        horasTrabajadas: horasTrab,
        horasExtra: Math.max(0, horasTrab - 8),
        materiales: matArr,
        trabajosCompletados: trabajosCompletados.length ? trabajosCompletados : (completados ? [{ texto:completados, localidad:"", ubicacion:"", tiempo:"", materiales:matArr }] : []),
        trabajosPendientes: trabajosPendientes.length ? trabajosPendientes : (pendientes ? [{ texto:pendientes, localidad:"", ubicacion:"" }] : []),
        observaciones: observ || "",
        createdAt: new Date().toISOString()
      });
    }
    out.sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
    if(window.StorageMT){
      StorageMT.saveRegistros(out, "importacion_excel");
    }else{
      localStorage.setItem("mantenimiento_registros_v1", JSON.stringify(out));
      localStorage.setItem("mantenimiento_trabajos_v1", JSON.stringify(out));
    }
    try{ if(window.FirebaseSyncMT){ FirebaseSyncMT.log("importacion_excel", { registros:out.length }); FirebaseSyncMT.pushAllLocal("importacion_excel"); } }catch(_){}
    return { imported: out.length };
  }

  function restoreFromText(text, mode="replace"){
    try{
      const obj=parseBackupText(text);
      const res=restoreFromBackupObject(obj, mode);
      toast(`Restauración completada. Claves: ${res.written}/${res.total}${res.failed ? " (con errores)" : ""}.`);
      return res;
    }catch(e){
      if(_looksLikeTSV(text)){
        const res=_importFromTSV(text);
        toast(`Importación desde Excel completada. Registros: ${res.imported}.`);
        return res;
      }
      throw e;
    }
  }

  function openPasteWindow(opts={}){
    const { title="Restaurar / Importar (portapapeles)", mode="replace", onDone=null }=opts;
    const overlay=document.createElement("div"); overlay.className="cbk-overlay";
    const box=document.createElement("div"); box.className="cbk-box";
    const h=document.createElement("div"); h.className="cbk-title"; h.textContent=title;
    const info=document.createElement("div"); info.className="cbk-info"; info.textContent="Pega aquí el JSON del backup o una tabla copiada desde Excel. Después pulsa ‘Restaurar / Importar’.";
    const ta=document.createElement("textarea"); ta.className="cbk-textarea"; ta.placeholder="Pega aquí el JSON o la tabla (TSV)...";
    const row=document.createElement("div"); row.className="cbk-row";

    const btnRead=document.createElement("button");
    btnRead.className="btn btnGhost"; btnRead.type="button"; btnRead.textContent="Pegar desde portapapeles";
    btnRead.onclick=async()=>{
      try{ const txt=await readClipboard(); ta.value=txt||""; toast("Texto pegado desde portapapeles."); }
      catch(e){ toast(e.message || "No se pudo leer el portapapeles. Pega manualmente."); }
    };

    const btnRestore=document.createElement("button");
    btnRestore.className="btn btnWarn"; btnRestore.type="button"; btnRestore.textContent="Restaurar / Importar";
    btnRestore.onclick=()=>{
      try{
        restoreFromText(ta.value, mode);
        document.body.removeChild(overlay);
        if(typeof onDone==="function") onDone();
        try{ location.reload(); }catch(_){}
      }catch(e){ toast(e.message || "Error restaurando/importando."); }
    };

    const btnClose=document.createElement("button");
    btnClose.className="btn"; btnClose.type="button"; btnClose.textContent="Cancelar";
    btnClose.onclick=()=>{ document.body.removeChild(overlay); };

    row.appendChild(btnRead); row.appendChild(btnRestore); row.appendChild(btnClose);
    box.appendChild(h); box.appendChild(info); box.appendChild(ta); box.appendChild(row);
    overlay.appendChild(box);
    overlay.addEventListener("click",(ev)=>{ if(ev.target===overlay) document.body.removeChild(overlay); });
    document.body.appendChild(overlay);
    ta.focus();
  }

  window.BackupClipboard={ buildBackupObject, serializeBackup, copyBackupToClipboard, restoreFromText, openPasteWindow, readClipboard };
})();
