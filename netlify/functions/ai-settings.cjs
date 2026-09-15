const { loadAiSettings, saveAiSettings, defaults, addKnowledgeItem, deleteKnowledgeItem } = require('../lib/ai-settings-store.cjs');
const { resolveBusinessId } = require('../lib/business.cjs');

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(payload)
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function tenantIdFrom(event, body) {
  return event.headers?.['x-tenant-id'] || event.headers?.['X-Tenant-Id'] || body?.tenantId || 'tenant_khyber_001';
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };

  const body = parseBody(event);
  const tenantId = (await resolveBusinessId(event, body)) || tenantIdFrom(event, body);
  const path = event.path || '';
  let record = await loadAiSettings(tenantId);

  if (method === 'GET') {
    return json(200, {
      success: true,
      settings: record.settings,
      knowledge: record.knowledge,
      knowledgeItems: record.knowledge,
      mandatoryModel: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      groqConfigured: Boolean(process.env.GROQ_API_KEY)
    });
  }

  if (path.includes('/knowledge') && (method === 'POST' || method === 'DELETE')) {
    if (method === 'DELETE') {
      const id = path.split('/').pop();
      await deleteKnowledgeItem(tenantId, id);
      record.knowledge = (record.knowledge || []).filter((k) => k.id !== id);
      await saveAiSettings(tenantId, record);
      return json(200, { success: true, knowledge: record.knowledge });
    }
    const item = await addKnowledgeItem(tenantId, body);
    record.knowledge = record.knowledge || [];
    record.knowledge.unshift(item);
    await saveAiSettings(tenantId, record);
    return json(200, { success: true, knowledge: record.knowledge, item });
  }

  if (method === 'POST' || method === 'PUT') {
    const base = defaults(tenantId);
    record.settings = {
      ...base.settings,
      ...record.settings,
      ...body,
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      tenantId,
      updatedAt: new Date().toISOString()
    };
    await saveAiSettings(tenantId, record);
    return json(200, { success: true, settings: record.settings, knowledge: record.knowledge });
  }

  return json(405, { success: false, error: 'Method Not Allowed' });
};
