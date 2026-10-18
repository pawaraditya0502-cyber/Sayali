import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, LogOut, Users, Plus, Lock, Trash2, ChevronDown, ChevronUp, Loader2, Flame, History, Utensils, Check, ArrowLeft, Send, MessageCircle, Upload, RefreshCw } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  SETUP: paste your Google OAuth Web Client ID here to enable real   */
/*  Google sign-in. Leave empty to use the built-in demo Google flow.  */
/* ------------------------------------------------------------------ */
const GOOGLE_CLIENT_ID = "";

const BRAND = "Hrushhi Wellness and Fitness Studio";
const C = { ink: "#0E2B27", bg: "#E9F0EB", line: "#CBD9D0", gold: "#F0A41B", protein: "#B83A5B", carbs: "#E49B13", fat: "#2B7A78", fiber: "#6B8F3A", muted: "#5B7570" };
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];
const DAY = 86400000;

/* ----------------------------- helpers ----------------------------- */
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayLabel = (ts) => { const k = dayKey(ts); if (k === dayKey(Date.now())) return "Today"; if (k === dayKey(Date.now() - DAY)) return "Yesterday"; return new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); };
const timeLabel = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const toUid = (email) => email.toLowerCase().replace(/[^a-z0-9]/g, "_");
const sum = (meals, k) => Math.round(meals.reduce((a, m) => a + (Number(m.nutrition?.[k]) || 0), 0));
const totals = (meals) => ({ calories: sum(meals, "calories"), protein_g: sum(meals, "protein_g"), carbs_g: sum(meals, "carbs_g"), fat_g: sum(meals, "fat_g"), fiber_g: sum(meals, "fiber_g"), sugar_g: sum(meals, "sugar_g"), sodium_mg: sum(meals, "sodium_mg") });

function sha256(text) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes = Array.from(unescape(encodeURIComponent(text))).map((c) => c.charCodeAt(0));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 4294967296), lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < bytes.length; i += 64) {
    const w = new Array(64);
    for (let t = 0; t < 16; t++) w[t] = ((bytes[i + 4 * t] << 24) | (bytes[i + 4 * t + 1] << 16) | (bytes[i + 4 * t + 2] << 8) | bytes[i + 4 * t + 3]) >>> 0;
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, k) => { H[k] = (H[k] + v) >>> 0; });
  }
  return H.map((x) => x.toString(16).padStart(8, "0")).join("");
}
/* Storage layer: uses Claude's shared storage when it exists, otherwise falls back
   to this browser's localStorage, then to memory, so saving never fails. */
const mem = {};
const hasWS = () => typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
const local = {
  get(k) { try { const v = localStorage.getItem(k); if (v != null) return v; } catch {} return mem[k] ?? null; },
  set(k, v) { try { localStorage.setItem(k, v); delete mem[k]; } catch { mem[k] = v; } },
  del(k) { try { localStorage.removeItem(k); } catch {} delete mem[k]; },
  keys() { const ks = []; try { for (let i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i)); } catch {} return ks.concat(Object.keys(mem)); },
};
const lk = (key, shared) => `hw:${shared ? "S" : "P"}:${key}`;

async function sget(key, shared = false) {
  if (hasWS()) { try { const r = await window.storage.get(key, shared); if (r && r.value != null) return JSON.parse(r.value); } catch {} }
  const v = local.get(lk(key, shared));
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return null; }
}
async function sset(key, val, shared = false) {
  const str = JSON.stringify(val);
  if (hasWS()) { try { const r = await window.storage.set(key, str, shared); if (r !== null && r !== undefined) return true; } catch (e) { console.warn("shared storage failed, using local fallback", e); } }
  local.set(lk(key, shared), str);
  return true;
}
async function sdel(key, shared = false) {
  if (hasWS()) { try { await window.storage.delete(key, shared); } catch {} }
  local.del(lk(key, shared));
}
async function slist(prefix, shared = false) {
  const out = new Set();
  if (hasWS()) { try { const r = await window.storage.list(prefix, shared); (r?.keys || []).forEach((k) => out.add(typeof k === "string" ? k : k.key)); } catch {} }
  const pre = lk(prefix, shared);
  local.keys().forEach((k) => { if (k && k.startsWith(pre)) out.add(k.slice(lk("", shared).length)); });
  return Array.from(out);
}

function loadImage(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("decode")); i.src = url; });
}
async function compressImage(file, max = 640, q = 0.65) {
  let src = null, w = 0, h = 0;
  try {
    if (typeof createImageBitmap === "function") { src = await createImageBitmap(file); w = src.width; h = src.height; }
  } catch { src = null; }
  if (!src) {
    let img = null;
    try { const url = URL.createObjectURL(file); try { img = await loadImage(url); } finally { URL.revokeObjectURL(url); } } catch { img = null; }
    if (!img) {
      const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error("read")); fr.readAsDataURL(file); });
      img = await loadImage(dataUrl);
    }
    src = img; w = img.width; h = img.height;
  }
  const sc = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}

