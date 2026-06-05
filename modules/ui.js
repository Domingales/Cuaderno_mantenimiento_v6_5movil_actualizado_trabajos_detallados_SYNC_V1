/* modules/ui.js */
(function(){
  "use strict";
  function el(tag, attrs={}, children){
    const n = document.createElement(tag);
    for(const [k,v] of Object.entries(attrs||{})){
      if(k==="class") n.className = v;
      else if(k==="html") n.innerHTML = v;
      else if(k==="style") n.setAttribute("style", v);
      else if(k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    if(children != null){
      const arr = Array.isArray(children) ? children : [children];
      for(const c of arr){
        if(c==null) continue;
        n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return n;
  }
  function setPage(title, subtitle, headerAction){
    const t = document.getElementById("pageTitle");
    if(t) t.textContent = title || "Cuaderno de Mantenimiento";
    const st = document.getElementById("pageSubtitle");
    if(st) st.textContent = subtitle || "";
    const btn = document.getElementById("btnHeaderAction");
    if(btn){
      if(headerAction && headerAction.label && typeof headerAction.onClick==="function"){
        btn.style.display = "";
        btn.textContent = headerAction.label;
        btn.onclick = headerAction.onClick;
      }else{
        btn.style.display = "none";
        btn.textContent = "";
        btn.onclick = null;
      }
    }
  }
  let toastTimer = null;
  function toast(msg, ms=1800){
    try{
      if(toastTimer){ clearTimeout(toastTimer); toastTimer=null; }
      const old = document.getElementById("toast");
      if(old) old.remove();
      const t = el("div",{id:"toast", class:"toast"}, String(msg||""));
      document.body.appendChild(t);
      toastTimer = setTimeout(()=>{ try{ t.remove(); }catch(_){ } }, ms);
    }catch(_){
      alert(msg);
    }
  }
  window.UI = { el, setPage, toast };
})();
