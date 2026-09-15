const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const { resolveBusinessId } = require('../lib/business.cjs');
const { createProducts } = require('../lib/products-store.cjs');

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

function stripTags(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function absUrl(origin, href) {
  if (!href) return '';
  try {
    return new URL(href, origin).toString();
  } catch {
    return '';
  }
}

function normalizeItem(item, origin) {
  if (!item || !item.name) return null;
  const price = Number(String(item.price || '').replace(/[^\d.]/g, ''));
  const sale = item.salePrice != null ? Number(String(item.salePrice).replace(/[^\d.]/g, '')) : undefined;
  return {
    name: String(item.name).trim().slice(0, 180),
    sku: (item.sku && String(item.sku).trim()) || `IMP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    price: price > 0 ? price : 1000,
    salePrice: sale > 0 ? sale : undefined,
    description: stripTags(item.description || item.name).slice(0, 500),
    categoryName: item.category || 'Imported',
    imageUrl: item.imageUrl && String(item.imageUrl).startsWith('http') ? item.imageUrl : absUrl(origin, item.imageUrl),
    stockQuantity: Number(item.stockQuantity) > 0 ? Number(item.stockQuantity) : 50,
    isActive: true
  };
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${(item.name || '').toLowerCase()}|${item.sku || ''}`;
    if (!item.name || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'text/html,application/json,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    redirect: 'follow'
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, contentType: res.headers.get('content-type') || '' };
}

function fromShopify(json, origin) {
  const list = json.products || json;
  if (!Array.isArray(list)) return [];
  return list.map((p) => {
    const variant = (p.variants && p.variants[0]) || {};
    const image = (p.images && p.images[0] && p.images[0].src) || p.image?.src;
    return normalizeItem(
      {
        name: p.title,
        sku: variant.sku || p.handle,
        price: variant.price,
        salePrice: variant.compare_at_price,
        description: stripTags(p.body_html),
        category: p.product_type || p.vendor || 'Imported',
        imageUrl: image,
        stockQuantity: variant.inventory_quantity > 0 ? variant.inventory_quantity : 50
      },
      origin
    );
  }).filter(Boolean);
}

function fromWoo(json, origin) {
  const list = Array.isArray(json) ? json : json.products || [];
  return list
    .map((p) =>
      normalizeItem(
        {
          name: p.name,
          sku: p.sku,
          price: p.prices?.price ? Number(p.prices.price) / 100 : p.price,
          salePrice: p.prices?.sale_price ? Number(p.prices.sale_price) / 100 : p.sale_price,
          description: stripTags(p.short_description || p.description),
          category: p.categories?.[0]?.name,
          imageUrl: p.images?.[0]?.src,
          stockQuantity: p.add_to_cart?.minimum || 50
        },
        origin
      )
    )
    .filter(Boolean);
}

function extractJsonLdProducts(html, origin) {
  const found = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html))) {
    try {
      const data = JSON.parse(match[1]);
      const nodes = Array.isArray(data) ? data : [data, ...(data['@graph'] || [])];
      for (const node of nodes) {
        if (!node) continue;
        if (node['@type'] === 'Product' || (Array.isArray(node['@type']) && node['@type'].includes('Product'))) {
          const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers || {};
          found.push(
            normalizeItem(
              {
                name: node.name,
                sku: node.sku,
                price: offer.price || node.price,
                description: node.description,
                imageUrl: Array.isArray(node.image) ? node.image[0] : node.image,
                category: node.category
              },
              origin
            )
          );
        }
        const elements = node.itemListElement || [];
        for (const el of elements) {
          const item = el.item || el;
          if (item?.name) {
            found.push(
              normalizeItem(
                {
                  name: item.name,
                  price: item.offers?.price,
                  imageUrl: item.image,
                  description: item.description
                },
                origin
              )
            );
          }
        }
      }
    } catch {
      /* ignore bad json-ld */
    }
  }
  return found.filter(Boolean);
}

function extractProductLinks(html, origin) {
  const links = new Set();
  const regex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html))) {
    const href = match[1];
    if (/\/(product|products|shop|item|collection)s?\//i.test(href) && !href.includes('#') && !href.startsWith('mailto:')) {
      const url = absUrl(origin, href);
      if (url.startsWith(origin)) links.add(url.split('?')[0]);
    }
  }
  return [...links].slice(0, 12);
}