async function analyzeMeal(dataUrl) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: dataUrl.split(",")[1] } },
          { type: "text", text: `You are a nutrition analyst. Look at this meal photo and estimate its nutrition for the portion shown. Respond ONLY with JSON, no markdown, in exactly this shape:
{"dish":"short name","items":[{"name":"food item","portion":"e.g. 1 cup / 150 g"}],"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"sodium_mg":0,"note":"one short sentence of advice or caveat"}
All numeric fields must be numbers. If the image is not food, return {"error":"not food"}.` },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error("ANALYSIS_UNAVAILABLE_" + res.status);
  const data = await res.json();
  const text = (data.content || []).map((i) => (i.type === "text" ? i.text : "")).join("");
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  if (parsed.error) throw new Error("That doesn't look like a meal. Try another photo.");
  return parsed;
}

function decodeJwt(token) {
  const b = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(decodeURIComponent(atob(b).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")));
}

/* ----------------------------- styles ------------------------------ */
const css = `
.hw { font-family: "Avenir Next","Segoe UI",system-ui,sans-serif; background:${C.bg}; color:${C.ink}; min-height:100vh; }
.hw * { box-sizing:border-box; }
.hw button { font-family:inherit; cursor:pointer; }
.hw button:focus-visible, .hw input:focus-visible, .hw select:focus-visible { outline:3px solid ${C.gold}; outline-offset:2px; }
.hw .card { background:#fff; border:1px solid ${C.line}; border-radius:20px; padding:16px; }
.hw .pill { border:1.5px solid ${C.ink}; background:transparent; color:${C.ink}; border-radius:999px; padding:7px 14px; font-size:14px; font-weight:600; }
.hw .pill.on { background:${C.ink}; color:#fff; }
.hw .cta { background:${C.gold}; color:${C.ink}; border:0; border-radius:14px; padding:13px 18px; font-weight:800; font-size:16px; width:100%; display:flex; align-items:center; justify-content:center; gap:8px; }
.hw .cta:disabled { opacity:.5; cursor:not-allowed; }
.hw .ghost { background:transparent; border:1.5px solid ${C.line}; color:${C.ink}; border-radius:12px; padding:9px 14px; font-weight:600; display:inline-flex; align-items:center; gap:6px; }
.hw input[type=text], .hw input[type=password], .hw input[type=email], .hw input[type=number] { width:100%; border:1.5px solid ${C.line}; border-radius:12px; padding:12px 14px; font-size:16px; background:#fff; color:${C.ink}; }
.hw .lbl { font-size:13px; color:${C.muted}; font-weight:600; margin-bottom:4px; display:block; }
.hw .err { background:#FBE4E4; color:#8A1F1F; border-radius:12px; padding:10px 12px; font-size:14px; }
.hw .spin { animation: hwspin 1s linear infinite; }
@keyframes hwspin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .hw .spin { animation:none; } }
.hw .ringdraw { stroke-dasharray: 100; animation: hwdraw 1.2s ease-out both; }
@keyframes hwdraw { from { stroke-dashoffset:100; } to { stroke-dashoffset:0; } }
@media (prefers-reduced-motion: reduce) { .hw .ringdraw { animation:none; } }
`;

/* --------------------------- small pieces -------------------------- */
function Ring({ size = 220 }) {
  const arcs = [{ c: C.protein, d: 34, o: 0 }, { c: C.carbs, d: 44, o: -37 }, { c: C.fat, d: 17, o: -84 }];
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" role="img" aria-label="Protein, carbs and fat ring">
      <circle cx="21" cy="21" r="15.915" fill="none" stroke="#fff" strokeWidth="5.5" />
      {arcs.map((a, i) => (
        <circle key={i} className="ringdraw" cx="21" cy="21" r="15.915" fill="none" stroke={a.c} strokeWidth="5.5" strokeLinecap="round"
          pathLength="100" strokeDasharray={`${a.d} ${100 - a.d}`} strokeDashoffset={a.o} transform="rotate(-90 21 21)" />
      ))}
    </svg>
  );
}

function MacroBar({ t }) {
  const p = t.protein_g * 4, c = t.carbs_g * 4, f = t.fat_g * 9, all = p + c + f || 1;
  return (
    <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: "#E3EBE6" }} aria-hidden="true">
      <div style={{ width: `${(p / all) * 100}%`, background: C.protein }} />
      <div style={{ width: `${(c / all) * 100}%`, background: C.carbs }} />
      <div style={{ width: `${(f / all) * 100}%`, background: C.fat }} />
    </div>
  );
}

function Stat({ label, value, unit, color }) {
  return (
    <div style={{ borderLeft: `4px solid ${color}`, paddingLeft: 10 }}>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{value}<span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}> {unit}</span></div>
      <div style={{ fontSize: 13, color: C.muted }}>{label}</div>
    </div>
  );
}

function TotalsGrid({ t }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
      <Stat label="Protein" value={t.protein_g} unit="g" color={C.protein} />
      <Stat label="Carbs" value={t.carbs_g} unit="g" color={C.carbs} />
      <Stat label="Fat" value={t.fat_g} unit="g" color={C.fat} />
      <Stat label="Fibre" value={t.fiber_g} unit="g" color={C.fiber} />
      <Stat label="Sugar" value={t.sugar_g} unit="g" color={C.muted} />
      <Stat label="Sodium" value={t.sodium_mg} unit="mg" color={C.muted} />
    </div>
  );
}

