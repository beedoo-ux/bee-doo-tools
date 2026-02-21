import { useState, useMemo, useRef, useCallback } from "react";

// ─── Design System ────────────────────────────────────────────────────────────
const C = {
  bg: "#0c1222", c1: "#151d30", c2: "#1c2640",
  bd: "#263354", tx: "#e1e7ef", dm: "#5c6b8a", y: "#FDE154",
};

const BLOCK_TYPEN = [
  { key: "urlaub",    label: "Urlaub",          color: "#4fc7f7", icon: "🏖" },
  { key: "krank",     label: "Krank",            color: "#f74f4f", icon: "🤒" },
  { key: "meeting",   label: "Internes Meeting", color: "#f7914f", icon: "👥" },
  { key: "training",  label: "Schulung",         color: "#a78bfa", icon: "📚" },
  { key: "sonstiges", label: "Sonstiges",        color: "#5c6b8a", icon: "🔒" },
];

const STATUS_CONFIG = {
  offen:      { label: "Offen",     color: "#FDE154", textColor: "#0c1222" },
  bestaetigt: { label: "Bestätigt", color: "#4f8ef7", textColor: "#fff" },
  storniert:  { label: "Storniert", color: "#5c6b8a", textColor: "#e1e7ef" },
  verpasst:   { label: "Verpasst",  color: "#f74f4f", textColor: "#fff" },
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const VERTRIEBLER = [
  { id: "AK",  name: "Andreas Klee",         color: "#4f8ef7" },
  { id: "FR",  name: "Frank Reddig",          color: "#FDE154" },
  { id: "JP",  name: "Jannis Pfeiffer",       color: "#a78bfa" },
  { id: "KM",  name: "Maximilian Koch",       color: "#f74f4f" },
  { id: "MSC", name: "Miguel Schader",        color: "#4fc7f7" },
  { id: "PM",  name: "Pascal Meier",          color: "#f7914f" },
  { id: "DV",  name: "Dimitri van Eeuwen",    color: "#FDE154" },
  { id: "PTH", name: "Philipp-Torben Hannig", color: "#4f8ef7" },
];

const TAGE = ["Mo","Di","Mi","Do","Fr","Sa","So"];
const TAGE_FULL = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];

// Defaults: 08:00–22:00, Mo–Fr aktiv
const defaultAz = () => TAGE.reduce((a, t) => ({
  ...a,
  [t]: ["Mo","Di","Mi","Do","Fr"].includes(t) ? 8*60 : null,
  [t+"E"]: ["Mo","Di","Mi","Do","Fr"].includes(t) ? 22*60 : null,
}), {});

const INIT_AZ = VERTRIEBLER.reduce((a, v) => ({ ...a, [v.id]: defaultAz() }), {});

const INIT_BLOCKS = [
  { id:"b1", vertriebId:"AK",  typ:"urlaub",   label:"Urlaub Mallorca",  datum:"2026-02-20", zeitVon:null, zeitBis:null, ganztaegig:true },
  { id:"b3", vertriebId:"FR",  typ:"meeting",  label:"Teammeeting",      datum:"2026-02-20", zeitVon:8*60, zeitBis:9.5*60, ganztaegig:false },
  { id:"b5", vertriebId:"JP",  typ:"training", label:"Produktschulung",  datum:"2026-02-20", zeitVon:9*60, zeitBis:11*60, ganztaegig:false },
  { id:"b6", vertriebId:"MSC", typ:"sonstiges",label:"Behördengang",     datum:"2026-02-20", zeitVon:8*60, zeitBis:9.5*60, ganztaegig:false },
  { id:"b7", vertriebId:"KM",  typ:"krank",    label:"Krank",            datum:"2026-02-20", zeitVon:null, zeitBis:null, ganztaegig:true },
];

