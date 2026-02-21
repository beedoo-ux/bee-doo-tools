import { useState, useMemo } from "react";

// ─── bee-doo Design System ────────────────────────────────────────────────────
const C = {
  bg: "#0c1222", c1: "#151d30", c2: "#1c2640",
  bd: "#263354", tx: "#e1e7ef", dm: "#5c6b8a", y: "#FDE154",
};

const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const TAGE_FULL = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const BLOCK_TYPEN = [
  { key: "urlaub",   label: "Urlaub",          color: "#4fc7f7", icon: "🏖" },
  { key: "krank",    label: "Krank",            color: "#f74f4f", icon: "🤒" },
  { key: "meeting",  label: "Internes Meeting", color: "#f7914f", icon: "👥" },
  { key: "training", label: "Schulung",         color: "#a78bfa", icon: "📚" },
  { key: "sonstiges",label: "Sonstiges",        color: "#5c6b8a", icon: "🔒" },
];

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const INIT_VERTRIEBLER = [
  { id: "AK",  name: "Andreas Klee",         color: "#4f8ef7" },
  { id: "FR",  name: "Frank Reddig",          color: "#FDE154" },
  { id: "JP",  name: "Jannis Pfeiffer",       color: "#a78bfa" },
  { id: "KM",  name: "Maximilian Koch",       color: "#f74f4f" },
  { id: "MSC", name: "Miguel Schader",        color: "#4fc7f7" },
  { id: "PM",  name: "Pascal Meier",          color: "#f7914f" },
  { id: "DV",  name: "Dimitri van Eeuwen",    color: "#FDE154" },
  { id: "PTH", name: "Philipp-Torben Hannig", color: "#4f8ef7" },
];

// Standard-Arbeitszeiten pro Vertriebler (Mo–So)
const INIT_ARBEITSZEITEN = {
  AK:  { Mo:"08:00", MoE:"20:00", Di:"08:00", DiE:"20:00", Mi:"08:00", MiE:"20:00", Do:"08:00", DoE:"20:00", Fr:"08:00", FrE:"20:00", Sa:"",     SaE:"",     So:"",     SoE:"" },
  FR:  { Mo:"09:00", MoE:"19:00", Di:"09:00", DiE:"19:00", Mi:"09:00", MiE:"19:00", Do:"09:00", DoE:"19:00", Fr:"09:00", FrE:"19:00", Sa:"",     SaE:"",     So:"",     SoE:"" },
  JP:  { Mo:"08:00", MoE:"21:00", Di:"08:00", DiE:"21:00", Mi:"08:00", MiE:"21:00", Do:"08:00", DoE:"21:00", Fr:"08:00", FrE:"21:00", Sa:"09:00",SaE:"15:00",So:"",     SoE:"" },
  KM:  { Mo:"10:00", MoE:"20:00", Di:"10:00", DiE:"20:00", Mi:"10:00", MiE:"20:00", Do:"10:00", DoE:"20:00", Fr:"10:00", FrE:"20:00", Sa:"",     SaE:"",     So:"",     SoE:"" },
  MSC: { Mo:"08:00", MoE:"21:00", Di:"08:00", DiE:"21:00", Mi:"08:00", MiE:"21:00", Do:"08:00", DoE:"21:00", Fr:"08:00", FrE:"21:00", Sa:"08:00",SaE:"18:00",So:"",     SoE:"" },
  PM:  { Mo:"09:00", MoE:"19:00", Di:"09:00", DiE:"19:00", Mi:"09:00", MiE:"19:00", Do:"09:00", DoE:"19:00", Fr:"09:00", FrE:"19:00", Sa:"",     SaE:"",     So:"",     SoE:"" },
  DV:  { Mo:"08:00", MoE:"20:00", Di:"08:00", DiE:"20:00", Mi:"08:00", MiE:"20:00", Do:"08:00", DoE:"20:00", Fr:"08:00", FrE:"20:00", Sa:"",     SaE:"",     So:"",     SoE:"" },
  PTH: { Mo:"08:00", MoE:"21:00", Di:"08:00", DiE:"21:00", Mi:"08:00", MiE:"21:00", Do:"08:00", DoE:"21:00", Fr:"08:00", FrE:"21:00", Sa:"09:00",SaE:"16:00",So:"",     SoE:"" },
};