function MealDetails({ n }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, fontSize: 13 }}>
        {[["Calories", n.calories, "kcal"], ["Protein", n.protein_g, "g"], ["Carbs", n.carbs_g, "g"], ["Fat", n.fat_g, "g"], ["Fibre", n.fiber_g, "g"], ["Sugar", n.sugar_g, "g"], ["Sodium", n.sodium_mg, "mg"]].map(([l, v, u]) => (
          <div key={l} style={{ background: C.bg, borderRadius: 10, padding: "6px 8px" }}><b>{Math.round(v || 0)}</b> {u}<div style={{ color: C.muted }}>{l}</div></div>
        ))}
      </div>
      {n.items?.length > 0 && (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 14 }}>
          {n.items.map((it, i) => <li key={i}>{it.name} <span style={{ color: C.muted }}>({it.portion})</span></li>)}
        </ul>
      )}
      {n.note && <p style={{ fontSize: 14, color: C.muted, margin: "10px 0 0" }}>{n.note}</p>}
    </div>
  );
}

const AVATAR_COLORS = ["#2B7A78", "#B83A5B", "#C47F0A", "#5B6FB8", "#6B8F3A", "#8A4FA0"];
function Avatar({ name = "?", size = 44 }) {
  const i = Array.from(name).reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return <div aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: AVATAR_COLORS[i], color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: size * 0.42, flexShrink: 0 }}>{name.trim().charAt(0).toUpperCase() || "?"}</div>;
}

function MealCard({ m, who, onDelete }) {
  const [open, setOpen] = useState(false);
  const n = m.nutrition || {};
  const posted = !!who;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {posted && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
          <Avatar name={who} size={38} />
          <div>
            <div style={{ fontWeight: 800 }}>{who}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{m.type} · {dayLabel(m.ts)}, {timeLabel(m.ts)}</div>
          </div>
        </div>
      )}
      {m.image ? <img src={m.image} alt={n.dish || "Meal"} style={{ width: "100%", maxHeight: 280, objectFit: "cover", display: "block" }} /> : <div style={{ height: 90, background: C.bg, display: "grid", placeItems: "center", color: C.muted }}><Utensils size={30} aria-label="No photo" /></div>}
      <div style={{ padding: 14 }}>
        {!posted && <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>{m.type}, {dayLabel(m.ts)} {timeLabel(m.ts)}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{n.dish || "Meal"}</div>
          <div style={{ fontWeight: 800 }}>{Math.round(n.calories || 0)} <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>kcal</span></div>
        </div>
        <div style={{ margin: "10px 0" }}><MacroBar t={n} /></div>
        {posted ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, fontSize: 13 }}>
            {[["Protein", n.protein_g, "g", C.protein], ["Carbs", n.carbs_g, "g", C.carbs], ["Fat", n.fat_g, "g", C.fat], ["Fibre", n.fiber_g, "g", C.fiber], ["Sugar", n.sugar_g, "g", C.muted], ["Sodium", n.sodium_mg, "mg", C.muted]].map(([l, v, u, col]) => (
              <div key={l} style={{ borderLeft: `4px solid ${col}`, paddingLeft: 8 }}><b>{Math.round(v || 0)}</b> {u}<div style={{ color: C.muted }}>{l}</div></div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13 }}>
            <span style={{ color: C.protein, fontWeight: 700 }}>P {Math.round(n.protein_g || 0)}g</span>{"  "}
            <span style={{ color: "#A8700A", fontWeight: 700 }}>C {Math.round(n.carbs_g || 0)}g</span>{"  "}
            <span style={{ color: C.fat, fontWeight: 700 }}>F {Math.round(n.fat_g || 0)}g</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {posted ? "Ingredients" : "Full details"}</button>
          {onDelete && <button className="ghost" onClick={onDelete} aria-label="Delete meal"><Trash2 size={16} /> Delete</button>}
        </div>
        {open && (posted ? (
          <div style={{ marginTop: 10 }}>
            {n.items?.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>{n.items.map((it, i) => <li key={i}>{it.name} <span style={{ color: C.muted }}>({it.portion})</span></li>)}</ul>}
            {n.note && <p style={{ fontSize: 14, color: C.muted, margin: "10px 0 0" }}>{n.note}</p>}
          </div>
        ) : <MealDetails n={n} />)}
      </div>
    </div>
  );
}

