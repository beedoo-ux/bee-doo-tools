// ============================================================
// Vercel Serverless Function: hr-contract-sign
// 
// Nimmt ein generiertes PDF + Mitarbeiterdaten entgegen,
// erstellt eine Yousign-Signaturanfrage und gibt die
// Signing-URLs zurück.
//
// Flow:
// 1. PDF als Base64 empfangen
// 2. In Supabase Storage speichern
// 3. Yousign Signaturanfrage erstellen
// 4. 2 Unterzeichner: Mitarbeiter (remote) + Arbeitgeber (remote)
// 5. Status in hr_contracts speichern
// 6. Signing-URLs zurückgeben
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hqzpemfaljxcysyqssng.supabase.co';

// Vertragstyp → Label
const CONTRACT_LABELS = {
  scout: 'Scout-Arbeitsvertrag',
  angestellt: 'Arbeitsvertrag',
  hgb: 'HGB-Handelsvertretervertrag'
};

// Signaturlevel pro Vertragstyp
const SIGNATURE_LEVELS = {
  scout: 'electronic_signature',         // EES reicht
  angestellt: 'electronic_signature',     // EES reicht (seit NachweisG 2025)
  hgb: 'qualified_electronic_signature'   // QES für §85 HGB
};

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const YOUSIGN_API_KEY = process.env.YOUSIGN_API_KEY;
  const YOUSIGN_BASE_URL = process.env.YOUSIGN_BASE_URL || 'https://api.yousign.app/v3';

  if (!SERVICE_ROLE_KEY || !YOUSIGN_API_KEY) {
    return res.status(500).json({ error: 'Server configuration missing (env vars)' });
  }

  // Simple auth: Anon key or service role key
  const authHeader = req.headers.authorization || '';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzUzOTcsImV4cCI6MjA4NjkxMTM5N30.LSlMApceWuLk5MUctCGCVspXfYhc_As559aaoV2uSik';
  
  if (!authHeader.includes(SERVICE_ROLE_KEY) && !authHeader.includes(anonKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const {
      contract_type,    // 'scout' | 'angestellt' | 'hgb'
      employee,         // { salutation, first_name, last_name, email, phone, street, zip_city }
      contract_data,    // All form fields as JSON
      pdf_base64,       // The generated PDF as base64
      created_by        // Who created this (optional)
    } = req.body;

    // Validierung
    if (!contract_type || !['scout', 'angestellt', 'hgb'].includes(contract_type)) {
      return res.status(400).json({ error: 'contract_type muss "scout", "angestellt" oder "hgb" sein' });
    }
    if (!employee?.email || !employee?.first_name || !employee?.last_name) {
      return res.status(400).json({ error: 'employee: email, first_name, last_name sind Pflicht' });
    }
    if (!pdf_base64) {
      return res.status(400).json({ error: 'pdf_base64 ist Pflicht' });
    }

    const label = CONTRACT_LABELS[contract_type];
    const name = `${employee.first_name} ${employee.last_name}`;
    console.log(`📝 HR Contract: ${label} für ${name}`);

    // 1. PDF in Supabase Storage speichern
    const pdfBuffer = Buffer.from(pdf_base64, 'base64');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const storagePath = `${contract_type}/${employee.last_name}_${employee.first_name}_${timestamp}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('hr-contracts')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`PDF Upload fehlgeschlagen: ${uploadError.message}`);
    }
    console.log(`📄 PDF gespeichert: ${storagePath}`);

    // 2. Vertrag in DB anlegen
    const { data: contract, error: dbError } = await supabase
      .from('hr_contracts')
      .insert({
        contract_type,
        employee_salutation: employee.salutation || 'Herrn',
        employee_first_name: employee.first_name,
        employee_last_name: employee.last_name,
        employee_email: employee.email,
        employee_phone: employee.phone || null,
        employee_street: employee.street || null,
        employee_zip_city: employee.zip_city || null,
        contract_data: contract_data || {},
        pdf_storage_path: storagePath,
        status: 'entwurf',
        created_by: created_by || 'system'
      })
      .select()
      .single();

    if (dbError) throw dbError;
    console.log(`💾 DB Eintrag: ${contract.id}`);

    // 3. Yousign Signaturanfrage erstellen
    const signatureRequest = await yousignRequest(YOUSIGN_BASE_URL, YOUSIGN_API_KEY,
      'POST', '/signature_requests', {
        name: `bee-doo ${label} – ${name}`,
        delivery_mode: 'email',  // Remote signing per Email
        timezone: 'Europe/Berlin',
        ordered_signers: true,   // Erst MA, dann AG
        expiration_date: getExpirationDate(30), // 30 Tage gültig
        email_notification: {
          sender: {
            type: 'custom',
            custom_name: 'bee-doo GmbH'
          }
        }
      }
    );
    console.log(`✍️ Yousign Request: ${signatureRequest.id}`);

    // 4. PDF zu Yousign hochladen
    const uploadedDoc = await yousignUploadDocument(
      YOUSIGN_BASE_URL, YOUSIGN_API_KEY,
      signatureRequest.id,
      pdfBuffer,
      `${label}_${employee.last_name}_${employee.first_name}.pdf`
    );
    console.log(`📤 Document uploaded: ${uploadedDoc.id}`);

    // 5. Unterzeichner 1: Mitarbeiter
    const signerEmployee = await yousignRequest(YOUSIGN_BASE_URL, YOUSIGN_API_KEY,
      'POST', `/signature_requests/${signatureRequest.id}/signers`, {
        info: {
          first_name: employee.first_name,
          last_name: employee.last_name,
          email: employee.email,
          phone_number: employee.phone || undefined,
          locale: 'de'
        },
        signature_authentication_mode: employee.phone ? 'otp_sms' : 'no_otp',
        signature_level: SIGNATURE_LEVELS[contract_type],
        fields: [{
          type: 'signature',
          document_id: uploadedDoc.id,
          page: getLastPage(pdfBuffer),  // Letzte Seite
          x: 28,
          y: 558,    // Position "Arbeitnehmer" Unterschriftslinie
          width: 180,
          height: 50
        }, {
          type: 'text',
          document_id: uploadedDoc.id,
          page: getLastPage(pdfBuffer),
          x: 28,
          y: 528,
          width: 180,
          height: 20,
          question: 'Ort, Datum',
          max_length: 50
        }]
      }
    );
    console.log(`👤 Signer 1 (MA): ${signerEmployee.id}`);

    // 6. Unterzeichner 2: Arbeitgeber (Patrick oder Olaf)
    const signerEmployer = await yousignRequest(YOUSIGN_BASE_URL, YOUSIGN_API_KEY,
      'POST', `/signature_requests/${signatureRequest.id}/signers`, {
        info: {
          first_name: 'Patrick',
          last_name: 'Grabowski',
          email: 'pg@bee-doo.de',
          locale: 'de'
        },
        signature_authentication_mode: 'no_otp',
        signature_level: SIGNATURE_LEVELS[contract_type],
        fields: [{
          type: 'signature',
          document_id: uploadedDoc.id,
          page: getLastPage(pdfBuffer),
          x: 28,
          y: 618,   // Position "Arbeitgeber" Unterschriftslinie
          width: 180,
          height: 50
        }]
      }
    );
    console.log(`👔 Signer 2 (AG): ${signerEmployer.id}`);

    // 7. Signaturanfrage aktivieren
    await yousignRequest(YOUSIGN_BASE_URL, YOUSIGN_API_KEY,
      'POST', `/signature_requests/${signatureRequest.id}/activate`
    );
    console.log(`✅ Signature request activated`);

    // 8. DB aktualisieren
    await supabase
      .from('hr_contracts')
      .update({
        yousign_request_id: signatureRequest.id,
        status: 'gesendet',
        sent_at: new Date().toISOString()
      })
      .eq('id', contract.id);

    // 9. Erfolg zurückgeben
    return res.status(200).json({
      success: true,
      contract_id: contract.id,
      yousign_request_id: signatureRequest.id,
      message: `${label} wurde an ${employee.email} zur Unterschrift gesendet.`,
      contract_type,
      employee_name: name,
      status: 'gesendet'
    });

  } catch (error) {
    console.error('❌ HR Contract Sign Error:', error);
    return res.status(500).json({
      error: error.message || 'Interner Fehler',
      details: error.response?.data || null
    });
  }
};

// ── Yousign Helper Functions ──────────────────────────────────

async function yousignRequest(baseUrl, apiKey, method, path, body) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, options);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Yousign API ${method} ${path} failed (${response.status}): ${errorBody}`);
  }
  // Some endpoints return 204 No Content
  if (response.status === 204) return {};
  return response.json();
}

async function yousignUploadDocument(baseUrl, apiKey, requestId, pdfBuffer, fileName) {
  const formData = new FormData();
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  formData.append('file', blob, fileName);
  formData.append('nature', 'signable_document');

  const response = await fetch(
    `${baseUrl}/signature_requests/${requestId}/documents`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    }
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Yousign document upload failed (${response.status}): ${errorBody}`);
  }
  return response.json();
}

function getExpirationDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getLastPage(pdfBuffer) {
  // Simple heuristic: count /Type /Page occurrences in PDF
  const str = pdfBuffer.toString('latin1');
  const matches = str.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 1;
}
