// fbClient.ts
import { config } from '../../config.js';
const FB_API_VERSION = config.META_API_VERSION || 'v24.0';
const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;
/**
 * Sleep/delay utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Generic GET helper for Facebook Graph API with retry logic
 * @param path - e.g. '/act_123456789/insights' or '/'
 * @param params - query params as key->value
 * @param accessToken - Meta access token to use for this request
 * @param retries - Number of retry attempts for rate limit errors (default: 3)
 */
export async function fbGet(path, params = {}, accessToken, retries = 3) {
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
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url.toString());
            if (!res.ok) {
                const text = await res.text();
                console.error('[FB API] Error:', res.status, text);
                // Check if it's a rate limit error
                const isRateLimit = res.status === 403 || res.status === 429;
                const errorData = (() => { try {
                    return JSON.parse(text);
                }
                catch {
                    return null;
                } })();
                const isTransient = errorData?.error?.is_transient || errorData?.error?.code === 4;
                if ((isRateLimit || isTransient) && attempt < retries) {
                    // Exponential backoff: 2^attempt * 1000ms (1s, 2s, 4s, 8s)
                    const delayMs = Math.pow(2, attempt) * 1000;
                    console.log(`[FB API] Rate limit hit, retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries + 1})...`);
                    await sleep(delayMs);
                    continue; // Retry
                }
                throw new Error(`Facebook API error: ${res.status} ${text}`);
            }
            const data = await res.json();
            console.log(`[FB API] Success - Response size:`, JSON.stringify(data).length, 'bytes');
            return data;
        }
        catch (error) {
            lastError = error;
            // If it's not a rate limit error, throw immediately
            if (!error.message?.includes('429') && !error.message?.includes('403') && !error.message?.includes('limit reached')) {
                throw error;
            }
            // If we've exhausted retries, throw the last error
            if (attempt === retries) {
                throw lastError;
            }
        }
    }
    throw lastError || new Error('Unknown error during Facebook API request');
}
