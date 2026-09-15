function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return { url, key };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function sbRequest(method, table, { query, body, prefer } = {}) {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return { ok: false, configured: false, error: 'Supabase env vars missing', data: null, status: 0 };
  }

  const qs = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) qs.set(key, String(value));
  });

  const res = await fetch(`${cfg.url}/rest/v1/${table}?${qs.toString()}`, {
    method,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=representation'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!res.ok) {
    const message =
      (data && (data.message || data.error || data.hint)) ||
      raw ||
      `Supabase ${res.status}`;
    console.warn(`[Supabase ${method} ${table}]`, message);
    return { ok: false, configured: true, error: message, data, status: res.status };
  }

  return { ok: true, configured: true, data, status: res.status };
}

async function sbSelect(table, query) {
  const result = await sbRequest('GET', table, { query });
  return {
    ...result,
    rows: Array.isArray(result.data) ? result.data : []
  };
}

async function sbInsert(table, body) {
  return sbRequest('POST', table, { body, prefer: 'return=representation' });
}

async function sbUpdate(table, query, body) {
  return sbRequest('PATCH', table, { query, body, prefer: 'return=representation' });
}

async function sbDelete(table, query) {
  return sbRequest('DELETE', table, { query, prefer: 'return=representation' });
}

module.exports = {
  getSupabaseConfig,
  isUuid,
  sbRequest,
  sbSelect,
  sbInsert,
  sbUpdate,
  sbDelete
};
