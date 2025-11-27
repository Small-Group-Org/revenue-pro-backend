// fbClient.ts
const FB_API_VERSION = process.env.FB_API_VERSION || 'v21.0';
const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;
const FB_ACCESS_TOKEN_ENV = process.env.FB_ACCESS_TOKEN;

if (!FB_ACCESS_TOKEN_ENV) {
  throw new Error('FB_ACCESS_TOKEN is not set in environment variables');
}

const FB_ACCESS_TOKEN: string = FB_ACCESS_TOKEN_ENV;

/**
 * Generic GET helper for Facebook Graph API
 * @param path - e.g. '/act_123456789/insights' or '/'
 * @param params - query params as key->value
 */
export async function fbGet(path: string, params: Record<string, any> = {}): Promise<any> {
  const url = new URL(FB_BASE_URL + path);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  url.searchParams.set('access_token', FB_ACCESS_TOKEN);

  console.log(`[FB API] Making request to: ${path}`);
  console.log(`[FB API] Params:`, JSON.stringify(params, null, 2));

  const res = await fetch(url.toString());

  if (!res.ok) {
    const text = await res.text();
    console.error('[FB API] ❌ Error:', res.status, text);
    throw new Error(`Facebook API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  console.log(`[FB API] ✅ Success - Response size:`, JSON.stringify(data).length, 'bytes');
  return data;
}
