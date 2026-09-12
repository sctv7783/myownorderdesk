const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

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

function extractPageSignals(html, origin) {
  const jsonLdMatches = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    if (match[1] && match[1].trim()) jsonLdMatches.push(match[1].trim().slice(0, 3000));
  }

  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
  const ogPrice =
    html.match(/<meta[^>]*property=["'](?:product:price:amount|og:price:amount)["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    '';

  const cleanText = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);

  return { jsonLdMatches, ogTitle, ogDesc, ogImage: ogImage.startsWith('http') ? ogImage : ogImage ? origin + ogImage : '', ogPrice, cleanText };
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
    return json(400, { success: false, count: 0, products: [], error: 'Please provide a valid HTTP or HTTPS URL.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return json(400, {
      success: false,
      count: 0,
      products: [],
      error: 'GROQ_API_KEY is not set on Netlify. Add it in Site settings → Environment variables.'
    });
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return json(400, {
        success: false,
        count: 0,
        products: [],
        error: `Failed to fetch website (HTTP ${response.status}).`
      });
    }

    const html = await response.text();
    const signals = extractPageSignals(html, parsedUrl.origin);

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.1,
        max_tokens: 1500,
        messages: [
          {
            role: 'system',
            content: 'You extract e-commerce product catalogs and output strictly valid JSON arrays.'
          },
          {
            role: 'user',
            content: `Extract products from ${parsedUrl.toString()}
OpenGraph title: ${signals.ogTitle}
description: ${signals.ogDesc}
image: ${signals.ogImage}
price: ${signals.ogPrice}
JSON-LD: ${signals.jsonLdMatches.join('\n').slice(0, 3000)}
Text: ${signals.cleanText}
Return ONLY a JSON array of {name, price, salePrice, sku, category, description, imageUrl, stockQuantity}.`
          }
        ]
      })
    });

    const groqData = await groqRes.json().catch(() => ({}));
    if (!groqRes.ok) {
      return json(400, {
        success: false,
        count: 0,
        products: [],
        error: groqData.error?.message || 'Groq API rejected the import request.'
      });
    }

    const replyContent = groqData.choices?.[0]?.message?.content || '';
    let parsedProducts = [];
    try {
      const jsonStart = replyContent.indexOf('[');
      const jsonEnd = replyContent.lastIndexOf(']');
      parsedProducts = JSON.parse(jsonStart !== -1 ? replyContent.slice(jsonStart, jsonEnd + 1) : replyContent);
    } catch {
      if (signals.ogTitle) {
        parsedProducts = [
          {
            name: signals.ogTitle,
            price: parseFloat(signals.ogPrice) || 1500,
            description: signals.ogDesc || signals.ogTitle,
            imageUrl: signals.ogImage,
            category: 'Imported Products',
            sku: 'IMP-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
            stockQuantity: 50
          }
        ];
      }
    }

    if (!Array.isArray(parsedProducts) || parsedProducts.length === 0) {
      return json(200, {
        success: false,
        count: 0,
        products: [],
        error: 'Could not detect products on this page. Try a direct product URL.'
      });
    }

    const now = new Date().toISOString();
    const products = parsedProducts
      .filter((item) => item && item.name)
      .map((item, index) => ({
        id: `imp_${Date.now()}_${index}`,
        name: String(item.name).trim(),
        sku: (item.sku && String(item.sku).trim()) || `IMP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        price: Number(item.price) > 0 ? Number(item.price) : 1000,
        salePrice: item.salePrice && Number(item.salePrice) > 0 ? Number(item.salePrice) : undefined,
        description: item.description || String(item.name).trim(),
        categoryName: item.category || 'Imported Products',
        imageUrl: item.imageUrl && String(item.imageUrl).startsWith('http') ? item.imageUrl : undefined,
        stockQuantity: item.stockQuantity > 0 ? Number(item.stockQuantity) : 50,
        reservedQuantity: 0,
        availableQuantity: item.stockQuantity > 0 ? Number(item.stockQuantity) : 50,
        lowStockThreshold: 5,
        isActive: true,
        createdAt: now,
        updatedAt: now
      }));

    return json(200, { success: true, count: products.length, products });
  } catch (err) {
    return json(500, {
      success: false,
      count: 0,
      products: [],
      error: err.message || 'Import failed.'
    });
  }
};
