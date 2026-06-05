/* modules/firebaseSync.js - Sincronización Firebase RTDB con emparejamiento por ID */
(function(){
  "use strict";

  const KEYS = {
    deviceId: "cuaderno_sync_device_id_v1",
    pairedId: "cuaderno_sync_paired_device_id_v1",
    tombstones: "cuaderno_sync_tombstones_v1",
    log: "cuaderno_sync_log_v1",
    lastAck: "cuaderno_sync_last_ack_v1",
    status: "cuaderno_sync_status_v1"
  };
  const ROOT = "cuaderno_mantenimiento_sync_v1";
  let app=null, db=null, pairKey="", pairRef=null, ready=false, listening=false, applyingRemote=false;
  let status = { state:"no_pair", text:"Sin dispositivo emparejado", ok:false, pending:false };
  const listeners=[];

  function now(){ return new Date().toISOString(); }
  function readJSON(k, def){ try{ const raw=localStorage.getItem(k); return raw ? JSON.parse(raw) : def; }catch(_){ return def; } }
  function writeJSON(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){} }
  function randomHex(n){ const a=new Uint8Array(n); (crypto||window.msCrypto).getRandomValues(a); return Array.from(a).map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase(); }
  function getDeviceId(){
    let id=localStorage.getItem(KEYS.deviceId);
    if(!id){ id="DEVICE-"+randomHex(4); localStorage.setItem(KEYS.deviceId,id); }
    return id;
  }
  function getPairedId(){ return localStorage.getItem(KEYS.pairedId)||""; }
  function setPairedId(id){
    id=String(id||"").trim().toUpperCase();
    if(id && id!==getDeviceId()) localStorage.setItem(KEYS.pairedId,id);
    log("emparejamiento", { remoteDeviceId:id });
    init();
  }
  function makePairKey(a,b){ return [String(a),String(b)].sort().join("__").replace(/[^A-Z0-9_\-]/gi,"_"); }
  function cfgOK(){ const c=window.CUADERNO_FIREBASE_CONFIG||{}; return !!(c.apiKey && c.databaseURL && !String(c.apiKey).includes("PEGA_AQUI")); }
  function setStatus(st){ status=Object.assign({},status,st); writeJSON(KEYS.status,status); renderWidget(); listeners.forEach(fn=>{try{fn(status);}catch(_){}}); }
  function log(action, extra){
    const arr=readJSON(KEYS.log, []); arr.unshift(Object.assign({ fechaHora:now(), accion:action, dispositivo:getDeviceId() }, extra||{}));
    writeJSON(KEYS.log, arr.slice(0,300));
  }
  function ensureMeta(r, action){
    if(!r || typeof r!=="object") return r;
    const t = r.updatedAt || r.modificadoEn || now();
    r.updatedAt = t; r.modificadoEn = t;
    r.syncDeviceId = r.syncDeviceId || getDeviceId();
    r.syncAction = r.syncAction || action || "guardado";
    return r;
  }
  function normalizeLocalRecords(records){
    const t=now(); let changed=false;
    (records||[]).forEach(r=>{ if(!r) return; if(!r.id){ r.id="r_"+Date.now()+"_"+Math.random().toString(16).slice(2); changed=true; } if(!r.updatedAt && !r.modificadoEn){ r.updatedAt=t; r.modificadoEn=t; changed=true; } });
    return changed;
  }
  function isRemoteApply(){ return applyingRemote; }
  function beforeLocalSave(records, action){ normalizeLocalRecords(records||[]); (records||[]).forEach(r=>ensureMeta(r, action||"guardado")); }
  function afterLocalSave(records, action){ if(applyingRemote) return; pushRecords(records, action||"guardado"); }
  function markDeleted(id){
    const ts=now(); const tomb=readJSON(KEYS.tombstones, {}); tomb[String(id)]={ id:String(id), deleted:true, updatedAt:ts, modificadoEn:ts, syncDeviceId:getDeviceId(), syncAction:"eliminacion" }; writeJSON(KEYS.tombstones,tomb);
    pushTombstone(tomb[String(id)]); log("eliminacion", { registroId:id });
  }
  function pushRecords(records, action){
    if(!ready || !db || !pairKey) { setStatus(getPairedId()?{state:"offline",text:"Pendiente de sincronización",pending:true}:{state:"no_pair",text:"Sin dispositivo emparejado"}); return; }
    const device=getDeviceId(); const updates={}; const ts=now();
    (records||[]).forEach(r=>{ if(!r || !r.id) return; ensureMeta(r, action); r.syncDeviceId=device; updates[`${ROOT}/pairs/${pairKey}/records/${r.id}`]=r; });
    updates[`${ROOT}/pairs/${pairKey}/meta/lastWrite`]={ deviceId:device, at:ts, action:action||"guardado" };
    firebase.database().ref().update(updates).then(()=>{ setStatus({state:"pending",text:"Pendiente de recepción en el otro dispositivo",pending:true,ok:false}); log("sincronizacion_enviada", { registros:(records||[]).length, accion:action }); }).catch(()=>setStatus({state:"offline",text:"Sin conexión / pendiente de sincronización",pending:true}));
  }
  function pushTombstone(t){
    if(!ready || !pairKey) return;
    const updates={}; updates[`${ROOT}/pairs/${pairKey}/records/${t.id}`]=Object.assign({},t,{_syncDeleted:true});
    updates[`${ROOT}/pairs/${pairKey}/meta/lastWrite`]={ deviceId:getDeviceId(), at:now(), action:"eliminacion" };
    firebase.database().ref().update(updates).catch(()=>setStatus({state:"offline",text:"Sin conexión / eliminación pendiente",pending:true}));
  }
  function pushAllLocal(action){ const regs=window.StorageMT?StorageMT.loadRegistros():[]; pushRecords(regs, action||"sincronizacion_manual"); }
  function mergeRemote(snapshotVal){
    if(!window.StorageMT) return;
    const remote = snapshotVal || {}; const local = StorageMT.loadRegistros(); const map=new Map(local.map(r=>[String(r.id),r])); let changed=false; let received=0;
    Object.values(remote).forEach(rr=>{
      if(!rr || !rr.id) return;
      const id=String(rr.id); const rt=Date.parse(rr.updatedAt||rr.modificadoEn||0)||0; const lr=map.get(id); const lt=Date.parse(lr?.updatedAt||lr?.modificadoEn||0)||0;
      if(rr.syncDeviceId===getDeviceId()) return;
      if(rt>=lt){
        if(rr._syncDeleted){ if(map.has(id)){ map.delete(id); changed=true; received++; } }
        else { map.set(id, Object.assign({}, rr)); changed=true; received++; }
      }
    });
    if(changed){
      applyingRemote=true;
      try{ StorageMT.saveRegistros(Array.from(map.values())); } finally { applyingRemote=false; }
      log("sincronizacion_recibida", { registros:received, origen:"Firebase" });
      confirmReceipt(received);
      try{ window.dispatchEvent(new CustomEvent("cuaderno-sync-updated")); }catch(_){}
    }
  }
  function confirmReceipt(count){
    if(!ready || !pairKey) return;
    const ack={ deviceId:getDeviceId(), pairedId:getPairedId(), at:now(), count:Number(count)||0 };
    writeJSON(KEYS.lastAck, ack);
    firebase.database().ref(`${ROOT}/pairs/${pairKey}/acks/${getDeviceId()}`).set(ack).then(()=>{ log("confirmacion_enviada", ack); }).catch(()=>{});
  }
  function listen(){
    if(!ready || listening || !pairKey) return; listening=true;
    firebase.database().ref(`${ROOT}/pairs/${pairKey}/records`).on("value", snap=>mergeRemote(snap.val()), ()=>setStatus({state:"offline",text:"Sin conexión",pending:true}));
    firebase.database().ref(`${ROOT}/pairs/${pairKey}/acks/${getPairedId()}`).on("value", snap=>{ const v=snap.val(); if(v && v.at){ setStatus({state:"ok",text:"Sincronizado en el otro dispositivo",ok:true,pending:false,lastAck:v.at}); log("confirmacion_recibida", v); } });
    firebase.database().ref(".info/connected").on("value", snap=>{ if(snap.val()===true){ setStatus({state:getPairedId()?"online":"no_pair", text:getPairedId()?"Conectado a Firebase":"Sin dispositivo emparejado"}); pushAllLocal("resincronizacion"); } else setStatus({state:"offline", text:"Sin conexión", pending:true}); });
  }
  function init(){
    getDeviceId(); const paired=getPairedId();
    if(!paired){ setStatus({state:"no_pair",text:"Sin dispositivo emparejado",pending:false,ok:false}); renderWidget(); return; }
    if(!cfgOK() || !window.firebase || !firebase.database){ setStatus({state:"no_config",text:"Firebase no configurado",pending:true,ok:false}); renderWidget(); return; }
    try{
      if(!firebase.apps.length) app=firebase.initializeApp(window.CUADERNO_FIREBASE_CONFIG); else app=firebase.app();
      db=firebase.database(); pairKey=makePairKey(getDeviceId(), paired); ready=true; listening=false;
      setStatus({state:"online", text:"Conectando sincronización…", pending:true}); listen();
    }catch(e){ setStatus({state:"error", text:"Error Firebase: "+(e.message||e), pending:true}); }
  }
  function openModal(){
    const overlay=document.createElement("div"); overlay.className="sync-overlay";
    const box=document.createElement("div"); box.className="sync-box";
    const paired=getPairedId(); const s=getStatus();
    box.innerHTML=`<div class="sync-title">Sincronización entre dispositivos</div>
      <div class="sync-state ${s.ok?'ok':s.pending?'warn':''}">${s.text||''}</div>
      <label class="sync-label">ID de ESTE dispositivo</label>
      <div class="sync-id-row"><input class="input" readonly value="${getDeviceId()}"><button class="btn btnSmall" id="syncCopyId">Copiar</button></div>
      <label class="sync-label">ID del OTRO dispositivo</label>
      <input class="input" id="syncRemoteId" placeholder="Ejemplo: DEVICE-8F3A91C2" value="${paired}">
      <div class="sync-actions"><button class="btn btnPrimary" id="syncPairBtn">EMPAREJAR</button><button class="btn btnSuccess" id="syncForceBtn">Sincronizar ahora</button><button class="btn" id="syncCloseBtn">Cerrar</button></div>
      <div class="tiny muted">Una vez emparejado, los cambios se envían y reciben automáticamente. Si no hay conexión, localStorage mantiene la copia local.</div>`;
    overlay.appendChild(box); document.body.appendChild(overlay);
    box.querySelector("#syncCopyId").onclick=async()=>{ try{ await navigator.clipboard.writeText(getDeviceId()); alert("ID copiado"); }catch(_){ prompt("Copia este ID", getDeviceId()); } };
    box.querySelector("#syncPairBtn").onclick=()=>{ const id=box.querySelector("#syncRemoteId").value; setPairedId(id); alert("Dispositivo emparejado. La sincronización automática queda activada."); document.body.removeChild(overlay); };
    box.querySelector("#syncForceBtn").onclick=()=>{ pushAllLocal("sincronizacion_manual"); alert("Sincronización enviada."); };
    box.querySelector("#syncCloseBtn").onclick=()=>document.body.removeChild(overlay);
    overlay.addEventListener("click",ev=>{ if(ev.target===overlay) document.body.removeChild(overlay); });
  }
  function getStatus(){ return Object.assign({}, status); }
  function renderWidget(){
    let w=document.getElementById("syncWidget"); if(!w){ w=document.createElement("button"); w.id="syncWidget"; w.type="button"; w.className="sync-widget"; w.onclick=openModal; document.body.appendChild(w); }
    const icon=status.ok?"✅":status.state==="no_pair"?"🔗":status.state==="offline"?"⚠️":"⏳";
    w.textContent=`${icon} SINCRONIZAR`;
    w.title=status.text||"Sincronizar";
  }
  window.FirebaseSyncMT={ init, openModal, getDeviceId, getPairedId, setPairedId, getStatus, onStatus(fn){listeners.push(fn);}, beforeLocalSave, afterLocalSave, markDeleted, pushAllLocal, log, isRemoteApply, KEYS };
  document.addEventListener("DOMContentLoaded", ()=>setTimeout(init,100));
})();
