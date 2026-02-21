import { useState, useMemo } from "react";

// ─── bee-doo Design System ───────────────────────────────────────────────────
const C = {
  bg: "#0c1222",
  c1: "#151d30",
  c2: "#1c2640",
  bd: "#263354",
  tx: "#e1e7ef",
  dm: "#5c6b8a",
  y: "#FDE154",
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const VERTRIEBLER = [
  { id: "AK", name: "Andreas Klee", color: "#4f8ef7" },
  { id: "FR", name: "Frank Reddig", color: "#FDE154" },
  { id: "JP", name: "Jannis Pfeiffer", color: "#FDE154" },
  { id: "KM", name: "Maximilian Koch", color: "#f74f4f" },
  { id: "MSC", name: "Miguel Schader", color: "#4f8ef7" },
  { id: "PM", name: "Pascal Meier", color: "#4fc7f7" },
  { id: "DV", name: "Dimitri van Eeuwen", color: "#FDE154" },
  { id: "PTH", name: "Philipp-Torben Hannig", color: "#4f8ef7" },
];

const STATUS_CONFIG = {
  offen: { label: "Offen", color: "#FDE154", textColor: "#0c1222" },
  bestaetigt: { label: "Bestätigt", color: "#4f8ef7", textColor: "#fff" },
  storniert: { label: "Storniert", color: "#5c6b8a", textColor: "#e1e7ef" },
  verpasst: { label: "Verpasst", color: "#f74f4f", textColor: "#fff" },
  reklamiert: { label: "Reklamiert", color: "#f7914f", textColor: "#fff" },
};

const TERMINE = [
  { id: 1, vertriebId: "AK", kunde: "Jochen Eck", zeit: "09:00", dauer: 90, status: "storniert", nr: "33654" },
  { id: 2, vertriebId: "AK", kunde: "Bernd Herbert", zeit: "11:00", dauer: 90, status: "bestaetigt", nr: "35395" },
  { id: 3, vertriebId: "AK", kunde: "Benno Krueche", zeit: "14:00", dauer: 90, status: "storniert", nr: "32640" },
  { id: 4, vertriebId: "AK", kunde: "Carsten Frey", zeit: "10:30", dauer: 60, status: "storniert", nr: "30847" },
  { id: 5, vertriebId: "AK", kunde: "Holger Fey", zeit: "15:00", dauer: 120, status: "bestaetigt", nr: "30460" },
  { id: 6, vertriebId: "FR", kunde: "Scheer", zeit: "11:00", dauer: 90, status: "offen", nr: "31001" },
  { id: 7, vertriebId: "FR", kunde: "Biermann", zeit: "14:00", dauer: 90, status: "offen", nr: "31002" },
  { id: 8, vertriebId: "FR", kunde: "Peltz", zeit: "15:30", dauer: 90, status: "offen", nr: "31003" },
  { id: 9, vertriebId: "JP", kunde: "Maria Hennek", zeit: "13:30", dauer: 90, status: "storniert", nr: "3361" },
  { id: 10, vertriebId: "JP", kunde: "Ankit Bhatia", zeit: "15:30", dauer: 90, status: "offen", nr: "12545" },
  { id: 11, vertriebId: "KM", kunde: "Julia Maria Dambis", zeit: "12:30", dauer: 90, status: "storniert", nr: "3004" },
  { id: 12, vertriebId: "KM", kunde: "Hasan Ozden", zeit: "15:00", dauer: 90, status: "offen", nr: "33609" },
  { id: 13, vertriebId: "MSC", kunde: "Ines Brouwers", zeit: "10:30", dauer: 90, status: "bestaetigt", nr: "3316" },
  { id: 14, vertriebId: "MSC", kunde: "Nina Schenz", zeit: "13:00", dauer: 90, status: "bestaetigt", nr: "13198" },
  { id: 15, vertriebId: "MSC", kunde: "Sabine Gabel", zeit: "15:00", dauer: 90, status: "bestaetigt", nr: "3388" },
  { id: 16, vertriebId: "MSC", kunde: "Cihun Biener", zeit: "16:30", dauer: 90, status: "storniert", nr: "32263" },
  { id: 17, vertriebId: "MSC", kunde: "Thomas Bende", zeit: "18:30", dauer: 90, status: "bestaetigt", nr: "30917" },
  { id: 18, vertriebId: "PM", kunde: "Vivien Müntemeyer", zeit: "10:30", dauer: 90, status: "offen", nr: "12299" },
  { id: 19, vertriebId: "DV", kunde: "Renate Scharbatke", zeit: "11:30", dauer: 90, status: "offen", nr: "3188" },
  { id: 20, vertriebId: "DV", kunde: "Barbara Brake", zeit: "14:00", dauer: 90, status: "storniert", nr: "13945" },
  { id: 21, vertriebId: "PTH", kunde: "Björn Lehmann", zeit: "14:30", dauer: 90, status: "bestaetigt", nr: "1234" },
  { id: 22, vertriebId: "PTH", kunde: "Tanja Witte", zeit: "17:00", dauer: 90, status: "storniert", nr: "13585" },
];

// ─── Helper ───────────────────────────────────────────────────────────────────
const timeToMinutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const DAY_START = 6 * 60; // 06:00
const DAY_END = 21 * 60;  // 21:00
const DAY_SPAN = DAY_END - DAY_START;

const posPercent = (t) => ((timeToMinutes(t) - DAY_START) / DAY_SPAN) * 100;
const widthPercent = (dur) => (dur / DAY_SPAN) * 100;

// ─── Components ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS_CONFIG[status];
  return (
    <span style={{
      background: s.color,
      color: s.textColor,
      fontSize: 10,
      fontWeight: 700,
      padding: "2px 6px",
      borderRadius: 4,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
    }}>{s.label}</span>
  );
}