/* ----------------------------- sign in ----------------------------- */
function SignIn({ onSignedIn }) {
  const [demo, setDemo] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const gbtn = useRef(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => {
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => { const p = decodeJwt(r.credential); onSignedIn({ name: p.name, email: p.email, picture: p.picture }); } });
      window.google.accounts.id.renderButton(gbtn.current, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 300 });
    };
    document.body.appendChild(s);
    return () => s.remove();
  }, [onSignedIn]);

  const submitDemo = () => {
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email)) { setErr("Enter your name and a valid Google email address."); return; }
    onSignedIn({ name: name.trim(), email: email.trim() });
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <Ring />
      <h1 style={{ fontSize: 34, lineHeight: 1.05, fontWeight: 900, margin: "18px 0 6px", letterSpacing: "-0.02em", maxWidth: 340 }}>{BRAND}</h1>
      <p style={{ color: C.muted, margin: "0 0 26px", maxWidth: 300 }}>Snap your meal. See the protein, carbs and fat. Cheer on your community.</p>

      {GOOGLE_CLIENT_ID ? <div ref={gbtn} /> : !demo ? (
        <button className="cta" style={{ maxWidth: 320, background: "#fff", border: `1.5px solid ${C.ink}` }} onClick={() => setDemo(true)}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
          Continue with Google
        </button>
      ) : (
        <div className="card" style={{ width: "100%", maxWidth: 320, textAlign: "left", display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 800 }}>Sign in with Google</div>
          <div><label className="lbl" htmlFor="gn">Name</label><input id="gn" type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="lbl" htmlFor="ge">Google email</label><input id="ge" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {err && <div className="err">{err}</div>}
          <button className="cta" onClick={submitDemo}>Sign in</button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- community --------------------------- */
function ChatPanel({ cid, user, uid }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const cache = useRef({});
  const endRef = useRef(null);

  const load = useCallback(async () => {
    const keys = (await slist(`chat:${cid}:`, true)).sort().slice(-100);
    const fresh = keys.filter((k) => !cache.current[k]);
    if (fresh.length) {
      const got = await Promise.all(fresh.map((k) => sget(k, true)));
      fresh.forEach((k, i) => { if (got[i]) cache.current[k] = got[i]; });
    }
    setMsgs(keys.map((k) => cache.current[k]).filter(Boolean));
  }, [cid]);

  useEffect(() => { cache.current = {}; setMsgs([]); load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const send = async () => {
    const body = text.trim(); if (!body || sending) return;
    setSending(true); setText("");
    const ts = Date.now();
    await sset(`chat:${cid}:${ts}:${uid}`, { text: body, name: user.name, uid, ts }, true);
    await load(); setSending(false);
  };

  let lastDay = "";
  return (
    <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", height: "62vh", minHeight: 360, overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 12, background: "#DCE9E1", display: "flex", flexDirection: "column", gap: 6 }} role="log" aria-live="polite">
        {msgs.length === 0 && <div style={{ margin: "auto", color: C.muted, textAlign: "center", fontSize: 14 }}>No messages yet. Say hello to the group.</div>}
        {msgs.map((m, i) => {
          const mine = m.uid === uid;
          const dk = dayKey(m.ts); const showDay = dk !== lastDay; lastDay = dk;
          const sameAsPrev = i > 0 && msgs[i - 1].uid === m.uid && dayKey(msgs[i - 1].ts) === dk;
          return (
            <div key={m.ts + m.uid} style={{ display: "flex", flexDirection: "column" }}>
              {showDay && <div style={{ alignSelf: "center", background: "#fff", color: C.muted, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 99, margin: "6px 0" }}>{dayLabel(m.ts)}</div>}
              <div style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", background: mine ? "#BFE8C8" : "#fff", borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "7px 10px", marginTop: sameAsPrev ? 0 : 4 }}>
                {!mine && !sameAsPrev && <div style={{ fontSize: 12, fontWeight: 800, color: C.fat }}>{m.name}</div>}
                <div style={{ fontSize: 15, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
                <div style={{ fontSize: 11, color: C.muted, textAlign: "right" }}>{timeLabel(m.ts)}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 8, padding: 10, borderTop: `1px solid ${C.line}`, background: "#fff" }}>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="Type a message" aria-label="Message" style={{ borderRadius: 99 }} />
        <button onClick={send} disabled={!text.trim()} aria-label="Send message" style={{ width: 46, height: 46, flexShrink: 0, borderRadius: "50%", border: 0, background: C.gold, color: C.ink, display: "grid", placeItems: "center", opacity: text.trim() ? 1 : .5 }}><Send size={20} /></button>
      </div>
    </div>
  );
}

function CommunityTab({ user, uid, myComms, setMyComms }) {
  const [all, setAll] = useState([]);
  const [info, setInfo] = useState({}); // id -> {members,last}
  const [view, setView] = useState("list"); // list | group | create | join
  const [active, setActive] = useState(null);
  const [joining, setJoining] = useState(null);
  const [sub, setSub] = useState("chat");
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cName, setCName] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const localRef = useRef({});

  const loadAll = useCallback(async () => {
    const keys = await slist("community:", true);
    const keySet = new Set(keys);
    myComms.forEach((id) => keySet.add(`community:${id}`));
    const fetched = (await Promise.all([...keySet].map((k) => sget(k, true)))).filter(Boolean);
    const list = Array.from(new Map([...fetched, ...Object.values(localRef.current)].map((c) => [c.id, c])).values());
    setAll(list);
    const entries = await Promise.all(list.map(async (c) => {
      const members = (await slist(`member:${c.id}:`, true)).length;
      const ck = (await slist(`chat:${c.id}:`, true)).sort();
      const last = ck.length ? await sget(ck[ck.length - 1], true) : null;
      return [c.id, { members, last }];
    }));
    setInfo(Object.fromEntries(entries));
  }, [myComms]);
  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (view === "list") { const t = setInterval(loadAll, 8000); return () => clearInterval(t); } }, [view, loadAll]);

  const loadFeed = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    const keys = await slist(`post:${id}:`, true);
    const cutoff = Date.now() - 7 * DAY;
    const recent = keys.filter((k) => Number(k.split(":")[2]) >= cutoff).sort().reverse().slice(0, 30);
    setFeed((await Promise.all(recent.map((k) => sget(k, true)))).filter(Boolean));
    setLoading(false);
  }, []);
  useEffect(() => { if (view === "group" && sub === "meals") loadFeed(active); }, [view, sub, active, loadFeed]);

  const openGroup = (id) => { setActive(id); setSub("chat"); setView("group"); };

  const create = async () => {
    setErr("");
    try {
    if (cName.trim().length < 3) return setErr("Community name needs at least 3 characters.");
    if (pw.length < 4) return setErr("Password needs at least 4 characters.");
    const id = "c" + Date.now().toString(36);
    const hash = await sha256(id + pw);
    const comm = { id, name: cName.trim(), hash, owner: uid, ownerName: user.name, created: Date.now() };
    const ok = await sset(`community:${id}`, comm, true);
    if (!ok) return setErr("Couldn't save the community. Please try again.");
    localRef.current[id] = comm;
    setAll((prev) => [...prev.filter((c) => c.id !== id), comm]);
    await sset(`member:${id}:${uid}`, { name: user.name, joined: Date.now() }, true);
    await sset(`chat:${id}:${Date.now()}:system`, { text: `${user.name} created the community "${cName.trim()}"`, name: "System", uid: "system", ts: Date.now() }, true);
    await setMyComms([...myComms, id]);
    setCName(""); setPw(""); await loadAll(); openGroup(id);
    } catch (ex) { setErr("Something went wrong: " + (ex?.message || "unknown error")); }
  };

  const join = async (c) => {
    setErr("");
    try {
    if ((await sha256(c.id + pw)) !== c.hash) return setErr("Wrong community password.");
    await sset(`member:${c.id}:${uid}`, { name: user.name, joined: Date.now() }, true);
    await sset(`chat:${c.id}:${Date.now()}:system`, { text: `${user.name} joined`, name: "System", uid: "system", ts: Date.now() }, true);
    if (!myComms.includes(c.id)) await setMyComms([...myComms, c.id]);
    setPw(""); await loadAll(); openGroup(c.id);
    } catch (ex) { setErr("Something went wrong: " + (ex?.message || "unknown error")); }
  };

  const mine = all.filter((c) => myComms.includes(c.id)).sort((a, b) => (info[b.id]?.last?.ts || b.created) - (info[a.id]?.last?.ts || a.created));
  const others = all.filter((c) => !myComms.includes(c.id));
  const activeC = all.find((c) => c.id === active);

  /* ---- group screen ---- */
  if (view === "group" && activeC) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="ghost" onClick={() => { setView("list"); loadAll(); }} aria-label="Back to groups" style={{ padding: 9 }}><ArrowLeft size={18} /></button>
          <Avatar name={activeC.name} size={42} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.1 }}>{activeC.name}</div>
            <div style={{ fontSize: 13, color: C.muted }}>{info[activeC.id]?.members || 1} member{(info[activeC.id]?.members || 1) === 1 ? "" : "s"}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`pill ${sub === "chat" ? "on" : ""}`} onClick={() => setSub("chat")} style={{ flex: 1 }}><MessageCircle size={14} style={{ verticalAlign: -2 }} /> Chat</button>
          <button className={`pill ${sub === "meals" ? "on" : ""}`} onClick={() => setSub("meals")} style={{ flex: 1 }}><Utensils size={14} style={{ verticalAlign: -2 }} /> Meals</button>
        </div>
        {sub === "chat" && <ChatPanel cid={activeC.id} user={user} uid={uid} />}
        {sub === "meals" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, color: C.muted }}>Meals from the last 7 days</div>
              <button className="ghost" onClick={() => loadFeed(active)}>Refresh</button>
            </div>
            {loading && <div style={{ textAlign: "center", padding: 20 }}><Loader2 className="spin" /></div>}
            {!loading && feed.length === 0 && <div className="card" style={{ textAlign: "center", color: C.muted }}>No meals shared yet. Log a meal on the Today tab and share it with this group.</div>}
            {feed.map((m) => <MealCard key={m.id} m={m} who={m.userName} />)}
          </div>
        )}
      </div>
    );
  }

  /* ---- create ---- */
  if (view === "create") {
    return (
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Create a community</div>
        <div><label className="lbl" htmlFor="cn">Community name</label><input id="cn" type="text" value={cName} onChange={(e) => setCName(e.target.value)} /></div>
        <div><label className="lbl" htmlFor="cp">Community password (members enter it the first time they join)</label><input id="cp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {err && <div className="err">{err}</div>}
        <button className="cta" onClick={create}>Create community</button>
        <button className="ghost" onClick={() => { setView("list"); setErr(""); }}>Cancel</button>
      </div>
    );
  }

  /* ---- join ---- */
  if (view === "join" && joining) {
    return (
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name={joining.name} /><div style={{ fontWeight: 900, fontSize: 18 }}>Join {joining.name}</div></div>
        <div><label className="lbl" htmlFor="jp">Community password</label><input id="jp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {err && <div className="err">{err}</div>}
        <button className="cta" onClick={() => join(joining)}><Lock size={16} /> Join community</button>
        <button className="ghost" onClick={() => { setView("list"); setErr(""); setPw(""); }}>Cancel</button>
      </div>
    );
  }

  /* ---- group list (WhatsApp style) ---- */
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 20 }}>Your groups</div>
        <button className="ghost" onClick={() => { setView("create"); setErr(""); }}><Plus size={16} /> New community</button>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {mine.length === 0 && <div style={{ padding: 18, color: C.muted, textAlign: "center" }}>You're not in any community yet. Create one or join one below.</div>}
        {mine.map((c, i) => {
          const last = info[c.id]?.last;
          return (
            <button key={c.id} onClick={() => openGroup(c.id)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", width: "100%", boxSizing: "border-box", borderTop: i ? `1px solid ${C.line}` : "none" }}>
              <Avatar name={c.name} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  {last && <div style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{dayKey(last.ts) === dayKey(Date.now()) ? timeLabel(last.ts) : dayLabel(last.ts)}</div>}
                </div>
                <div style={{ fontSize: 14, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {last ? (last.uid === "system" ? last.text : `${last.uid === uid ? "You" : last.name}: ${last.text}`) : "No messages yet"}
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>{info[c.id]?.members || 1} member{(info[c.id]?.members || 1) === 1 ? "" : "s"}</div>
              </div>
            </button>
          );
        })}
      </div>

      {others.length > 0 && (
        <>
          <div style={{ fontWeight: 800, marginTop: 6 }}>Communities you can join</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {others.map((c, i) => (
              <button key={c.id} onClick={() => { setJoining(c); setView("join"); setErr(""); setPw(""); }} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", width: "100%", boxSizing: "border-box", borderTop: i ? `1px solid ${C.line}` : "none" }}>
                <Avatar name={c.name} size={42} />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>{c.name}</div><div style={{ fontSize: 13, color: C.muted }}>by {c.ownerName} · {info[c.id]?.members || 1} member{(info[c.id]?.members || 1) === 1 ? "" : "s"}</div></div>
                <Lock size={16} color={C.muted} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------- today ----------------------------- */
function PickButton({ label, icon, onPick, camera, ghost, style }) {
  return (
    <div style={{ position: "relative", display: ghost ? "inline-block" : "block" }}>
      <div className={ghost ? "ghost" : "cta"} style={ghost ? undefined : style} aria-hidden="true">{icon} {label}</div>
      <input type="file" accept="image/*" capture={camera ? "environment" : undefined} onChange={onPick} aria-label={label} title="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", fontSize: 0 }} />
    </div>
  );
}

const EMPTY_FORM = { dish: "", calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "", sugar_g: "", sodium_mg: "" };

function TodayTab({ user, uid, meals, reload, myComms, comms }) {
  const [type, setType] = useState(() => { const h = new Date().getHours(); return h < 11 ? "Breakfast" : h < 16 ? "Lunch" : h < 21 ? "Dinner" : "Snack"; });
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState(false);
  const [picked, setPicked] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [shareTo, setShareTo] = useState(myComms);

  useEffect(() => { setShareTo(myComms); }, [myComms]);

  const runAnalysis = async (img) => {
    setErr(""); setBusy(true);
    try { setResult(await analyzeMeal(img)); }
    catch (ex) {
      setErr(ex.message?.startsWith("That doesn't") ? ex.message : "Your photo is attached, but automatic analysis isn't available right now. Retry, or enter the numbers yourself.");
    }
    setBusy(false);
  };

  const handleFile = async (f) => {
    if (!f || busy) return;
    setErr(""); setResult(null); setManual(false); setBusy(true); setPicked(`${f.name || "photo"} (${Math.round(f.size / 1024)} KB)`);
    let img;
    try { img = await compressImage(f); setImage(img); }
    catch {
      setBusy(false);
      setErr(/hei[cf]/i.test(`${f.type} ${f.name}`) ? "HEIC photos can't be read here. Take a screenshot of the photo, or set your camera format to Most Compatible, then try again." : "That file couldn't be opened as a photo. Try a JPG or PNG, or use \"Add a meal without a photo\".");
      return;
    }
    setBusy(false);
    await runAnalysis(img);
  };

  const pick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); };

  useEffect(() => {
    const onPaste = (e) => { const f = Array.from(e.clipboardData?.files || []).find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); handleFile(f); } };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const submitManual = () => {
    const n = (k) => Math.max(0, Number(form[k]) || 0);
    setResult({ dish: form.dish.trim() || "Meal", items: [], calories: n("calories"), protein_g: n("protein_g"), carbs_g: n("carbs_g"), fat_g: n("fat_g"), fiber_g: n("fiber_g"), sugar_g: n("sugar_g"), sodium_mg: n("sodium_mg"), note: "Entered manually." });
    setManual(false); setErr(""); setForm(EMPTY_FORM);
  };

  const discard = () => { setPicked(""); setImage(null); setResult(null); setErr(""); setManual(false); setForm(EMPTY_FORM); };

  const save = async () => {
    if (!result) return;
    const ts = Date.now();
    const meal = { id: `${ts}_${uid}`, ts, type, image: image || null, nutrition: result, userName: user.name, uid, sharedTo: shareTo };
    await sset(`meal:${ts}`, meal, false);
    for (const cid of shareTo) await sset(`post:${cid}:${ts}:${uid}`, meal, true);
    discard(); await reload();
  };

  const remove = async (m) => {
    await sdel(`meal:${m.ts}`, false);
    for (const cid of m.sharedTo || []) await sdel(`post:${cid}:${m.ts}:${uid}`, true);
    await reload();
  };

  const today = meals.filter((m) => dayKey(m.ts) === dayKey(Date.now()));
  const t = totals(today);
  const lockStyle = busy ? { opacity: 0.5, pointerEvents: "none" } : {};

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card" style={{ display: "grid", gap: 12 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer?.files?.[0]); }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Log a meal</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {MEAL_TYPES.map((x) => <button key={x} className={`pill ${type === x ? "on" : ""}`} onClick={() => setType(x)}>{x}</button>)}
        </div>

        {!image && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, ...lockStyle }}>
              <PickButton camera onPick={pick} icon={<Camera size={20} />} label="Take photo" />
              <PickButton onPick={pick} icon={<Upload size={20} />} label="Upload photo" style={{ background: "#fff", border: `1.5px solid ${C.ink}`, borderRadius: 14 }} />
            </div>
            {!manual && <button className="ghost" style={{ justifySelf: "start" }} onClick={() => setManual(true)}>Photo not working? Add a meal without a photo</button>}
            <details style={{ fontSize: 14 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Trouble uploading?</summary>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <div>Basic uploader:</div>
                <input type="file" accept="image/*" onChange={pick} aria-label="Basic photo uploader" style={{ fontSize: 14 }} />
                <div style={{ color: C.muted }}>You can also drag a photo onto this card or paste one with Ctrl+V (Cmd+V on Mac).</div>
              </div>
            </details>
          </>
        )}

        {image && (
          <>
            <img src={image} alt="Your meal" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 14 }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", ...lockStyle }}>
              <PickButton ghost onPick={pick} icon={<Upload size={15} />} label="Change photo" />
              <PickButton ghost camera onPick={pick} icon={<Camera size={15} />} label="Retake" />
            </div>
          </>
        )}

        {picked && (busy || err) && <div style={{ fontSize: 13, color: C.muted }}>Selected: {picked}</div>}
        {busy && <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.muted }}><Loader2 className="spin" size={18} /> Reading your meal…</div>}
        {err && <div className="err" role="alert">{err}</div>}

        {image && !result && !busy && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="ghost" onClick={() => runAnalysis(image)}><RefreshCw size={15} /> Retry analysis</button>
            <button className="ghost" onClick={() => setManual(!manual)}>Enter nutrition manually</button>
            <button className="ghost" onClick={discard}>Remove photo</button>
          </div>
        )}

        {manual && !result && (
          <div style={{ display: "grid", gap: 10 }}>
            <div><label className="lbl" htmlFor="m-dish">Dish name</label><input id="m-dish" type="text" value={form.dish} onChange={(e) => setForm({ ...form, dish: e.target.value })} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["calories", "Calories (kcal)"], ["protein_g", "Protein (g)"], ["carbs_g", "Carbs (g)"], ["fat_g", "Fat (g)"], ["fiber_g", "Fibre (g)"], ["sugar_g", "Sugar (g)"], ["sodium_mg", "Sodium (mg)"]].map(([k, l]) => (
                <div key={k}><label className="lbl" htmlFor={`m-${k}`}>{l}</label><input id={`m-${k}`} type="number" inputMode="decimal" min="0" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
              ))}
            </div>
            <button className="cta" onClick={submitManual}>Use these values</button>
          </div>
        )}

        {result && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{result.dish} <span style={{ color: C.muted, fontWeight: 600 }}>· {Math.round(result.calories)} kcal</span></div>
            <MealDetails n={result} />
            {myComms.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="lbl">Share with</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {myComms.map((cid) => { const c = comms.find((x) => x.id === cid); const on = shareTo.includes(cid); return <button key={cid} className={`pill ${on ? "on" : ""}`} onClick={() => setShareTo(on ? shareTo.filter((x) => x !== cid) : [...shareTo, cid])}>{on && <Check size={13} style={{ verticalAlign: -2 }} />} {c?.name || "Community"}</button>; })}
                </div>
              </div>
            )}
            <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
              <button className="cta" onClick={save}>Save {type.toLowerCase()}</button>
              <button className="ghost" onClick={discard}>Discard</button>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ background: C.ink, color: "#fff", border: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Today's total</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: C.gold }}><Flame size={22} style={{ verticalAlign: -3 }} /> {t.calories}<span style={{ fontSize: 14, fontWeight: 600 }}> kcal</span></div>
        </div>
        <div style={{ margin: "12px 0" }}><MacroBar t={t} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, color: "#fff" }}>
          {[["Protein", t.protein_g, "g", "#F27C9A"], ["Carbs", t.carbs_g, "g", "#F5C25A"], ["Fat", t.fat_g, "g", "#6CC4BF"], ["Fibre", t.fiber_g, "g", "#A9CB73"], ["Sugar", t.sugar_g, "g", "#B7C9C4"], ["Sodium", t.sodium_mg, "mg", "#B7C9C4"]].map(([l, v, u, col]) => (
            <div key={l} style={{ borderLeft: `4px solid ${col}`, paddingLeft: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{v}<span style={{ fontSize: 13, fontWeight: 600, opacity: .7 }}> {u}</span></div>
              <div style={{ fontSize: 13, opacity: .7 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 13, opacity: .7, marginTop: 12 }}>{today.length} meal{today.length === 1 ? "" : "s"} logged. Totals update after each meal, so the last number of the day is your final count.</div>
      </div>

      {today.length === 0 && <div className="card" style={{ textAlign: "center", color: C.muted }}>No meals yet today. Upload your first photo above.</div>}
      {[...today].sort((a, b) => b.ts - a.ts).map((m) => <MealCard key={m.id} m={m} onDelete={() => remove(m)} />)}
    </div>
  );
}

/* ------------------------------ history ---------------------------- */
function HistoryTab({ meals }) {
  const [openDay, setOpenDay] = useState(null);
  const days = Array.from({ length: 7 }, (_, i) => Date.now() - i * DAY);
  const rows = days.map((ts) => { const k = dayKey(ts); const ms = meals.filter((m) => dayKey(m.ts) === k).sort((a, b) => a.ts - b.ts); return { ts, k, ms, t: totals(ms) }; });
  const maxCal = Math.max(1, ...rows.map((r) => r.t.calories));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div><div style={{ fontWeight: 900, fontSize: 20 }}>Last 7 days</div><div style={{ fontSize: 13, color: C.muted }}>Tap a day to see its meals and details.</div></div>
      {rows.map((r) => (
        <div key={r.k} className="card">
          <button onClick={() => setOpenDay(openDay === r.k ? null : r.k)} aria-expanded={openDay === r.k} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 800 }}>{dayLabel(r.ts)}</div>
              <div style={{ fontWeight: 800 }}>{r.t.calories} <span style={{ fontSize: 12, color: C.muted }}>kcal</span></div>
            </div>
            <div style={{ height: 6, background: "#E3EBE6", borderRadius: 99, margin: "8px 0" }}><div style={{ height: 6, width: `${(r.t.calories / maxCal) * 100}%`, background: C.gold, borderRadius: 99 }} /></div>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: C.protein, fontWeight: 700 }}>Protein {r.t.protein_g}g</span>{"   "}
              <span style={{ color: "#A8700A", fontWeight: 700 }}>Carbs {r.t.carbs_g}g</span>{"   "}
              <span style={{ color: C.fat, fontWeight: 700 }}>Fat {r.t.fat_g}g</span>
            </div>
          </button>
          {openDay === r.k && (
            <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
              {r.ms.length === 0 ? <div style={{ color: C.muted }}>Nothing logged this day.</div> : (
                <>
                  <TotalsGrid t={r.t} />
                  {r.ms.map((m) => <MealCard key={m.id} m={m} />)}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* Built-in community: name "Aditya", password "Aditya" */
async function seedAditya() {
  const id = "aditya";
  if (await sget(`community:${id}`, true)) return;
  const hash = await sha256(id + "Aditya");
  await sset(`community:${id}`, { id, name: "Aditya", hash, owner: "studio", ownerName: "Hrushhi Studio", created: Date.now() }, true);
}

/* -------------------------------- app ------------------------------ */
export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("today");
  const [meals, setMeals] = useState([]);
  const [myComms, setMyCommsState] = useState([]);
  const [comms, setComms] = useState([]);
  const uid = user ? toUid(user.email) : null;

  useEffect(() => { (async () => { const u = await sget("session", false); if (u) setUser(u); setReady(true); })(); }, []);

  const reload = useCallback(async () => {
    const keys = await slist("meal:", false);
    const cutoff = Date.now() - 7 * DAY - DAY;
    const recent = keys.filter((k) => Number(k.split(":")[1]) >= cutoff);
    const list = (await Promise.all(recent.map((k) => sget(k, false)))).filter(Boolean);
    setMeals(list);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setMyCommsState((await sget(`mycomms:${uid}`, false)) || []);
      try { await seedAditya(); } catch (e) { console.error(e); }
      const ck = await slist("community:", true);
      setComms((await Promise.all(ck.map((k) => sget(k, true)))).filter(Boolean));
      reload();
    })();
  }, [user, uid, reload]);

  const setMyComms = async (ids) => { setMyCommsState(ids); await sset(`mycomms:${uid}`, ids, false); const ck = await slist("community:", true); setComms((await Promise.all(ck.map((k) => sget(k, true)))).filter(Boolean)); };
  const signIn = useCallback(async (u) => { await sset("session", u, false); setUser(u); }, []);
  const signOut = async () => { await sdel("session", false); setUser(null); setMeals([]); };

  if (!ready) return <div className="hw" style={{ display: "grid", placeItems: "center" }}><style>{css}</style><Loader2 className="spin" /></div>;

  return (
    <div className="hw">
      <style>{css}</style>
      {!user ? <SignIn onSignedIn={signIn} /> : (
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "14px 14px 96px" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 19, lineHeight: 1.1, letterSpacing: "-0.01em" }}>{BRAND}</div>
            <button className="ghost" onClick={signOut} aria-label="Sign out" title={user.email}><LogOut size={16} /></button>
          </header>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 14 }}>Hi {user.name.split(" ")[0]}, here's your day.</div>
          {tab === "today" && <TodayTab user={user} uid={uid} meals={meals} reload={reload} myComms={myComms} comms={comms} />}
          {tab === "history" && <HistoryTab meals={meals} />}
          {tab === "community" && <CommunityTab user={user} uid={uid} myComms={myComms} setMyComms={setMyComms} />}
          <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "center", paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div style={{ display: "flex", width: "100%", maxWidth: 520 }}>
              {[["today", "Today", Utensils], ["history", "History", History], ["community", "Community", Users]].map(([k, l, Icon]) => (
                <button key={k} onClick={() => setTab(k)} aria-current={tab === k} style={{ flex: 1, background: "none", border: 0, padding: "10px 0", color: tab === k ? C.ink : C.muted, fontWeight: tab === k ? 800 : 600, display: "grid", justifyItems: "center", gap: 2, fontSize: 13, borderTop: tab === k ? `3px solid ${C.gold}` : "3px solid transparent" }}>
                  <Icon size={20} />{l}
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