// Blocks: { id, vertriebId, typ, label, datum, zeitVon, zeitBis, ganztaegig }
const INIT_BLOCKS = [
  { id: "b1", vertriebId: "AK",  typ: "urlaub",   label: "Urlaub Mallorca",    datum: "2026-02-23", zeitVon: "", zeitBis: "", ganztaegig: true },
  { id: "b2", vertriebId: "AK",  typ: "urlaub",   label: "Urlaub Mallorca",    datum: "2026-02-24", zeitVon: "", zeitBis: "", ganztaegig: true },
  { id: "b3", vertriebId: "FR",  typ: "meeting",  label: "Teammeeting",        datum: "2026-02-20", zeitVon: "08:00", zeitBis: "09:30", ganztaegig: false },
  { id: "b4", vertriebId: "KM",  typ: "krank",    label: "Krank",              datum: "2026-02-20", zeitVon: "", zeitBis: "", ganztaegig: true },
  { id: "b5", vertriebId: "JP",  typ: "training", label: "Produktschulung",    datum: "2026-02-20", zeitVon: "09:00", zeitBis: "11:00", ganztaegig: false },
  { id: "b6", vertriebId: "MSC", typ: "sonstiges",label: "Behördengang",       datum: "2026-02-20", zeitVon: "07:00", zeitBis: "08:30", ganztaegig: false },
  { id: "b7", vertriebId: "PM",  typ: "urlaub",   label: "Brückentag",         datum: "2026-02-21", zeitVon: "", zeitBis: "", ganztaegig: true },
];

const TERMINE = [
  { id:1,  vertriebId:"AK",  kunde:"Bernd Herbert",     zeit:"11:00", dauer:90, status:"bestaetigt", nr:"35395" },
  { id:2,  vertriebId:"AK",  kunde:"Benno Krüche",      zeit:"14:00", dauer:90, status:"storniert",  nr:"32640" },
  { id:3,  vertriebId:"AK",  kunde:"Holger Fey",        zeit:"15:00", dauer:120,status:"bestaetigt", nr:"30460" },
  { id:4,  vertriebId:"FR",  kunde:"Scheer",            zeit:"11:00", dauer:90, status:"offen",      nr:"31001" },
  { id:5,  vertriebId:"FR",  kunde:"Biermann",          zeit:"14:00", dauer:90, status:"offen",      nr:"31002" },
  { id:6,  vertriebId:"FR",  kunde:"Peltz",             zeit:"16:00", dauer:90, status:"offen",      nr:"31003" },
  { id:7,  vertriebId:"JP",  kunde:"Ankit Bhatia",      zeit:"14:00", dauer:90, status:"offen",      nr:"12545" },
  { id:8,  vertriebId:"JP",  kunde:"Maria Hennek",      zeit:"16:00", dauer:90, status:"storniert",  nr:"3361" },
  { id:9,  vertriebId:"MSC", kunde:"Nina Schenz",       zeit:"13:00", dauer:90, status:"bestaetigt", nr:"13198" },
  { id:10, vertriebId:"MSC", kunde:"Sabine Gabel",      zeit:"15:00", dauer:90, status:"bestaetigt", nr:"3388" },
  { id:11, vertriebId:"DV",  kunde:"Renate Scharbatke", zeit:"11:30", dauer:90, status:"offen",      nr:"3188" },
  { id:12, vertriebId:"PTH", kunde:"Björn Lehmann",     zeit:"14:30", dauer:90, status:"bestaetigt", nr:"1234" },
];