async function groqExtract(html, pageUrl, origin) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return [];
  const cleanText = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.1,
      max_tokens: 3500,
      messages: [
        {
          role: 'system',
          content:
            'Extract EVERY distinct product on the page. Return ONLY a JSON array of objects with name, price, salePrice, sku, category, description, imageUrl, stockQuantity. Never return just one product if many are listed.'
        },
        {
          role: 'user',
          content: `URL: ${pageUrl}\nORIGIN: ${origin}\nPAGE TEXT:\n${cleanText}`
        }
      ]
    })
  });
  const groqData = await groqRes.json().catch(() => ({}));
  const reply = groqData.choices?.[0]?.message?.content || '';
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(reply.slice(start, end + 1));
    return (Array.isArray(parsed) ? parsed : []).map((item) => normalizeItem(item, origin)).filter(Boolean);
  } catch {
    return [];
  }
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'POST').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };
  if (method !== 'POST') return json(405, { success: false, error: 'Method Not Allowed' });

  const body = parseBody(event);
  const targetUrl = String(body.url || '').trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
    if (!parsedUrl.protocol.startsWith('http')) throw new Error('Invalid protocol');
  } catch {
    return json(400, { success: false, count: 0, products: [], error: 'Valid HTTP/HTTPS URL dein.' });
  }

  const tenantId = await resolveBusinessId(event, body);
  if (!tenantId) {
    return json(400, {
      success: false,
      count: 0,
      products: [],
      error: 'Store ID missing. Login karke import karein.'
    });
  }
  const origin = parsedUrl.origin;
  let collected = [];

  try {
    for (const endpoint of [
      `${origin}/products.json?limit=250`,
      `${origin}/collections/all/products.json?limit=250`
    ]) {
      const res = await fetchText(endpoint);
      if (!res.ok) continue;
      try {
        collected.push(...fromShopify(JSON.parse(res.text), origin));
      } catch {
        /* not shopify */
      }
      if (collected.length >= 8) break;
    }

    if (collected.length < 8) {
      for (const endpoint of [
        `${origin}/wp-json/wc/store/v1/products?per_page=100`,
        `${origin}/wp-json/wc/store/products?per_page=100`
      ]) {
        const res = await fetchText(endpoint);
        if (!res.ok) continue;
        try {
          collected.push(...fromWoo(JSON.parse(res.text), origin));
        } catch {
          /* not woo */
        }
        if (collected.length >= 8) break;
      }
    }

    const page = await fetchText(parsedUrl.toString());
    if (!page.ok) {
      if (!collected.length) {
        return json(400, {
          success: false,
          count: 0,
          products: [],
          error: `Website fetch fail (HTTP ${page.status}).`
        });
      }
    } else {
      collected.push(...extractJsonLdProducts(page.text, origin));
      if (collected.length < 8) {
        collected.push(...(await groqExtract(page.text, parsedUrl.toString(), origin)));
      }
      if (collected.length < 8) {
        const links = extractProductLinks(page.text, origin).slice(0, 6);
        for (const link of links) {
          const extra = await fetchText(link);
          if (!extra.ok) continue;
          collected.push(...extractJsonLdProducts(extra.text, origin));
          if (collected.length >= 40) break;
        }
      }
    }

    collected = dedupe(collected.filter(Boolean)).slice(0, 40);
    if (!collected.length) {
      return json(200, {
        success: false,
        count: 0,
        products: [],
        error: 'Is URL se products nahi milay. Shop/collection page try karein.'
      });
    }

    const saved = await createProducts(tenantId, collected);
    const products = saved.products || [];
    if (!products.length) {
      return json(500, {
        success: false,
        count: 0,
        products: [],
        error:
          saved.error ||
          'Products extract ho gaye magar save nahi hue. Supabase products table / RLS / columns check karein.'
      });
    }
    return json(200, {
      success: true,
      count: products.length,
      products,
      persisted: true
    });
  } catch (err) {
    return json(500, {
      success: false,
      count: 0,
      products: [],
      error: err.message || 'Import failed.'
    });
  }
};
