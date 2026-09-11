import Groq from 'groq-sdk';
import { db } from '../db';
import { Product } from '../../src/types';
import { persistProductToSupabase } from '../supabase';

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

interface ScrapedProductInput {
  name: string;
  price: number;
  salePrice?: number | null;
  sku?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  stockQuantity?: number;
}

export async function scrapeProductsFromUrl(
  tenantId: string,
  targetUrl: string
): Promise<{ success: boolean; count: number; products: Product[]; error?: string }> {
  try {
    // 1. Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl.trim());
      if (!parsedUrl.protocol.startsWith('http')) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return { success: false, count: 0, products: [], error: 'Please provide a valid HTTP or HTTPS URL.' };
    }

    // 2. Fetch page HTML
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ur;q=0.8'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return {
        success: false,
        count: 0,
        products: [],
        error: `Failed to fetch website (HTTP ${response.status} ${response.statusText}). Check if URL is publicly accessible.`
      };
    }

    const html = await response.text();

    // 3. Extract JSON-LD, OpenGraph, and clean text
    const jsonLdMatches: string[] = [];
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      if (match[1] && match[1].trim()) {
        jsonLdMatches.push(match[1].trim().slice(0, 3000));
      }
    }

    // Extract OpenGraph tags
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
    const ogPrice =
      html.match(/<meta[^>]*property=["'](?:product:price:amount|og:price:amount)["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';

    // Strip scripts, styles, SVGs and tags to get clean readable content
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    // 4. Use Groq AI to extract structured product list
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        count: 0,
        products: [],
        error: 'Groq API Key is not configured on the server.'
      };
    }

    const groq = new Groq({ apiKey });

    const extractionPrompt = `You are an expert e-commerce catalog extractor.
Target URL: ${parsedUrl.toString()}

OpenGraph metadata:
Title: ${ogTitle}
Description: ${ogDesc}
Image: ${ogImage}
Price: ${ogPrice}

Structured JSON-LD found:
${jsonLdMatches.join('\n---\n').slice(0, 3000)}

Webpage content extract:
${cleanText}

TASK:
Extract all available products from this page (individual product page or product catalog/collection).
For each product, identify:
- name: Clear product title
- price: Numeric price (in local currency e.g. PKR/USD, strictly a positive number, no currency symbols or commas)
- salePrice: Numeric discounted price if available, otherwise null
- sku: Short alphanumeric SKU code (e.g. "SKU-EARBUDS-01")
- category: Product category (e.g. "Electronics", "Clothing", "Accessories")
- description: Concise summary (1-2 sentences)
- imageUrl: Full image URL (if relative, resolve to ${parsedUrl.origin}), or empty string
- stockQuantity: Default to 50 if not explicitly mentioned

OUTPUT FORMAT:
Output ONLY a valid JSON array of objects. Do not wrap in markdown quotes if possible, or use standard markdown json. No conversational text.
Example format:
[
  {
    "name": "Wireless Bluetooth Earbuds",
    "price": 2499,
    "salePrice": 1999,
    "sku": "EAR-BLU-01",
    "category": "Electronics",
    "description": "High bass bluetooth earbuds with digital battery display.",
    "imageUrl": "https://example.com/images/earbuds.jpg",
    "stockQuantity": 50
  }
]`;

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You extract e-commerce product catalogs and output strictly valid JSON arrays.'
        },
        { role: 'user', content: extractionPrompt }
      ],
      temperature: 0.1,
      max_tokens: 1500
    });

    const replyContent = completion.choices[0]?.message?.content || '';

    // Parse JSON from Groq output
    let parsedProducts: ScrapedProductInput[] = [];
    try {
      // Find JSON array in reply
      const jsonStart = replyContent.indexOf('[');
      const jsonEnd = replyContent.lastIndexOf(']');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const jsonStr = replyContent.slice(jsonStart, jsonEnd + 1);
        parsedProducts = JSON.parse(jsonStr);
      } else {
        // Try parsing entire response
        parsedProducts = JSON.parse(replyContent);
      }
    } catch (parseErr) {
      console.warn('[Scraper AI Parsing Warning]:', parseErr, replyContent.slice(0, 200));
      // Fallback: If OpenGraph had title and price, create 1 product
      if (ogTitle) {
        parsedProducts = [
          {
            name: ogTitle,
            price: parseFloat(ogPrice) || 1500,
            description: ogDesc || ogTitle,
            imageUrl: ogImage || undefined,
            category: 'General',
            sku: 'IMP-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
            stockQuantity: 50
          }
        ];
      }
    }

    if (!Array.isArray(parsedProducts) || parsedProducts.length === 0) {
      return {
        success: false,
        count: 0,
        products: [],
        error: 'Could not detect any products on the provided webpage. Ensure the URL links directly to a product or shop page.'
      };
    }

    // 5. Add products to database and sync to Supabase
    const createdProducts: Product[] = [];
    for (const item of parsedProducts) {
      if (!item.name || !item.name.trim()) continue;

      const numericPrice = typeof item.price === 'number' && item.price > 0 ? item.price : 1000;
      const cleanSku = item.sku && item.sku.trim() ? item.sku.trim() : 'IMP-' + Math.random().toString(36).substring(2, 7).toUpperCase();

      const newProduct = db.createProduct(tenantId, {
        name: item.name.trim(),
        sku: cleanSku,
        price: numericPrice,
        salePrice: item.salePrice && item.salePrice > 0 ? item.salePrice : undefined,
        description: item.description || item.name.trim(),
        categoryName: item.category || 'Imported Products',
        imageUrl: item.imageUrl && item.imageUrl.startsWith('http') ? item.imageUrl : undefined,
        stockQuantity: item.stockQuantity && item.stockQuantity > 0 ? item.stockQuantity : 50,
        lowStockThreshold: 5,
        isActive: true
      });

      createdProducts.push(newProduct);

      // Async write-back to Supabase
      persistProductToSupabase(newProduct).catch(err => {
        console.warn('[Supabase Importer Sync Warning]:', err?.message || err);
      });
    }

    return {
      success: true,
      count: createdProducts.length,
      products: createdProducts
    };
  } catch (err: any) {
    console.error('[Product Scraper Error]:', err);
    return {
      success: false,
      count: 0,
      products: [],
      error: err?.message || 'An unexpected error occurred while scraping the website.'
    };
  }
}