const STATUS_CONFIG = {
  offen:      { label: "Offen",      color: "#FDE154", textColor: "#0c1222" },
  bestaetigt: { label: "Bestätigt",  color: "#4f8ef7", textColor: "#fff" },
  storniert:  { label: "Storniert",  color: "#5c6b8a", textColor: "#e1e7ef" },
  verpasst:   { label: "Verpasst",   color: "#f74f4f", textColor: "#fff" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const t2m = (t) => { if (!t) return 0; const [h,m] = t.split(":").map(Number); return h*60+m; };
const m2t = (m) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const DAY_START = 6*60, DAY_END = 21*60, DAY_SPAN = DAY_END - DAY_START;
const pct = (t) => Math.max(0, Math.min(100, ((t2m(t) - DAY_START) / DAY_SPAN) * 100));
const wPct = (dur) => (dur / DAY_SPAN) * 100;
const HOURS = Array.from({length:16},(_,i)=>i+6);

// Current day of week index (0=Mo...6=So) for today 20.02.2026 = Friday = index 4
const TODAY_TAG_IDX = 4;
const TODAY_TAG = TAGE[TODAY_TAG_IDX];

// ─── Reusable UI ──────────────────────────────────────────────────────────────
function Btn({ children, active, color = C.y, onClick, small, danger }) {
  return (
    <button onClick={onClick} style={{
      padding: small ? "4px 10px" : "6px 14px",
      borderRadius: 8,
      border: `1.5px solid ${danger ? "#f74f4f" : active ? color : C.bd}`,
      background: danger ? "#f74f4f22" : active ? color+"22" : "transparent",
      color: danger ? "#f74f4f" : active ? color : C.dm,
      fontSize: small ? 11 : 12,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "'DM Sans', sans-serif",
      transition: "all 0.15s",
      whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#000000aa",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background: C.c1,
        border: `1px solid ${C.bd}`,
        borderRadius: 14,
        width: wide ? 680 : 480,
        maxWidth: "100%",
        maxHeight: "90vh",
        overflow: "auto",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: `1px solid ${C.bd}`,
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: C.tx }}>{title}</span>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: C.dm, fontSize: 20,
            cursor: "pointer", lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, color: C.dm, fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type="text", min, max }) {
  return (
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} min={min} max={max} style={{
      background: C.c2, border: `1px solid ${C.bd}`, borderRadius: 8,
      color: C.tx, padding: "7px 12px", fontSize: 13,
      fontFamily: "'DM Sans', sans-serif", width: "100%", boxSizing: "border-box",
      outline: "none",
    }} />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)} style={{
      background: C.c2, border: `1px solid ${C.bd}`, borderRadius: 8,
      color: C.tx, padding: "7px 12px", fontSize: 13,
      fontFamily: "'DM Sans', sans-serif", width: "100%",
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Arbeitszeiten-Modal ──────────────────────────────────────────────────────
function ArbeitsModal({ v, az, onSave, onClose }) {
  const [data, setData] = useState({ ...az });
  const set = (k, val) => setData(p => ({ ...p, [k]: val }));

  return (
    <Modal title={`Arbeitszeiten — ${v.name}`} onClose={onClose} wide>
      <p style={{ fontSize: 12, color: C.dm, marginBottom: 16 }}>
        Lege fest, an welchen Tagen und zu welchen Zeiten {v.name.split(" ")[0]} buchbar ist. Leere Felder = kein Arbeitstag.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 16px" }}>
        {TAGE.map((tag, i) => (
          <div key={tag} style={{
            background: C.c2, border: `1px solid ${C.bd}`, borderRadius: 10,
            padding: 12,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: data[tag] ? C.y : C.dm, marginBottom: 8 }}>
              {TAGE_FULL[i]}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="time" value={data[tag] || ""} onChange={e=>set(tag, e.target.value)}
                style={{ flex:1, background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 6, color: C.tx, padding: "4px 6px", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }} />
              <span style={{ color: C.dm, fontSize: 11 }}>–</span>
              <input type="time" value={data[tag+"E"] || ""} onChange={e=>set(tag+"E", e.target.value)}
                style={{ flex:1, background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 6, color: C.tx, padding: "4px 6px", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }} />
            </div>
            {data[tag] && data[tag+"E"] && (
              <div style={{ fontSize: 10, color: C.dm, marginTop: 5 }}>
                {data[tag]} – {data[tag+"E"]} Uhr
              </div>
            )}
            {(!data[tag] || !data[tag+"E"]) && (
              <div style={{ fontSize: 10, color: "#f74f4f55", marginTop: 5 }}>nicht verfügbar</div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <Btn onClick={onClose}>Abbrechen</Btn>
        <Btn active onClick={() => { onSave(data); onClose(); }}>Speichern</Btn>
      </div>
    </Modal>
  );
}

// ─── Block hinzufügen Modal ───────────────────────────────────────────────────
function BlockModal({ v, onSave, onClose, editBlock }) {
  const [form, setForm] = useState(editBlock || {
    vertriebId: v.id,
    typ: "urlaub",
    label: "",
    datum: "2026-02-20",
    zeitVon: "",
    zeitBis: "",
    ganztaegig: true,
  });
  const set = (k, val) => setForm(p => ({ ...p, [k]: val }));
  const typ = BLOCK_TYPEN.find(t => t.key === form.typ);

  return (
    <Modal title={editBlock ? "Block bearbeiten" : `Block hinzufügen — ${v.name}`} onClose={onClose}>
      <Field label="Typ">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {BLOCK_TYPEN.map(t => (
            <button key={t.key} onClick={() => set("typ", t.key)} style={{
              padding: "5px 12px", borderRadius: 8,
              border: `1.5px solid ${form.typ === t.key ? t.color : C.bd}`,
              background: form.typ === t.key ? t.color+"22" : "transparent",
              color: form.typ === t.key ? t.color : C.dm,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}>{t.icon} {t.label}</button>
          ))}
        </div>
      </Field>
      <Field label="Bezeichnung">
        <Input value={form.label} onChange={v => set("label", v)} />
      </Field>
      <Field label="Datum">
        <Input type="date" value={form.datum} onChange={v => set("datum", v)} />
      </Field>
      <Field label="Zeitraum">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={form.ganztaegig} onChange={e => set("ganztaegig", e.target.checked)}
              style={{ accentColor: C.y }} />
            <span style={{ fontSize: 12, color: C.dm }}>Ganztägig</span>
          </label>
        </div>
        {!form.ganztaegig && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.dm, marginBottom: 4 }}>Von</div>
              <Input type="time" value={form.zeitVon} onChange={v => set("zeitVon", v)} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.dm, marginBottom: 4 }}>Bis</div>
              <Input type="time" value={form.zeitBis} onChange={v => set("zeitBis", v)} />
            </div>
          </div>
        )}
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <Btn onClick={onClose}>Abbrechen</Btn>
        <Btn active onClick={() => {
          if (!form.label || !form.datum) return;
          onSave({ ...form, id: editBlock?.id || "b" + Date.now() });
          onClose();
        }}>Speichern</Btn>
      </div>
    </Modal>
  );
}

// ─── Vertriebler Einstellungen Panel ─────────────────────────────────────────
function VertrieblerPanel({ v, az, blocks, onEditAz, onAddBlock, onDeleteBlock, onEditBlock }) {
  const vBlocks = blocks.filter(b => b.vertriebId === v.id).sort((a,b) => a.datum.localeCompare(b.datum));
  const todayAz = az[TODAY_TAG];
  const todayAzE = az[TODAY_TAG+"E"];

  return (
    <div style={{
      background: C.c1, border: `1px solid ${C.bd}`, borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${C.bd}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: v.color+"22", border: `2px solid ${v.color}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800, color: v.color, flexShrink: 0,
          }}>{v.id.slice(0,2)}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{v.name}</div>
            <div style={{ fontSize: 11, color: C.dm }}>
              Heute: {todayAz && todayAzE ? `${todayAz} – ${todayAzE} Uhr` : "Nicht verfügbar"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn small onClick={onEditAz}>⏰ Zeiten</Btn>
          <Btn small active onClick={onAddBlock}>+ Block</Btn>
        </div>
      </div>

      {/* Blocks Liste */}
      {vBlocks.length === 0 ? (
        <div style={{ padding: "12px 16px", fontSize: 12, color: C.dm, fontStyle: "italic" }}>
          Keine Blocks eingetragen
        </div>
      ) : (
        <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {vBlocks.map(b => {
            const typ = BLOCK_TYPEN.find(t => t.key === b.typ);
            return (
              <div key={b.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 10px",
                background: C.c2, borderRadius: 8,
                border: `1px solid ${typ.color}33`,
                gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{typ.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{b.label || typ.label}</div>
                    <div style={{ fontSize: 10, color: C.dm }}>
                      {b.datum} {b.ganztaegig ? "· Ganztägig" : `· ${b.zeitVon} – ${b.zeitBis}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => onEditBlock(b)} style={{
                    background: "none", border: "none", color: C.dm, cursor: "pointer", fontSize: 13, padding: "2px 4px",
                  }}>✏️</button>
                  <button onClick={() => onDeleteBlock(b.id)} style={{
                    background: "none", border: "none", color: "#f74f4f88", cursor: "pointer", fontSize: 13, padding: "2px 4px",
                  }}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Timeline Row ─────────────────────────────────────────────────────────────
function TimelineRow({ v, termine, blocks, az }) {
  const [hover, setHover] = useState(null);
  const tagKey = TODAY_TAG;
  const von = az[tagKey];
  const bis = az[tagKey + "E"];

  // Nicht-Verfügbar-Bereiche: vor Arbeitszeit und nach Arbeitszeit
  const hasAz = von && bis;
  const vonM = hasAz ? t2m(von) : null;
  const bisM = hasAz ? t2m(bis) : null;

  // Ganztägige Blocks = komplette Zeile gesperrt
  const ganztaegig = blocks.find(b => b.ganztaegig);

  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      borderBottom: `1px solid ${C.bd}22`,
      minHeight: 58,
      opacity: ganztaegig ? 0.7 : 1,
    }}>
      {/* Name */}
      <div style={{
        width: 180, flexShrink: 0,
        padding: "0 14px",
        display: "flex", alignItems: "center", gap: 8,
        borderRight: `1px solid ${C.bd}`,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: v.color+"22", border: `2px solid ${v.color}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 800, color: v.color, flexShrink: 0,
        }}>{v.id.slice(0,2)}</div>
        <div style={{ overflow: "hidden" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {v.name.split(" ")[0]}
          </div>
          {hasAz && !ganztaegig && (
            <div style={{ fontSize: 9, color: C.dm }}>{von}–{bis}</div>
          )}
          {ganztaegig && (
            <div style={{ fontSize: 9, color: BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.color }}>
              {BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.icon} {ganztaegig.label}
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, position: "relative", background: ganztaegig ? C.bg+"88" : "transparent" }}>
        {/* Hour grid */}
        {HOURS.map(h => (
          <div key={h} style={{
            position: "absolute",
            left: `${((h*60-DAY_START)/DAY_SPAN)*100}%`,
            top:0, bottom:0,
            borderLeft: `1px solid ${C.bd}22`,
          }} />
        ))}

        {/* Nicht-Arbeitszeit schattieren */}
        {hasAz && !ganztaegig && (
          <>
            {vonM > DAY_START && (
              <div style={{
                position: "absolute",
                left: 0,
                width: `${((vonM - DAY_START) / DAY_SPAN) * 100}%`,
                top: 0, bottom: 0,
                background: "repeating-linear-gradient(45deg, transparent, transparent 4px, #ffffff08 4px, #ffffff08 8px)",
                borderRight: `2px dashed ${C.bd}`,
              }} />
            )}
            {bisM < DAY_END && (
              <div style={{
                position: "absolute",
                left: `${((bisM - DAY_START) / DAY_SPAN) * 100}%`,
                right: 0,
                top: 0, bottom: 0,
                background: "repeating-linear-gradient(45deg, transparent, transparent 4px, #ffffff08 4px, #ffffff08 8px)",
                borderLeft: `2px dashed ${C.bd}`,
              }} />
            )}
          </>
        )}

        {/* Ganztägig-Overlay */}
        {ganztaegig && (
          <div style={{
            position: "absolute", inset: 0,
            background: `repeating-linear-gradient(45deg, transparent, transparent 8px, ${BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.color}18 8px, ${BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.color}18 16px)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <span style={{ fontSize: 18, opacity: 0.3 }}>{BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.icon}</span>
          </div>
        )}

        {/* Zeitgebundene Blocks */}
        {!ganztaegig && blocks.filter(b => !b.ganztaegig).map(b => {
          const typ = BLOCK_TYPEN.find(t => t.key === b.typ);
          const left = pct(b.zeitVon);
          const dur = t2m(b.zeitBis) - t2m(b.zeitVon);
          return (
            <div key={b.id} style={{
              position: "absolute",
              left: `${left}%`,
              width: `${wPct(dur)}%`,
              top: 4, bottom: 4,
              background: `repeating-linear-gradient(45deg, ${typ.color}22, ${typ.color}22 4px, ${typ.color}11 4px, ${typ.color}11 8px)`,
              borderRadius: 6,
              border: `1.5px dashed ${typ.color}88`,
              display: "flex", alignItems: "center", paddingLeft: 6,
              overflow: "hidden",
              zIndex: 2,
            }}>
              <span style={{ fontSize: 10, color: typ.color, fontWeight: 700, whiteSpace: "nowrap" }}>
                {typ.icon} {b.label}
              </span>
            </div>
          );
        })}

        {/* Termine */}
        {!ganztaegig && termine.map(t => {
          const s = STATUS_CONFIG[t.status];
          return (
            <div key={t.id}
              onMouseEnter={() => setHover(t.id)}
              onMouseLeave={() => setHover(null)}
              style={{
                position: "absolute",
                left: `${pct(t.zeit)}%`,
                width: `${wPct(t.dauer)}%`,
                top: 6, bottom: 6,
                background: s.color,
                borderRadius: 7,
                padding: "3px 7px",
                overflow: "hidden",
                cursor: "pointer",
                zIndex: hover === t.id ? 10 : 3,
                boxShadow: hover === t.id ? `0 4px 16px ${s.color}55` : "none",
                transform: hover === t.id ? "scaleY(1.05)" : "scaleY(1)",
                transition: "all 0.12s",
              }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: s.textColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.kunde}
              </div>
              <div style={{ fontSize: 9, color: s.textColor+"cc" }}>#{t.nr} · {t.zeit}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function BeedooKalenderV2() {
  const [blocks, setBlocks] = useState(INIT_BLOCKS);
  const [arbeitszeiten, setArbeitszeiten] = useState(INIT_ARBEITSZEITEN);
  const [activeStatus, setActiveStatus] = useState({ offen:true, bestaetigt:true, storniert:true, verpasst:true });
  const [activeV, setActiveV] = useState(INIT_VERTRIEBLER.reduce((a,v)=>({...a,[v.id]:true}),{}));
  const [tab, setTab] = useState("kalender"); // kalender | einstellungen
  const [azModal, setAzModal] = useState(null); // vertriebId
  const [blockModal, setBlockModal] = useState(null); // { v, editBlock? }
  const [showBlocks, setShowBlocks] = useState(true);

  const filteredTermine = useMemo(() =>
    TERMINE.filter(t => activeStatus[t.status] && activeV[t.vertriebId]),
    [activeStatus, activeV]
  );

  const activeList = INIT_VERTRIEBLER.filter(v => activeV[v.id]);

  // Blocks für heute
  const todayBlocks = (vertriebId) =>
    blocks.filter(b => b.vertriebId === vertriebId && b.datum === "2026-02-20");

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: C.tx }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        background: C.c1, borderBottom: `1px solid ${C.bd}`,
        padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: C.y, textTransform: "uppercase" }}>bee-doo</span>
          <span style={{ color: C.bd }}>|</span>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Vertriebskalender</span>
          <span style={{
            background: C.c2, border: `1px solid ${C.bd}`,
            borderRadius: 6, padding: "2px 10px",
            fontSize: 11, color: C.dm,
          }}>Freitag, 20.02.2026</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["kalender", "einstellungen"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "6px 16px", borderRadius: 8,
              border: `1.5px solid ${tab === t ? C.y : C.bd}`,
              background: tab === t ? C.y+"22" : "transparent",
              color: tab === t ? C.y : C.dm,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              textTransform: "capitalize",
            }}>
              {t === "kalender" ? "📅 Kalender" : "⚙️ Verfügbarkeit"}
            </button>
          ))}
        </div>
      </div>

      {tab === "kalender" && (
        <>
          {/* Filter Bar */}
          <div style={{ background: C.c1, borderBottom: `1px solid ${C.bd}`, padding: "10px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Status */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: C.dm, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", minWidth: 80 }}>Status</span>
              {Object.entries(STATUS_CONFIG).map(([k, s]) => (
                <button key={k} onClick={() => setActiveStatus(p => ({...p,[k]:!p[k]}))} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 11px", borderRadius: 7,
                  border: `1.5px solid ${activeStatus[k] ? s.color : C.bd}`,
                  background: activeStatus[k] ? s.color+"22" : "transparent",
                  color: activeStatus[k] ? s.color : C.dm,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  <span style={{ width:7,height:7,borderRadius:"50%",background:activeStatus[k]?s.color:C.bd }} />
                  {s.label}
                </button>
              ))}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => setShowBlocks(p=>!p)} style={{
                  padding: "4px 11px", borderRadius: 7,
                  border: `1.5px solid ${showBlocks ? "#a78bfa" : C.bd}`,
                  background: showBlocks ? "#a78bfa22" : "transparent",
                  color: showBlocks ? "#a78bfa" : C.dm,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}>🔒 Blocks anzeigen</button>
                <span style={{ fontSize: 12, color: C.dm }}>
                  <span style={{ color: C.y, fontWeight: 700 }}>{filteredTermine.length}</span> Termine
                </span>
              </div>
            </div>
            {/* Vertriebler */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: C.dm, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", minWidth: 80 }}>Vertriebler</span>
              <button onClick={() => {
                const all = INIT_VERTRIEBLER.every(v=>activeV[v.id]);
                setActiveV(INIT_VERTRIEBLER.reduce((a,v)=>({...a,[v.id]:!all}),{}));
              }} style={{
                padding: "4px 10px", borderRadius: 16,
                border: `1.5px solid ${INIT_VERTRIEBLER.every(v=>activeV[v.id]) ? C.y : C.bd}`,
                background: INIT_VERTRIEBLER.every(v=>activeV[v.id]) ? C.y+"22" : "transparent",
                color: INIT_VERTRIEBLER.every(v=>activeV[v.id]) ? C.y : C.dm,
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}>Alle</button>
              {INIT_VERTRIEBLER.map(v => (
                <button key={v.id} onClick={() => setActiveV(p=>({...p,[v.id]:!p[v.id]}))} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 10px 4px 6px", borderRadius: 16,
                  border: `1.5px solid ${activeV[v.id] ? v.color : C.bd}`,
                  background: activeV[v.id] ? v.color+"18" : "transparent",
                  color: activeV[v.id] ? C.tx : C.dm,
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
                }}>
                  <span style={{
                    width:20,height:20,borderRadius:"50%",
                    background:activeV[v.id]?v.color:C.bd,
                    color:activeV[v.id]?"#0c1222":C.dm,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:8,fontWeight:800,flexShrink:0,
                  }}>{v.id.slice(0,2)}</span>
                  {v.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{ background: C.c2, borderBottom: `1px solid ${C.bd}`, padding: "6px 24px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: C.dm, fontWeight: 700, textTransform: "uppercase" }}>Legende:</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 20, height: 10, background: "repeating-linear-gradient(45deg,transparent,transparent 3px,#ffffff10 3px,#ffffff10 6px)", border: `1px dashed ${C.bd}`, borderRadius: 2 }} />
              <span style={{ fontSize: 10, color: C.dm }}>Nicht-Arbeitszeit</span>
            </div>
            {BLOCK_TYPEN.map(t => (
              <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 20, height: 10, background: `repeating-linear-gradient(45deg,${t.color}22,${t.color}22 3px,${t.color}11 3px,${t.color}11 6px)`, border: `1px dashed ${t.color}88`, borderRadius: 2 }} />
                <span style={{ fontSize: 10, color: C.dm }}>{t.icon} {t.label}</span>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 1100 }}>
              {/* Time Header */}
              <div style={{ display: "flex", borderBottom: `1px solid ${C.bd}`, background: C.c1, position: "sticky", top: 0, zIndex: 20 }}>
                <div style={{ width: 180, flexShrink: 0, borderRight: `1px solid ${C.bd}`, padding: "7px 14px" }}>
                  <span style={{ fontSize: 10, color: C.dm, fontWeight: 600 }}>RESSOURCEN</span>
                </div>
                <div style={{ flex: 1, position: "relative", height: 30 }}>
                  {HOURS.map(h => (
                    <div key={h} style={{ position: "absolute", left: `${((h*60-DAY_START)/DAY_SPAN)*100}%`, top:0, bottom:0, display:"flex",alignItems:"center", paddingLeft:4 }}>
                      <span style={{ fontSize: 10, color: C.dm, fontWeight: 600 }}>{String(h).padStart(2,"0")}:00</span>
                    </div>
                  ))}
                  <div style={{ position:"absolute", left:`${pct("15:30")}%`, top:0, bottom:0, width:2, background:"#ff4444", zIndex:5 }} />
                </div>
              </div>
              {activeList.map(v => (
                <TimelineRow
                  key={v.id}
                  v={v}
                  termine={filteredTermine.filter(t => t.vertriebId === v.id)}
                  blocks={showBlocks ? todayBlocks(v.id) : []}
                  az={arbeitszeiten[v.id] || {}}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "einstellungen" && (
        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: C.tx }}>Verfügbarkeit & Blocks</h2>
            <p style={{ fontSize: 12, color: C.dm, margin: "4px 0 0" }}>
              Arbeitszeiten und Sperr-Blocks pro Vertriebler verwalten. Blocks werden im Kalender als gesperrte Zonen angezeigt.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
            {INIT_VERTRIEBLER.map(v => (
              <VertrieblerPanel
                key={v.id}
                v={v}
                az={arbeitszeiten[v.id] || {}}
                blocks={blocks.filter(b => b.vertriebId === v.id)}
                onEditAz={() => setAzModal(v.id)}
                onAddBlock={() => setBlockModal({ v })}
                onDeleteBlock={(id) => setBlocks(p => p.filter(b => b.id !== id))}
                onEditBlock={(b) => setBlockModal({ v, editBlock: b })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {azModal && (
        <ArbeitsModal
          v={INIT_VERTRIEBLER.find(v => v.id === azModal)}
          az={arbeitszeiten[azModal] || {}}
          onSave={(data) => setArbeitszeiten(p => ({ ...p, [azModal]: data }))}
          onClose={() => setAzModal(null)}
        />
      )}
      {blockModal && (
        <BlockModal
          v={blockModal.v}
          editBlock={blockModal.editBlock}
          onSave={(b) => setBlocks(p => {
            const exists = p.find(x => x.id === b.id);
            return exists ? p.map(x => x.id === b.id ? b : x) : [...p, b];
          })}
          onClose={() => setBlockModal(null)}
        />
      )}
    </div>
  );
}
