function getNamedStore(name) {
  try {
    const { getStore } = require('@netlify/blobs');
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || '';
    const token =
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.NETLIFY_API_TOKEN ||
      process.env.NETLIFY_AUTH_TOKEN ||
      '';
    if (siteID && token) {
      return getStore({ name, siteID, token, consistency: 'strong' });
    }
    return getStore({ name, consistency: 'strong' });
  } catch (err) {
    console.warn(`[Blobs] ${name} unavailable:`, err?.message || err);
    return null;
  }
}

module.exports = { getNamedStore };
