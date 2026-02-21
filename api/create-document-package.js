// ============================================================
// Vercel Serverless Function: create-document-package
// 
// Erstellt ein vollständiges Dokumentenpaket für einen Auftrag:
// 1. Datenblätter ermitteln via Pattern-Matching
// 2. Paket in DB anlegen
// 3. Yousign Signaturanfrage erstellen
// 4. In-Person Signing Link zurückgeben
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hqzpemfaljxcysyqssng.supabase.co';

export default async function handler(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  const authHeader = req.headers.authorization;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const YOUSIGN_API_KEY = process.env.YOUSIGN_API_KEY || 'jtQnnf21pS8GrJZKsHViCXvSnOnrWI5d';
  const YOUSIGN_BASE_URL = process.env.YOUSIGN_BASE_URL || 'https://api.yousign.app/v3';

  if (!authHeader || !authHeader.includes(SERVICE_ROLE_KEY)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { order_id, customer, advisor, components, system } = req.body;

    // Validierung
    if (!order_id || !customer?.email || !customer?.last_name || !components?.length) {
      return res.status(400).json({
        error: 'Pflichtfelder fehlen: order_id, customer (email, last_name), components'
      });
    }

    console.log(`📦 Creating document package for ${order_id}`);

    // 1. Paket in DB anlegen
    const { data: pkg, error: pkgError } = await supabase
      .from('order_document_packages')
      .insert({
        order_id,
        customer_id: customer.id,
        customer_salutation: customer.salutation,
        customer_first_name: customer.first_name,
        customer_last_name: customer.last_name,
        customer_email: customer.email,
        customer_street: customer.street,
        customer_zip: customer.zip,
        customer_city: customer.city,
        advisor_name: advisor?.name,
        advisor_email: advisor?.email,
        advisor_phone: advisor?.phone,
        delivery_status: 'entwurf',
      })
      .select()
      .single();

    if (pkgError) throw pkgError;

    // 2. Datenblätter ermitteln
    const datasheets = await matchDatasheets(supabase, components);
    console.log(`📋 Matched ${datasheets.length} datasheets`);

    // 3. Statische + signierbare Dokumente laden
    const { data: staticDocs } = await supabase
      .from('document_templates')
      .select('*')
      .in('category', ['agb', 'widerruf', 'datenschutz'])
      .eq('is_active', true)
      .order('sort_order');

    const { data: signableDocs } = await supabase
      .from('document_templates')
      .select('*')
      .eq('requires_signature', true)
      .eq('is_active', true)
      .order('sort_order');

    // 4. Alle Dokumente in order_documents eintragen
    const allDocs = [];

    for (const tmpl of (signableDocs || [])) {
      const fileName = formatFileName(tmpl.file_name_template, customer, { angebotsnr: order_id });
      allDocs.push({
        package_id: pkg.id,
        template_id: tmpl.id,
        category: tmpl.category,
        document_name: tmpl.name,
        file_name: fileName,
        storage_path: `${order_id}/generated/${fileName}`,
        signature_status: 'ausstehend',
        sort_order: tmpl.sort_order,
        is_generated: true,
        is_attachment_only: false,
      });
    }

    for (const tmpl of (staticDocs || [])) {
      const fileName = formatFileName(tmpl.file_name_template, customer);
      allDocs.push({
        package_id: pkg.id,
        template_id: tmpl.id,
        category: tmpl.category,
        document_name: tmpl.name,
        file_name: fileName,
        storage_path: tmpl.storage_path,
        signature_status: 'nicht_erforderlich',
        sort_order: tmpl.sort_order,
        is_generated: false,
        is_attachment_only: true,
      });
    }

    for (const tmpl of datasheets) {
      const fileName = formatFileName(tmpl.file_name_template, customer);
      allDocs.push({
        package_id: pkg.id,
        template_id: tmpl.id,
        category: 'datenblatt',
        document_name: tmpl.name,
        file_name: fileName,
        storage_path: tmpl.storage_path,
        signature_status: 'nicht_erforderlich',
        sort_order: tmpl.sort_order,
        is_generated: false,
        is_attachment_only: true,
      });
    }

    const { error: docsError } = await supabase
      .from('order_documents')
      .insert(allDocs);

    if (docsError) throw docsError;

    // 5. Yousign Signaturanfrage erstellen
    const signatureRequest = await yousignRequest(YOUSIGN_BASE_URL, YOUSIGN_API_KEY, 'POST', '/signature_requests', {
      name: `bee-doo Vertrag ${order_id} – ${customer.last_name}, ${customer.first_name}`,
      delivery_mode: 'none',
      timezone: 'Europe/Berlin',
      ordered_signers: true,
    });

    // 6. Unterzeichner anlegen
    const signer = await yousignRequest(
      YOUSIGN_BASE_URL, YOUSIGN_API_KEY, 'POST',
      `/signature_requests/${signatureRequest.id}/signers`,
      {
        info: {
          first_name: customer.first_name,
          last_name: customer.last_name,
          email: customer.email,
          phone_number: customer.phone,
          locale: 'de',
        },
        signature_authentication_mode: 'otp_sms',
        signature_level: 'electronic_signature',
      }
    );

    // 7. Dokumente zu Yousign hochladen
    for (const doc of allDocs) {
      const bucket = doc.is_generated ? 'customer-documents' : 'document-templates';
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from(bucket)
        .download(doc.storage_path);

      if (downloadError) {
        console.warn(`⚠️ Konnte ${doc.file_name} nicht laden: ${downloadError.message}`);
        continue;
      }

      const pdfBuffer = new Uint8Array(await pdfData.arrayBuffer());
      const nature = doc.is_attachment_only ? 'attachment' : 'signable_document';

      const uploadedDoc = await yousignUploadDocument(
        YOUSIGN_BASE_URL, YOUSIGN_API_KEY,
        signatureRequest.id, pdfBuffer, doc.file_name, nature
      );

      // Signaturfeld für signierbare Dokumente
      if (!doc.is_attachment_only) {
        await yousignRequest(
          YOUSIGN_BASE_URL, YOUSIGN_API_KEY, 'POST',
          `/signature_requests/${signatureRequest.id}/documents/${uploadedDoc.id}/fields`,
          {
            type: 'signature',
            page: 1,
            signer_id: signer.id,
            x: 100, y: 600, width: 200, height: 60,
          }
        );
      }
    }

    // 8. Signaturanfrage aktivieren
    await yousignRequest(YOUSIGN_BASE_URL, YOUSIGN_API_KEY, 'POST',
      `/signature_requests/${signatureRequest.id}/activate`);

    // 9. Paket aktualisieren
    await supabase
      .from('order_document_packages')
      .update({
        yousign_envelope_id: signatureRequest.id,
        delivery_status: 'bereit',
      })
      .eq('id', pkg.id);

    // 10. Audit Log
    await supabase
      .from('document_audit_log')
      .insert({
        package_id: pkg.id,
        action: 'created',
        actor: advisor?.name || 'system',
        details: {
          order_id,
          documents_count: allDocs.length,
          signable_count: (signableDocs || []).length,
          datasheets_count: datasheets.length,
          yousign_id: signatureRequest.id,
        },
      });

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({
      success: true,
      package_id: pkg.id,
      yousign_signature_request_id: signatureRequest.id,
      documents: {
        total: allDocs.length,
        signable: (signableDocs || []).length,
        attachments: (staticDocs || []).length + datasheets.length,
      },
      signer_id: signer.id,
      next_step: 'POST /signature_requests/{id}/signers/{signer_id}/host → In-Person Signing',
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ---- Hilfsfunktionen ----

function formatFileName(template, customer, extra = {}) {
  let name = template
    .replace('{nachname}', customer.last_name)
    .replace('{vorname}', customer.first_name);
  for (const [key, value] of Object.entries(extra)) {
    name = name.replace(`{${key}}`, value);
  }
  return name;
}

async function matchDatasheets(supabase, components) {
  const { data: mappings } = await supabase
    .from('component_datasheet_map')
    .select('*, template:document_templates(*)')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (!mappings) return [];

  const matchedTemplateIds = new Set();
  const results = [];

  for (const component of components) {
    for (const mapping of mappings) {
      const pattern = mapping.product_pattern
        .replace(/%/g, '.*')
        .replace(/_/g, '.');
      const regex = new RegExp(pattern, 'i');
      if (regex.test(component.name) && !matchedTemplateIds.has(mapping.template.id)) {
        matchedTemplateIds.add(mapping.template.id);
        results.push(mapping.template);
      }
    }
  }
  return results;
}

async function yousignRequest(baseUrl, apiKey, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Yousign API error ${response.status}: ${error}`);
  }
  return response.json();
}

async function yousignUploadDocument(baseUrl, apiKey, signatureRequestId, pdfBuffer, fileName, nature) {
  const formData = new FormData();
  formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName);
  formData.append('nature', nature);

  const response = await fetch(
    `${baseUrl}/signature_requests/${signatureRequestId}/documents`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    }
  );
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Yousign upload error ${response.status}: ${error}`);
  }
  return response.json();
}
