/* modules/mobileBottomNav.js */
(function(){
  "use strict";
  function el(tag, attrs={}, text){
    const n=document.createElement(tag);
    for(const [k,v] of Object.entries(attrs||{})){
      if(k==="class") n.className=v;
      else if(k==="html") n.innerHTML=v;
      else n.setAttribute(k, v);
    }
    if(text!=null) n.textContent=text;
    return n;
  }

  function svgIcon(pathD){
    return `<svg class="bn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${pathD}"></path></svg>`;
  }

  function init(items){
    const host=document.getElementById("bottomNav") || el("div",{id:"bottomNav"});
    host.className="bottom-nav";
    if(!host.parentNode) document.body.appendChild(host);

    const wrap=el("div",{class:"bn-wrap"});
    host.innerHTML="";
    host.appendChild(wrap);

    document.body.classList.add("has-bottom-nav");

    const btns=new Map();

    function setActive(id){
      for(const [k,b] of btns.entries()){
        if(k===id) b.classList.add("active");
        else b.classList.remove("active");
      }
    }

    function tryNavigate(target){
      if(typeof target==="function"){ target(); return true; }
      const t=String(target||"").trim();
      if(!t) return false;
      if(window.App && typeof App.go==="function"){ App.go(t); return true; }
      return false;
    }

    for(const it of (items||[])){
      const b=el("button",{type:"button","data-bn":it.id});
      b.appendChild(el("span",{class:"bn-ico", html: it.iconSvg || ""}));
      b.appendChild(el("span",{class:"bn-txt"}, it.label || it.id));
      b.onclick=()=>{
        const ok=tryNavigate(it.target || it.id);
        if(ok) setActive(it.id);
      };
      wrap.appendChild(b);
      btns.set(it.id,b);
    }

    return { setActive };
  }

  window.MobileBottomNav = { init, svgIcon };
})();
