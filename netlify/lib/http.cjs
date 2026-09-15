function readHeader(event, name) {
  const headers = event.headers || {};
  const want = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === want) {
      if (Array.isArray(value)) return String(value[0] || '').trim();
      return String(value || '').trim();
    }
  }
  return '';
}

function readAccessToken(event, body) {
  const bearer = readHeader(event, 'authorization') || readHeader(event, 'Authorization');
  const fromAuth = bearer.replace(/^Bearer\s+/i, '').trim();
  return (
    fromAuth ||
    readHeader(event, 'x-orderdesk-token') ||
    readHeader(event, 'x-access-token') ||
    String(body?.accessToken || body?.token || '').trim()
  );
}

module.exports = { readHeader, readAccessToken };