function FilterToggle({ label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 14px",
      borderRadius: 8,
      border: `1.5px solid ${active ? color : C.bd}`,
      background: active ? color + "22" : "transparent",
      color: active ? color : C.dm,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.15s",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: active ? color : C.bd,
        transition: "background 0.15s",
      }} />
      {label}
    </button>
  );
}

function VertrieblerChip({ v, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex",
      alignItems: "center",
      gap: 7,
      padding: "5px 12px 5px 8px",
      borderRadius: 20,
      border: `1.5px solid ${active ? v.color : C.bd}`,
      background: active ? v.color + "18" : "transparent",
      color: active ? C.tx : C.dm,
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.15s",
      fontFamily: "'DM Sans', sans-serif",
      whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: "50%",
        background: active ? v.color : C.bd,
        color: active ? "#0c1222" : C.dm,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 800,
        flexShrink: 0,
      }}>{v.id.slice(0, 2)}</span>
      {v.name}
    </button>
  );
}

function TerminBlock({ termin, vertriebler }) {
  const [hover, setHover] = useState(false);
  const s = STATUS_CONFIG[termin.status];
  const left = posPercent(termin.zeit);
  const width = widthPercent(termin.dauer);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute",
        left: `${left}%`,
        width: `${width}%`,
        top: 6,
        bottom: 6,
        background: s.color,
        borderRadius: 8,
        padding: "4px 8px",
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: hover ? `0 4px 16px ${s.color}55` : "none",
        transition: "box-shadow 0.15s, transform 0.1s",
        transform: hover ? "scaleY(1.04)" : "scaleY(1)",
        zIndex: hover ? 10 : 1,
        borderLeft: `3px solid ${s.color === "#FDE154" ? "#c9b000" : "#ffffff33"}`,
      }}
    >
      <div style={{
        fontSize: 11, fontWeight: 700,
        color: s.textColor,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {vertriebler?.id} – {termin.kunde}
      </div>
      <div style={{ fontSize: 10, color: s.textColor + "cc" }}>
        #{termin.nr}
      </div>
    </div>
  );
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06–21

function TimelineRow({ vertriebler, termine }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "stretch",
      borderBottom: `1px solid ${C.bd}22`,
      minHeight: 58,
    }}>
      {/* Name */}
      <div style={{
        width: 180,
        flexShrink: 0,
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderRight: `1px solid ${C.bd}`,
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: "50%",
          background: vertriebler.color + "33",
          border: `2px solid ${vertriebler.color}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, color: vertriebler.color,
          flexShrink: 0,
        }}>{vertriebler.id.slice(0, 2)}</span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: C.tx,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{vertriebler.name}</span>
      </div>
      {/* Timeline */}
      <div style={{ flex: 1, position: "relative" }}>
        {/* Hour grid */}
        {HOURS.map(h => (
          <div key={h} style={{
            position: "absolute",
            left: `${((h * 60 - DAY_START) / DAY_SPAN) * 100}%`,
            top: 0, bottom: 0,
            borderLeft: `1px solid ${C.bd}33`,
          }} />
        ))}
        {/* Termine */}
        {termine.map(t => (
          <TerminBlock key={t.id} termin={t} vertriebler={vertriebler} />
        ))}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function BeedooKalender() {
  const [activeStatus, setActiveStatus] = useState(
    Object.keys(STATUS_CONFIG).reduce((a, k) => ({ ...a, [k]: true }), {})
  );
  const [activeVertriebler, setActiveVertriebler] = useState(
    VERTRIEBLER.reduce((a, v) => ({ ...a, [v.id]: true }), {})
  );
  const [view, setView] = useState("tag"); // tag | woche

  const toggleStatus = (s) => setActiveStatus(p => ({ ...p, [s]: !p[s] }));
  const toggleVertriebler = (id) => setActiveVertriebler(p => ({ ...p, [id]: !p[id] }));
  const allVSelected = VERTRIEBLER.every(v => activeVertriebler[v.id]);
  const toggleAllV = () => {
    const next = !allVSelected;
    setActiveVertriebler(VERTRIEBLER.reduce((a, v) => ({ ...a, [v.id]: next }), {}));
  };

  const filteredTermine = useMemo(() =>
    TERMINE.filter(t => activeStatus[t.status] && activeVertriebler[t.vertriebId]),
    [activeStatus, activeVertriebler]
  );

  const termineCounts = useMemo(() => {
    const counts = {};
    VERTRIEBLER.forEach(v => {
      counts[v.id] = filteredTermine.filter(t => t.vertriebId === v.id).length;
    });
    return counts;
  }, [filteredTermine]);

  const activeVertrieblerList = VERTRIEBLER.filter(v => activeVertriebler[v.id]);

  return (
    <div style={{
      background: C.bg,
      minHeight: "100vh",
      fontFamily: "'DM Sans', sans-serif",
      color: C.tx,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        background: C.c1,
        borderBottom: `1px solid ${C.bd}`,
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
            color: C.y, textTransform: "uppercase",
          }}>bee-doo</span>
          <span style={{ color: C.bd, fontSize: 18 }}>|</span>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Vertriebskalender</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ background: C.c2, borderRadius: 8, padding: 3, display: "flex", gap: 2 }}>
            {["tag", "woche"].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "none",
                background: view === v ? C.y : "transparent",
                color: view === v ? C.bg : C.dm,
                fontWeight: 700, fontSize: 12,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                textTransform: "capitalize",
                transition: "all 0.15s",
              }}>{v === "tag" ? "Tag" : "Woche"}</button>
            ))}
          </div>
          <button style={{
            padding: "6px 16px",
            borderRadius: 8,
            border: `1.5px solid ${C.bd}`,
            background: "transparent",
            color: C.y,
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}>Freitag, 20.02.2026</button>
        </div>
      </div>

      {/* Filter Panel */}
      <div style={{
        background: C.c1,
        borderBottom: `1px solid ${C.bd}`,
        padding: "12px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        {/* Status Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.dm, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", minWidth: 90 }}>
            Terminstatus
          </span>
          <button onClick={() => {
            const allOn = Object.values(activeStatus).every(Boolean);
            const next = !allOn;
            setActiveStatus(Object.keys(STATUS_CONFIG).reduce((a, k) => ({ ...a, [k]: next }), {}));
          }} style={{
            padding: "5px 12px", borderRadius: 8,
            border: `1.5px solid ${C.bd}`,
            background: Object.values(activeStatus).every(Boolean) ? C.y + "22" : "transparent",
            color: Object.values(activeStatus).every(Boolean) ? C.y : C.dm,
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}>Alle</button>
          {Object.entries(STATUS_CONFIG).map(([key, s]) => (
            <FilterToggle
              key={key}
              label={s.label}
              active={activeStatus[key]}
              color={s.color}
              onClick={() => toggleStatus(key)}
            />
          ))}
          <span style={{
            marginLeft: "auto",
            fontSize: 12, color: C.dm,
          }}>
            <span style={{ color: C.y, fontWeight: 700 }}>{filteredTermine.length}</span> Termine
          </span>
        </div>

        {/* Vertriebler Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.dm, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", minWidth: 90 }}>
            Vertriebler
          </span>
          <button onClick={toggleAllV} style={{
            padding: "5px 12px", borderRadius: 20,
            border: `1.5px solid ${allVSelected ? C.y : C.bd}`,
            background: allVSelected ? C.y + "22" : "transparent",
            color: allVSelected ? C.y : C.dm,
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}>Alle</button>
          {VERTRIEBLER.map(v => (
            <VertrieblerChip
              key={v.id}
              v={v}
              active={activeVertriebler[v.id]}
              onClick={() => toggleVertriebler(v.id)}
            />
          ))}
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{
        background: C.c2,
        borderBottom: `1px solid ${C.bd}`,
        padding: "8px 24px",
        display: "flex",
        gap: 24,
        flexWrap: "wrap",
        overflowX: "auto",
      }}>
        {Object.entries(STATUS_CONFIG).map(([key, s]) => {
          const count = filteredTermine.filter(t => t.status === key).length;
          if (!activeStatus[key]) return null;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.dm }}>{s.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Timeline */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1100 }}>
          {/* Time header */}
          <div style={{
            display: "flex",
            borderBottom: `1px solid ${C.bd}`,
            background: C.c1,
            position: "sticky",
            top: 0,
            zIndex: 20,
          }}>
            <div style={{ width: 180, flexShrink: 0, borderRight: `1px solid ${C.bd}`, padding: "8px 16px" }}>
              <span style={{ fontSize: 11, color: C.dm, fontWeight: 600 }}>RESSOURCEN</span>
            </div>
            <div style={{ flex: 1, position: "relative", height: 32 }}>
              {HOURS.map(h => (
                <div key={h} style={{
                  position: "absolute",
                  left: `${((h * 60 - DAY_START) / DAY_SPAN) * 100}%`,
                  top: 0, bottom: 0,
                  display: "flex", alignItems: "center",
                  paddingLeft: 4,
                }}>
                  <span style={{ fontSize: 11, color: C.dm, fontWeight: 600 }}>
                    {String(h).padStart(2, "0")}:00
                  </span>
                </div>
              ))}
              {/* NOW line */}
              <div style={{
                position: "absolute",
                left: `${posPercent("15:30")}%`,
                top: 0, bottom: 0,
                width: 2,
                background: "#ff4444",
                zIndex: 5,
              }} />
            </div>
          </div>

          {/* Rows */}
          {activeVertrieblerList.map(v => (
            <TimelineRow
              key={v.id}
              vertriebler={v}
              termine={filteredTermine.filter(t => t.vertriebId === v.id)}
            />
          ))}

          {activeVertrieblerList.length === 0 && (
            <div style={{
              padding: 40,
              textAlign: "center",
              color: C.dm,
              fontSize: 14,
            }}>
              Keine Vertriebler ausgewählt
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
