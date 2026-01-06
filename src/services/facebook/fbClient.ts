// fbClient.ts
import { config } from '../../config.js';

const FB_API_VERSION = config.META_API_VERSION || 'v24.0';
const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;

/**
 * Sleep/delay utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generic GET helper for Facebook Graph API
 * @param path - e.g. '/act_123456789/insights' or '/'
 * @param params - query params as key->value
 * @param accessToken - Meta access token to use for this request
 */
export async function fbGet(
  path: string,
  params: Record<string, any> = {},
  accessToken?: string
): Promise<any> {
  if (!accessToken) {
    throw new Error('Meta access token is required for Facebook API calls');
  }

  const url = new URL(FB_BASE_URL + path);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  url.searchParams.set('access_token', accessToken);

  console.log(`[FB API] Making request to: ${path}`);
  console.log(`[FB API] Params:`, JSON.stringify(params, null, 2));

  const res = await fetch(url.toString());

  if (!res.ok) {
    const text = await res.text();
    console.error('[FB API] Error:', res.status, text);
    throw new Error(`Facebook API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  console.log(`[FB API] Success - Response size:`, JSON.stringify(data).length, 'bytes');
  return data;
}
