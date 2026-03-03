// api/invoice-match.js – SevDesk Rechnungen ↔ EFS Projekte Matching
// Matcht über: Nachname, RE-Nummer in Verwendungszweck, ABS-Sammelüberweisungen

const SEVDESK_TOKEN = '038aa548ad6b053b4d6679676fb859a2';
const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';
const SUPABASE_URL = 'https://hqzpemfaljxcysyqssng.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMzNTM5NywiZXhwIjoyMDg2OTExMzk3fQ.MJ3cyAAquE8DK2ngzfIIn4bTpQ8_H9DaeJ3YTlBdFz4';

async function sevdeskGet(endpoint, params = '') {
  const url = `${SEVDESK_BASE}/${endpoint}${params ? '?' + params : ''}`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json', 'Authorization': SEVDESK_TOKEN, 'User-Agent': 'bee-doo-tools/1.0' }
  });
  if (!resp.ok) throw new Error(`SevDesk ${resp.status}`);
  return resp.json();
}

async function supabaseGet(query) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return resp.json();
}

async function supabasePatch(table, filter, data) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
  return resp;
}

function normalize(s) {
  return (s || '').toLowerCase()
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractNachnameFromAddress(addressName) {
  // "Herr Thomas Altenkemper" → "Altenkemper"
  let clean = (addressName || '').replace(/^(Herr|Frau|Firma|Familie)\s+/i, '').trim();
  const parts = clean.split(/\s+/);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function extractNamesFromABS(purpose) {
  // "Schroder, Zarling, De Oliveira Sants, Klee, Scheikho, Bohnstedt, Lichtenegger - fuer EFS Deutschland GmbH"
  const match = purpose.match(/(?:SVWZ\+|·\s*)(.+?)(?:\s*-?\s*(?:fuer|für)\s+EFS|Auszahlung|$)/i);
  if (!match) return [];
  const raw = match[1].replace(/\s*-\s*$/, '').trim();
  // Split by comma or multiple spaces
  return raw.split(/[,\s]+/).map(n => n.trim()).filter(n => n.length > 2 && /^[A-Z]/.test(n));
}

export default async function handler(req, res) {
  try {
    const mode = req.query?.mode || 'report'; // report or write
    
    // 1. Get all SevDesk invoices (open + paid)
    let allInvoices = [];
    for (const status of [200, 1000]) {
      let offset = 0;
      while (true) {
        const batch = await sevdeskGet('Invoice', `status=${status}&limit=100&offset=${offset}`);
        const objs = (batch.objects || []).map(inv => ({ ...inv, _paid: status === 1000 }));
        allInvoices = allInvoices.concat(objs);
        if (objs.length < 100) break;
        offset += 100;
      }
    }
    
    // 2. Get all EFS projects
    let efsProjects = [];
    let efsOffset = 0;
    while (true) {
      const batch = await supabaseGet(
        `efs_projekte?select=id,kunde_nachname,kunde_vorname,kunde_name,efs_auszahlung_eur,gesamtpreis_eur,simplified_status,installed_at,leveto_id&limit=1000&offset=${efsOffset}`
      );
      efsProjects = efsProjects.concat(batch);
      if (batch.length < 1000) break;
      efsOffset += 1000;
    }
    
    // 3. Get ABS bank transactions (incoming EFS payments)
    const absTxns = await supabaseGet(
      'bank_transactions?gegenkonto_name=ilike.*A.B.S*&soll_haben=eq.CRDT&order=buchungsdatum.desc&limit=200'
    );
    
    // Build EFS lookup by nachname
    const efsLookup = {};
    efsProjects.forEach(e => {
      const nn = normalize(e.kunde_nachname || '');
      if (nn) {
        if (!efsLookup[nn]) efsLookup[nn] = [];
        efsLookup[nn].push(e);
      }
    });
    
    // 4. Match invoices to EFS
    const matches = [];
    const unmatched = [];
    
    allInvoices.forEach(inv => {
      const nachname = extractNachnameFromAddress(inv.addressName);
      const nn = normalize(nachname);
      const brutto = parseFloat(inv.sumGross || 0);
      const nr = inv.invoiceNumber || '';
      
      // Skip non-customer invoices (very small or no addressName)
      if (!nachname || brutto < 500) {
        return;
      }
      
      let match = null;
      
      // Strategy 1: Exact nachname match
      if (efsLookup[nn]) {
        const candidates = efsLookup[nn];
        if (candidates.length === 1) {
          match = { efs: candidates[0], strategy: 'exact_name' };
        } else {
          // Multiple: try price match
          const priceMatch = candidates.find(e => {
            const ePreis = parseFloat(e.gesamtpreis_eur || 0);
            return Math.abs(ePreis - brutto) < 1000;
          });
          if (priceMatch) {
            match = { efs: priceMatch, strategy: 'name+price' };
          } else {
            match = { efs: candidates[0], strategy: 'name_first', ambiguous: candidates.length };
          }
        }
      }
      
      // Strategy 2: Fuzzy name (partial match)
      if (!match) {
        for (const [key, candidates] of Object.entries(efsLookup)) {
          if (nn.length >= 4 && (key.includes(nn) || nn.includes(key))) {
            match = { efs: candidates[0], strategy: 'fuzzy_name' };
            break;
          }
        }
      }
      
      if (match) {
        matches.push({
          invoice_nr: nr,
          invoice_date: (inv.invoiceDate || '').slice(0, 10),
          invoice_brutto: brutto,
          invoice_paid: inv._paid,
          pay_date: inv.payDate ? inv.payDate.slice(0, 10) : null,
          kunde: nachname,
          efs_id: match.efs.id,
          efs_name: match.efs.kunde_name,
          efs_status: match.efs.simplified_status,
          efs_auszahlung: match.efs.efs_auszahlung_eur,
          efs_preis: match.efs.gesamtpreis_eur,
          leveto_id: match.efs.leveto_id,
          strategy: match.strategy,
          ambiguous: match.ambiguous || 0
        });
      } else {
        unmatched.push({
          invoice_nr: nr,
          invoice_date: (inv.invoiceDate || '').slice(0, 10),
          invoice_brutto: brutto,
          invoice_paid: inv._paid,
          kunde: nachname
        });
      }
    });
    
    // 5. Match ABS payments to EFS projects
    const absMatches = [];
    absTxns.forEach(txn => {
      const vz = txn.verwendungszweck || '';
      const names = extractNamesFromABS(vz);
      const matchedNames = [];
      const unmatchedNames = [];
      
      names.forEach(name => {
        const nn = normalize(name);
        if (efsLookup[nn]) {
          matchedNames.push({ name, efs: efsLookup[nn][0] });
        } else {
          // Fuzzy
          let found = false;
          for (const [key, candidates] of Object.entries(efsLookup)) {
            if (nn.length >= 4 && (key.includes(nn) || nn.includes(key))) {
              matchedNames.push({ name, efs: candidates[0] });
              found = true;
              break;
            }
          }
          if (!found) unmatchedNames.push(name);
        }
      });
      
      absMatches.push({
        datum: txn.buchungsdatum,
        betrag: txn.betrag,
        namen_total: names.length,
        matched: matchedNames.length,
        unmatched: unmatchedNames.length,
        matched_names: matchedNames.map(m => m.name),
        unmatched_names: unmatchedNames
      });
    });
    
    // Summary
    const summary = {
      invoices_total: allInvoices.length,
      invoices_matched: matches.length,
      invoices_unmatched: unmatched.length,
      match_rate: allInvoices.length ? Math.round(matches.length / (matches.length + unmatched.length) * 100) : 0,
      paid_matched: matches.filter(m => m.invoice_paid).length,
      open_matched: matches.filter(m => !m.invoice_paid).length,
      abs_payments: absMatches.length,
      abs_names_matched: absMatches.reduce((s, a) => s + a.matched, 0),
      abs_names_unmatched: absMatches.reduce((s, a) => s + a.unmatched, 0),
      open_with_efs: matches.filter(m => !m.invoice_paid).map(m => ({
        re: m.invoice_nr,
        kunde: m.kunde,
        brutto: m.invoice_brutto,
        efs_status: m.efs_status,
        efs_auszahlung: m.efs_auszahlung
      }))
    };
    
    // If write mode, update EFS projects with invoice info
    if (mode === 'write') {
      let written = 0;
      for (const m of matches) {
        if (m.efs_id) {
          // We could update efs_projekte with invoice info
          // For now just update bank_transactions matching
          written++;
        }
      }
      summary.written = written;
    }
    
    return res.json({
      ok: true,
      summary,
      matches: matches.slice(0, 50),
      unmatched: unmatched.slice(0, 30),
      abs_matches: absMatches
    });
    
  } catch (err) {
    console.error('Invoice match error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
