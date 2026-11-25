/* AZADOR core: طبقة البيانات المشتركة بين كل الصفحات (Firebase Firestore). */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyANUAd9bj7-eCJsA4VQuOegFhaFJaborrc",
  authDomain: "azador-web.firebaseapp.com",
  projectId: "azador-web",
  storageBucket: "azador-web.firebasestorage.app",
  messagingSenderId: "350515751641",
  appId: "1:350515751641:web:bdeaa734ba215b90baacc8",
  measurementId: "G-7LMBNK7H29"
};
const AZ = (() => {
  const ls = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
  const fmt = (t, l = "ar") => new Intl.DateTimeFormat(l === "ar" ? "ar-u-nu-latn" : l, { hour: "2-digit", minute: "2-digit" }).format(t);
  const cur = { ar: "دج", fr: "DA", en: "DA" };
  const money = (n, l = "ar") => Math.round(n || 0).toLocaleString("en") + " " + cur[l];
  const paid = o => o.payments.reduce((a, x) => a + x.amount, 0);
  const waiting = o => { let c = 0; for (let i = o.messages.length - 1; i >= 0 && o.messages[i].from === "client"; i--) c++; return c; };
  const url = u => { u = (u || "").trim(); if (!u) return ""; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null; };
  const copy = async t => {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) { const a = document.createElement("textarea"); a.value = t; a.style.cssText = "position:fixed;opacity:0"; document.body.append(a); a.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (e2) {} a.remove(); return ok; }
  };
  const WA_NUMBER = "0770990341";
  const WA_INTL = "213" + WA_NUMBER.replace(/^0/, "");
  const wa = (text, to = WA_INTL) => "https://wa.me/" + to + (text ? "?text=" + encodeURIComponent(text) : "");
  const waTo = p => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = "213" + d.slice(1); return d; };
  const ccp = () => ccpInfo;
  const ccpCheck = v => {
    const num = String(v.num || "").replace(/[\s.-]/g, ""), key = String(v.key || "").trim(), name = String(v.name || "").trim().replace(/\s+/g, " "), ref = String(v.ref || "").trim().toUpperCase(), err = {};
    if (!num) err.num = "req"; else if (!/^\d{6,10}$/.test(num) || /^(\d)\1+$/.test(num)) err.num = "fmt";
    if (!key) err.key = "req"; else if (!/^\d{2}$/.test(key)) err.key = "fmt";
    if (!name) err.name = "req"; else if (name.length > 60 || !/^[\p{L}\p{M}][\p{L}\p{M}'’.-]*(\s[\p{L}\p{M}][\p{L}\p{M}'’.-]*)+$/u.test(name)) err.name = "fmt";
    if (ref && !/^[A-Z0-9\-_/ ]{4,30}$/.test(ref)) err.ref = "fmt";
    if (!v.ok) err.ok = "req";
    return { err, v: { num, key, name, ref } };
  };
  const ST = {
    new: { ar: "جديد", fr: "Nouveau", en: "New" },
    reviewing: { ar: "قيد المراجعة", fr: "En examen", en: "Reviewing" },
    quoted: { ar: "تم عرض السعر", fr: "Devis envoyé", en: "Quoted" },
    in_progress: { ar: "قيد التنفيذ", fr: "En cours", en: "In progress" },
    delivered: { ar: "تم التسليم", fr: "Livré", en: "Delivered" },
    closed: { ar: "مغلق", fr: "Clôturé", en: "Closed" }
  };
  const STAGES = ["new", "reviewing", "quoted", "in_progress", "delivered"];

  /* ===== Firestore: orders/{id} + finals/{id} + settings/ccp ===== */
  const hasFb = typeof firebase !== "undefined";
  let fs = null, ccpInfo = {}, cache = [];
  if (hasFb) {
    firebase.initializeApp(FIREBASE_CONFIG);
    fs = firebase.firestore();
    fs.settings({ experimentalAutoDetectLongPolling: true, merge: true });
  }
  const MSG = { ar: "تعذّر الحفظ، تحقق من الاتصال وأعد المحاولة", fr: "Échec de l’enregistrement, vérifie ta connexion", en: "Couldn’t save, check your connection" };
  const toast = m => { const d = document.createElement("div"); d.className = "toast"; d.setAttribute("role", "alert"); d.textContent = m; document.body.append(d); setTimeout(() => d.remove(), 4500); };
  const fail = e => { console.error(e); toast(MSG[document.documentElement.lang] || MSG.en); };
  const col = n => { if (!fs) throw new Error("Firebase SDK missing"); return fs.collection(n); };
  const clean = o => JSON.parse(JSON.stringify(o));
  const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", finals = {}, wf = {}, subs = new Set(), emit = () => subs.forEach(f => f());
  const watchCcp = () => new Promise(r => col("settings").doc("ccp").onSnapshot(s => { ccpInfo = s.exists ? s.data() : {}; emit(); r(); }, () => r()));

  const DB = {
    all: () => cache,
    get(id) { const o = cache.find(x => x.id === id); return o && finals[id] ? { ...o, finalUrl: finals[id] } : o; },
    newId: () => "AZD-" + Array.from({ length: 8 }, () => CH[Math.random() * CH.length | 0]).join(""),
    on(f) { subs.add(f); return () => subs.delete(f); },
    async create(o) {
      for (let i = 0; i < 5; i++) {
        const id = this.newId(), ref = col("orders").doc(id), ord = clean({ status: "new", price: 0, payments: [], messages: [], createdAt: Date.now(), ...o });
        try { await fs.runTransaction(async t => { if ((await t.get(ref)).exists) throw new Error("dup"); t.set(ref, ord); }); return { id, ...ord }; }
        catch (e) { if (e.message !== "dup") throw e; }
      }
      throw new Error("id-collision");
    },
    update(id, fn) {
      const ref = col("orders").doc(id);
      return fs.runTransaction(async t => { const s = await t.get(ref); if (!s.exists) return; const o = s.data(); fn(o); t.set(ref, clean(o)); }).catch(fail);
    },
    say(id, from, text) { return col("orders").doc(id).update({ messages: firebase.firestore.FieldValue.arrayUnion({ from, text, t: Date.now() }) }).catch(fail); },
    watch(id) {
      return new Promise((res, rej) => {
        let first = true;
        col("orders").doc(id).onSnapshot(s => {
          cache = s.exists ? [{ id: s.id, ...s.data() }] : []; const o = cache[0];
          if (o && o.unlocked && !wf[id]) { wf[id] = 1; col("finals").doc(id).onSnapshot(f => { if (f.exists) { finals[id] = f.data().url; emit(); } }, () => { wf[id] = 0; }); }
          if (first) { first = false; res(o || null); watchCcp(); } else emit();
        }, e => { if (first) { first = false; rej(e); } else fail(e); });
      });
    },
    watchAll() {
      return new Promise((res, rej) => {
        let first = true;
        col("orders").onSnapshot(s => { cache = s.docs.map(d => ({ id: d.id, ...d.data() })); if (first) { first = false; watchCcp().then(res); } emit(); }, e => { if (first) { first = false; rej(e); } else fail(e); });
      });
    },
    setFinal(id, url) { return col("finals").doc(id).set({ url }).catch(fail); },
    getFinal(id) { return col("finals").doc(id).get().then(s => s.exists ? s.data().url : "").catch(() => ""); },
    setCcp(v) { return col("settings").doc("ccp").set(v).catch(fail); },
    seed(list) { const b = fs.batch(); list.forEach(({ id, ...r }) => b.set(col("orders").doc(id), clean(r))); return b.commit().catch(fail); },
    clear() { const b = fs.batch(); cache.forEach(o => { b.delete(col("orders").doc(o.id)); b.delete(col("finals").doc(o.id)); }); return b.commit().catch(fail); }
  };

  /* مكوّن الشات المشترك: me = "client" | "admin" */
  const Chat = {
    mount(root, id, me, L) {
      root.innerHTML = (L.title ? `<div class="ch"><b>${esc(L.title)}</b><small>${esc(L.sub || "")}</small></div>` : "")
        + `<div class="msgs"></div><form class="composer"><textarea rows="1" placeholder="${esc(L.ph)}"></textarea><button class="btn pri" type="submit">${esc(L.send)}</button></form>`;
      const list = root.querySelector(".msgs"), ta = root.querySelector("textarea"), f = root.querySelector("form");
      let n = 0;
      const draw = () => {
        const o = DB.get(id); if (!o) return;
        const ms = o.messages;
        if (ms.length < n) n = 0;
        if (!ms.length) { list.innerHTML = `<p class="empty">${esc(L.empty)}</p>`; return; }
        if (n === 0) list.innerHTML = "";
        ms.slice(n).forEach(m => {
          const d = document.createElement("div"), tm = `<time>${fmt(m.t, L.lang)}</time>`, lk = m.kind === "demo" || m.kind === "final",
            sys = { paysub: L.sysSub, payok: L.sysOk, payno: L.sysNo }[m.kind];
          d.className = "msg " + (sys ? "sys" : m.from === me ? "me" : "them") + (lk ? " lk" : "");
          if (sys) d.innerHTML = `<div class="sysn ${m.kind}">${esc(sys)}${m.text ? " — " + esc(m.text) : ""}</div>${tm}`;
          else if (lk) {
            const fin = m.kind === "final", u = esc(m.url), buy = L.buy ? `<button type="button" class="btn pri sm" data-buy>${esc(L.buy)}</button>` : "";
            d.innerHTML = fin
              ? `<div class="lkc"><b>${esc(L.finalMsg)}</b><code dir="ltr">${u}</code><div class="lka"><a class="btn gh sm" href="${u}" target="_blank" rel="noopener">${esc(L.open)}</a><button type="button" class="btn pri sm" data-copy="${u}" data-t="${esc(L.copy)}" data-ok="${esc(L.copied)}" data-f="${esc(L.copyFail)}" aria-live="polite">${esc(L.copy)}</button></div></div>${tm}`
              : L.demoBtn
                ? `<div class="lkc"><b>${esc(L.demoMsg)}</b><div class="lka"><button type="button" class="btn gh sm" data-demo>${esc(L.demoBtn)}</button>${buy}</div></div>${tm}`
                : `<div class="lkc"><b>${esc(L.demoMsg)}</b><code dir="ltr">${u}</code><div class="lka"><a class="btn gh sm" href="${u}" target="_blank" rel="noopener">${esc(L.open)}</a></div></div>${tm}`;
          } else { d.innerHTML = `<p></p>${tm}`; d.firstChild.textContent = m.text; }
          list.append(d);
        });
        n = ms.length; list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      };
      f.onsubmit = e => { e.preventDefault(); const t = ta.value.trim(); if (!t) return; ta.value = ""; ta.style.height = ""; DB.say(id, me, t); };
      ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } };
      ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; };
      const off = DB.on(draw); draw(); return off;
    }
  };

  const Theme = {
    init() { const r = document.documentElement; if (ls("mode")) r.dataset.theme = ls("mode"); if (ls("primary")) r.style.setProperty("--primary", ls("primary")); },
    toggle() { const r = document.documentElement, n = r.dataset.theme === "light" ? "dark" : "light"; r.classList.add("theming"); r.dataset.theme = n; ls("mode", n); setTimeout(() => r.classList.remove("theming"), 600); },
    primary(v) { document.documentElement.style.setProperty("--primary", v); ls("primary", v); }
  };
  Theme.init();

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    copy(b.dataset.copy).then(ok => {
      b.textContent = ok ? b.dataset.ok : b.dataset.f; b.classList.toggle("done", ok);
      clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = b.dataset.t; b.classList.remove("done"); }, 2200);
    });
  });

  return { ls, esc, fmt, cur, money, paid, waiting, url, copy, ccp, ccpCheck, wa, waTo, WA_NUMBER, toast, ST, STAGES, DB, Chat, Theme };
})();