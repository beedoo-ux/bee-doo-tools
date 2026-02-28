// ============================================================
// Vercel Serverless Function: hr-contract-status
// 
// GET: Alle Verträge oder einzelnen Vertrag abrufen
// PATCH: Status manuell aktualisieren
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hqzpemfaljxcysyqssng.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxenBlbWZhbGp4Y3lzeXFzc25nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzUzOTcsImV4cCI6MjA4NjkxMTM5N30.LSlMApceWuLk5MUctCGCVspXfYhc_As559aaoV2uSik';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY || ANON_KEY);

  try {
    if (req.method === 'GET') {
      const { id, type, status } = req.query;

      if (id) {
        // Einzelnen Vertrag abrufen
        const { data, error } = await supabase
          .from('hr_contracts')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      // Liste mit optionalen Filtern
      let query = supabase
        .from('hr_contracts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (type) query = query.eq('contract_type', type);
      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'PATCH') {
      const { id, status: newStatus } = req.body;
      if (!id || !newStatus) {
        return res.status(400).json({ error: 'id und status sind Pflicht' });
      }

      const updateData = { status: newStatus };
      if (newStatus === 'mitarbeiter_ok') updateData.employee_signed_at = new Date().toISOString();
      if (newStatus === 'unterschrieben') {
        updateData.employer_signed_at = new Date().toISOString();
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('hr_contracts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('❌ HR Contract Status Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
