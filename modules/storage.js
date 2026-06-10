/* modules/storage.js - Cuaderno de Mantenimiento (fix cuota / no duplicar keys) */
(function(){
  "use strict";

  // Claves principales
  const KEY_REGISTROS     = "mantenimiento_registros_v1";
  const KEY_OLD_TRABAJOS  = "mantenimiento_trabajos_v1"; // legacy (solo lectura)
  const KEY_EXTRA_PAGOS   = "mantenimiento_extra_pagos_v1"; // pagos horas extra (si tu app usa otro, lo cubrimos con fallback)

  // FallBacks típicos de versiones anteriores (para no perder datos si existían)
  const FALLBACK_PAGOS_KEYS = [
    KEY_EXTRA_PAGOS,
    "cuaderno_mantenimiento_extra_cobradas_v1",
    "cuaderno_mantenimiento_extra_pagos_v1",
    "mantenimiento_extra_cobradas_v1"
  ];

  function _isQuotaError(e){
    if(!e) return false;
    const name = String(e.name || "");
    const msg  = String(e.message || "");
    return (
      name === "QuotaExceededError" ||
      name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      msg.toLowerCase().includes("quota") ||
      msg.toLowerCase().includes("exceeded")
    );
  }

  function _safeParse(raw, def){
    try{
      if(raw==null || raw==="") return def;
      const v = JSON.parse(raw);
      return (v==null ? def : v);
    }catch(_){
      return def;
    }
  }

  function _readFirstExisting(keys, def){
    for(const k of keys){
      const raw = localStorage.getItem(k);
      if(raw!=null && raw!==""){
        const v = _safeParse(raw, def);
        // Si parsea y no es null, devolvemos
        if(v!=null) return { key:k, value:v, raw };
      }
    }
    return { key:null, value:def, raw:null };
  }

  function _newId(prefix){
    const rnd = Math.random().toString(16).slice(2);
    return `${prefix}_${Date.now()}_${rnd}`;
  }

  function _touchRecord(rec, action){
    if(!rec || typeof rec!=="object") return rec;
    const ts = new Date().toISOString();
    if(!rec.createdAt) rec.createdAt = ts;
    rec.updatedAt = ts;
    rec.modificadoEn = ts;
    rec.syncAction = action || rec.syncAction || "guardado";
    if(window.FirebaseSyncMT && FirebaseSyncMT.getDeviceId){
      rec.syncDeviceId = FirebaseSyncMT.getDeviceId();
    }
    return rec;
  }

  function _prepareForSave(arr, action){
    const regs = Array.isArray(arr) ? arr : [];
    if(window.FirebaseSyncMT && FirebaseSyncMT.beforeLocalSave){
      try{ FirebaseSyncMT.beforeLocalSave(regs, action || "guardado"); }catch(_){}
    }else{
      regs.forEach(r=>{ if(r && !r.updatedAt){ r.updatedAt = new Date().toISOString(); r.modificadoEn = r.updatedAt; } });
    }
    return regs;
  }

  // Limpieza segura: borra la key legacy SOLO si la key nueva existe y es válida
  function _cleanupLegacyDuplicate(){
    const rawNew = localStorage.getItem(KEY_REGISTROS);
    const rawOld = localStorage.getItem(KEY_OLD_TRABAJOS);
    if(!rawNew || !rawOld) return;

    const parsedNew = _safeParse(rawNew, null);
    // Solo borramos si lo nuevo es válido y "parece" un array
    if(Array.isArray(parsedNew)){
      // Si son exactamente iguales, es duplicado seguro
      if(rawNew === rawOld){
        try{ localStorage.removeItem(KEY_OLD_TRABAJOS); }catch(_){}
        return;
      }
      // Si no son iguales, NO borramos por seguridad (podrían ser datos distintos)
      // (pero ya no volveremos a escribir en KEY_OLD_TRABAJOS, así que no seguirá creciendo)
    }
  }

  // Ejecuta limpieza al cargar el módulo
  try{ _cleanupLegacyDuplicate(); }catch(_){}

  // -------------------------
  // REGISTROS
  // -------------------------
  function loadRegistros(){
    // Preferimos la key nueva. Si no existe, leemos la legacy.
    const rawNew = localStorage.getItem(KEY_REGISTROS);
    let regs = _safeParse(rawNew, null);

    if(!Array.isArray(regs)){
      const rawOld = localStorage.getItem(KEY_OLD_TRABAJOS);
      regs = _safeParse(rawOld, []);
    }

    if(!Array.isArray(regs)) regs = [];
    // Asegura ids
    regs.forEach(r=>{
      if(r && !r.id) r.id = _newId("r");
    });
    return regs;
  }

  function saveRegistros(registros, action){
    const arr = _prepareForSave(registros, action || "guardado");
    const json = JSON.stringify(arr);

    try{
      localStorage.setItem(KEY_REGISTROS, json);

      // Importante: NO guardamos en KEY_OLD_TRABAJOS (evita duplicar)
      // Si existe duplicado legacy, intentamos limpiarlo si es seguro
      _cleanupLegacyDuplicate();

      if(window.FirebaseSyncMT && FirebaseSyncMT.afterLocalSave){
        try{ FirebaseSyncMT.afterLocalSave(arr, action || "guardado"); }catch(_){}
      }
      return;
    }catch(e){
      // Si falla por cuota, intentamos liberar el duplicado legacy (si existe) y reintentar una vez
      if(_isQuotaError(e)){
        try{
          // Si hay legacy, borrarla puede liberar bastante
          localStorage.removeItem(KEY_OLD_TRABAJOS);
        }catch(_){}

        try{
          localStorage.setItem(KEY_REGISTROS, json);
          if(window.FirebaseSyncMT && FirebaseSyncMT.afterLocalSave){
            try{ FirebaseSyncMT.afterLocalSave(arr, action || "guardado"); }catch(_){}
          }
          return;
        }catch(e2){
          if(_isQuotaError(e2)){
            throw new Error(
              "ALMACENAMIENTO LLENO (localStorage). " +
              "Solución recomendada: haz BACKUP (Exportar JSON), borra registros antiguos o usa 'Borrar TODO' y restaura solo lo necesario."
            );
          }
          throw e2;
        }
      }
      throw e;
    }
  }

  function addRegistro(obj){
    const regs = loadRegistros();
    const rec = Object.assign({}, (obj||{}));
    rec.id = rec.id || _newId("r");
    _touchRecord(rec, "creacion");
    regs.push(rec);
    saveRegistros(regs, "creacion");
    if(window.FirebaseSyncMT) try{ FirebaseSyncMT.log("creacion", { registroId:rec.id }); }catch(_){}
    return rec.id;
  }

  function updateRegistro(id, obj){
    const regs = loadRegistros();
    const idx = regs.findIndex(r=>String(r?.id)===String(id));
    if(idx<0) return false;
    const prev = regs[idx] || {};
    const next = Object.assign({}, prev, (obj||{}));
    next.id = prev.id || String(id);
    _touchRecord(next, "edicion");
    regs[idx] = next;
    saveRegistros(regs, "edicion");
    if(window.FirebaseSyncMT) try{ FirebaseSyncMT.log("edicion", { registroId:next.id }); }catch(_){}
    return true;
  }

  function deleteRegistro(id){
    const regs = loadRegistros();
    const before = regs.length;
    const afterArr = regs.filter(r=>String(r?.id)!==String(id));
    if(afterArr.length===before) return false;
    if(window.FirebaseSyncMT && FirebaseSyncMT.markDeleted){
      try{ FirebaseSyncMT.markDeleted(id); }catch(_){}
    }
    saveRegistros(afterArr, "eliminacion");
    return true;
  }

  function clearRegistros(){
    const regs = loadRegistros();
    if(window.FirebaseSyncMT && FirebaseSyncMT.markDeleted){
      regs.forEach(r=>{ try{ FirebaseSyncMT.markDeleted(r.id); }catch(_){} });
    }
    try{ localStorage.removeItem(KEY_REGISTROS); }catch(_){}
    try{ localStorage.removeItem(KEY_OLD_TRABAJOS); }catch(_){}
  }

  // -------------------------
  // PAGOS (horas cobradas)
  // -------------------------
  function loadPagos(){
    const got = _readFirstExisting(FALLBACK_PAGOS_KEYS, []);
    const pagos = Array.isArray(got.value) ? got.value : [];
    pagos.forEach(p=>{
      if(p && !p.id) p.id = _newId("p");
    });
    return pagos;
  }

  function savePagos(pagos){
    const arr = Array.isArray(pagos) ? pagos : [];
    const json = JSON.stringify(arr);
    try{
      localStorage.setItem(KEY_EXTRA_PAGOS, json);
    }catch(e){
      if(_isQuotaError(e)){
        throw new Error(
          "ALMACENAMIENTO LLENO (localStorage) al guardar PAGOS. " +
          "Haz BACKUP y borra datos antiguos."
        );
      }
      throw e;
    }
  }

  function addPago(obj){
    const pagos = loadPagos();
    const rec = Object.assign({}, (obj||{}));
    rec.id = rec.id || _newId("p");
    pagos.push(rec);
    savePagos(pagos);
    return rec.id;
  }

  function deletePago(id){
    const pagos = loadPagos();
    const before = pagos.length;
    const afterArr = pagos.filter(p=>String(p?.id)!==String(id));
    if(afterArr.length===before) return false;
    savePagos(afterArr);
    return true;
  }

  function clearPagos(){
    try{ localStorage.removeItem(KEY_EXTRA_PAGOS); }catch(_){}
  }

  // Exponer API
  window.StorageMT = {
    // keys
    KEY_REGISTROS,
    KEY_OLD_TRABAJOS,
    KEY_EXTRA_PAGOS,

    // registros
    loadRegistros,
    saveRegistros,
    addRegistro,
    updateRegistro,
    deleteRegistro,
    clearRegistros,

    // pagos
    loadPagos,
    addPago,
    deletePago,
    clearPagos
  };
})();