const INIT_TERMINE = [
  { id:1,  vertriebId:"FR",  kunde:"Scheer",             zeit:11*60, dauer:120, status:"offen",      nr:"31001" },
  { id:2,  vertriebId:"FR",  kunde:"Biermann",           zeit:14*60, dauer:120, status:"offen",      nr:"31002" },
  { id:3,  vertriebId:"FR",  kunde:"Peltz",              zeit:16*60, dauer:120, status:"offen",      nr:"31003" },
  { id:4,  vertriebId:"JP",  kunde:"Ankit Bhatia",       zeit:14*60, dauer:120, status:"offen",      nr:"12545" },
  { id:5,  vertriebId:"JP",  kunde:"Maria Hennek",       zeit:16.5*60,dauer:120,status:"storniert",  nr:"3361" },
  { id:6,  vertriebId:"MSC", kunde:"Nina Schenz",        zeit:13*60, dauer:120, status:"bestaetigt", nr:"13198" },
  { id:7,  vertriebId:"MSC", kunde:"Sabine Gabel",       zeit:15.5*60,dauer:120,status:"bestaetigt", nr:"3388" },
  { id:8,  vertriebId:"DV",  kunde:"Renate Scharbatke",  zeit:11.5*60,dauer:120,status:"offen",      nr:"3188" },
  { id:9,  vertriebId:"PTH", kunde:"Björn Lehmann",      zeit:14.5*60,dauer:120,status:"bestaetigt", nr:"1234" },
  { id:10, vertriebId:"PM",  kunde:"Vivien Müntemeyer",  zeit:10.5*60,dauer:120,status:"offen",      nr:"12299" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const GLOBAL_START = 8 * 60;   // 08:00 — absolute linke Kante
const GLOBAL_END   = 22 * 60;  // 22:00 — absolute rechte Kante
const GLOBAL_SPAN  = GLOBAL_END - GLOBAL_START;
const HOURS = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];

const pct  = (m) => Math.max(0, Math.min(100, ((m - GLOBAL_START) / GLOBAL_SPAN) * 100));
const wPct = (d) => (d / GLOBAL_SPAN) * 100;
const m2t  = (m) => {
  if (m == null) return "";
  const h = Math.floor(m/60), min = Math.round(m%60);
  return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
};

// ─── Range Slider ─────────────────────────────────────────────────────────────
function RangeSlider({ vonM, bisM, onChange, disabled }) {
  const trackRef = useRef(null);
  const dragging = useRef(null);

  const getM = useCallback((clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = GLOBAL_START + ratio * GLOBAL_SPAN;
    return Math.round(raw / 30) * 30; // snap 30min
  }, []);

  const onMouseDown = (handle) => (e) => {
    if (disabled) return;
    e.preventDefault();
    dragging.current = handle;
    const move = (ev) => {
      const m = getM(ev.clientX);
      if (dragging.current === "von") {
        const newVon = Math.min(m, bisM - 60);
        onChange(Math.max(GLOBAL_START, newVon), bisM);
      } else {
        const newBis = Math.max(m, vonM + 60);
        onChange(vonM, Math.min(GLOBAL_END, newBis));
      }
    };
    const up = () => { dragging.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const leftPct  = ((vonM - GLOBAL_START) / GLOBAL_SPAN) * 100;
  const rightPct = ((bisM - GLOBAL_START) / GLOBAL_SPAN) * 100;

  return (
    <div ref={trackRef} style={{
      position: "relative", height: 28,
      borderRadius: 6, background: C.bg,
      border: `1px solid ${C.bd}`,
      userSelect: "none",
      opacity: disabled ? 0.35 : 1,
    }}>
      {/* Hour ticks */}
      {HOURS.map(h => (
        <div key={h} style={{
          position: "absolute",
          left: `${((h*60 - GLOBAL_START) / GLOBAL_SPAN) * 100}%`,
          top: 0, bottom: 0,
          borderLeft: h % 2 === 0 ? `1px solid ${C.bd}55` : `1px solid ${C.bd}22`,
          pointerEvents: "none",
        }}>
          {h % 2 === 0 && (
            <span style={{ position:"absolute", top:2, left:2, fontSize:8, color:C.dm+"88" }}>{h}</span>
          )}
        </div>
      ))}

      {/* Active range */}
      <div style={{
        position: "absolute",
        left: `${leftPct}%`,
        width: `${rightPct - leftPct}%`,
        top: 4, bottom: 4,
        background: `linear-gradient(90deg, #4f8ef733, #FDE15433)`,
        border: `1px solid ${C.y}55`,
        borderRadius: 4,
        pointerEvents: "none",
      }} />

      {/* Left handle */}
      <div
        onMouseDown={onMouseDown("von")}
        style={{
          position: "absolute",
          left: `${leftPct}%`,
          top: "50%", transform: "translate(-50%, -50%)",
          width: 16, height: 20,
          background: "#4f8ef7",
          borderRadius: 4,
          cursor: disabled ? "default" : "ew-resize",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 3,
          boxShadow: "0 2px 6px #00000055",
        }}
      >
        <div style={{ width: 2, height: 10, background: "#ffffff66", borderRadius: 1 }} />
      </div>

      {/* Right handle */}
      <div
        onMouseDown={onMouseDown("bis")}
        style={{
          position: "absolute",
          left: `${rightPct}%`,
          top: "50%", transform: "translate(-50%, -50%)",
          width: 16, height: 20,
          background: C.y,
          borderRadius: 4,
          cursor: disabled ? "default" : "ew-resize",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 3,
          boxShadow: "0 2px 6px #00000055",
        }}
      >
        <div style={{ width: 2, height: 10, background: "#00000066", borderRadius: 1 }} />
      </div>

      {/* Labels */}
      <div style={{
        position: "absolute", left: `${leftPct}%`,
        top: "50%", transform: "translate(-50%,-50%)",
        marginTop: -18, pointerEvents: "none",
        fontSize: 9, color: "#4f8ef7", fontWeight: 700, whiteSpace: "nowrap",
      }}>{m2t(vonM)}</div>
      <div style={{
        position: "absolute", left: `${rightPct}%`,
        top: "50%", transform: "translate(-50%,-50%)",
        marginTop: -18, pointerEvents: "none",
        fontSize: 9, color: C.y, fontWeight: 700, whiteSpace: "nowrap",
      }}>{m2t(bisM)}</div>
    </div>
  );
}

// ─── Block Modal ──────────────────────────────────────────────────────────────
function BlockModal({ v, onSave, onClose, editBlock }) {
  const [form, setForm] = useState(editBlock || {
    vertriebId: v.id, typ: "urlaub", label: "",
    datum: "2026-02-20", zeitVon: 9*60, zeitBis: 11*60, ganztaegig: true,
  });
  const set = (k, val) => setForm(p => ({ ...p, [k]: val }));
  const typ = BLOCK_TYPEN.find(t => t.key === form.typ);

  return (
    <div style={{ position:"fixed",inset:0,background:"#000a",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.c1,border:`1px solid ${C.bd}`,borderRadius:14,width:440,maxWidth:"100%" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:`1px solid ${C.bd}` }}>
          <span style={{ fontWeight:700,fontSize:14,color:C.tx }}>{editBlock?"Block bearbeiten":"Block hinzufügen"} — {v.name}</span>
          <button onClick={onClose} style={{ background:"none",border:"none",color:C.dm,fontSize:20,cursor:"pointer" }}>×</button>
        </div>
        <div style={{ padding:18, display:"flex", flexDirection:"column", gap:12 }}>
          <div>
            <label style={{ fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:6 }}>Typ</label>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
              {BLOCK_TYPEN.map(t => (
                <button key={t.key} onClick={() => set("typ", t.key)} style={{
                  padding:"4px 10px",borderRadius:7,fontFamily:"'DM Sans',sans-serif",
                  border:`1.5px solid ${form.typ===t.key?t.color:C.bd}`,
                  background:form.typ===t.key?t.color+"22":"transparent",
                  color:form.typ===t.key?t.color:C.dm,
                  fontSize:11,fontWeight:700,cursor:"pointer",
                }}>{t.icon} {t.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:5 }}>Bezeichnung</label>
            <input value={form.label} onChange={e=>set("label",e.target.value)} placeholder={typ?.label}
              style={{ width:"100%",boxSizing:"border-box",background:C.c2,border:`1px solid ${C.bd}`,borderRadius:8,color:C.tx,padding:"7px 11px",fontSize:13,fontFamily:"'DM Sans',sans-serif",outline:"none" }} />
          </div>
          <div>
            <label style={{ fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:5 }}>Datum</label>
            <input type="date" value={form.datum} onChange={e=>set("datum",e.target.value)}
              style={{ width:"100%",boxSizing:"border-box",background:C.c2,border:`1px solid ${C.bd}`,borderRadius:8,color:C.tx,padding:"7px 11px",fontSize:13,fontFamily:"'DM Sans',sans-serif",outline:"none" }} />
          </div>
          <div>
            <label style={{ display:"flex",alignItems:"center",gap:7,cursor:"pointer",marginBottom:8 }}>
              <input type="checkbox" checked={form.ganztaegig} onChange={e=>set("ganztaegig",e.target.checked)} style={{ accentColor:C.y,width:14,height:14 }} />
              <span style={{ fontSize:12,color:C.dm }}>Ganztägig</span>
            </label>
            {!form.ganztaegig && (
              <div style={{ paddingTop:4 }}>
                <label style={{ fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:8 }}>Zeitraum</label>
                <RangeSlider
                  vonM={form.zeitVon ?? 9*60}
                  bisM={form.zeitBis ?? 11*60}
                  onChange={(v,b) => { set("zeitVon",v); set("zeitBis",b); }}
                />
                <div style={{ fontSize:11,color:C.dm,marginTop:6,textAlign:"center" }}>
                  {m2t(form.zeitVon)} – {m2t(form.zeitBis)} Uhr ({Math.round((form.zeitBis-form.zeitVon)/60*10)/10}h)
                </div>
              </div>
            )}
          </div>
          <div style={{ display:"flex",justifyContent:"flex-end",gap:8,marginTop:4 }}>
            <button onClick={onClose} style={{ padding:"6px 14px",borderRadius:8,border:`1.5px solid ${C.bd}`,background:"transparent",color:C.dm,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Abbrechen</button>
            <button onClick={() => { if(!form.label) return; onSave({...form,id:editBlock?.id||"b"+Date.now()}); onClose(); }}
              style={{ padding:"6px 14px",borderRadius:8,border:`1.5px solid ${C.y}`,background:C.y+"22",color:C.y,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Termin Detail Modal ──────────────────────────────────────────────────────
function TerminModal({ termin, v, onSave, onClose }) {
  const [dauer, setDauer] = useState(termin.dauer);
  const [zeitM, setZeitM] = useState(termin.zeit);
  const [status, setStatus] = useState(termin.status);

  return (
    <div style={{ position:"fixed",inset:0,background:"#000a",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.c1,border:`1px solid ${v.color}55`,borderRadius:14,width:460,maxWidth:"100%" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:`1px solid ${C.bd}` }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ width:8,height:8,borderRadius:"50%",background:v.color }} />
            <span style={{ fontWeight:700,fontSize:14,color:C.tx }}>{termin.kunde}</span>
            <span style={{ fontSize:11,color:C.dm }}>#{termin.nr}</span>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:C.dm,fontSize:20,cursor:"pointer" }}>×</button>
        </div>
        <div style={{ padding:18, display:"flex", flexDirection:"column", gap:14 }}>
          {/* Info */}
          <div style={{ background:C.c2,borderRadius:10,padding:12,display:"flex",gap:16 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:10,color:C.dm,marginBottom:2 }}>Vertriebler</div>
              <div style={{ fontSize:12,fontWeight:700,color:v.color }}>{v.name}</div>
            </div>
            <div style={{ width:1,background:C.bd }} />
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:10,color:C.dm,marginBottom:2 }}>Startzeit</div>
              <div style={{ fontSize:16,fontWeight:800,color:C.tx }}>{m2t(zeitM)}</div>
            </div>
            <div style={{ width:1,background:C.bd }} />
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:10,color:C.dm,marginBottom:2 }}>Ende</div>
              <div style={{ fontSize:16,fontWeight:800,color:C.tx }}>{m2t(zeitM + dauer)}</div>
            </div>
            <div style={{ width:1,background:C.bd }} />
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:10,color:C.dm,marginBottom:2 }}>Dauer</div>
              <div style={{ fontSize:16,fontWeight:800,color:C.y }}>{dauer}min</div>
            </div>
          </div>

          {/* Startzeit Slider */}
          <div>
            <label style={{ fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:8 }}>Startzeit verschieben</label>
            <RangeSlider
              vonM={zeitM}
              bisM={zeitM + dauer}
              onChange={(von, bis) => {
                setZeitM(von);
                setDauer(bis - von);
              }}
            />
            <div style={{ fontSize:11,color:C.dm,marginTop:6,textAlign:"center" }}>
              {m2t(zeitM)} – {m2t(zeitM+dauer)} Uhr
            </div>
          </div>

          {/* Dauer */}
          <div>
            <label style={{ fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:8 }}>
              Dauer: <span style={{ color:C.y }}>{dauer} min ({dauer/60}h)</span>
            </label>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
              {[60,90,120,150,180].map(d => (
                <button key={d} onClick={() => setDauer(d)} style={{
                  padding:"5px 12px",borderRadius:7,fontFamily:"'DM Sans',sans-serif",
                  border:`1.5px solid ${dauer===d?C.y:C.bd}`,
                  background:dauer===d?C.y+"22":"transparent",
                  color:dauer===d?C.y:C.dm,
                  fontSize:12,fontWeight:700,cursor:"pointer",
                }}>{d}min</button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:8 }}>Status</label>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
              {Object.entries(STATUS_CONFIG).map(([k,s]) => (
                <button key={k} onClick={() => setStatus(k)} style={{
                  display:"flex",alignItems:"center",gap:5,
                  padding:"5px 12px",borderRadius:7,fontFamily:"'DM Sans',sans-serif",
                  border:`1.5px solid ${status===k?s.color:C.bd}`,
                  background:status===k?s.color+"22":"transparent",
                  color:status===k?s.color:C.dm,
                  fontSize:11,fontWeight:700,cursor:"pointer",
                }}>
                  <span style={{ width:7,height:7,borderRadius:"50%",background:status===k?s.color:C.bd }} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:"flex",justifyContent:"flex-end",gap:8,marginTop:2 }}>
            <button onClick={onClose} style={{ padding:"6px 14px",borderRadius:8,border:`1.5px solid ${C.bd}`,background:"transparent",color:C.dm,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Abbrechen</button>
            <button onClick={() => { onSave({ ...termin, zeit: zeitM, dauer, status }); onClose(); }}
              style={{ padding:"6px 14px",borderRadius:8,border:`1.5px solid ${C.y}`,background:C.y+"22",color:C.y,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Availability Settings ────────────────────────────────────────────────────
function AvailabilityPanel({ v, az, onUpdate, blocks, onAddBlock, onEditBlock, onDeleteBlock }) {
  return (
    <div style={{ background:C.c1,border:`1px solid ${C.bd}`,borderRadius:12,overflow:"hidden" }}>
      <div style={{ padding:"12px 16px",borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:30,height:30,borderRadius:"50%",background:v.color+"22",border:`2px solid ${v.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:v.color }}>
            {v.id.slice(0,2)}
          </div>
          <span style={{ fontSize:13,fontWeight:700,color:C.tx }}>{v.name}</span>
        </div>
        <button onClick={onAddBlock} style={{ padding:"4px 12px",borderRadius:8,border:`1.5px solid ${C.y}`,background:C.y+"22",color:C.y,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
          + Block
        </button>
      </div>
      <div style={{ padding:14, display:"flex", flexDirection:"column", gap:10 }}>
        {TAGE.map((tag, i) => {
          const von = az[tag];
          const bis = az[tag+"E"];
          const aktiv = von != null && bis != null;
          return (
            <div key={tag}>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:aktiv?8:0 }}>
                <label style={{ display:"flex",alignItems:"center",gap:6,cursor:"pointer",minWidth:90 }}>
                  <input type="checkbox" checked={aktiv}
                    onChange={e => {
                      if (e.target.checked) onUpdate(tag, 8*60, 22*60);
                      else onUpdate(tag, null, null);
                    }}
                    style={{ accentColor:C.y,width:14,height:14 }} />
                  <span style={{ fontSize:12,fontWeight:aktiv?700:400,color:aktiv?C.tx:C.dm }}>{TAGE_FULL[i].slice(0,2)}</span>
                </label>
                {aktiv
                  ? <span style={{ fontSize:11,color:C.dm }}>{m2t(von)} – {m2t(bis)} Uhr <span style={{ color:C.y }}>({Math.round((bis-von)/60*10)/10}h)</span></span>
                  : <span style={{ fontSize:11,color:C.dm,fontStyle:"italic" }}>nicht verfügbar</span>
                }
              </div>
              {aktiv && (
                <RangeSlider
                  vonM={von}
                  bisM={bis}
                  onChange={(v2, b2) => onUpdate(tag, v2, b2)}
                  disabled={!aktiv}
                />
              )}
            </div>
          );
        })}

        {/* Blocks */}
        {blocks.length > 0 && (
          <div style={{ marginTop:4 }}>
            <div style={{ fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6 }}>Blocks</div>
            {blocks.map(b => {
              const typ = BLOCK_TYPEN.find(t=>t.key===b.typ);
              return (
                <div key={b.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 8px",background:C.c2,borderRadius:7,border:`1px solid ${typ.color}33`,marginBottom:4 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                    <span>{typ.icon}</span>
                    <div>
                      <div style={{ fontSize:11,fontWeight:600,color:C.tx }}>{b.label}</div>
                      <div style={{ fontSize:10,color:C.dm }}>{b.datum} {b.ganztaegig?"· Ganztägig":`· ${m2t(b.zeitVon)}–${m2t(b.zeitBis)}`}</div>
                    </div>
                  </div>
                  <div style={{ display:"flex",gap:3 }}>
                    <button onClick={()=>onEditBlock(b)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,padding:"2px 4px" }}>✏️</button>
                    <button onClick={()=>onDeleteBlock(b.id)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,padding:"2px 4px" }}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Timeline Row ─────────────────────────────────────────────────────────────
function TimelineRow({ v, termine, blocks, az, showBlocks, onTerminClick }) {
  const TODAY_TAG = "Fr";
  const von = az[TODAY_TAG];
  const bis = az[TODAY_TAG+"E"];
  const hasAz = von != null && bis != null;

  // Compute free slots = az minus blocks
  const ganztaegig = blocks.find(b => b.ganztaegig);

  // Build "free ranges" by subtracting block times from arbeitszeit
  const freeRanges = useMemo(() => {
    if (!hasAz || ganztaegig) return [];
    const timeBlocks = blocks.filter(b => !b.ganztaegig && b.zeitVon != null);
    let free = [{ s: von, e: bis }];
    timeBlocks.forEach(b => {
      const newFree = [];
      free.forEach(seg => {
        if (b.zeitBis <= seg.s || b.zeitVon >= seg.e) {
          newFree.push(seg);
        } else {
          if (b.zeitVon > seg.s) newFree.push({ s: seg.s, e: b.zeitVon });
          if (b.zeitBis < seg.e) newFree.push({ s: b.zeitBis, e: seg.e });
        }
      });
      free = newFree;
    });
    return free;
  }, [von, bis, blocks, hasAz, ganztaegig]);

  return (
    <div style={{ display:"flex",alignItems:"stretch",borderBottom:`1px solid ${C.bd}22`,minHeight:60 }}>
      {/* Name col */}
      <div style={{ width:180,flexShrink:0,padding:"0 14px",display:"flex",alignItems:"center",gap:8,borderRight:`1px solid ${C.bd}` }}>
        <div style={{ width:26,height:26,borderRadius:"50%",background:v.color+"22",border:`2px solid ${v.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:v.color,flexShrink:0 }}>
          {v.id.slice(0,2)}
        </div>
        <div style={{ overflow:"hidden" }}>
          <div style={{ fontSize:11,fontWeight:700,color:C.tx,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>
            {v.name.split(" ")[0]}
          </div>
          {hasAz && !ganztaegig
            ? <div style={{ fontSize:9,color:C.dm }}>{m2t(von)}–{m2t(bis)}</div>
            : ganztaegig
              ? <div style={{ fontSize:9,color:BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.color }}>{BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.icon} {ganztaegig.label}</div>
              : <div style={{ fontSize:9,color:"#f74f4f88" }}>nicht verfügbar</div>
          }
        </div>
      </div>

      {/* Timeline */}
      <div style={{ flex:1,position:"relative" }}>
        {/* Hour grid */}
        {HOURS.map(h => (
          <div key={h} style={{ position:"absolute",left:`${((h*60-GLOBAL_START)/GLOBAL_SPAN)*100}%`,top:0,bottom:0,borderLeft:`1px solid ${C.bd}22` }} />
        ))}

        {/* Not-available zones (before/after az) */}
        {hasAz && !ganztaegig && (
          <>
            {von > GLOBAL_START && (
              <div style={{ position:"absolute",left:0,width:`${((von-GLOBAL_START)/GLOBAL_SPAN)*100}%`,top:0,bottom:0,background:"repeating-linear-gradient(45deg,transparent,transparent 4px,#ffffff07 4px,#ffffff07 8px)",borderRight:`2px dashed ${C.bd}55` }} />
            )}
            {bis < GLOBAL_END && (
              <div style={{ position:"absolute",left:`${((bis-GLOBAL_START)/GLOBAL_SPAN)*100}%`,right:0,top:0,bottom:0,background:"repeating-linear-gradient(45deg,transparent,transparent 4px,#ffffff07 4px,#ffffff07 8px)",borderLeft:`2px dashed ${C.bd}55` }} />
            )}
          </>
        )}

        {/* Ganztägig block overlay */}
        {ganztaegig && (
          <div style={{ position:"absolute",inset:0,background:`repeating-linear-gradient(45deg,transparent,transparent 8px,${BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.color}15 8px,${BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.color}15 16px)`,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none" }}>
            <span style={{ fontSize:20,opacity:0.25 }}>{BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.icon}</span>
          </div>
        )}

        {/* Time blocks (in az, zeitgebunden) */}
        {showBlocks && !ganztaegig && blocks.filter(b=>!b.ganztaegig&&b.zeitVon!=null).map(b => {
          const typ = BLOCK_TYPEN.find(t=>t.key===b.typ);
          const dur = b.zeitBis - b.zeitVon;
          return (
            <div key={b.id} style={{ position:"absolute",left:`${pct(b.zeitVon)}%`,width:`${wPct(dur)}%`,top:4,bottom:4,background:`repeating-linear-gradient(45deg,${typ.color}22,${typ.color}22 4px,${typ.color}0a 4px,${typ.color}0a 8px)`,border:`1.5px dashed ${typ.color}88`,borderRadius:6,display:"flex",alignItems:"center",paddingLeft:6,overflow:"hidden",zIndex:2 }}>
              <span style={{ fontSize:10,color:typ.color,fontWeight:700,whiteSpace:"nowrap" }}>{typ.icon} {b.label}</span>
            </div>
          );
        })}

        {/* Free time highlight */}
        {showBlocks && !ganztaegig && freeRanges.map((r, i) => (
          <div key={i} style={{ position:"absolute",left:`${pct(r.s)}%`,width:`${wPct(r.e-r.s)}%`,top:0,bottom:0,background:`${v.color}08`,borderBottom:`2px solid ${v.color}22`,pointerEvents:"none" }} />
        ))}

        {/* Termine */}
        {termine.map(t => {
          const s = STATUS_CONFIG[t.status];
          return (
            <div key={t.id} onClick={() => onTerminClick(t)}
              style={{ position:"absolute",left:`${pct(t.zeit)}%`,width:`${wPct(t.dauer)}%`,top:5,bottom:5,background:s.color,borderRadius:8,padding:"3px 8px",overflow:"hidden",cursor:"pointer",zIndex:4,transition:"filter 0.1s,transform 0.1s",boxShadow:`0 2px 8px ${s.color}44` }}
              onMouseEnter={e=>{e.currentTarget.style.filter="brightness(1.15)";e.currentTarget.style.transform="scaleY(1.05)";e.currentTarget.style.zIndex=10;}}
              onMouseLeave={e=>{e.currentTarget.style.filter="";e.currentTarget.style.transform="";e.currentTarget.style.zIndex=4;}}
            >
              <div style={{ fontSize:11,fontWeight:700,color:s.textColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{t.kunde}</div>
              <div style={{ fontSize:9,color:s.textColor+"bb" }}>#{t.nr} · {m2t(t.zeit)}–{m2t(t.zeit+t.dauer)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("kalender");
  const [blocks, setBlocks] = useState(INIT_BLOCKS);
  const [termine, setTermine] = useState(INIT_TERMINE);
  const [az, setAz] = useState(INIT_AZ);
  const [activeStatus, setActiveStatus] = useState({ offen:true, bestaetigt:true, storniert:true, verpasst:true });
  const [activeV, setActiveV] = useState(VERTRIEBLER.reduce((a,v)=>({...a,[v.id]:true}),{}));
  const [showBlocks, setShowBlocks] = useState(true);
  const [blockModal, setBlockModal] = useState(null);
  const [terminModal, setTerminModal] = useState(null);

  const filteredTermine = useMemo(() =>
    termine.filter(t => activeStatus[t.status] && activeV[t.vertriebId]),
    [termine, activeStatus, activeV]
  );

  const TODAY = "2026-02-20";
  const todayBlocks = (vid) => blocks.filter(b => b.vertriebId===vid && b.datum===TODAY);

  const updateAz = (vid, tag, von, bis) => {
    setAz(p => ({ ...p, [vid]: { ...p[vid], [tag]: von, [tag+"E"]: bis } }));
  };

  const allVActive = VERTRIEBLER.every(v => activeV[v.id]);

  return (
    <div style={{ background:C.bg,minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",color:C.tx }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background:C.c1,borderBottom:`1px solid ${C.bd}`,padding:"13px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <span style={{ fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:C.y,textTransform:"uppercase" }}>bee-doo</span>
          <span style={{ color:C.bd }}>|</span>
          <span style={{ fontSize:15,fontWeight:700 }}>Vertriebskalender</span>
          <span style={{ background:C.c2,border:`1px solid ${C.bd}`,borderRadius:6,padding:"2px 10px",fontSize:11,color:C.dm }}>Fr. 20.02.2026</span>
        </div>
        <div style={{ display:"flex",gap:6 }}>
          {[["kalender","📅 Kalender"],["einstellungen","⚙️ Verfügbarkeit"]].map(([t,l]) => (
            <button key={t} onClick={()=>setTab(t)} style={{ padding:"6px 14px",borderRadius:8,border:`1.5px solid ${tab===t?C.y:C.bd}`,background:tab===t?C.y+"22":"transparent",color:tab===t?C.y:C.dm,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {tab === "kalender" && (
        <>
          {/* Filters */}
          <div style={{ background:C.c1,borderBottom:`1px solid ${C.bd}`,padding:"9px 24px",display:"flex",flexDirection:"column",gap:7 }}>
            <div style={{ display:"flex",alignItems:"center",gap:7,flexWrap:"wrap" }}>
              <span style={{ fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",minWidth:60 }}>Status</span>
              {Object.entries(STATUS_CONFIG).map(([k,s]) => (
                <button key={k} onClick={()=>setActiveStatus(p=>({...p,[k]:!p[k]}))} style={{ display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:7,border:`1.5px solid ${activeStatus[k]?s.color:C.bd}`,background:activeStatus[k]?s.color+"22":"transparent",color:activeStatus[k]?s.color:C.dm,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                  <span style={{ width:6,height:6,borderRadius:"50%",background:activeStatus[k]?s.color:C.bd }} />{s.label}
                </button>
              ))}
              <div style={{ marginLeft:"auto",display:"flex",alignItems:"center",gap:8 }}>
                <button onClick={()=>setShowBlocks(p=>!p)} style={{ padding:"4px 10px",borderRadius:7,border:`1.5px solid ${showBlocks?"#a78bfa":C.bd}`,background:showBlocks?"#a78bfa22":"transparent",color:showBlocks?"#a78bfa":C.dm,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                  🔒 Blocks
                </button>
                <span style={{ fontSize:11,color:C.dm }}><span style={{ color:C.y,fontWeight:700 }}>{filteredTermine.length}</span> Termine</span>
              </div>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
              <span style={{ fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",minWidth:60 }}>Team</span>
              <button onClick={()=>setActiveV(VERTRIEBLER.reduce((a,v)=>({...a,[v.id]:!allVActive}),{}))} style={{ padding:"4px 10px",borderRadius:16,border:`1.5px solid ${allVActive?C.y:C.bd}`,background:allVActive?C.y+"22":"transparent",color:allVActive?C.y:C.dm,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Alle</button>
              {VERTRIEBLER.map(v => (
                <button key={v.id} onClick={()=>setActiveV(p=>({...p,[v.id]:!p[v.id]}))} style={{ display:"flex",alignItems:"center",gap:5,padding:"4px 10px 4px 6px",borderRadius:16,border:`1.5px solid ${activeV[v.id]?v.color:C.bd}`,background:activeV[v.id]?v.color+"18":"transparent",color:activeV[v.id]?C.tx:C.dm,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>
                  <span style={{ width:18,height:18,borderRadius:"50%",background:activeV[v.id]?v.color:C.bd,color:activeV[v.id]?"#0c1222":C.dm,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,flexShrink:0 }}>{v.id.slice(0,2)}</span>
                  {v.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{ background:C.c2,borderBottom:`1px solid ${C.bd}`,padding:"5px 24px",display:"flex",gap:14,flexWrap:"wrap",alignItems:"center" }}>
            <span style={{ fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase" }}>Legende:</span>
            <div style={{ display:"flex",alignItems:"center",gap:4 }}>
              <div style={{ width:16,height:8,background:"repeating-linear-gradient(45deg,transparent,transparent 3px,#ffffff0a 3px,#ffffff0a 6px)",border:`1px dashed ${C.bd}55`,borderRadius:2 }} />
              <span style={{ fontSize:10,color:C.dm }}>Nicht-Arbeitszeit</span>
            </div>
            {BLOCK_TYPEN.map(t=>(
              <div key={t.key} style={{ display:"flex",alignItems:"center",gap:4 }}>
                <div style={{ width:16,height:8,background:`repeating-linear-gradient(45deg,${t.color}22,${t.color}22 3px,${t.color}0a 3px,${t.color}0a 6px)`,border:`1px dashed ${t.color}88`,borderRadius:2 }} />
                <span style={{ fontSize:10,color:C.dm }}>{t.icon} {t.label}</span>
              </div>
            ))}
            <span style={{ fontSize:10,color:C.dm,marginLeft:"auto" }}>Klick auf Termin = bearbeiten</span>
          </div>

          {/* Timeline */}
          <div style={{ overflowX:"auto" }}>
            <div style={{ minWidth:1100 }}>
              {/* Header */}
              <div style={{ display:"flex",borderBottom:`1px solid ${C.bd}`,background:C.c1,position:"sticky",top:0,zIndex:20 }}>
                <div style={{ width:180,flexShrink:0,borderRight:`1px solid ${C.bd}`,padding:"7px 14px" }}>
                  <span style={{ fontSize:10,color:C.dm,fontWeight:600 }}>RESSOURCEN</span>
                </div>
                <div style={{ flex:1,position:"relative",height:30 }}>
                  {HOURS.map(h=>(
                    <div key={h} style={{ position:"absolute",left:`${((h*60-GLOBAL_START)/GLOBAL_SPAN)*100}%`,top:0,bottom:0,display:"flex",alignItems:"center",paddingLeft:4 }}>
                      <span style={{ fontSize:10,color:C.dm,fontWeight:600 }}>{String(h).padStart(2,"0")}:00</span>
                    </div>
                  ))}
                  {/* Now line */}
                  <div style={{ position:"absolute",left:`${((15*60+30-GLOBAL_START)/GLOBAL_SPAN)*100}%`,top:0,bottom:0,width:2,background:"#ff4444",zIndex:5 }}>
                    <div style={{ position:"absolute",top:0,left:-3,width:8,height:8,borderRadius:"50%",background:"#ff4444" }} />
                  </div>
                </div>
              </div>

              {VERTRIEBLER.filter(v=>activeV[v.id]).map(v => (
                <TimelineRow
                  key={v.id}
                  v={v}
                  termine={filteredTermine.filter(t=>t.vertriebId===v.id)}
                  blocks={showBlocks ? todayBlocks(v.id) : []}
                  az={az[v.id]||{}}
                  showBlocks={showBlocks}
                  onTerminClick={t => setTerminModal({ t, v })}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "einstellungen" && (
        <div style={{ padding:24 }}>
          <div style={{ marginBottom:16 }}>
            <h2 style={{ fontSize:16,fontWeight:700,margin:0,color:C.tx }}>Verfügbarkeit & Blocks</h2>
            <p style={{ fontSize:12,color:C.dm,margin:"4px 0 0" }}>Schieberegler für Arbeitszeit je Tag. Standard: 08:00–22:00.</p>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(380px,1fr))",gap:14 }}>
            {VERTRIEBLER.map(v => (
              <AvailabilityPanel
                key={v.id}
                v={v}
                az={az[v.id]||{}}
                onUpdate={(tag,von,bis) => updateAz(v.id,tag,von,bis)}
                blocks={blocks.filter(b=>b.vertriebId===v.id)}
                onAddBlock={() => setBlockModal({ v })}
                onEditBlock={b => setBlockModal({ v, editBlock:b })}
                onDeleteBlock={id => setBlocks(p=>p.filter(b=>b.id!==id))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {blockModal && (
        <BlockModal
          v={blockModal.v}
          editBlock={blockModal.editBlock}
          onSave={b => setBlocks(p => p.find(x=>x.id===b.id) ? p.map(x=>x.id===b.id?b:x) : [...p,b])}
          onClose={() => setBlockModal(null)}
        />
      )}
      {terminModal && (
        <TerminModal
          termin={terminModal.t}
          v={terminModal.v}
          onSave={t => setTermine(p => p.map(x=>x.id===t.id?t:x))}
          onClose={() => setTerminModal(null)}
        />
      )}
    </div>
  );
}
