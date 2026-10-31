/* kieranmurphy.ie: simple password screen for the locked apps. Add to an app's <head>:
   <script src="../gate.js" data-app="App name"></script> */
(function () {
  var KEY = "km-unlocked", H = "cuny23", d = document.documentElement;
  var me = document.currentScript, NAME = (me && me.getAttribute("data-app")) || "This app";
  function h(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x.toString(36); }
  try { if (localStorage.getItem(KEY) === H) return; } catch (e) {}
  d.classList.add("km-locked");
  var css = document.createElement("style");
  css.textContent =
    "html.km-locked body>*:not(#km-gate){display:none!important}html.km-locked,html.km-locked body{overflow:hidden!important}" +
    "#km-gate,#km-gate *{box-sizing:border-box}#km-gate{--g:#ECEEEA;--i:#151917;--i2:#57605B;--r:#C6CDC8;--c:#F9F9F5;position:fixed;inset:0;z-index:2147483647;display:grid;grid-template-columns:minmax(0,23rem);justify-content:center;align-content:center;" +
    "padding:24px max(20px,env(safe-area-inset-right)) 24px max(20px,env(safe-area-inset-left));background:var(--g);color:var(--i);" +
    "font:17px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}" +
    "@media (prefers-color-scheme:dark){#km-gate{--g:#111513;--i:#E5E9E5;--i2:#9AA49E;--r:#2A332E;--c:#1A201D}}" +
    "#km-gate form{width:100%;min-width:0;display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin:0}" +
    "#km-gate .km-back{justify-self:start;color:var(--i2);font-size:15px;font-weight:600;text-decoration:none;margin-bottom:18px}" +
    "#km-gate .km-back:hover{color:var(--i);text-decoration:underline}" +
    "#km-gate .km-lock{width:34px;height:34px;color:var(--i)}" +
    "#km-gate h1{margin:4px 0 0;font-size:32px;line-height:1.05;letter-spacing:-.02em;font-weight:800}" +
    "#km-gate p{margin:0;color:var(--i2)}#km-gate label{margin-top:12px;font-size:15px;font-weight:700}" +
    "#km-gate .km-row{display:flex;gap:8px;min-width:0}" +
    "#km-gate input{flex:1 1 0;width:auto;min-width:0;max-width:none;margin:0;height:50px;padding:0 14px;border:1.5px solid var(--r);border-radius:12px;background:var(--c);color:var(--i);font:inherit;font-size:17px}" +
    "#km-gate input:focus{outline:2px solid var(--i);outline-offset:1px;border-color:transparent}" +
    "#km-gate button{flex:none;width:auto;min-width:0;margin:0;height:50px;padding:0 20px;border:0;border-radius:12px;background:var(--i);color:var(--g);font:inherit;font-weight:700;cursor:pointer}" +
    "#km-gate button:focus-visible{outline:2px solid var(--i);outline-offset:3px}" +
    "#km-gate .km-err{min-height:1.5em;color:#C4372C;font-size:15px;font-weight:600}" +
    "@media (prefers-color-scheme:dark){#km-gate .km-err{color:#FF8A7A}}" +
    "#km-gate .km-shake{animation:km-shake .35s}@keyframes km-shake{25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}" +
    "@media (prefers-reduced-motion:reduce){#km-gate .km-shake{animation:none}}";
  (document.head || d).appendChild(css);
  function show() {
    if (document.getElementById("km-gate")) return;
    var g = document.createElement("div");
    g.id = "km-gate"; g.setAttribute("role", "dialog"); g.setAttribute("aria-modal", "true"); g.setAttribute("aria-labelledby", "km-gate-h");
    g.innerHTML = '<form novalidate><a class="km-back" href="../">‹ kieranmurphy.ie</a>' +
      '<svg class="km-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor" stroke="none"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>' +
      '<h1 id="km-gate-h"></h1><p>Enter the password to open it.</p>' +
      '<label for="km-pw">Password</label><div class="km-row"><input id="km-pw" type="password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go">' +
      '<button type="submit">Open</button></div><p class="km-err" role="alert"></p></form>';
    g.querySelector("h1").textContent = NAME;
    document.body.appendChild(g);
    var f = g.querySelector("form"), i = g.querySelector("input"), e = g.querySelector(".km-err");
    setTimeout(function () { i.focus(); }, 60);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (h(i.value.trim().toLowerCase()) === H) {
        try { localStorage.setItem(KEY, H); } catch (x) {}
        d.classList.remove("km-locked"); g.parentNode.removeChild(g); css.parentNode.removeChild(css);
        return;
      }
      e.textContent = i.value ? "That's not the password. Try again." : "Enter the password.";
      f.classList.remove("km-shake"); void f.offsetWidth; f.classList.add("km-shake"); i.select();
    });
  }
  if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
})();
