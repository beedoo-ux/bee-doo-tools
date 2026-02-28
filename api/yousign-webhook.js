// ============================================================
// Vercel Serverless Function: yousign-webhook
// 
// Empfängt Webhooks von Yousign nach Unterschrift:
// 1. Unterschriebene PDFs herunterladen
// 2. In Supabase Storage speichern
// 3. Status in DB aktualisieren
// 4. Bestätigungsmail via Brevo versenden
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hqzpemfaljxcysyqssng.supabase.co';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const YOUSIGN_API_KEY = process.env.YOUSIGN_API_KEY || 'jtQnnf21pS8GrJZKsHViCXvSnOnrWI5d';
  const YOUSIGN_BASE_URL = process.env.YOUSIGN_BASE_URL || 'https://api.yousign.app/v3';
  const BREVO_API_KEY = process.env.BREVO_API_KEY;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const event = req.body;
    console.log(`📨 Yousign Webhook: ${event.event_name}`);

    // Nur auf "signature_request.done" und "signer.done" reagieren
    if (event.event_name === 'signer.done') {
      // Check if this is an HR contract signer
      const srId = event.data?.signature_request?.id || event.data?.signer?.signature_request_id;
      if (srId) {
        const { data: hrC } = await supabase
          .from('hr_contracts')
          .select('*')
          .eq('yousign_request_id', srId)
          .single();
        if (hrC && hrC.status === 'gesendet') {
          await supabase.from('hr_contracts').update({
            status: 'mitarbeiter_ok',
            employee_signed_at: new Date().toISOString()
          }).eq('id', hrC.id);
          console.log(`👤 HR: Mitarbeiter ${hrC.employee_first_name} hat unterschrieben`);
        }
      }
      return res.status(200).json({ ok: true, event: 'signer.done' });
    }

    if (event.event_name !== 'signature_request.done') {
      return res.status(200).json({ ok: true, skipped: event.event_name });
    }

    const signatureRequestId = event.data?.signature_request?.id;
    if (!signatureRequestId) {
      return res.status(400).json({ error: 'Missing signature_request.id' });
    }

    // 1. Paket finden (erst Kundenverträge, dann HR-Verträge)
    const { data: pkg } = await supabase
      .from('order_document_packages')
      .select('*')
      .eq('yousign_envelope_id', signatureRequestId)
      .single();

    // Check HR contracts if no customer package found
    if (!pkg) {
      const { data: hrContract } = await supabase
        .from('hr_contracts')
        .select('*')
        .eq('yousign_request_id', signatureRequestId)
        .single();

      if (hrContract) {
        console.log(`📝 HR Contract: ${hrContract.employee_first_name} ${hrContract.employee_last_name}`);

        // Download signed PDF from Yousign
        const docsRes = await fetch(
          `${YOUSIGN_BASE_URL}/signature_requests/${signatureRequestId}/documents`,
          { headers: { 'Authorization': `Bearer ${YOUSIGN_API_KEY}` } }
        );
        const yDocs = await docsRes.json();

        for (const yDoc of (yDocs.data || yDocs)) {
          if (yDoc.nature === 'signable_document') {
            const dlRes = await fetch(
              `${YOUSIGN_BASE_URL}/signature_requests/${signatureRequestId}/documents/${yDoc.id}/download`,
              { headers: { 'Authorization': `Bearer ${YOUSIGN_API_KEY}` } }
            );
            const pdfBuf = new Uint8Array(await dlRes.arrayBuffer());

            // Save signed PDF
            const signedPath = hrContract.pdf_storage_path.replace('.pdf', '_signed.pdf');
            await supabase.storage
              .from('hr-contracts')
              .upload(signedPath, pdfBuf, { contentType: 'application/pdf', upsert: true });

            // Update HR contract status
            await supabase
              .from('hr_contracts')
              .update({
                signed_pdf_path: signedPath,
                status: 'unterschrieben',
                completed_at: new Date().toISOString()
              })
              .eq('id', hrContract.id);

            console.log(`✅ HR Contract signed: ${signedPath}`);
          }
        }

        return res.status(200).json({ ok: true, type: 'hr_contract', id: hrContract.id });
      }

      console.error(`❌ Kein Paket/Vertrag für Yousign ID: ${signatureRequestId}`);
      return res.status(404).json({ error: 'Package not found' });
    }

    console.log(`📦 Paket: ${pkg.order_id} (${pkg.customer_last_name})`);

    // 2. Dokumente von Yousign holen
    const docsResponse = await fetch(
      `${YOUSIGN_BASE_URL}/signature_requests/${signatureRequestId}/documents`,
      { headers: { 'Authorization': `Bearer ${YOUSIGN_API_KEY}` } }
    );
    const yousignDocs = await docsResponse.json();

    // 3. Unterschriebene PDFs herunterladen + speichern
    const mailAttachments = [];

    for (const yDoc of (yousignDocs.data || yousignDocs)) {
      if (yDoc.nature === 'signable_document') {
        const dlResponse = await fetch(
          `${YOUSIGN_BASE_URL}/signature_requests/${signatureRequestId}/documents/${yDoc.id}/download`,
          { headers: { 'Authorization': `Bearer ${YOUSIGN_API_KEY}` } }
        );
        const pdfBuffer = new Uint8Array(await dlResponse.arrayBuffer());

        // order_documents Eintrag finden
        const { data: orderDoc } = await supabase
          .from('order_documents')
          .select('*')
          .eq('package_id', pkg.id)
          .eq('is_attachment_only', false)
          .single(); // Simplified - in prod match by filename

        if (orderDoc) {
          const signedPath = `${pkg.order_id}/signed/${orderDoc.file_name}`;
          await supabase.storage
            .from('customer-documents')
            .upload(signedPath, pdfBuffer, {
              contentType: 'application/pdf',
              upsert: true,
            });

          await supabase
            .from('order_documents')
            .update({
              signature_status: 'unterschrieben',
              signed_at: new Date().toISOString(),
              signed_storage_path: signedPath,
            })
            .eq('id', orderDoc.id);

          mailAttachments.push({
            name: orderDoc.file_name,
            content: Buffer.from(pdfBuffer).toString('base64'),
          });
        }
      }
    }

    // 4. Statische Dokumente + Datenblätter für Mail laden
    const { data: attachmentDocs } = await supabase
      .from('order_documents')
      .select('*')
      .eq('package_id', pkg.id)
      .eq('is_attachment_only', true)
      .order('sort_order');

    for (const doc of (attachmentDocs || [])) {
      const { data: pdfData } = await supabase.storage
        .from('document-templates')
        .download(doc.storage_path);

      if (pdfData) {
        const buffer = new Uint8Array(await pdfData.arrayBuffer());
        mailAttachments.push({
          name: doc.file_name,
          content: Buffer.from(buffer).toString('base64'),
        });
      }
    }

    console.log(`📎 ${mailAttachments.length} Anhänge vorbereitet`);

    // 5. Mail versenden
    const { data: allDocs } = await supabase
      .from('order_documents')
      .select('*')
      .eq('package_id', pkg.id)
      .order('sort_order');

    const signedDocs = (allDocs || []).filter(d => d.signature_status === 'unterschrieben');
    const staticDocsForMail = (allDocs || []).filter(d => d.category !== 'datenblatt' && d.is_attachment_only);
    const datasheetDocs = (allDocs || []).filter(d => d.category === 'datenblatt');

    const htmlContent = buildEmailHtml(pkg, signedDocs, staticDocsForMail, datasheetDocs);

    const mailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'bee-doo GmbH', email: 'kontakt@bee-doo.de' },
        to: [{
          name: `${pkg.customer_first_name} ${pkg.customer_last_name}`,
          email: pkg.customer_email,
        }],
        subject: `Ihre Unterlagen zum Angebot ${pkg.order_id} – bee-doo GmbH`,
        htmlContent,
        attachment: mailAttachments,
      }),
    });

    const mailResult = await mailResponse.json();

    // 6. Paket-Status aktualisieren
    await supabase
      .from('order_document_packages')
      .update({
        delivery_status: 'gesendet',
        mail_sent_at: new Date().toISOString(),
        mail_message_id: mailResult?.messageId,
      })
      .eq('id', pkg.id);

    // 7. Audit Log
    await supabase
      .from('document_audit_log')
      .insert({
        package_id: pkg.id,
        action: 'sent',
        actor: 'system',
        details: {
          yousign_event: event.event_name,
          attachments_count: mailAttachments.length,
          brevo_message_id: mailResult?.messageId,
          recipient: pkg.customer_email,
        },
      });

    console.log(`✅ Paket ${pkg.order_id} versendet an ${pkg.customer_email}`);

    return res.status(200).json({ success: true, package_id: pkg.id });

  } catch (error) {
    console.error('❌ Webhook Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

function buildEmailHtml(pkg, signedDocs, staticDocs, datasheetDocs) {
  const signedList = signedDocs.map(d => `<li>${d.document_name}</li>`).join('\n');
  const staticList = staticDocs.map(d => `<li>${d.document_name}</li>`).join('\n');
  const datasheetList = datasheetDocs.map(d => `<li>${d.document_name}</li>`).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { padding: 20px 0; border-bottom: 3px solid #F5C518; margin-bottom: 30px; }
    .header .phone { float: right; color: #666; font-size: 14px; margin-top: 15px; }
    h2 { color: #333; font-size: 16px; margin-top: 25px; margin-bottom: 10px; }
    ul { padding-left: 20px; }
    li { margin: 5px 0; }
    .advisor-box { background: #f8f8f8; padding: 15px; border-radius: 8px; margin: 25px 0; }
    .advisor-box strong { display: block; margin-bottom: 5px; }
    .footer { border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; color: #666; font-size: 13px; }
    .footer .company { font-weight: bold; color: #333; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="phone">08002233664</span>
      <div style="font-size: 28px; font-weight: bold; color: #333;">
        <span>bee-</span><span>doo</span>
      </div>
      <div style="font-size: 11px; letter-spacing: 3px; color: #666;">ENERGY FOR YOU</div>
    </div>

    <p>Sehr geehrte${pkg.customer_salutation === 'Frau' ? '' : 'r'} ${pkg.customer_salutation} ${pkg.customer_last_name},</p>
    <p>vielen Dank für Ihr Vertrauen in bee-doo. Anbei erhalten Sie Ihre vollständigen Vertragsunterlagen.</p>

    ${signedList ? `<h2>Ihre unterschriebenen Dokumente</h2><ul>${signedList}</ul>` : ''}
    ${staticList ? `<h2>Ergänzende Unterlagen</h2><ul>${staticList}</ul>` : ''}
    ${datasheetList ? `<h2>Technische Datenblätter Ihrer Komponenten</h2><ul>${datasheetList}</ul>` : ''}

    ${pkg.advisor_name ? `
    <div class="advisor-box">
      <strong>Ihr persönlicher Ansprechpartner</strong>
      ${pkg.advisor_name}${pkg.advisor_email ? ` | ${pkg.advisor_email}` : ''}${pkg.advisor_phone ? ` | ${pkg.advisor_phone}` : ''}
    </div>` : ''}

    <p>Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.</p>
    <p>Mit freundlichen Grüßen<br><strong>Patrick Windolph</strong></p>

    <div class="footer">
      <div class="company">bee-doo GmbH</div>
      Am Stadtholz 39 | D-33609 Bielefeld<br>
      Telefon: 08002233664<br>
      E-Mail: kontakt@bee-doo.de
    </div>
  </div>
</body>
</html>`;
}
