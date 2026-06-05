/* assets/js/app.js - Cuaderno de Mantenimiento v6.6 (móvil) */
(function(){
  "use strict";

  const S = {
    view: "registros",
    editId: null,
    search: "",
    filtroPendientes: "todos",
    periodStart: "",
    periodEnd: "",
  };

  // -------- Constantes (localStorage)
  const SETTINGS_KEY = "cuaderno_mantenimiento_settings_v1";
  const AUTOCOMPLETE_KEY = "cuaderno_mantenimiento_autocomplete_v1";

  // -------- Utils
  const pad2 = (n)=>String(n).padStart(2,"0");

  function toMinHHMM(hhmm){
    const m = String(hhmm||"").match(/^(\d{1,2}):(\d{2})$/);
    if(!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    if(!Number.isFinite(hh)||!Number.isFinite(mm)) return null;
    if(hh<0||hh>47||mm<0||mm>59) return null;
    return (hh*60)+mm;
  }

  function diffMinutes(startHHMM, endHHMM){
    const a = toMinHHMM(startHHMM);
    const b = toMinHHMM(endHHMM);
    if(a==null || b==null) return null;
    let d = b - a;
    if(d < 0) d += 24*60; // turno nocturno
    return d;
  }

  function fmtHoursDec(h){
    const x = Number(h||0);
    const v = Number.isFinite(x) ? x : 0;
    return v.toFixed(2).replace(".", ",");
  }

  function hoursToHHMM(dec){
    const x = Number(dec||0);
    const total = Math.round((Number.isFinite(x)?x:0) * 60);
    const hh = Math.floor(total/60);
    const mm = total % 60;
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  function safeText(s){ return String(s||""); }

  function confirmDanger(msg){
    return window.confirm(msg);
  }

  function download(filename, text){
    const blob = new Blob([text], {type:"application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  function pickFile(accept){
    return new Promise((resolve)=>{
      const input=document.createElement("input");
      input.type="file";
      input.accept = accept || "*/*";
      input.onchange=()=>resolve(input.files && input.files[0] ? input.files[0] : null);
      input.click();
    });
  }

  async function writeClipboard(text){
    if(navigator.clipboard && typeof navigator.clipboard.writeText==="function"){
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta=document.createElement("textarea");
    ta.value=String(text||"");
    ta.setAttribute("readonly","readonly");
    ta.style.position="fixed"; ta.style.left="-9999px"; ta.style.top="0";
    document.body.appendChild(ta);
    ta.select();
    let ok=false;
    try{ ok=document.execCommand("copy"); }catch(_){ ok=false; }
    document.body.removeChild(ta);
    return ok;
  }

  function escHtml(s){
    return String(s??"")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  function toTSVCell(s){
    return String(s??"").replace(/\t/g," ").replace(/\r?\n/g," | ").trim();
  }


  function cleanStr(v){
    return String(v ?? "").trim();
  }

  function normalizeTrabajoCompletado(it){
    if(typeof it === "string"){
      return { texto: cleanStr(it), localidad:"", ubicacion:"", tiempo:"", materiales:[] };
    }
    if(it && typeof it === "object"){
      return {
        texto: cleanStr(it.texto ?? it.text ?? it.trabajo ?? ""),
        localidad: cleanStr(it.localidad ?? it.locality ?? ""),
        ubicacion: cleanStr(it.ubicacion ?? it["ubicación"] ?? it.location ?? ""),
        tiempo: cleanStr(it.tiempo ?? it.tiempoEmpleado ?? it.duracion ?? ""),
        materiales: Array.isArray(it.materiales) ? it.materiales.map(m=>({
          nombre: cleanStr(m?.nombre ?? m?.name ?? ""),
          cantidad: cleanStr(m?.cantidad ?? m?.qty ?? "")
        })).filter(m=>m.nombre || m.cantidad) : []
      };
    }
    return { texto:"", localidad:"", ubicacion:"", tiempo:"", materiales:[] };
  }

  function normalizeTrabajoPendiente(it){
    if(typeof it === "string") return { texto: cleanStr(it), localidad:"", ubicacion:"" };
    if(it && typeof it === "object"){
      return {
        texto: cleanStr(it.texto ?? it.text ?? it.trabajo ?? ""),
        localidad: cleanStr(it.localidad ?? it.locality ?? ""),
        ubicacion: cleanStr(it.ubicacion ?? it["ubicación"] ?? it.location ?? "")
      };
    }
    return { texto:"", localidad:"", ubicacion:"" };
  }

  function trabajoLugarText(it){
    const loc = cleanStr(it.localidad);
    const ubi = cleanStr(it.ubicacion);
    if(loc && ubi) return `${loc} - ${ubi}`;
    return loc || ubi || "";
  }

  function formatTrabajoPendienteItem(it){
    const p = normalizeTrabajoPendiente(it);
    const parts = [];
    if(p.texto) parts.push(p.texto);
    const lugar = trabajoLugarText(p);
    if(lugar) parts.push(lugar);
    return parts.join(" — ");
  }

  function pendingText(arr){
    return (arr||[])
      .map(formatTrabajoPendienteItem)
      .map(s=>cleanStr(s))
      .filter(Boolean)
      .join(" | ");
  }

  function pendingSearch(arr){
    return (arr||[]).map(it=>{
      const p = normalizeTrabajoPendiente(it);
      return [p.texto, p.localidad, p.ubicacion].join(" ");
    }).join(" ");
  }

  function loadAuto(){
    try{
      const raw = localStorage.getItem(AUTOCOMPLETE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === "object") ? obj : {};
    }catch(_){ return {}; }
  }

  function saveAuto(obj){
    try{ localStorage.setItem(AUTOCOMPLETE_KEY, JSON.stringify(obj||{})); }catch(_){ }
  }

  function rememberAuto(values){
    const obj = loadAuto();
    for(const [k,v] of Object.entries(values||{})){
      const val = cleanStr(v);
      if(val) obj[k] = val;
    }
    saveAuto(obj);
  }

  function autoValue(key){
    const obj = loadAuto();
    return cleanStr(obj[key] || "");
  }

  function withAutoInput(el, key){
    if(!el || !key) return el;
    const v = autoValue(key);
    if(v){
      const ph = el.getAttribute("placeholder") || "";
      el.setAttribute("placeholder", `${ph} Último: ${v}`.trim());
      el.setAttribute("title", `Último valor usado: ${v}`);
    }
    return el;
  }

  function fmtTotalCell(horasTrab){
    const hhmm = hoursToHHMM(horasTrab);
    return `${hhmm} = ${fmtHoursDec(horasTrab)} h`;
  }

  function computeExtra(hTrab, hConv){
    const a = Number(hTrab)||0;
    let b = Number(hConv);
    if(!Number.isFinite(b) || b < 0) b = 0;
    return Math.max(0, a - b);
  }

  // -------- Fechas (ISO) + presentación (DD/MM/AAAA)
  function parseISODate(iso){
    const m = String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;
    const y=Number(m[1]), mo=Number(m[2])-1, d=Number(m[3]);
    const dt = new Date(Date.UTC(y,mo,d));
    if(dt.getUTCFullYear()!==y || dt.getUTCMonth()!==mo || dt.getUTCDate()!==d) return null;
    return dt;
  }

  function isoFromUTCDate(dt){
    return dt.toISOString().slice(0,10);
  }

  function addDaysISO(iso, days){
    const d = parseISODate(iso);
    if(!d) return "";
    d.setUTCDate(d.getUTCDate()+Number(days||0));
    return isoFromUTCDate(d);
  }

  function startOfISOWeekISO(iso){
    const d = parseISODate(iso);
    if(!d) return "";
    let dow = d.getUTCDay(); // 0=dom
    dow = (dow===0) ? 7 : dow; // 1..7 (lun..dom)
    d.setUTCDate(d.getUTCDate() - (dow-1));
    return isoFromUTCDate(d);
  }

  function isoWeekInfo(iso){
    const d0 = parseISODate(iso);
    if(!d0) return null;
    const d = new Date(d0.getTime());
    let day = d.getUTCDay(); day = (day===0)?7:day;
    d.setUTCDate(d.getUTCDate() + 4 - day); // jueves
    const year = d.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year,0,1));
    const week = Math.ceil((((d - yearStart)/86400000)+1)/7);
    return { year, week };
  }

  function daysBetweenInclusive(aISO, bISO){
    const a = parseISODate(aISO), b = parseISODate(bISO);
    if(!a||!b) return null;
    const diff = Math.round((b - a)/86400000);
    return diff + 1;
  }

  // DDMMYYYY para nombres de archivo (sin /)
  function fmtDDMMAAAA(iso){
    const d = parseISODate(iso);
    if(!d) return "";
    const dd = pad2(d.getUTCDate());
    const mm = pad2(d.getUTCMonth()+1);
    const yy = d.getUTCFullYear();
    return `${dd}${mm}${yy}`;
  }

  // DD/MM/AAAA para mostrar siempre al usuario (tablas / impresión)
  function fmtDDMMYYYY(isoOrAlready){
    const s = String(isoOrAlready||"").trim();
    if(!s) return "";
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    const d = parseISODate(s);
    if(!d) return s;
    const dd = pad2(d.getUTCDate());
    const mm = pad2(d.getUTCMonth()+1);
    const yy = d.getUTCFullYear();
    return `${dd}/${mm}/${yy}`;
  }

  // -------- Ajustes (cabecera PARTE T)
  function loadSettings(){
    try{
      const raw = localStorage.getItem(SETTINGS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return {
        cooperativa: String(obj?.cooperativa||"").trim(),
        centroTrabajo: String(obj?.centroTrabajo||"").trim(),
        trabajador: String(obj?.trabajador||"").trim(),
        categoria: String(obj?.categoria||"").trim()
      };
    }catch(_){
      return { cooperativa:"", centroTrabajo:"", trabajador:"", categoria:"" };
    }
  }

  function saveSettings(s){
    const obj = {
      cooperativa: String(s?.cooperativa||"").trim(),
      centroTrabajo: String(s?.centroTrabajo||"").trim(),
      trabajador: String(s?.trabajador||"").trim(),
      categoria: String(s?.categoria||"").trim()
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj));
  }

  // -------- Centros (multi)
  function getCentrosObj(r){
    const arr = (r && Array.isArray(r.centros) && r.centros.length)
      ? r.centros
      : [{ localidad: r?.localidad||"", ubicacion: r?.ubicacion||"" }];

    return (arr||[])
      .map(c=>({
        localidad: String(c?.localidad||"").trim(),
        ubicacion: String(c?.ubicacion||"").trim()
      }))
      .filter(c=>c.localidad || c.ubicacion);
  }

  function fmtCentroLine(c){
    const a = String(c?.localidad||"").trim();
    const b = String(c?.ubicacion||"").trim();
    if(a && b) return `${a} - ${b}`;
    return a || b || "";
  }

  function centrosTextForSearch(r){
    return getCentrosObj(r).map(fmtCentroLine).join(" ");
  }

  // -------- Trabajos completados / pendientes (incluye materiales y datos por trabajo)
  function formatTrabajoCompletadoItem(it){
    const t = normalizeTrabajoCompletado(it);
    const parts = [];
    if(t.texto) parts.push(t.texto);
    const lugar = trabajoLugarText(t);
    if(lugar) parts.push(lugar);
    if(t.tiempo) parts.push(`Tiempo: ${t.tiempo}`);
    if(t.materiales.length){
      const mats = t.materiales.map(m=>{
        if(!m.nombre && !m.cantidad) return "";
        return m.cantidad ? `${m.nombre} (${m.cantidad})` : m.nombre;
      }).filter(Boolean);
      if(mats.length) parts.push(`Mat: ${mats.join(", ")}`);
    }
    return parts.join(" — ");
  }

  function completadosText(arr){
    return (arr||[])
      .map(formatTrabajoCompletadoItem)
      .map(s=>cleanStr(s))
      .filter(Boolean)
      .join(" | ");
  }

  function completadosSearch(arr){
    return (arr||[]).map(it=>{
      const t = normalizeTrabajoCompletado(it);
      const mats = t.materiales.map(m=>[m.nombre, m.cantidad].join(" ")).join(" ");
      return [t.texto, t.localidad, t.ubicacion, t.tiempo, mats].join(" ").trim();
    }).join(" ");
  }

  function filterByPeriod(arr, start, end){
    const s = String(start||"").trim();
    const e = String(end||"").trim();
    return (arr||[]).filter(r=>{
      const d = String(r.fecha||"").slice(0,10);
      if(!d) return false;
      if(s && d < s) return false;
      if(e && d > e) return false;
      return true;
    });
  }

  function buildTSV(registros){
    const headers = [
      "Fecha","Empresa","Localidad","Ubicación","Inicio","Fin","Descanso",
      "Total horas","Horas convenio","Horas extra",
      "Materiales","Cantidades","Trabajos completados","Trabajos pendientes","Observaciones"
    ];
    const lines = [headers.join("\t")];
    for(const r of (registros||[])){
      const centros = getCentrosObj(r);
      const locs = centros.map(c=>String(c.localidad||"").trim()).filter(Boolean).join(" | ");
      const ubis = centros.map(c=>String(c.ubicacion||"").trim()).filter(Boolean).join(" | ");

      const mats = (r.materiales||[]).map(m=>String(m?.nombre||"").trim()).filter(Boolean).join(" | ");
      const cants = (r.materiales||[]).map(m=>String(m?.cantidad??"").trim()).filter(x=>x!=="").join(" | ");
      const comp = completadosText(r.trabajosCompletados);
      const pend = pendingText(r.trabajosPendientes);
      const conv = (r.horasLegales!=null) ? r.horasLegales : 8;
      const extra = computeExtra(r.horasTrabajadas, conv);

      const row = [
        fmtDDMMYYYY(r.fecha||""),
        r.empresa||"",
        locs,
        ubis,
        r.horaInicio||"",
        r.horaFin||"",
        r.descanso||"00:00",
        fmtTotalCell(r.horasTrabajadas),
        String(conv),
        fmtHoursDec(extra) + " h",
        mats,
        cants,
        comp,
        pend,
        r.observaciones||""
      ].map(toTSVCell);
      lines.push(row.join("\t"));
    }
    return lines.join("\n");
  }

  function printRegistros(registros, start, end){
    const title = "Registros guardados";
    const period = (start || end) ? `${fmtDDMMYYYY(start||"…")} → ${fmtDDMMYYYY(end||"…")}` : "Todos";

    const rows = (registros||[]).map(r=>{
      const conv = (r.horasLegales!=null) ? r.horasLegales : 8;
      const extra = computeExtra(r.horasTrabajadas, conv);

      const centros = getCentrosObj(r);
      const locs = centros.map(c=>String(c.localidad||"").trim()).filter(Boolean).join(" | ");
      const ubis = centros.map(c=>String(c.ubicacion||"").trim()).filter(Boolean).join(" | ");

      const mats = (r.materiales||[]).map(m=>String(m?.nombre||"").trim()).filter(Boolean).join(" | ");
      const cants = (r.materiales||[]).map(m=>String(m?.cantidad??"").trim()).filter(x=>x!=="").join(" | ");
      const comp = completadosText(r.trabajosCompletados);
      const pend = pendingText(r.trabajosPendientes);

      return `<tr>
        <td>${escHtml(fmtDDMMYYYY(r.fecha||""))}</td>
        <td>${escHtml(r.empresa||"")}</td>
        <td>${escHtml(locs)}</td>
        <td>${escHtml(ubis)}</td>
        <td>${escHtml(r.horaInicio||"")}</td>
        <td>${escHtml(r.horaFin||"")}</td>
        <td>${escHtml(r.descanso||"00:00")}</td>
        <td>${escHtml(fmtTotalCell(r.horasTrabajadas))}</td>
        <td>${escHtml(String(conv))}</td>
        <td>${escHtml(fmtHoursDec(extra) + " h")}</td>
        <td>${escHtml(mats)}</td>
        <td>${escHtml(cants)}</td>
        <td>${escHtml(comp)}</td>
        <td>${escHtml(pend)}</td>
        <td>${escHtml(r.observaciones||"")}</td>
      </tr>`;
    }).join("");

    const htmlDoc = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escHtml(title)}</title>
<style>
  body{ font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; margin:18px; color:#111; }
  h1{ font-size:18px; margin:0 0 4px; }
  .sub{ color:#555; font-size:12px; margin:0 0 12px; }
  table{ width:100%; border-collapse:collapse; font-size:11px; }
  th,td{ border:1px solid #ddd; padding:6px 6px; vertical-align:top; text-align:left; }
  th{ background:#f6f7f9; }
  @media print{ @page{ margin:10mm; } }
</style>
</head>
<body>
  <h1>${escHtml(title)}</h1>
  <p class="sub">Periodo: ${escHtml(period)} · Registros: ${(registros||[]).length}</p>
  <table>
    <thead><tr>
      <th>Fecha</th><th>Empresa</th><th>Localidad</th><th>Ubicación</th>
      <th>Inicio</th><th>Fin</th><th>Descanso</th><th>Total</th>
      <th>Convenio</th><th>Extra</th>
      <th>Materiales</th><th>Cant.</th><th>Completado</th><th>Pendiente</th><th>Observaciones</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=()=>{ setTimeout(()=>window.print(), 120); };</script>
</body></html>`;

    const w = window.open("", "_blank");
    if(w){
      w.document.open(); w.document.write(htmlDoc); w.document.close();
      return;
    }
    const iframe=document.createElement("iframe");
    iframe.style.position="fixed";
    iframe.style.right="0";
    iframe.style.bottom="0";
    iframe.style.width="0";
    iframe.style.height="0";
    iframe.style.border="0";
    document.body.appendChild(iframe);
    const doc=iframe.contentWindow.document;
    doc.open(); doc.write(htmlDoc); doc.close();
    setTimeout(()=>{
      try{ iframe.contentWindow.focus(); iframe.contentWindow.print(); }catch(_){}
      setTimeout(()=>iframe.remove(), 800);
    }, 200);
  }

  // -------- PARTE DE TRABAJO SEMANAL (A4 apaisado)
  function printParteT(registrosFiltrados, periodStart, periodEnd){
    const settings = loadSettings();

    const w1 = isoWeekInfo(periodStart);
    const w2 = isoWeekInfo(periodEnd);
    if(!w1 || !w2 || w1.week!==w2.week || w1.year!==w2.year){
      UI.toast("PARTE T: el periodo debe estar dentro de la misma semana (lunes-domingo).");
      return;
    }

    const weekStart = startOfISOWeekISO(periodStart);
    const weekEnd = addDaysISO(weekStart, 6);

    const pdfName = `Semana ${w1.week} _ De ${fmtDDMMAAAA(weekStart)} a ${fmtDDMMAAAA(weekEnd)} Parte de Trabajo`;

    const dayLetters = ["L","M","X","J","V","S","D"];

    // ✅ FIX: No duplicar mañana cuando el usuario solo rellena la tarde.
    // Solo usamos (horaInicio/horaFin) legacy si NO hay campos explícitos mañana/tarde.
    function getShift(r){
      const manIni = String(r?.horaMananaInicio || r?.hManIni || "").trim();
      const manFin = String(r?.horaMananaFin || r?.hManFin || "").trim();
      const tarIni = String(r?.horaTardeInicio || r?.hTarIni || "").trim();
      const tarFin = String(r?.horaTardeFin || r?.hTarFin || "").trim();

      const legacyIni = String(r?.horaInicio||"").trim();
      const legacyFin = String(r?.horaFin||"").trim();

      const hasExplicit = !!(manIni || manFin || tarIni || tarFin);
      const useLegacy = (!hasExplicit) && !!(legacyIni || legacyFin);

      return {
        manIni: manIni || (useLegacy ? legacyIni : ""),
        manFin: manFin || (useLegacy ? legacyFin : ""),
        tarIni: tarIni || "",
        tarFin: tarFin || ""
      };
    }

    function laborText(r){
      // Trabajos completados organizados dentro del día: localidad, ubicación, tiempo y materiales.
      const lines = (r?.trabajosCompletados||[])
        .map((it, idx)=>{
          const t = normalizeTrabajoCompletado(it);
          const parts = [];
          if(t.texto) parts.push(t.texto);
          const lugar = trabajoLugarText(t);
          if(lugar) parts.push(lugar);
          if(t.tiempo) parts.push(`Tiempo: ${t.tiempo}`);
          if(t.materiales.length){
            const mats = t.materiales.map(m=>m.cantidad ? `${m.nombre} (${m.cantidad})` : m.nombre).filter(Boolean);
            if(mats.length) parts.push(`Mat: ${mats.join(", ")}`);
          }
          const txt = parts.join(" — ");
          return txt ? `${idx+1}. ${txt}` : "";
        })
        .filter(Boolean);
      return lines.join("\n");
    }

    // Filtramos SOLO lo de la semana impresa (por seguridad)
    const inWeek = (registrosFiltrados||[]).filter(r=>{
      const d = String(r?.fecha||"").slice(0,10);
      return d && d>=weekStart && d<=weekEnd;
    });

    // Totales semana
    const totalHorasSemana = inWeek.reduce((a,r)=>a + (Number(r?.horasTrabajadas)||0), 0);
    const totalKmSemana = inWeek.reduce((a,r)=>a + (Number(r?.km)||0), 0);
    const totalExtraSemana = inWeek.reduce((a,r)=>{
      const conv = (r?.horasLegales!=null) ? Number(r.horasLegales) : 8;
      return a + computeExtra(Number(r?.horasTrabajadas)||0, conv);
    }, 0);

    // Helpers de orden para PARTE T (ascendente: primero el trabajo que empieza antes)
    function startMinParte(r){
      const sh = getShift(r);
      const t = String(sh.manIni || sh.tarIni || r?.horaInicio || "").trim();
      const m = toMinHHMM(t);
      return (m==null ? 999999 : m);
    }
    function endMinParte(r){
      const sh = getShift(r);
      const s = startMinParte(r);
      const t = String(sh.tarFin || sh.manFin || r?.horaFin || "").trim();
      const m = toMinHHMM(t);
      if(m==null) return 999999;
      if(s!==999999 && m < s) return m + 24*60; // turno nocturno
      return m;
    }

    // Construcción de filas (puede haber varias filas mismo día)
    let bodyRows = "";

    for(let i=0;i<7;i++){
      const dayDate = addDaysISO(weekStart, i);
      const day = dayLetters[i];

      const regsDay = inWeek
        .filter(r=>String(r?.fecha||"").slice(0,10)===dayDate)
        .slice()
        .sort((a,b)=>{
          const sa = startMinParte(a), sb = startMinParte(b);
          if(sa!==sb) return sa - sb;
          const ea = endMinParte(a), eb = endMinParte(b);
          if(ea!==eb) return ea - eb;
          return String(a?.id||"").localeCompare(String(b?.id||""));
        });

      if(!regsDay.length){
        bodyRows += `<tr>
          <td class="daycol">${escHtml(day)}</td>
          <td class="datecol"></td>
          <td class="timecol"></td><td class="timecol"></td>
          <td class="timecol"></td><td class="timecol"></td>
          <td class="totalcol"></td>
          <td class="kmcol"></td>
          <td class="dietcol"></td>
          <td class="centercol"></td>
          <td class="laborcol pre"></td>
        </tr>`;
        continue;
      }

      for(const r of regsDay){
        const sh = getShift(r);
        const km = (r?.km==null || r.km==="") ? "" : String(r.km);
        const dieta = r?.dieta ? "X" : "";
        const total = (r?.horasTrabajadas!=null) ? hoursToHHMM(Number(r.horasTrabajadas)||0) : "";

        const centros = getCentrosObj(r).map(fmtCentroLine).filter(Boolean);
        const labor = laborText(r);

        const firstCentro = centros[0] || "";
        const extraCentros = centros.slice(1);

        bodyRows += `<tr>
          <td class="daycol">${escHtml(day)}</td>
          <td class="datecol">${escHtml(fmtDDMMYYYY(String(r?.fecha||"")))}</td>
          <td class="timecol">${escHtml(sh.manIni||"")}</td>
          <td class="timecol">${escHtml(sh.manFin||"")}</td>
          <td class="timecol">${escHtml(sh.tarIni||"")}</td>
          <td class="timecol">${escHtml(sh.tarFin||"")}</td>
          <td class="totalcol">${escHtml(total)}</td>
          <td class="kmcol">${escHtml(km)}</td>
          <td class="dietcol">${escHtml(dieta)}</td>
          <td class="centercol">${escHtml(firstCentro)}</td>
          <td class="laborcol pre">${escHtml(labor)}</td>
        </tr>`;

        for(const c of extraCentros){
          bodyRows += `<tr>
            <td class="daycol"></td>
            <td class="datecol">${escHtml(fmtDDMMYYYY(String(r?.fecha||"")))}</td>
            <td class="timecol"></td><td class="timecol"></td>
            <td class="timecol"></td><td class="timecol"></td>
            <td class="totalcol"></td>
            <td class="kmcol"></td>
            <td class="dietcol"></td>
            <td class="centercol">${escHtml(c)}</td>
            <td class="laborcol pre"></td>
          </tr>`;
        }
      }
    }

    // Pie tipo “TOTAL SEMANA DEL __ AL __”
    const footerRow = `<tr>
      <td colspan="6" class="totLbl">TOTAL SEMANA DEL ${escHtml(fmtDDMMYYYY(weekStart))} AL ${escHtml(fmtDDMMYYYY(weekEnd))}</td>
      <td class="totalcol">${escHtml(hoursToHHMM(totalHorasSemana))}</td>
      <td class="kmcol">${escHtml(String(Math.round(totalKmSemana*100)/100))}</td>
      <td class="dietcol"></td>
      <td class="centercol"></td>
      <td class="laborcol"></td>
    </tr>`;

    const htmlDoc = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escHtml(pdfName)}</title>
<style>
  @page{ size: A4 landscape; margin: 8mm; }
  body{ font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; color:#111; }
  .title{ text-align:center; font-weight:900; font-size:18px; margin:0 0 6px; }
  .hdr{ display:grid; grid-template-columns: 1fr 1fr; gap:6px 18px; font-size:12px; margin-bottom:6px; }
  .f{ display:flex; gap:6px; align-items:flex-end; }
  .lbl{ font-weight:800; white-space:nowrap; }
  .line{ flex:1; border-bottom:1px solid #000; min-height:14px; padding-left:6px; }
  table{ width:100%; border-collapse:collapse; font-size:10.5px; }
  th,td{ border:1px solid #000; padding:3px 4px; vertical-align:top; }
  th{ text-align:center; font-weight:900; }
  .small{ font-size:9px; font-weight:700; }
  .daycol{ width:18px; text-align:center; font-weight:900; }
  .datecol{ width:86px; }
  .timecol{ width:58px; text-align:center; }
  .totalcol{ width:64px; text-align:center; font-weight:800; }
  .kmcol{ width:44px; text-align:center; }
  .dietcol{ width:26px; text-align:center; font-weight:900; }
  .centercol{ width:170px; }
  .laborcol{ width:auto; }
  .pre{ white-space:pre-wrap; }
  .totLbl{ font-weight:900; }
  .extraLine{ margin-top:6px; font-size:11px; }
  .signRow{ display:flex; gap:18mm; margin-top:10mm; }
  .signBox{ flex:1; border:1px solid #000; height:18mm; position:relative; }
  .signLbl{ position:absolute; left:6px; bottom:3px; font-size:10px; font-weight:700; }
</style>
</head>
<body>
  <div class="title">PARTE DE TRABAJO SEMANAL</div>

  <div class="hdr">
    <div class="f"><div class="lbl">COOPERATIVA:</div><div class="line">${escHtml(settings.cooperativa||"")}</div></div>
    <div class="f"><div class="lbl">CENTRO DE TRABAJO:</div><div class="line">${escHtml(settings.centroTrabajo||"")}</div></div>
    <div class="f"><div class="lbl">NOMBRE DEL TRABAJADOR:</div><div class="line">${escHtml(settings.trabajador||"")}</div></div>
    <div class="f"><div class="lbl">CATEGORÍA:</div><div class="line">${escHtml(settings.categoria||"")}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th rowspan="2" class="daycol"></th>
        <th rowspan="2" class="datecol">FECHA</th>
        <th colspan="2" class="small">HORARIO MAÑANA</th>
        <th colspan="2" class="small">HORARIO TARDE</th>
        <th rowspan="2" class="totalcol">Total<br/>Horas</th>
        <th rowspan="2" class="kmcol">Km</th>
        <th class="dietcol">M/DIETA</th>
        <th rowspan="2" class="centercol">CENTRO DE TRABAJO</th>
        <th rowspan="2" class="laborcol">LABOR REALIZADA</th>
      </tr>
      <tr>
        <th class="timecol">Comienzo</th>
        <th class="timecol">Final</th>
        <th class="timecol">Comienzo</th>
        <th class="timecol">Final</th>
        <th class="dietcol small">SI/NO</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
    <tfoot>
      ${footerRow}
    </tfoot>
  </table>

  <div class="extraLine"><b>HORAS EXCESO JORNADA Y KMS.</b> &nbsp; Horas exceso: <b>${escHtml(hoursToHHMM(totalExtraSemana))}</b> &nbsp; | &nbsp; Kms: <b>${escHtml(String(Math.round(totalKmSemana*100)/100))}</b></div>

  <div class="signRow">
    <div class="signBox"><div class="signLbl">Fdo. El Trabajador</div></div>
    <div class="signBox"><div class="signLbl">VºBº El Responsable de producción.</div></div>
  </div>

  <script>window.onload=()=>{ setTimeout(()=>window.print(), 120); };</script>
</body></html>`;

    const w = window.open("", "_blank");
    if(w){
      w.document.open(); w.document.write(htmlDoc); w.document.close();
      return;
    }
    const iframe=document.createElement("iframe");
    iframe.style.position="fixed";
    iframe.style.right="0";
    iframe.style.bottom="0";
    iframe.style.width="0";
    iframe.style.height="0";
    iframe.style.border="0";
    document.body.appendChild(iframe);
    const doc=iframe.contentWindow.document;
    doc.open(); doc.write(htmlDoc); doc.close();
    setTimeout(()=>{
      try{ iframe.contentWindow.focus(); iframe.contentWindow.print(); }catch(_){}
      setTimeout(()=>iframe.remove(), 800);
    }, 200);
  }

  // -------- UI builders
  function card(title, subtitle=null){
    const c = UI.el("section",{class:"card"});
    const h = UI.el("div",{class:"row", style:"justify-content:space-between;align-items:flex-start"});
    const left = UI.el("div",{});
    left.appendChild(UI.el("h2",{}, title));
    if(subtitle) left.appendChild(UI.el("div",{class:"tiny muted"}, subtitle));
    h.appendChild(left);
    c.appendChild(h);
    return c;
  }

  function kpiItem(value, label){
    const k = UI.el("div",{class:"k"});
    k.appendChild(UI.el("div",{class:"n"}, value));
    k.appendChild(UI.el("div",{class:"t"}, label));
    return k;
  }

  function btn(label, cls, onClick, small=false){
    return UI.el("button",{type:"button", class:`btn ${cls||""} ${small?"btnSmall":""}`.trim(), onclick:onClick}, label);
  }

  function inputRow(labelText, inputEl){
    const w=UI.el("div",{class:"form-row"});
    w.appendChild(UI.el("div",{class:"label"}, labelText));
    w.appendChild(inputEl);
    return w;
  }

  function checkboxRow(labelText, checked=false){
    const cb = UI.el("input",{type:"checkbox"});
    cb.checked = !!checked;
    const w=UI.el("div",{class:"form-row"});
    w.appendChild(UI.el("div",{class:"label"}, labelText));
    const box = UI.el("label",{style:"display:flex;align-items:center;gap:10px"});
    box.appendChild(cb);
    box.appendChild(UI.el("span",{class:"tiny muted"},"Sí"));
    w.appendChild(box);
    return { wrap:w, input:cb };
  }

  // -------- Data access
  function getRegistros(){
    return StorageMT.loadRegistros();
  }
  function getPagos(){
    return StorageMT.loadPagos();
  }

  function calcTotals(registros, pagos){
    const totalTrab = (registros||[]).reduce((a,r)=>a + (Number(r?.horasTrabajadas)||0), 0);
    const totalExtra = (registros||[]).reduce((a,r)=>{
      const conv = (r?.horasLegales!=null) ? Number(r.horasLegales) : 8;
      return a + computeExtra(Number(r?.horasTrabajadas)||0, conv);
    }, 0);
    const totalPagos = (pagos||[]).reduce((a,p)=>a + (Number(p?.horas)||0), 0);
    const balance = totalExtra - totalPagos;
    return { totalTrab, totalExtra, totalPagos, balance };
  }

  // -------- Views
  function renderRegistros(container){
    UI.setPage("Registros", "Partes de trabajo", {
      label:"➕ Nuevo",
      onClick: ()=>{ S.editId=null; App.go("form"); }
    });

    const registros = getRegistros();
    const pagos = getPagos();
    const totals = calcTotals(registros, pagos);

    const top = UI.el("div",{class:"card"});
    const kpi = UI.el("div",{class:"kpi"});
    kpi.appendChild(kpiItem(fmtHoursDec(totals.totalExtra), "Total horas extra"));
    kpi.appendChild(kpiItem(fmtHoursDec(totals.totalPagos), "Total horas cobradas"));
    kpi.appendChild(kpiItem(fmtHoursDec(totals.balance), "Balance (debe empresa)"));
    top.appendChild(kpi);
    top.appendChild(UI.el("hr",{class:"sep"}));

    const search = UI.el("input",{class:"input", placeholder:"Buscar por localidad / texto…", value: S.search});
    search.addEventListener("input", ()=>{ S.search = search.value; render(); });

    const select = UI.el("select",{class:"select"});
    select.innerHTML = `
      <option value="todos">Todos los registros</option>
      <option value="conPendientes">Solo con trabajos pendientes</option>
      <option value="sinPendientes">Solo sin trabajos pendientes</option>`;
    select.value = S.filtroPendientes;
    select.addEventListener("change", ()=>{ S.filtroPendientes = select.value; render(); });

    const row = UI.el("div",{class:"grid cols2"});
    row.appendChild(inputRow("Buscar", search));
    row.appendChild(inputRow("Mostrar", select));
    top.appendChild(row);

    const actions = UI.el("div",{class:"row", style:"flex-wrap:wrap;justify-content:flex-end;margin-top:10px"});
    actions.appendChild(btn("🧹 Borrar TODOS", "btnDanger", ()=>{
      if(!confirmDanger("¿Seguro que quieres borrar TODOS los registros? Esto no se puede deshacer.")) return;
      StorageMT.clearRegistros();
      UI.toast("Registros borrados.");
      render();
    }, true));
    top.appendChild(actions);
    container.appendChild(top);

    // Table
    const tCard = card("Registros guardados", `${registros.length} registros`);

    // --- Periodo (listados / exportación)
    const dates = registros.map(r=>String(r.fecha||"").slice(0,10)).filter(Boolean).sort();
    const minDate = dates.length ? dates[0] : new Date().toISOString().slice(0,10);
    const maxDate = dates.length ? dates[dates.length-1] : new Date().toISOString().slice(0,10);
    if(!S.periodStart) S.periodStart = minDate;
    if(!S.periodEnd) S.periodEnd = maxDate;

    const rowPeriod = UI.el("div",{class:"grid cols3"});
    const inpStart = UI.el("input",{class:"input", type:"date", value:S.periodStart});
    const inpEnd = UI.el("input",{class:"input", type:"date", value:S.periodEnd});
    inpStart.addEventListener("change", ()=>{ S.periodStart = inpStart.value; render(); });
    inpEnd.addEventListener("change", ()=>{ S.periodEnd = inpEnd.value; render(); });

    rowPeriod.appendChild(inputRow("Fecha inicio (listados)", inpStart));
    rowPeriod.appendChild(inputRow("Fecha fin (listados)", inpEnd));

    const boxBtns = UI.el("div",{class:"form-row"});
    boxBtns.appendChild(UI.el("div",{class:"label"},"Acciones del periodo"));
    const btnRow = UI.el("div",{class:"row", style:"flex-wrap:wrap;justify-content:flex-end"});

    function recordEndMin(r){
      const t = String(
        r?.horaTardeFin || r?.hTarFin || r?.horaFin || r?.horaMananaFin || r?.hManFin || ""
      ).trim();
      const m = toMinHHMM(t);
      return (m==null ? -1 : m);
    }
    function recordStartMin(r){
      const t = String(
        r?.horaMananaInicio || r?.hManIni || r?.horaInicio || r?.horaTardeInicio || r?.hTarIni || ""
      ).trim();
      const m = toMinHHMM(t);
      return (m==null ? -1 : m);
    }

    function getFilteredList(){
      const list = filterByPeriod(registros, S.periodStart, S.periodEnd).filter(r=>{
        const q = String(S.search||"").trim().toLowerCase();
        if(q){
          const hay = [
            r.fecha, r.empresa,
            centrosTextForSearch(r),
            (r.materiales||[]).map(m=>m.nombre).join(" "),
            completadosSearch(r.trabajosCompletados),
            pendingSearch(r.trabajosPendientes),
            r.observaciones
          ].join(" ").toLowerCase();
          if(!hay.includes(q)) return false;
        }
        const pend = (r.trabajosPendientes||[]).map(formatTrabajoPendienteItem).map(s=>String(s||"").trim()).filter(Boolean);
        if(S.filtroPendientes==="conPendientes") return pend.length>0;
        if(S.filtroPendientes==="sinPendientes") return pend.length===0;
        return true;
      });

      // ✅ Orden del listado: más actual arriba (fecha desc + hora fin desc)
      return (list||[]).slice().sort((a,b)=>{
        const da = String(a?.fecha||"").slice(0,10);
        const db = String(b?.fecha||"").slice(0,10);
        if(da !== db) return db.localeCompare(da);

        const ea = recordEndMin(a);
        const eb = recordEndMin(b);
        if(ea !== eb) return eb - ea;

        const sa = recordStartMin(a);
        const sb = recordStartMin(b);
        if(sa !== sb) return sb - sa;

        return String(b?.id||"").localeCompare(String(a?.id||""));
      });
    }

    btnRow.appendChild(btn("🖨️ IMPRIMIR", "btnPrimary", ()=>{
      const list = getFilteredList();
      if(!list.length){ UI.toast("No hay registros en el periodo seleccionado."); return; }
      printRegistros(list, S.periodStart, S.periodEnd);
    }));

    btnRow.appendChild(btn("📋 EXCEL", "btnSuccess", async()=>{
      const list = getFilteredList();
      if(!list.length){ UI.toast("No hay registros en el periodo seleccionado."); return; }
      const tsv = buildTSV(list);
      try{
        const ok = await writeClipboard(tsv);
        if(ok) UI.toast("Listado copiado para Excel (pega en Excel).");
        else UI.toast("No se pudo copiar. Prueba en otro navegador o pega manualmente.");
      }catch(e){
        UI.toast(e.message || "Error copiando a portapapeles.");
      }
    }));

    btnRow.appendChild(btn("🗂️ PARTE T.", "btnWarn", ()=>{
      const days = daysBetweenInclusive(S.periodStart, S.periodEnd);
      if(days==null || days<=0){
        UI.toast("PARTE T: periodo inválido.");
        return;
      }
      if(days>7){
        UI.toast("PARTE T: no se puede proceder con más de 7 días seleccionados.");
        return;
      }
      const w1 = isoWeekInfo(S.periodStart);
      const w2 = isoWeekInfo(S.periodEnd);
      if(!w1 || !w2 || w1.week!==w2.week || w1.year!==w2.year){
        UI.toast("PARTE T: selecciona un periodo dentro de la misma semana (lunes-domingo).");
        return;
      }
      const list = getFilteredList();
      if(!list.length){ UI.toast("No hay registros en el periodo seleccionado."); return; }
      printParteT(list, S.periodStart, S.periodEnd);
    }));

    btnRow.appendChild(btn("Todo", "", ()=>{ S.periodStart=minDate; S.periodEnd=maxDate; render(); }, true));

    boxBtns.appendChild(btnRow);
    rowPeriod.appendChild(boxBtns);
    tCard.appendChild(rowPeriod);
    tCard.appendChild(UI.el("hr",{class:"sep"}));

    const wrap = UI.el("div",{class:"tableWrap"});

    const table = UI.el("table",{class:"table"});
    table.appendChild(UI.el("thead",{}, UI.el("tr",{}, [
      UI.el("th",{},"Fecha"),
      UI.el("th",{},"Empresa"),
      UI.el("th",{},"Localidad"),
      UI.el("th",{},"Ubicación"),
      UI.el("th",{},"Inicio"),
      UI.el("th",{},"Fin"),
      UI.el("th",{},"Descanso"),
      UI.el("th",{},"Horas"),
      UI.el("th",{},"Extra"),
      UI.el("th",{},"Materiales"),
      UI.el("th",{},"Cant."),
      UI.el("th",{},"Completado"),
      UI.el("th",{},"Pendiente"),
      UI.el("th",{},"Observaciones"),
      UI.el("th",{},"Acciones"),
    ])));

    const tbody = UI.el("tbody");
    const filtered = getFilteredList();

    for(const r of filtered){
      const mats = (r.materiales||[]).map(m=>String(m?.nombre||"").trim()).filter(Boolean);
      const cants = (r.materiales||[]).map(m=>String(m?.cantidad||"").trim()).filter(x=>x!=="");
      const complet = (r.trabajosCompletados||[]).map(formatTrabajoCompletadoItem).map(s=>String(s||"").trim()).filter(Boolean);
      const pend = (r.trabajosPendientes||[]).map(formatTrabajoPendienteItem).map(s=>String(s||"").trim()).filter(Boolean);

      const centros = getCentrosObj(r);
      const locs = centros.map(c=>String(c.localidad||"").trim()).filter(Boolean);
      const ubis = centros.map(c=>String(c.ubicacion||"").trim()).filter(Boolean);

      const td = (txt)=>UI.el("td",{}, safeText(txt));
      const tdMulti = (arr)=>{
        const t = UI.el("td");
        const text = (arr||[]).join("\n");
        const pre = UI.el("div",{style:"white-space:pre-wrap;"} , text);
        t.appendChild(pre);
        return t;
      };

      const tr = UI.el("tr");
      tr.appendChild(td(fmtDDMMYYYY(r.fecha)));
      tr.appendChild(td(r.empresa));
      tr.appendChild(tdMulti(locs));
      tr.appendChild(tdMulti(ubis));
      tr.appendChild(td(r.horaInicio));
      tr.appendChild(td(r.horaFin));
      tr.appendChild(td(r.descanso));
      tr.appendChild(td(hoursToHHMM(r.horasTrabajadas)));
      tr.appendChild(td(fmtHoursDec(computeExtra(Number(r.horasTrabajadas)||0, (r.horasLegales!=null)?Number(r.horasLegales):8))));
      tr.appendChild(tdMulti(mats));
      tr.appendChild(tdMulti(cants));
      tr.appendChild(tdMulti(complet));
      tr.appendChild(tdMulti(pend));
      tr.appendChild(tdMulti([r.observaciones||""]));

      const tdAct = UI.el("td");
      const rowAct = UI.el("div",{class:"row", style:"flex-wrap:wrap"});
      rowAct.appendChild(UI.el("button",{type:"button", class:"iconBtn small secondary", onclick:()=>{ S.editId=r.id; App.go("form"); }}, "✏️"));
      rowAct.appendChild(UI.el("button",{type:"button", class:"iconBtn small danger", onclick:()=>{
        if(!confirmDanger("¿Borrar este registro?")) return;
        StorageMT.deleteRegistro(r.id);
        UI.toast("Registro borrado.");
        render();
      }}, "🗑️"));
      tdAct.appendChild(rowAct);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    tCard.appendChild(wrap);

    container.appendChild(tCard);
  }

  // -------- Filas dinámicas: centros (localidad + ubicación)
  function makeCentroRow(data){
    const row = UI.el("div",{class:"form-row-inline", style:"width:100%;align-items:stretch"});

    const loc = withAutoInput(UI.el("input",{class:"input", placeholder:"Localidad…", value: data?.localidad || "", style:"flex:1;min-width:0"}), "centroLocalidad");
    const ubi = withAutoInput(UI.el("input",{class:"input", placeholder:"Ubicación…", value: data?.ubicacion || "", style:"flex:1;min-width:0"}), "centroUbicacion");

    const btns = UI.el("div",{style:"display:flex;gap:8px;margin-left:auto;flex:0 0 auto;align-items:flex-start"});
    const add = UI.el("button",{type:"button", class:"btn btnSmall", style:"min-width:44px"}, "＋");
    const del = UI.el("button",{type:"button", class:"btn btnSmall btnDanger", style:"min-width:44px"}, "－");
    btns.appendChild(add); btns.appendChild(del);

    row.appendChild(loc);
    row.appendChild(ubi);
    row.appendChild(btns);

    return { row, loc, ubi, add, del };
  }

  function makeMaterialRow(data){
    const row = UI.el("div",{class:"form-row-inline"});

    const name = withAutoInput(UI.el("input",{class:"input", placeholder:"Rodamiento…", value: data?.nombre || ""}), "materialNombre");
    const qty  = UI.el("input",{class:"input", type:"number", min:"0", step:"1", placeholder:"Cant.", value: data?.cantidad ?? ""});

    const nameBox = UI.el("div",{class:"flex-grow"});
    nameBox.appendChild(UI.el("div",{class:"label"},"Material"));
    nameBox.appendChild(name);

    const qtyBox = UI.el("div",{class:"cantidad-box"});
    qtyBox.appendChild(UI.el("div",{class:"label"},"Cant."));
    qtyBox.appendChild(qty);

    const btns = UI.el("div",{style:"display:flex;gap:8px;margin-left:auto;flex:0 0 auto;align-items:flex-start"});
    const add = UI.el("button",{type:"button", class:"btn btnSmall", style:"min-width:44px"}, "＋");
    const del = UI.el("button",{type:"button", class:"btn btnSmall btnDanger", style:"min-width:44px"}, "－");

    btns.appendChild(add);
    btns.appendChild(del);

    row.appendChild(nameBox);
    row.appendChild(qtyBox);
    row.appendChild(btns);

    return { row, name, qty, add, del };
  }

  function makeTrabajoRow(kind, data){
    const d = normalizeTrabajoPendiente(data);
    const wrap = UI.el("div",{class:"workBlock"});
    const rowTop = UI.el("div",{class:"form-row-inline", style:"width:100%;align-items:stretch"});
    const ta = UI.el("textarea",{
      class:"textarea",
      rows:"2",
      placeholder: kind==="pendiente" ? "Ej: Revisar poleas, revisar motor…" : "Ej: Cambio de correa, engrase…",
      style:"flex:1;min-width:0"
    }, d.texto || "");

    const add = UI.el("button",{type:"button", class:"btn btnSmall", style:"min-width:44px"}, "＋");
    const del = UI.el("button",{type:"button", class:"btn btnSmall btnDanger", style:"min-width:44px"}, "－");

    const btns = UI.el("div",{style:"display:flex;gap:8px;margin-left:auto;flex:0 0 auto;align-items:flex-start"});
    btns.appendChild(add);
    btns.appendChild(del);

    rowTop.appendChild(ta);
    rowTop.appendChild(btns);
    wrap.appendChild(rowTop);

    const meta = UI.el("div",{class:"grid cols2", style:"margin-top:6px"});
    const loc = withAutoInput(UI.el("input",{class:"input", placeholder:"Localidad del pendiente…", value:d.localidad || ""}), "pendienteLocalidad");
    const ubi = withAutoInput(UI.el("input",{class:"input", placeholder:"Ubicación del pendiente…", value:d.ubicacion || ""}), "pendienteUbicacion");
    meta.appendChild(inputRow("Localidad", loc));
    meta.appendChild(inputRow("Ubicación", ubi));
    wrap.appendChild(meta);

    function getData(){
      return { texto: ta.value.trim(), localidad: loc.value.trim(), ubicacion: ubi.value.trim() };
    }
    function clear(){ ta.value=""; loc.value=""; ubi.value=""; }
    return { row: wrap, ta, loc, ubi, add, del, getData, clear };
  }

  function makeTrabajoCompletadoRow(data){
    const d = normalizeTrabajoCompletado(data);
    const wrap = UI.el("div",{class:"workBlock"});

    const rowTop = UI.el("div",{class:"form-row-inline", style:"width:100%;align-items:stretch"});
    const ta = UI.el("textarea",{
      class:"textarea",
      rows:"2",
      placeholder:"Ej: Cambio de correa, engrase…",
      style:"flex:1"
    }, d.texto || "");

    const btns = UI.el("div",{style:"display:flex;gap:8px"});
    const add = UI.el("button",{type:"button", class:"btn btnSmall", style:"min-width:44px"}, "＋");
    const del = UI.el("button",{type:"button", class:"btn btnSmall btnDanger", style:"min-width:44px"}, "－");
    btns.appendChild(add); btns.appendChild(del);

    rowTop.appendChild(ta);
    rowTop.appendChild(btns);
    wrap.appendChild(rowTop);

    const meta = UI.el("div",{class:"grid cols3", style:"margin-top:6px"});
    const loc = withAutoInput(UI.el("input",{class:"input", placeholder:"Localidad…", value:d.localidad || ""}), "completadoLocalidad");
    const ubi = withAutoInput(UI.el("input",{class:"input", placeholder:"Ubicación…", value:d.ubicacion || ""}), "completadoUbicacion");
    const tiempo = UI.el("input",{class:"input", type:"time", value:d.tiempo || ""});
    meta.appendChild(inputRow("Localidad", loc));
    meta.appendChild(inputRow("Ubicación", ubi));
    meta.appendChild(inputRow("Tiempo empleado", tiempo));
    wrap.appendChild(meta);

    // Materiales del trabajo
    wrap.appendChild(UI.el("div",{class:"tiny muted", style:"margin:6px 0 4px 2px"},"Materiales de este trabajo"));
    const matsHost = UI.el("div",{});
    const matRows = [];

    function addMatRow(m, focus=false){
      const it = makeMaterialRow(m||{});
      matRows.push(it);
      matsHost.appendChild(it.row);

      it.add.onclick=()=>addMatRow({}, true);
      it.del.onclick=()=>{
        if(matRows.length===1){
          it.name.value=""; it.qty.value="";
          return;
        }
        const idx = matRows.indexOf(it);
        if(idx>=0) matRows.splice(idx,1);
        it.row.remove();
      };

      if(focus) it.name.focus();
    }

    const initMats = d.materiales && d.materiales.length ? d.materiales : [{}];
    for(const mm of initMats) addMatRow(mm);

    wrap.appendChild(matsHost);

    function getMateriales(){
      return matRows
        .map(it=>({ nombre: it.name.value.trim(), cantidad: it.qty.value }))
        .filter(m=>m.nombre || String(m.cantidad||"").trim()!=="");
    }

    function getData(){
      return {
        texto: ta.value.trim(),
        localidad: loc.value.trim(),
        ubicacion: ubi.value.trim(),
        tiempo: tiempo.value.trim(),
        materiales: getMateriales()
      };
    }

    function clear(){
      ta.value = "";
      loc.value = "";
      ubi.value = "";
      tiempo.value = "";
      while(matRows.length>1){
        const it = matRows.pop();
        it.row.remove();
      }
      if(matRows[0]){
        matRows[0].name.value="";
        matRows[0].qty.value="";
      }
    }

    return { row: wrap, ta, loc, ubi, tiempo, add, del, getMateriales, getData, clear };
  }

  // -------- Form (Nuevo/Editar)
  function renderForm(container){
    const isEdit = !!S.editId;
    UI.setPage(isEdit ? "Editar registro" : "Nuevo registro", "Completa los datos y guarda", {
      label:"⟵ Volver",
      onClick: ()=>{ App.go("registros"); }
    });

    const registros = getRegistros();
    const current = isEdit ? registros.find(r=>r.id===S.editId) : null;

    const c = card(isEdit ? "Editar" : "Nuevo registro", isEdit ? `ID: ${S.editId}` : null);

    // Inputs base
    const fecha = UI.el("input",{class:"input", type:"date", required:"required", value: current?.fecha || new Date().toISOString().slice(0,10)});
    const empresa = withAutoInput(UI.el("input",{class:"input", type:"text", placeholder:"Ej: Santísimo Cristo", value: current?.empresa || ""}), "empresa");

    // Centros dinámicos
    const centrosHost = UI.el("div",{});
    const centroRows = [];

    function addCentroRow(data, focus=false){
      const it = makeCentroRow(data||{});
      centroRows.push(it);
      centrosHost.appendChild(it.row);

      it.add.onclick=()=>addCentroRow({}, true);
      it.del.onclick=()=>{
        if(centroRows.length===1){
          it.loc.value=""; it.ubi.value="";
          return;
        }
        const idx=centroRows.indexOf(it);
        if(idx>=0) centroRows.splice(idx,1);
        it.row.remove();
      };

      if(focus) it.loc.focus();
    }

    const initCentros = getCentrosObj(current);
    if(initCentros.length){
      for(const cc of initCentros) addCentroRow(cc);
    }else{
      addCentroRow({localidad:"", ubicacion:""});
    }

    // Turnos (mañana / tarde)
    const defaultManIni = String(current?.horaMananaInicio || current?.hManIni || current?.horaInicio || "").trim();
    const defaultManFin = String(current?.horaMananaFin || current?.hManFin || current?.horaFin || "").trim();
    const defaultTarIni = String(current?.horaTardeInicio || current?.hTarIni || "").trim();
    const defaultTarFin = String(current?.horaTardeFin || current?.hTarFin || "").trim();

    const manIni = UI.el("input",{class:"input", type:"time", value: defaultManIni });
    const manFin = UI.el("input",{class:"input", type:"time", value: defaultManFin });
    const tarIni = UI.el("input",{class:"input", type:"time", value: defaultTarIni });
    const tarFin = UI.el("input",{class:"input", type:"time", value: defaultTarFin });

    const descanso = UI.el("input",{class:"input", type:"time", value: current?.descanso || "00:00"});
    const horasConvenio = UI.el("input",{class:"input", type:"number", step:"0.25", min:"0", value: String((current && current.horasLegales!=null) ? current.horasLegales : 8)});

    const km = UI.el("input",{class:"input", type:"number", step:"1", min:"0", placeholder:"Km (ej: 25)", value: (current?.km!=null ? String(current.km) : "")});
    const dietaRow = checkboxRow("M/DIETA", !!current?.dieta);

    const totalHoras = UI.el("input",{class:"input readonly", type:"text", readOnly:"readonly", value:""});
    const extraHoras = UI.el("input",{class:"input readonly", type:"text", readOnly:"readonly", value:""});

    function calcShiftMin(ini, fin){
      const a = String(ini||"").trim();
      const b = String(fin||"").trim();
      if(!a && !b) return 0; // turno vacío permitido
      if(!a || !b) return null; // incompleto
      return diffMinutes(a,b);
    }

    function recalc(){
      const m1 = calcShiftMin(manIni.value, manFin.value);
      const m2 = calcShiftMin(tarIni.value, tarFin.value);
      const ds = toMinHHMM(descanso.value);

      if(m1==null || m2==null){
        totalHoras.value = "";
        extraHoras.value = "";
        return;
      }

      const rest = (ds!=null ? ds : 0);
      const workedMin = Math.max(0, (m1+m2) - rest);
      const dec = workedMin/60;

      totalHoras.value = `${hoursToHHMM(dec)} (${fmtHoursDec(dec)} h)`;

      let legal = (horasConvenio && horasConvenio.value !== "") ? Number(horasConvenio.value) : 8;
      if(!Number.isFinite(legal) || legal < 0) legal = 0;

      const extra = Math.max(0, dec - legal);
      extraHoras.value = `${fmtHoursDec(extra)} h`;
    }

    for(const i of [manIni,manFin,tarIni,tarFin,descanso,horasConvenio]) i.addEventListener("input", recalc);

    // Trabajos completados dynamic (cada trabajo incluye sus materiales)
    const compHost = UI.el("div",{});
    const compRows=[];
    function addCompRow(data, focus=false){
      const it = makeTrabajoCompletadoRow(data || {});
      compRows.push(it);
      compHost.appendChild(it.row);
      it.add.onclick=()=>addCompRow({texto:"", materiales:[{}]}, true);
      it.del.onclick=()=>{
        if(compRows.length===1){ it.clear(); return; }
        const idx=compRows.indexOf(it);
        if(idx>=0) compRows.splice(idx,1);
        it.row.remove();
      };
      if(focus) it.ta.focus();
    }

    const initComp = (current?.trabajosCompletados && current.trabajosCompletados.length)
      ? current.trabajosCompletados
      : [{texto:"", materiales:[{}]}];
    for(const t of initComp) addCompRow(t);

    // Trabajos pendientes dynamic
    const pendHost = UI.el("div",{});
    const pendRows=[];
    function addPendRow(text, focus=false){
      const it = makeTrabajoRow("pendiente", text);
      pendRows.push(it);
      pendHost.appendChild(it.row);
      it.add.onclick=()=>addPendRow("", true);
      it.del.onclick=()=>{
        if(pendRows.length===1){ it.ta.value=""; return; }
        const idx=pendRows.indexOf(it);
        if(idx>=0) pendRows.splice(idx,1);
        it.row.remove();
      };
      if(focus) it.ta.focus();
    }
    const initPend = (current?.trabajosPendientes && current.trabajosPendientes.length) ? current.trabajosPendientes : [""];
    for(const t of initPend) addPendRow(t);

    const observ = UI.el("textarea",{class:"textarea", rows:"2", placeholder:"Ruido leve, se recomienda revisar en 1 semana…"}, current?.observaciones || "");

    // Layout
    c.appendChild(UI.el("div",{class:"grid cols2"}, [
      inputRow("Fecha", fecha),
      inputRow("Empresa", empresa),
    ]));

    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(UI.el("div",{class:"label"},"Centro(s) del día (Localidad + Ubicación)"));
    c.appendChild(centrosHost);

    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(UI.el("div",{class:"grid cols2"}, [
      inputRow("Mañana: comienzo", manIni),
      inputRow("Mañana: final", manFin),
      inputRow("Tarde: comienzo", tarIni),
      inputRow("Tarde: final", tarFin),
      inputRow("Descanso", descanso),
      inputRow("Horas convenio", horasConvenio),
      inputRow("Km", km),
      dietaRow.wrap,
      inputRow("Horas trabajadas", totalHoras),
      inputRow("Horas extra", extraHoras),
    ]));

    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(UI.el("div",{class:"label"},"Trabajos completados"));
    c.appendChild(compHost);

    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(UI.el("div",{class:"label"},"Trabajos pendientes"));
    c.appendChild(pendHost);

    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(inputRow("Observaciones", observ));

    const actions = UI.el("div",{class:"row", style:"justify-content:flex-end;flex-wrap:wrap;gap:10px"});
    actions.appendChild(btn("Cancelar / Limpiar", "", ()=>{
      if(isEdit){
        S.editId=null;
        App.go("registros");
        return;
      }

      empresa.value="";
      fecha.value = new Date().toISOString().slice(0,10);

      while(centroRows.length>1){
        const it = centroRows.pop();
        it.row.remove();
      }
      if(centroRows[0]){
        centroRows[0].loc.value="";
        centroRows[0].ubi.value="";
      }

      manIni.value=""; manFin.value="";
      tarIni.value=""; tarFin.value="";
      descanso.value="00:00";
      horasConvenio.value="8";
      km.value="";
      dietaRow.input.checked=false;

      while(compRows.length>1){
        const it = compRows.pop();
        it.row.remove();
      }
      if(compRows[0]) compRows[0].clear();

      while(pendRows.length>1){
        const it = pendRows.pop();
        it.row.remove();
      }
      if(pendRows[0]) pendRows[0].clear();

      observ.value="";
      recalc();
      UI.toast("Formulario limpiado.");
    }));

    actions.appendChild(btn("Guardar registro", "btnPrimary", ()=>{
      if(!fecha.value){ UI.toast("Falta la fecha."); return; }

      const centros = centroRows
        .map(it=>({ localidad: it.loc.value.trim(), ubicacion: it.ubi.value.trim() }))
        .filter(c=>c.localidad || c.ubicacion);

      if(!centros.length || !centros[0].localidad || !centros[0].ubicacion){
        UI.toast("Falta Localidad/Ubicación (al menos la primera).");
        return;
      }

      const m1 = calcShiftMin(manIni.value, manFin.value);
      const m2 = calcShiftMin(tarIni.value, tarFin.value);
      if(m1==null || m2==null){
        UI.toast("Horas de turno incompletas (mañana o tarde).");
        return;
      }

      const rest = toMinHHMM(descanso.value) || 0;
      const workedMin = Math.max(0, (m1+m2) - rest);
      const horasTrab = workedMin/60;

      let legal = (horasConvenio && horasConvenio.value !== "") ? Number(horasConvenio.value) : 8;
      if(!Number.isFinite(legal) || legal < 0) legal = 0;

      const horasExtra = Math.max(0, horasTrab - legal);

      // horaInicio/horaFin (compatibilidad): inicio = primer comienzo, fin = último final
      const starts = [manIni.value, tarIni.value].filter(Boolean).map(toMinHHMM).filter(x=>x!=null);
      const ends = [tarFin.value, manFin.value].filter(Boolean).map(toMinHHMM).filter(x=>x!=null);
      const horaInicio = (starts.length ? [manIni.value, tarIni.value].find(v=>String(v||"").trim()) : "");
      const horaFin = (ends.length ? (String(tarFin.value||"").trim() ? tarFin.value : manFin.value) : "");

      const trabajosCompletados = compRows
        .map(it=>{
          const data = it.getData();
          if(!data.texto && !data.localidad && !data.ubicacion && !data.tiempo && !data.materiales.length) return null;
          return data;
        })
        .filter(Boolean);

      // Agregado de materiales (compatibilidad)
      const materiales = trabajosCompletados
        .flatMap(t=>Array.isArray(t.materiales) ? t.materiales : [])
        .map(m=>({ nombre: String(m?.nombre||"").trim(), cantidad: (m?.cantidad==null ? "" : String(m.cantidad)).trim() }))
        .filter(m=>m.nombre || String(m.cantidad||"").trim()!=="");

      const trabajosPendientes = pendRows
        .map(it=>it.getData())
        .filter(t=>t.texto || t.localidad || t.ubicacion);

      const kmVal = (km.value==="" ? "" : Number(km.value));
      const kmNum = (kmVal==="" ? 0 : (Number.isFinite(kmVal)?kmVal:0));

      const obj = {
        fecha: fecha.value,
        empresa: empresa.value.trim(),

        centros,
        horaMananaInicio: manIni.value || "",
        horaMananaFin: manFin.value || "",
        horaTardeInicio: tarIni.value || "",
        horaTardeFin: tarFin.value || "",
        km: kmNum,
        dieta: !!dietaRow.input.checked,

        // compatibilidad
        localidad: centros[0].localidad,
        ubicacion: centros[0].ubicacion,
        horaInicio,
        horaFin,

        descanso: descanso.value || "00:00",
        horasLegales: legal,
        horasTrabajadas: horasTrab,
        horasExtra: horasExtra,

        materiales,
        trabajosCompletados,
        trabajosPendientes,
        observaciones: observ.value.trim()
      };

      rememberAuto({
        empresa: empresa.value,
        centroLocalidad: centros[centros.length-1]?.localidad || "",
        centroUbicacion: centros[centros.length-1]?.ubicacion || "",
        completadoLocalidad: trabajosCompletados.slice().reverse().find(t=>t.localidad)?.localidad || "",
        completadoUbicacion: trabajosCompletados.slice().reverse().find(t=>t.ubicacion)?.ubicacion || "",
        pendienteLocalidad: trabajosPendientes.slice().reverse().find(t=>t.localidad)?.localidad || "",
        pendienteUbicacion: trabajosPendientes.slice().reverse().find(t=>t.ubicacion)?.ubicacion || "",
        materialNombre: materiales.slice().reverse().find(m=>m.nombre)?.nombre || ""
      });

      if(isEdit){
        StorageMT.updateRegistro(S.editId, obj);
        UI.toast("Registro actualizado.");
        S.editId=null;
      }else{
        StorageMT.addRegistro(obj);
        UI.toast("Registro guardado.");
      }
      App.go("registros");
    },""));

    c.appendChild(actions);
    container.appendChild(c);
    recalc();
  }

  function renderExtra(container){
    UI.setPage("Horas extra", "Pagos y balance", null);

    const registros = getRegistros();
    const pagos = getPagos();
    const totals = calcTotals(registros, pagos);

    const c = card("Resumen", "Se calcula automáticamente con los registros diarios. Los pagos se introducen manualmente.");
    const kpi = UI.el("div",{class:"kpi"});
    kpi.appendChild(kpiItem(fmtHoursDec(totals.totalExtra), "Total horas extras"));
    kpi.appendChild(kpiItem(fmtHoursDec(totals.totalPagos), "Total horas cobradas"));
    kpi.appendChild(kpiItem(fmtHoursDec(totals.balance), "Balance (debe empresa)"));
    c.appendChild(kpi);
    c.appendChild(UI.el("hr",{class:"sep"}));

    // Add payment form
    const fecha = UI.el("input",{class:"input", type:"date", value:new Date().toISOString().slice(0,10)});
    const horas = UI.el("input",{class:"input", type:"number", step:"0.25", min:"0", placeholder:"Horas cobradas (ej: 5)", value:""});
    const nota = UI.el("input",{class:"input", type:"text", placeholder:"Nota (opcional)", value:""});

    const grid = UI.el("div",{class:"grid cols3"});
    grid.appendChild(inputRow("Fecha de pago", fecha));
    grid.appendChild(inputRow("Horas cobradas", horas));
    grid.appendChild(inputRow("Nota", nota));
    c.appendChild(grid);

    const row = UI.el("div",{class:"row", style:"justify-content:flex-end;flex-wrap:wrap"});
    row.appendChild(btn("Añadir pago", "btnSuccess", ()=>{
      const h = Number(horas.value);
      if(!Number.isFinite(h) || h<=0){ UI.toast("Introduce horas cobradas válidas."); return; }
      StorageMT.addPago({ fecha: fecha.value, horas: h, nota: nota.value.trim() });
      horas.value=""; nota.value="";
      UI.toast("Pago guardado.");
      render();
    }));
    c.appendChild(row);
    container.appendChild(c);

    // Payments list
    const list = card("Pagos registrados", `${pagos.length} pagos`);
    if(!pagos.length){
      list.appendChild(UI.el("div",{class:"tiny muted"},"Aún no hay pagos. Añade el primero arriba."));
      container.appendChild(list);
      return;
    }

    const wrap = UI.el("div",{class:"tableWrap"});
    const table = UI.el("table",{class:"table", style:"min-width:680px"});
    table.appendChild(UI.el("thead",{}, UI.el("tr",{}, [
      UI.el("th",{},"Fecha"),
      UI.el("th",{},"Horas"),
      UI.el("th",{},"Nota"),
      UI.el("th",{},"Acciones"),
    ])));
    const tbody = UI.el("tbody");
    for(const p of pagos){
      const tr = UI.el("tr");
      tr.appendChild(UI.el("td",{}, fmtDDMMYYYY(p.fecha || "")));
      tr.appendChild(UI.el("td",{}, fmtHoursDec(p.horas)));
      tr.appendChild(UI.el("td",{}, p.nota || ""));
      const td = UI.el("td");
      td.appendChild(UI.el("button",{type:"button", class:"iconBtn small danger", onclick:()=>{
        if(!confirmDanger("¿Borrar este pago?")) return;
        StorageMT.deletePago(p.id);
        UI.toast("Pago borrado.");
        render();
      }}, "🗑️"));
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    list.appendChild(wrap);
    container.appendChild(list);
  }

  function renderBackup(container){
    UI.setPage("Backup", "Exportar / Importar", null);

    const c = card("Copias de seguridad", "Exporta a archivo, copia al portapapeles o restaura pegando el contenido.");
    const row = UI.el("div",{class:"row", style:"flex-wrap:wrap"});

    row.appendChild(btn("📤 Exportar JSON", "btnPrimary", ()=>{
      const registros = getRegistros();
      const pagos = getPagos();
      const pack = {
        meta:{ app:"Cuaderno Mantenimiento", createdAt:new Date().toISOString(), version:1 },
        data:{
          [StorageMT.KEY_REGISTROS]: JSON.stringify(registros),
          [StorageMT.KEY_OLD_TRABAJOS]: JSON.stringify(registros),
          [StorageMT.KEY_EXTRA_PAGOS]: JSON.stringify(pagos),
          [SETTINGS_KEY]: localStorage.getItem(SETTINGS_KEY) || "",
          [AUTOCOMPLETE_KEY]: localStorage.getItem(AUTOCOMPLETE_KEY) || ""
        }
      };
      const name = `backup_mantenimiento_${new Date().toISOString().slice(0,10)}.json`;
      download(name, JSON.stringify(pack, null, 2));
    }));

    row.appendChild(btn("📥 Importar JSON", "btnWarn", async()=>{
      const f = await pickFile("application/json");
      if(!f) return;
      const text = await f.text();
      try{
        const obj = JSON.parse(text);
        const storage = obj.storage || obj.data;
        if(!storage || typeof storage!=="object") throw new Error("Formato no reconocido.");
        const keepSync = {};
        ["cuaderno_sync_device_id_v1","cuaderno_sync_paired_device_id_v1"].forEach(k=>{ const v=localStorage.getItem(k); if(v!=null) keepSync[k]=v; });
        localStorage.clear();
        for(const [k,v] of Object.entries(keepSync)){ localStorage.setItem(k, String(v)); }
        for(const [k,v] of Object.entries(storage)){
          localStorage.setItem(k, String(v));
        }
        try{
          const regs = StorageMT.loadRegistros();
          StorageMT.saveRegistros(regs, "importacion_json");
          if(window.FirebaseSyncMT){ FirebaseSyncMT.log("importacion_json", { registros:regs.length }); FirebaseSyncMT.pushAllLocal("importacion_json"); }
        }catch(_){}
        UI.toast("Importación completada. Se recarga…");
        setTimeout(()=>location.reload(), 400);
      }catch(e){
        UI.toast(e.message || "Error importando.");
      }
    }));

    row.appendChild(btn("📋 Copiar backup", "btnSuccess", async()=>{
      try{
        await BackupClipboard.copyBackupToClipboard({ appName:"Cuaderno Mantenimiento" });
      }catch(e){
        UI.toast(e.message || "No se pudo copiar.");
      }
    }));

    row.appendChild(btn("🧩 Pegar / Restaurar", "btnWarn", ()=>{
      BackupClipboard.openPasteWindow({ title:"Restaurar / Importar (pegar)", mode:"replace", onDone:()=>{} });
    }));

    row.appendChild(btn("🗑️ Borrar TODO", "btnDanger", ()=>{
      if(!confirmDanger("¿Seguro que quieres borrar TODOS los datos (registros + pagos) del dispositivo?")) return;
      StorageMT.clearRegistros();
      StorageMT.clearPagos();
      UI.toast("Datos borrados. Recargando…");
      setTimeout(()=>location.reload(), 350);
    }));

    c.appendChild(row);
    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(UI.el("div",{class:"tiny muted"}, "Consejo: guarda un backup semanal. La opción de “Pegar / Restaurar” acepta un JSON de backup o una tabla copiada desde Excel (si vienes de otra app)."));
    container.appendChild(c);
  }

  function renderInfo(container){
    UI.setPage("Ajustes", "Datos fijos para el PARTE T", null);

    const s = loadSettings();

    const c = card("Ajustes del Parte de Trabajo", "Estos datos se usan en la cabecera del PARTE T.");
    const cooperativa = UI.el("input",{class:"input", type:"text", placeholder:"Cooperativa…", value:s.cooperativa});
    const centroTrabajo = UI.el("input",{class:"input", type:"text", placeholder:"Centro de trabajo (cabecera)…", value:s.centroTrabajo});
    const trabajador = UI.el("input",{class:"input", type:"text", placeholder:"Nombre del trabajador…", value:s.trabajador});
    const categoria = UI.el("input",{class:"input", type:"text", placeholder:"Categoría…", value:s.categoria});

    const grid = UI.el("div",{class:"grid cols2"});
    grid.appendChild(inputRow("COOPERATIVA", cooperativa));
    grid.appendChild(inputRow("CENTRO DE TRABAJO (cabecera)", centroTrabajo));
    grid.appendChild(inputRow("NOMBRE DEL TRABAJADOR", trabajador));
    grid.appendChild(inputRow("CATEGORÍA", categoria));
    c.appendChild(grid);

    const row = UI.el("div",{class:"row", style:"justify-content:flex-end;flex-wrap:wrap;margin-top:10px"});
    row.appendChild(btn("Guardar ajustes", "btnPrimary", ()=>{
      saveSettings({
        cooperativa: cooperativa.value,
        centroTrabajo: centroTrabajo.value,
        trabajador: trabajador.value,
        categoria: categoria.value
      });
      UI.toast("Ajustes guardados.");
    }));
    c.appendChild(row);

    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(UI.el("div",{class:"tiny muted"}, "Nota: el “CENTRO DE TRABAJO” de la cabecera NO es la columna “CENTRO DE TRABAJO” dentro de la tabla del parte. Esa columna se rellena con los centros reales del día desde los registros."));
    container.appendChild(c);
  }

  function render(){
    const host = document.getElementById("app");
    host.innerHTML="";
    const view = S.view;

    if(view==="registros") renderRegistros(host);
    else if(view==="form") renderForm(host);
    else if(view==="extra") renderExtra(host);
    else if(view==="backup") renderBackup(host);
    else if(view==="ajustes") renderInfo(host);
    else { S.view="registros"; renderRegistros(host); }
  }

  // -------- Navigation
  let nav=null;
  function initNav(){
    const i = MobileBottomNav.svgIcon;
    nav = MobileBottomNav.init([
      { id:"registros", label:"Registros", iconSvg: i("M4 6h16M4 12h16M4 18h16") },
      { id:"form", label:"Nuevo", iconSvg: i("M12 5v14M5 12h14") },
      { id:"extra", label:"Horas", iconSvg: i("M12 8v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0") },
      { id:"backup", label:"Backup", iconSvg: i("M12 3v12m0 0 4-4m-4 4-4-4M4 21h16") },
      { id:"ajustes", label:"Ajustes", iconSvg: i("M12 1l2 3 3 .5-2 3 .5 3-3-2-3 2 .5-3-2-3 3-.5z") },
    ]);
    nav.setActive("registros");
  }

  const App = {
    go(view){
      S.view = view;
      if(nav) nav.setActive(view==="ajustes" ? "ajustes" : view);
      render();
    },
    getState(){ return Object.assign({}, S); }
  };
  window.App = App;

  document.addEventListener("DOMContentLoaded", ()=>{
    initNav();
    render();
    window.addEventListener("cuaderno-sync-updated", ()=>{ try{ render(); }catch(_){} });
  });
})();